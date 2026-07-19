-- ============================================================================
-- 2026_07_19_business_billing_real_students.sql
--
-- Per-student contracts now bill against the tenant's REAL active student
-- count (profiles.role='student' AND is_active), computed live per call.
-- terms.expected_students becomes an optional manual OVERRIDE only.
--
-- Also fixes future-dated contracts: a contract that hasn't started yet
-- expects 0 (previously the yearly/upfront components counted early).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.biz_billing_overview()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
  v_summary JSONB;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH ledger AS (
    SELECT contract_id,
           sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS collected,
           max(occurred_on) FILTER (WHERE direction = 'in') AS last_payment_on
    FROM public.biz_transactions
    WHERE contract_id IS NOT NULL AND status = 'confirmed'
    GROUP BY contract_id
  ),
  students AS (
    SELECT tenant_id, count(*)::numeric AS cnt
    FROM public.profiles
    WHERE role = 'student' AND is_active
    GROUP BY tenant_id
  ),
  calc AS (
    SELECT c.id, c.counterparty, c.contract_type, c.status, c.start_date, c.end_date,
           tn.name AS tenant_name, tn.slug AS tenant_slug,
           COALESCE(l.collected, 0) AS collected,
           l.last_payment_on,
           -- Real active students of the linked tenant; terms.expected_students
           -- is a manual override only.
           COALESCE(NULLIF(c.terms->>'expected_students', '')::numeric, s.cnt, 0) AS students_count,
           -- Months elapsed since start (0 for future-dated contracts)
           GREATEST(0, EXTRACT(YEAR FROM age(CURRENT_DATE, c.start_date)) * 12
            + EXTRACT(MONTH FROM age(CURRENT_DATE, c.start_date)) + 1)::int AS months_elapsed,
           CASE
             WHEN c.terms ? 'expected_total' THEN (c.terms->>'expected_total')::numeric
             WHEN c.start_date > CURRENT_DATE THEN 0   -- not started yet → nothing owed
             ELSE
               COALESCE((c.terms->>'upfront_amount')::numeric, 0)
               + COALESCE((c.terms->>'yearly_amount')::numeric, 0)
                 * GREATEST(1, CEIL((EXTRACT(YEAR FROM age(CURRENT_DATE, c.start_date)) * 12
                     + EXTRACT(MONTH FROM age(CURRENT_DATE, c.start_date)) + 1) / 12.0))
               + COALESCE((c.terms->>'monthly_per_student')::numeric, 0)
                 * COALESCE(NULLIF(c.terms->>'expected_students', '')::numeric, s.cnt, 0)
                 * GREATEST(0, EXTRACT(YEAR FROM age(CURRENT_DATE, c.start_date)) * 12
                    + EXTRACT(MONTH FROM age(CURRENT_DATE, c.start_date)) + 1)
           END AS expected,
           (c.terms ? 'monthly_per_student') AS has_monthly
    FROM public.biz_contracts c
    LEFT JOIN public.tenants tn ON tn.id = c.tenant_id
    LEFT JOIN ledger l ON l.contract_id = c.id
    LEFT JOIN students s ON s.tenant_id = c.tenant_id
    WHERE c.status IN ('active', 'suspended')
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.remaining DESC), '[]'::jsonb),
    jsonb_build_object(
      'expected_total',  COALESCE(sum(x.expected), 0),
      'collected_total', COALESCE(sum(x.collected), 0),
      'remaining_total', COALESCE(sum(x.remaining), 0),
      'overdue_count',   count(*) FILTER (WHERE x.overdue))
  INTO v_rows, v_summary
  FROM (
    SELECT *,
           GREATEST(0, expected - collected) AS remaining,
           (GREATEST(0, expected - collected) > 0 AND start_date <= CURRENT_DATE AND (
              (has_monthly AND (last_payment_on IS NULL OR last_payment_on < date_trunc('month', CURRENT_DATE)))
              OR (NOT has_monthly AND last_payment_on IS NULL AND start_date < CURRENT_DATE - 30)
           )) AS overdue,
           CASE WHEN has_monthly AND start_date <= CURRENT_DATE
                THEN (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
                WHEN has_monthly THEN start_date
                ELSE NULL END AS next_payment_on
    FROM calc
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'summary', v_summary);
END;
$$;

-- MRR follows the same rule: real active students unless overridden.
-- (Only the first block of biz_kpis changes; full body re-declared.)
CREATE OR REPLACE FUNCTION public.biz_kpis()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrr NUMERIC;
  v_active_teachers INT;
  v_churn NUMERIC;
  v_this_month NUMERIC;
  v_prev_month NUMERIC;
  v_by_month JSONB;
  v_by_tenant JSONB;
  v_by_category JSONB;
  v_totals JSONB;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(sum(
           COALESCE((c.terms->>'monthly_per_student')::numeric, 0)
             * COALESCE(NULLIF(c.terms->>'expected_students', '')::numeric, s.cnt, 0)
           + COALESCE((c.terms->>'yearly_amount')::numeric, 0) / 12.0), 0),
         count(*)
  INTO v_mrr, v_active_teachers
  FROM public.biz_contracts c
  LEFT JOIN (
    SELECT tenant_id, count(*)::numeric AS cnt
    FROM public.profiles
    WHERE role = 'student' AND is_active
    GROUP BY tenant_id
  ) s ON s.tenant_id = c.tenant_id
  WHERE c.status = 'active';

  SELECT CASE WHEN (v_active_teachers + count(*)) = 0 THEN 0
              ELSE round(count(*)::numeric * 100 / (v_active_teachers + count(*)), 1) END
  INTO v_churn
  FROM public.biz_contracts
  WHERE status = 'ended' AND updated_at >= CURRENT_DATE - 90;

  SELECT COALESCE(sum(t.amount) FILTER (WHERE t.occurred_on >= date_trunc('month', CURRENT_DATE)), 0),
         COALESCE(sum(t.amount) FILTER (WHERE t.occurred_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                                          AND t.occurred_on < date_trunc('month', CURRENT_DATE)), 0)
  INTO v_this_month, v_prev_month
  FROM public.biz_transactions t
  LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
  WHERE t.direction = 'in' AND t.status = 'confirmed'
    AND COALESCE(bc.kind, '') <> 'loan'
    AND t.occurred_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month';

  SELECT jsonb_build_object(
    'revenue',  COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'in'), 0),
    'expenses', COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'out'), 0),
    'net',      COALESCE(sum(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0))
  INTO v_totals
  FROM public.biz_transactions t
  LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
  WHERE t.status = 'confirmed' AND COALESCE(bc.kind, '') <> 'loan';

  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month), '[]'::jsonb)
  INTO v_by_month
  FROM (
    SELECT to_char(date_trunc('month', t.occurred_on), 'YYYY-MM') AS month,
           COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'in'), 0) AS revenue,
           COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'out'), 0) AS expenses
    FROM public.biz_transactions t
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.status = 'confirmed' AND COALESCE(bc.kind, '') <> 'loan'
      AND t.occurred_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
    GROUP BY 1
  ) m;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
  INTO v_by_tenant
  FROM (
    SELECT COALESCE(tn.name, t.counterparty, 'غير مرتبط') AS name, sum(t.amount) AS total
    FROM public.biz_transactions t
    LEFT JOIN public.tenants tn ON tn.id = t.tenant_id
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.direction = 'in' AND t.status = 'confirmed'
      AND COALESCE(bc.kind, '') <> 'loan'
      AND t.occurred_on >= CURRENT_DATE - 365
    GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
  INTO v_by_category
  FROM (
    SELECT COALESCE(bc.name, 'غير مصنف') AS name, sum(t.amount) AS total
    FROM public.biz_transactions t
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.direction = 'in' AND t.status = 'confirmed'
      AND COALESCE(bc.kind, '') <> 'loan'
      AND t.occurred_on >= CURRENT_DATE - 365
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'mrr', v_mrr,
    'arr', v_mrr * 12,
    'active_teachers', v_active_teachers,
    'arpt', CASE WHEN v_active_teachers > 0 THEN round(v_mrr / v_active_teachers, 2) ELSE 0 END,
    'churn_rate', v_churn,
    'revenue_this_month', v_this_month,
    'revenue_prev_month', v_prev_month,
    'mom_growth', CASE WHEN v_prev_month > 0
                       THEN round((v_this_month - v_prev_month) * 100 / v_prev_month, 1)
                       ELSE NULL END,
    'totals', v_totals,
    'by_month', v_by_month,
    'revenue_by_tenant', v_by_tenant,
    'revenue_by_category', v_by_category
  );
END;
$$;
