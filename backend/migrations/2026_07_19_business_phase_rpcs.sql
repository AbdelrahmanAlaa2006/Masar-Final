-- ============================================================================
-- 2026_07_19_business_phase_rpcs.sql
-- Aggregation RPCs for the Business Management dashboard (SUPER ADMIN ONLY).
-- One RPC per dashboard tab → each screen loads in a single round trip.
--
--   biz_billing_overview()  Phase 3 — per-teacher billing: expected/collected/
--                           remaining/overdue, computed from contract terms +
--                           the ledger (money is NEVER duplicated).
--   biz_kpis()              Phase 4 — MRR/ARR/growth/churn/ARPT + series.
--   biz_operations()        Phase 5 — platform counts, DB size, queue health.
--
-- Expected-income rules (documented, extensible):
--   upfront_amount          counted once
--   yearly_amount           × contract years started
--   monthly_per_student × expected_students × months elapsed
--   terms.expected_total    explicit override that wins over all of the above
-- ============================================================================

-- Phase 3: billing center ----------------------------------------------------
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
  calc AS (
    SELECT c.id, c.counterparty, c.contract_type, c.status, c.start_date, c.end_date,
           tn.name AS tenant_name, tn.slug AS tenant_slug,
           COALESCE(l.collected, 0) AS collected,
           l.last_payment_on,
           -- months elapsed since start (inclusive of the current month)
           (EXTRACT(YEAR FROM age(CURRENT_DATE, c.start_date)) * 12
            + EXTRACT(MONTH FROM age(CURRENT_DATE, c.start_date)) + 1)::int AS months_elapsed,
           CASE
             WHEN c.terms ? 'expected_total' THEN (c.terms->>'expected_total')::numeric
             ELSE
               COALESCE((c.terms->>'upfront_amount')::numeric, 0)
               + COALESCE((c.terms->>'yearly_amount')::numeric, 0)
                 * GREATEST(1, CEIL((EXTRACT(YEAR FROM age(CURRENT_DATE, c.start_date)) * 12
                     + EXTRACT(MONTH FROM age(CURRENT_DATE, c.start_date)) + 1) / 12.0))
               + COALESCE((c.terms->>'monthly_per_student')::numeric, 0)
                 * COALESCE((c.terms->>'expected_students')::numeric, 0)
                 * (EXTRACT(YEAR FROM age(CURRENT_DATE, c.start_date)) * 12
                    + EXTRACT(MONTH FROM age(CURRENT_DATE, c.start_date)) + 1)
           END AS expected,
           (c.terms ? 'monthly_per_student') AS has_monthly
    FROM public.biz_contracts c
    LEFT JOIN public.tenants tn ON tn.id = c.tenant_id
    LEFT JOIN ledger l ON l.contract_id = c.id
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
           -- Overdue: still owes money AND no payment landed in the current
           -- month (for monthly deals) / no payment at all 30+ days after
           -- start (for one-shot deals).
           (GREATEST(0, expected - collected) > 0 AND (
              (has_monthly AND (last_payment_on IS NULL OR last_payment_on < date_trunc('month', CURRENT_DATE)))
              OR (NOT has_monthly AND last_payment_on IS NULL AND start_date < CURRENT_DATE - 30)
           )) AS overdue,
           -- Next expected payment: monthly deals bill again next month-start.
           CASE WHEN has_monthly
                THEN (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
                ELSE NULL END AS next_payment_on
    FROM calc
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'summary', v_summary);
END;
$$;

-- Phase 4: executive KPIs ------------------------------------------------------
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

  -- MRR: monthly-normalized value of ACTIVE contracts (upfronts are one-time
  -- and excluded by definition).
  SELECT COALESCE(sum(
           COALESCE((terms->>'monthly_per_student')::numeric, 0)
             * COALESCE((terms->>'expected_students')::numeric, 0)
           + COALESCE((terms->>'yearly_amount')::numeric, 0) / 12.0), 0),
         count(*)
  INTO v_mrr, v_active_teachers
  FROM public.biz_contracts
  WHERE status = 'active';

  -- Simplified churn: contracts ended in the last 90 days vs the cohort that
  -- was alive during that window.
  SELECT CASE WHEN (v_active_teachers + count(*)) = 0 THEN 0
              ELSE round(count(*)::numeric * 100 / (v_active_teachers + count(*)), 1) END
  INTO v_churn
  FROM public.biz_contracts
  WHERE status = 'ended' AND updated_at >= CURRENT_DATE - 90;

  -- Month-over-month confirmed revenue growth
  SELECT COALESCE(sum(amount) FILTER (WHERE occurred_on >= date_trunc('month', CURRENT_DATE)), 0),
         COALESCE(sum(amount) FILTER (WHERE occurred_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                                        AND occurred_on < date_trunc('month', CURRENT_DATE)), 0)
  INTO v_this_month, v_prev_month
  FROM public.biz_transactions
  WHERE direction = 'in' AND status = 'confirmed'
    AND occurred_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month';

  -- All-time totals
  SELECT jsonb_build_object(
    'revenue',  COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0),
    'expenses', COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0),
    'net',      COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0))
  INTO v_totals
  FROM public.biz_transactions
  WHERE status = 'confirmed';

  -- Last 12 months revenue/expense series
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month), '[]'::jsonb)
  INTO v_by_month
  FROM (
    SELECT to_char(date_trunc('month', occurred_on), 'YYYY-MM') AS month,
           COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) AS revenue,
           COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS expenses
    FROM public.biz_transactions
    WHERE status = 'confirmed' AND occurred_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
    GROUP BY 1
  ) m;

  -- Revenue by tenant, last 12 months
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
  INTO v_by_tenant
  FROM (
    SELECT COALESCE(tn.name, t.counterparty, 'غير مرتبط') AS name, sum(t.amount) AS total
    FROM public.biz_transactions t
    LEFT JOIN public.tenants tn ON tn.id = t.tenant_id
    WHERE t.direction = 'in' AND t.status = 'confirmed'
      AND t.occurred_on >= CURRENT_DATE - 365
    GROUP BY 1
  ) x;

  -- Revenue by category ("per product"), last 12 months
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
  INTO v_by_category
  FROM (
    SELECT COALESCE(bc.name, 'غير مصنف') AS name, sum(t.amount) AS total
    FROM public.biz_transactions t
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.direction = 'in' AND t.status = 'confirmed'
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

-- Phase 5: operations ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.biz_operations()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenants JSONB;
  v_users JSONB;
  v_whatsapp JSONB;
  v_db_bytes BIGINT;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'with_students', count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.tenant_id = t.id AND p.role = 'student' AND p.is_active)))
  INTO v_tenants
  FROM public.tenants t;

  SELECT jsonb_build_object(
    'students_total',  count(*) FILTER (WHERE role = 'student'),
    'students_active', count(*) FILTER (WHERE role = 'student' AND is_active),
    'with_parent_phone', count(*) FILTER (WHERE role = 'student' AND parent_phone IS NOT NULL AND parent_phone <> ''),
    'assistants', count(*) FILTER (WHERE role = 'assistant'),
    'admins', count(*) FILTER (WHERE role = 'admin'))
  INTO v_users
  FROM public.profiles;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status->>'whatsapp' = 'pending'),
    'sent_total', count(*) FILTER (WHERE status->>'whatsapp' = 'sent'),
    'failed_total', count(*) FILTER (WHERE status->>'whatsapp' = 'failed'),
    'sent_7d', count(*) FILTER (WHERE status->>'whatsapp' = 'sent'
                 AND (status->>'whatsapp_sent_at') >= (CURRENT_DATE - 7)::text),
    'failed_7d', count(*) FILTER (WHERE status->>'whatsapp' = 'failed'
                 AND created_at >= CURRENT_DATE - 7),
    'oldest_pending_at', min(created_at) FILTER (WHERE status->>'whatsapp' = 'pending'))
  INTO v_whatsapp
  FROM public.unified_notifications
  WHERE channels @> ARRAY['whatsapp'];

  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  RETURN jsonb_build_object(
    'tenants', v_tenants,
    'users', v_users,
    'whatsapp', v_whatsapp,
    'db_size_bytes', v_db_bytes,
    'generated_at', timezone('utc', now())
  );
END;
$$;

-- Lock down execution (repo convention)
REVOKE EXECUTE ON FUNCTION public.biz_billing_overview() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.biz_kpis() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.biz_operations() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.biz_billing_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.biz_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.biz_operations() TO authenticated;
