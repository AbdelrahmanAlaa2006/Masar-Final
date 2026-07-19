-- ============================================================================
-- 2026_07_19_business_finance_foundation.sql
--
-- Company-level (platform owner) financial system — SUPER ADMIN ONLY.
-- Completely separate from the tenant-level books (finance_transactions /
-- finance_categories / student_ledger belong to teachers; these biz_* tables
-- belong to the company). The two systems never join.
--
-- Core principle: biz_transactions is the single ledger. Every report
-- (revenue, expenses, cash flow, P&L, per-teacher revenue) is an aggregate
-- over stored ledger rows — nothing is ever calculated from UI state.
--
-- See BUSINESS_ARCHITECTURE.md for the full design rationale.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- 1) Accounts — where company money physically sits ---------------------------
CREATE TABLE IF NOT EXISTS public.biz_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank', 'cash', 'wallet', 'other')),
  currency TEXT NOT NULL DEFAULT 'EGP',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2) Categories — revenue/expense classification ------------------------------
CREATE TABLE IF NOT EXISTS public.biz_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('revenue', 'expense')),
  parent_id UUID REFERENCES public.biz_categories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT biz_categories_uniq UNIQUE (kind, name)
);

-- 3) Teacher contracts — the agreement, NOT the money -------------------------
-- contract_type is an open set; the numbers live in `terms` JSONB:
--   fixed_yearly        → { "yearly_amount": 20000, "payment_day": 1 }
--   upfront             → { "upfront_amount": 15000 }
--   per_student_monthly → { "monthly_per_student": 20, "expected_students": 300 }
--   hybrid              → any combination of the above keys
-- Reports NEVER read terms — actual money is always biz_transactions rows
-- carrying contract_id. New contract types need zero schema changes.
CREATE TABLE IF NOT EXISTS public.biz_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  counterparty TEXT NOT NULL,               -- teacher / company name
  title TEXT NOT NULL DEFAULT '',
  contract_type TEXT NOT NULL,              -- open set (see above)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'suspended', 'ended')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  currency TEXT NOT NULL DEFAULT 'EGP',
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4) Recurring templates — subscriptions & repeating bills --------------------
-- Infrastructure services (Supabase, Claude, domains, Cloudflare, hosting)
-- are rows here: vendor + category + cadence. No separate services table —
-- it would duplicate this one 1:1.
CREATE TABLE IF NOT EXISTS public.biz_recurring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                       -- "Supabase Pro", "Claude Code", …
  direction TEXT NOT NULL DEFAULT 'out' CHECK (direction IN ('in', 'out')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),   -- EGP (functional currency)
  original_amount NUMERIC(14,2),            -- e.g. 25.00 when billed in USD
  original_currency TEXT,                   -- e.g. 'USD'
  category_id UUID REFERENCES public.biz_categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.biz_accounts(id) ON DELETE SET NULL,
  counterparty TEXT,                        -- vendor
  cadence TEXT NOT NULL CHECK (cadence IN ('monthly', 'quarterly', 'yearly')),
  next_due_on DATE NOT NULL,
  auto_post BOOLEAN NOT NULL DEFAULT false, -- true → posting RPC creates ledger rows
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_posted_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 5) THE LEDGER — every company money movement is one row here ----------------
CREATE TABLE IF NOT EXISTS public.biz_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),    -- EGP (functional currency)
  original_amount NUMERIC(14,2),
  original_currency TEXT,
  category_id UUID REFERENCES public.biz_categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.biz_accounts(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,      -- revenue attribution
  contract_id UUID REFERENCES public.biz_contracts(id) ON DELETE SET NULL,
  recurring_id UUID REFERENCES public.biz_recurring(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'recurring', 'contract')),
  description TEXT NOT NULL DEFAULT '',
  counterparty TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes ---------------------------------------------------------------------
