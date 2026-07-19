-- ============================================================================
-- 2026_07_19_business_finance_v2.sql
-- Pre-UI hardening of the business finance foundation. Additive only.
--
--   1. biz_transactions.status  confirmed|pending|void — reports count only
--      confirmed; void replaces delete (audit integrity).
--   2. source CHECK widened     payroll/invoice/tax/adjustment ready now.
--   3. Attachments              attachment_url/key on transactions+contracts.
--   4. Contract snapshots       trigger appends old terms/type/status to a
--      history JSONB whenever they change — renegotiations never lose the
--      previous deal.
--   5. biz_settings             key→JSONB store for company identity /
--      fiscal config / future invoice numbering.
--   6. Audit fields             updated_by on transactions; created_by/
--      updated_by on contracts & recurring.
--   7. biz_dashboard v2         confirmed-only aggregates + pending totals.
-- ============================================================================

-- 1) Transaction status -------------------------------------------------------
ALTER TABLE public.biz_transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.biz_transactions DROP CONSTRAINT IF EXISTS biz_tx_status_check;
ALTER TABLE public.biz_transactions
  ADD CONSTRAINT biz_tx_status_check CHECK (status IN ('confirmed', 'pending', 'void'));

-- 2) Widen the source set (future phases: zero migrations) --------------------
ALTER TABLE public.biz_transactions DROP CONSTRAINT IF EXISTS biz_transactions_source_check;
ALTER TABLE public.biz_transactions
  ADD CONSTRAINT biz_transactions_source_check
  CHECK (source IN ('manual', 'recurring', 'contract', 'payroll', 'invoice', 'tax', 'adjustment'));

-- 3) Attachments (receipts / signed contract PDFs) ----------------------------
ALTER TABLE public.biz_transactions
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_key TEXT;
ALTER TABLE public.biz_contracts
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_key TEXT;

-- 4) Contract snapshots -------------------------------------------------------
ALTER TABLE public.biz_contracts
  ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.biz_contract_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (OLD.terms IS DISTINCT FROM NEW.terms)
     OR (OLD.contract_type IS DISTINCT FROM NEW.contract_type)
     OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.history := COALESCE(OLD.history, '[]'::jsonb) || jsonb_build_object(
      'terms', OLD.terms,
      'contract_type', OLD.contract_type,
      'status', OLD.status,
      'changed_at', timezone('utc', now()),
      'changed_by', auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_biz_contract_snapshot ON public.biz_contracts;
CREATE TRIGGER trig_biz_contract_snapshot
  BEFORE UPDATE ON public.biz_contracts
  FOR EACH ROW EXECUTE FUNCTION public.biz_contract_snapshot();

-- 5) Business settings --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biz_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.biz_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin only" ON public.biz_settings;
CREATE POLICY "Super admin only" ON public.biz_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.biz_settings (key, value)
VALUES ('general', '{"company_name": "GitFekra", "functional_currency": "EGP", "fiscal_year_start_month": 1}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 6) Audit fields -------------------------------------------------------------
ALTER TABLE public.biz_transactions
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.biz_contracts
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.biz_recurring
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 7) Dashboard v2: confirmed-only aggregates + pending (expected) totals ------
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
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Period totals (P&L headline) — settled money only
  SELECT jsonb_build_object(
    'revenue',  COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0),
    'expenses', COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0),
    'net',      COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0),
    'tx_count', count(*))
  INTO v_totals
  FROM public.biz_transactions
  WHERE occurred_on BETWEEN p_from AND p_to AND status = 'confirmed';

  -- Expected (pending) money in period — informational
  SELECT jsonb_build_object(
    'expected_in',  COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0),
    'expected_out', COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0))
  INTO v_pending
  FROM public.biz_transactions
  WHERE occurred_on BETWEEN p_from AND p_to AND status = 'pending';

  -- Cash position per account (all-time, confirmed only, ledger-derived)
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

  -- Breakdown by category in period (confirmed only)
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.total DESC), '[]'::jsonb)
  INTO v_by_category
  FROM (
    SELECT COALESCE(bc.name, 'غير مصنف') AS category, t.direction, sum(t.amount) AS total
    FROM public.biz_transactions t
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.occurred_on BETWEEN p_from AND p_to AND t.status = 'confirmed'
    GROUP BY 1, 2
  ) c;

  -- Revenue per tenant in period (confirmed only)
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
  INTO v_by_tenant
  FROM (
    SELECT tn.name AS tenant_name, tn.slug, sum(t.amount) AS total
    FROM public.biz_transactions t
    JOIN public.tenants tn ON tn.id = t.tenant_id
    WHERE t.direction = 'in' AND t.occurred_on BETWEEN p_from AND p_to
      AND t.status = 'confirmed'
    GROUP BY tn.id, tn.name, tn.slug
  ) x;

  -- Monthly P&L series in period (confirmed only)
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month), '[]'::jsonb)
  INTO v_monthly
  FROM (
    SELECT to_char(date_trunc('month', occurred_on), 'YYYY-MM') AS month,
           COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) AS revenue,
           COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS expenses,
           COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net
    FROM public.biz_transactions
    WHERE occurred_on BETWEEN p_from AND p_to AND status = 'confirmed'
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

  RETURN jsonb_build_object(
    'totals', v_totals,
    'pending', v_pending,
    'accounts', v_accounts,
    'by_category', v_by_category,
    'revenue_by_tenant', v_by_tenant,
    'monthly', v_monthly,
    'recurring_monthly_burn', v_recurring_monthly
  );
END;
$$;
