-- ============================================================================
-- 2026_07_19_business_loans.sql
-- Loans (سلف) to developers/staff — money out that comes back.
--
-- Accounting treatment: a loan touches CASH but never P&L.
--   give a loan   → direction 'out' + a category of kind 'loan'
--   repayment     → direction 'in'  + the same category
-- Account balances keep counting loan rows (the money really moved);
-- revenue/expenses/net/monthly series now EXCLUDE kind='loan' categories.
-- Outstanding per person = sum(out) - sum(in) grouped by counterparty.
-- ============================================================================

-- 1) Third category kind
ALTER TABLE public.biz_categories DROP CONSTRAINT IF EXISTS biz_categories_kind_check;
ALTER TABLE public.biz_categories
  ADD CONSTRAINT biz_categories_kind_check CHECK (kind IN ('revenue', 'expense', 'loan'));

INSERT INTO public.biz_categories (name, kind)
VALUES ('سلف ومديونيات العاملين', 'loan')
ON CONFLICT ON CONSTRAINT biz_categories_uniq DO NOTHING;

-- 2) Dashboard v3: P&L excludes loans; adds loans outstanding block ----------
CREATE OR REPLACE FUNCTION public.biz_dashboard(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totals JSONB;
  v_pending JSONB;
  v_accounts JSONB;
  v_by_category JSONB;
  v_by_tenant JSONB;
  v_monthly JSONB;
  v_recurring_monthly NUMERIC;
  v_loans JSONB;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- P&L headline — confirmed, non-loan
  SELECT jsonb_build_object(
    'revenue',  COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'in'), 0),
    'expenses', COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'out'), 0),
    'net',      COALESCE(sum(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0),
    'tx_count', count(*))
  INTO v_totals
  FROM public.biz_transactions t
  LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
  WHERE t.occurred_on BETWEEN p_from AND p_to AND t.status = 'confirmed'
    AND COALESCE(bc.kind, '') <> 'loan';

  -- Expected (pending) money in period — informational, non-loan
  SELECT jsonb_build_object(
    'expected_in',  COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'in'), 0),
    'expected_out', COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'out'), 0))
  INTO v_pending
  FROM public.biz_transactions t
  LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
  WHERE t.occurred_on BETWEEN p_from AND p_to AND t.status = 'pending'
    AND COALESCE(bc.kind, '') <> 'loan';

  -- Cash position per account — loans INCLUDED (the money really moved)
  SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.balance DESC), '[]'::jsonb)
  INTO v_accounts
  FROM (
    SELECT ac.id, ac.name, ac.kind,
           COALESCE(sum(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END)
                    FILTER (WHERE t.status = 'confirmed'), 0) AS balance
    FROM public.biz_accounts ac
    LEFT JOIN public.biz_transactions t ON t.account_id = ac.id
    WHERE ac.is_active
    GROUP BY ac.id, ac.name, ac.kind
  ) a;

  -- Breakdown by category in period (confirmed, non-loan)
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.total DESC), '[]'::jsonb)
  INTO v_by_category
  FROM (
    SELECT COALESCE(bc.name, 'غير مصنف') AS category, t.direction, sum(t.amount) AS total
    FROM public.biz_transactions t
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.occurred_on BETWEEN p_from AND p_to AND t.status = 'confirmed'
      AND COALESCE(bc.kind, '') <> 'loan'
    GROUP BY 1, 2
  ) c;

  -- Revenue per tenant in period (confirmed, non-loan)
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
  INTO v_by_tenant
  FROM (
    SELECT tn.name AS tenant_name, tn.slug, sum(t.amount) AS total
    FROM public.biz_transactions t
    JOIN public.tenants tn ON tn.id = t.tenant_id
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.direction = 'in' AND t.occurred_on BETWEEN p_from AND p_to
      AND t.status = 'confirmed' AND COALESCE(bc.kind, '') <> 'loan'
    GROUP BY tn.id, tn.name, tn.slug
  ) x;

  -- Monthly P&L series in period (confirmed, non-loan)
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month), '[]'::jsonb)
  INTO v_monthly
  FROM (
    SELECT to_char(date_trunc('month', t.occurred_on), 'YYYY-MM') AS month,
           COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'in'), 0) AS revenue,
           COALESCE(sum(t.amount) FILTER (WHERE t.direction = 'out'), 0) AS expenses,
           COALESCE(sum(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0) AS net
    FROM public.biz_transactions t
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.occurred_on BETWEEN p_from AND p_to AND t.status = 'confirmed'
      AND COALESCE(bc.kind, '') <> 'loan'
    GROUP BY 1
  ) m;

  -- Committed monthly burn from active recurring templates (normalized)
  SELECT COALESCE(sum(CASE cadence
           WHEN 'monthly' THEN amount
           WHEN 'quarterly' THEN amount / 3
           WHEN 'yearly' THEN amount / 12 END
           * CASE WHEN direction = 'out' THEN 1 ELSE -1 END), 0)
  INTO v_recurring_monthly
  FROM public.biz_recurring
  WHERE is_active;

  -- Loans: outstanding per person (ALL-TIME, confirmed) — a loan stays owed
  -- until repaid regardless of the selected period.
  SELECT jsonb_build_object(
    'outstanding_total', COALESCE(sum(x.outstanding), 0),
    'by_person', COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.outstanding DESC)
                          FILTER (WHERE x.outstanding <> 0), '[]'::jsonb))
  INTO v_loans
  FROM (
    SELECT COALESCE(NULLIF(t.counterparty, ''), 'غير محدد') AS name,
           sum(CASE WHEN t.direction = 'out' THEN t.amount ELSE -t.amount END) AS outstanding
    FROM public.biz_transactions t
    JOIN public.biz_categories bc ON bc.id = t.category_id AND bc.kind = 'loan'
    WHERE t.status = 'confirmed'
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'totals', v_totals,
    'pending', v_pending,
    'accounts', v_accounts,
    'by_category', v_by_category,
    'revenue_by_tenant', v_by_tenant,
    'monthly', v_monthly,
    'recurring_monthly_burn', v_recurring_monthly,
    'loans', v_loans
  );
END;
$$;

-- 3) KPIs v2: revenue metrics exclude loan repayments ------------------------
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
           COALESCE((terms->>'monthly_per_student')::numeric, 0)
             * COALESCE((terms->>'expected_students')::numeric, 0)
           + COALESCE((terms->>'yearly_amount')::numeric, 0) / 12.0), 0),
         count(*)
  INTO v_mrr, v_active_teachers
  FROM public.biz_contracts
  WHERE status = 'active';

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