-- Date-range scans drive every report.
CREATE INDEX IF NOT EXISTS idx_biz_tx_occurred ON public.biz_transactions (occurred_on);
CREATE INDEX IF NOT EXISTS idx_biz_tx_category ON public.biz_transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biz_tx_account  ON public.biz_transactions (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biz_tx_tenant   ON public.biz_transactions (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biz_tx_contract ON public.biz_transactions (contract_id) WHERE contract_id IS NOT NULL;
-- A recurring template can post at most ONE ledger row per due date —
-- makes the posting RPC idempotent under double invocation.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_biz_tx_recurring_day
  ON public.biz_transactions (recurring_id, occurred_on) WHERE recurring_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_recurring_due ON public.biz_recurring (next_due_on) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_biz_contracts_tenant ON public.biz_contracts (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biz_contracts_status ON public.biz_contracts (status);

-- RLS: SUPER ADMIN ONLY — tenants/teachers/students can never touch these ----
ALTER TABLE public.biz_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biz_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biz_contracts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biz_recurring    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biz_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['biz_accounts','biz_categories','biz_contracts','biz_recurring','biz_transactions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Super admin only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Super admin only" ON public.%I FOR ALL TO authenticated
         USING (public.is_super_admin(auth.uid()))
         WITH CHECK (public.is_super_admin(auth.uid()))', t);
  END LOOP;
END $$;

-- 6) Posting engine: materialize due recurring templates ----------------------
-- Called by the dashboard (one RPC per visit; cron-ready later). For each
-- active auto_post row that is due: insert a ledger row per missed due date
-- and advance the cursor. Non-auto rows are only reported as due reminders.
CREATE OR REPLACE FUNCTION public.biz_post_due_recurring()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_posted INT := 0;
  v_due JSONB;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR r IN
    SELECT * FROM public.biz_recurring
    WHERE is_active AND auto_post AND next_due_on <= CURRENT_DATE
    ORDER BY next_due_on
  LOOP
    WHILE r.next_due_on <= CURRENT_DATE LOOP
      -- The unique index makes this idempotent under double invocation.
      INSERT INTO public.biz_transactions
        (occurred_on, direction, amount, original_amount, original_currency,
         category_id, account_id, recurring_id, source, description, counterparty, created_by)
      VALUES
        (r.next_due_on, r.direction, r.amount, r.original_amount, r.original_currency,
         r.category_id, r.account_id, r.id, 'recurring', r.name, r.counterparty, auth.uid())
      ON CONFLICT (recurring_id, occurred_on) WHERE recurring_id IS NOT NULL DO NOTHING;
      v_posted := v_posted + 1;
      r.next_due_on := CASE r.cadence
        WHEN 'monthly'   THEN r.next_due_on + INTERVAL '1 month'
        WHEN 'quarterly' THEN r.next_due_on + INTERVAL '3 months'
        WHEN 'yearly'    THEN r.next_due_on + INTERVAL '1 year'
      END;
    END LOOP;
    UPDATE public.biz_recurring
    SET next_due_on = r.next_due_on, last_posted_on = CURRENT_DATE,
        updated_at = timezone('utc', now())
    WHERE id = r.id;
  END LOOP;

  -- Due-but-manual templates (reminders for the dashboard).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'amount', amount, 'cadence', cadence,
           'next_due_on', next_due_on, 'counterparty', counterparty)
           ORDER BY next_due_on), '[]'::jsonb)
  INTO v_due
  FROM public.biz_recurring
  WHERE is_active AND NOT auto_post AND next_due_on <= CURRENT_DATE;

  RETURN jsonb_build_object('posted', v_posted, 'due_manual', v_due);
END;
$$;

-- 7) Dashboard: every report in ONE round trip --------------------------------
CREATE OR REPLACE FUNCTION public.biz_dashboard(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totals JSONB;
  v_accounts JSONB;
  v_by_category JSONB;
  v_by_tenant JSONB;
  v_monthly JSONB;
  v_recurring_monthly NUMERIC;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Period totals (P&L headline)
  SELECT jsonb_build_object(
    'revenue',  COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0),
    'expenses', COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0),
    'net',      COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0),
    'tx_count', count(*))
  INTO v_totals
  FROM public.biz_transactions
  WHERE occurred_on BETWEEN p_from AND p_to;

  -- Cash position per account (all-time, ledger-derived — never stored)
  SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.balance DESC), '[]'::jsonb)
  INTO v_accounts
  FROM (
    SELECT ac.id, ac.name, ac.kind,
           COALESCE(sum(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0) AS balance
    FROM public.biz_accounts ac
    LEFT JOIN public.biz_transactions t ON t.account_id = ac.id
    WHERE ac.is_active
    GROUP BY ac.id, ac.name, ac.kind
  ) a;

  -- Breakdown by category in period
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.total DESC), '[]'::jsonb)
  INTO v_by_category
  FROM (
    SELECT COALESCE(bc.name, 'غير مصنف') AS category, t.direction, sum(t.amount) AS total
    FROM public.biz_transactions t
    LEFT JOIN public.biz_categories bc ON bc.id = t.category_id
    WHERE t.occurred_on BETWEEN p_from AND p_to
    GROUP BY 1, 2
  ) c;

  -- Revenue per tenant (which teacher generates what) in period
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
  INTO v_by_tenant
  FROM (
    SELECT tn.name AS tenant_name, tn.slug, sum(t.amount) AS total
    FROM public.biz_transactions t
    JOIN public.tenants tn ON tn.id = t.tenant_id
    WHERE t.direction = 'in' AND t.occurred_on BETWEEN p_from AND p_to
    GROUP BY tn.id, tn.name, tn.slug
  ) x;

  -- Monthly P&L series in period (cash-flow / trend chart)
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month), '[]'::jsonb)
  INTO v_monthly
  FROM (
    SELECT to_char(date_trunc('month', occurred_on), 'YYYY-MM') AS month,
           COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) AS revenue,
           COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS expenses,
           COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net
    FROM public.biz_transactions
    WHERE occurred_on BETWEEN p_from AND p_to
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
    'accounts', v_accounts,
    'by_category', v_by_category,
    'revenue_by_tenant', v_by_tenant,
    'monthly', v_monthly,
    'recurring_monthly_burn', v_recurring_monthly
  );
END;
$$;

-- Lock down execution (repo convention)
REVOKE EXECUTE ON FUNCTION public.biz_post_due_recurring() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.biz_dashboard(DATE, DATE) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.biz_post_due_recurring() TO authenticated;
GRANT EXECUTE ON FUNCTION public.biz_dashboard(DATE, DATE) TO authenticated;

-- 8) Seeds (idempotent): a default cash account + sensible categories ---------
INSERT INTO public.biz_accounts (name, kind)
VALUES ('الحساب الرئيسي', 'bank')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.biz_categories (name, kind)
VALUES
  ('اشتراكات المعلمين', 'revenue'),
  ('دفعات تعاقد', 'revenue'),
  ('إيرادات أخرى', 'revenue'),
  ('بنية تحتية', 'expense'),
  ('نطاقات ودومينات', 'expense'),
  ('أدوات تطوير', 'expense'),
  ('تسويق', 'expense'),
  ('مصروفات أخرى', 'expense')
ON CONFLICT ON CONSTRAINT biz_categories_uniq DO NOTHING;
