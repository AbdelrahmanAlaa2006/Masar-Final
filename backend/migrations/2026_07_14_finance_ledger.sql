-- ============================================================================
-- 2026_07_14_finance_ledger.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Evolves the existing payment system into a complete financial ledger.
-- student_ledger is EXTENDED (never replaced) — every existing payment,
-- balance and report keeps working unchanged.
--
--   1. student_ledger + transaction_date (backdated entries: the secretary can
--      record yesterday's payment today; reports use transaction_date, while
--      created_at remains the audit timestamp) + billing_period (partial
--      payments: attribute charges/payments to a subscription month).
--   2. finance_categories : admin-defined revenue/expense categories — no code
--      changes needed for new revenue types (books, notes, courses, ...).
--   3. finance_transactions : cash movements NOT tied to student subscriptions
--      (custom revenue + all expenses).
--   4. RPCs for the daily cash ledger (running balance), reports, current cash
--      balance and outstanding student balances — all single SQL aggregates,
--      SECURITY DEFINER guarded by has_permission(auth.uid(),'payments') and
--      current_tenant_id() (repo convention).
-- ============================================================================

-- 1) student_ledger extensions --------------------------------------------------
ALTER TABLE public.student_ledger ADD COLUMN IF NOT EXISTS transaction_date DATE;
UPDATE public.student_ledger
  SET transaction_date = (created_at AT TIME ZONE 'utc')::date
  WHERE transaction_date IS NULL;
ALTER TABLE public.student_ledger ALTER COLUMN transaction_date SET DEFAULT CURRENT_DATE;
ALTER TABLE public.student_ledger ALTER COLUMN transaction_date SET NOT NULL;

ALTER TABLE public.student_ledger ADD COLUMN IF NOT EXISTS billing_period TEXT;
-- Backfill: existing subscription payments already carry the month label in
-- description (e.g. «اشتراك شهر أكتوبر») — reuse it as the billing period.
UPDATE public.student_ledger
  SET billing_period = description
  WHERE billing_period IS NULL AND description LIKE 'اشتراك%';

CREATE INDEX IF NOT EXISTS idx_student_ledger_tenant_txdate
  ON public.student_ledger(tenant_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_student_ledger_billing
  ON public.student_ledger(student_id, billing_period)
  WHERE billing_period IS NOT NULL;

-- 2) Categories ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('revenue', 'expense')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT finance_categories_uniq UNIQUE (tenant_id, name, kind)
);

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_finance_categories ON public.finance_categories;
CREATE TRIGGER trig_set_tenant_id_finance_categories
  BEFORE INSERT ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP POLICY IF EXISTS "Finance categories staff" ON public.finance_categories;
CREATE POLICY "Finance categories staff" ON public.finance_categories
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'));

-- Seed sensible defaults for every existing tenant (idempotent).
INSERT INTO public.finance_categories (tenant_id, name, kind)
SELECT t.id, c.name, c.kind
FROM public.tenants t
CROSS JOIN (VALUES
  ('بيع كتب', 'revenue'),
  ('مذكرات مطبوعة', 'revenue'),
  ('حصص مراجعة', 'revenue'),
  ('كورسات خاصة', 'revenue'),
  ('دروس خصوصية', 'revenue'),
  ('كهرباء', 'expense'),
  ('إنترنت', 'expense'),
  ('مياه', 'expense'),
  ('إيجار', 'expense'),
  ('طباعة', 'expense'),
  ('مرتبات', 'expense'),
  ('نظافة', 'expense'),
  ('أدوات مكتبية', 'expense')
) AS c(name, kind)
ON CONFLICT ON CONSTRAINT finance_categories_uniq DO NOTHING;

-- 3) Non-subscription cash movements ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant_date
  ON public.finance_transactions(tenant_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category
  ON public.finance_transactions(tenant_id, category_id);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_finance_transactions ON public.finance_transactions;
CREATE TRIGGER trig_set_tenant_id_finance_transactions
  BEFORE INSERT ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP POLICY IF EXISTS "Finance transactions staff" ON public.finance_transactions;
CREATE POLICY "Finance transactions staff" ON public.finance_transactions
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'));

-- 4) Reporting RPCs ---------------------------------------------------------------

-- Daily cash ledger: every approved student payment/refund UNIONed with every
-- finance transaction, chronological, with an opening balance and a running
-- balance computed in one SQL pass. Reports use transaction_date (backdating).
CREATE OR REPLACE FUNCTION public.finance_daily_ledger(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_opening NUMERIC;
  v_rows JSONB;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH movements AS (
    SELECT sl.id,
           'student_ledger'::text AS source,
           sl.transaction_date,
           sl.created_at,
           CASE WHEN sl.type = 'payment' THEN 'in' ELSE 'out' END AS direction,
           sl.amount,
           COALESCE(NULLIF(sl.description, ''), 'دفعة اشتراك') AS description,
           'اشتراكات الطلاب'::text AS category,
           p.name AS student_name,
           sl.payment_method,
           sl.billing_period
    FROM public.student_ledger sl
    LEFT JOIN public.profiles p ON p.id = sl.student_id
    WHERE sl.tenant_id = v_tenant
      AND sl.status = 'approved'
      AND sl.type IN ('payment', 'refund')
    UNION ALL
    SELECT ft.id,
           'finance_transactions'::text AS source,
           ft.transaction_date,
           ft.created_at,
           ft.direction,
           ft.amount,
           ft.description,
           COALESCE(fc.name, CASE WHEN ft.direction = 'in' THEN 'إيرادات أخرى' ELSE 'مصروفات أخرى' END) AS category,
           p.name AS student_name,
           NULL::text AS payment_method,
           NULL::text AS billing_period
    FROM public.finance_transactions ft
    LEFT JOIN public.finance_categories fc ON fc.id = ft.category_id
    LEFT JOIN public.profiles p ON p.id = ft.student_id
    WHERE ft.tenant_id = v_tenant
  )
  SELECT
    COALESCE((SELECT sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END)
              FROM movements WHERE transaction_date < p_from), 0),
    COALESCE((SELECT jsonb_agg(row_to_json(x))
              FROM (
                SELECT *,
                       sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END)
                         OVER (ORDER BY transaction_date, created_at, id) AS period_running
                FROM movements
                WHERE transaction_date BETWEEN p_from AND p_to
                ORDER BY transaction_date, created_at, id
              ) x), '[]'::jsonb)
  INTO v_opening, v_rows;

  RETURN jsonb_build_object('opening_balance', v_opening, 'entries', v_rows);
END;
$$;

-- Aggregated financial report for a date range.
CREATE OR REPLACE FUNCTION public.finance_report(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_subscriptions NUMERIC;
  v_refunds NUMERIC;
  v_other_revenue JSONB;
  v_expenses JSONB;
  v_other_revenue_total NUMERIC;
  v_expenses_total NUMERIC;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(sum(amount) FILTER (WHERE type = 'payment'), 0),
         COALESCE(sum(amount) FILTER (WHERE type = 'refund'), 0)
  INTO v_subscriptions, v_refunds
  FROM public.student_ledger
  WHERE tenant_id = v_tenant AND status = 'approved'
    AND transaction_date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'total', total) ORDER BY total DESC), '[]'::jsonb),
         COALESCE(sum(total), 0)
  INTO v_other_revenue, v_other_revenue_total
  FROM (
    SELECT COALESCE(fc.name, 'إيرادات أخرى') AS category, sum(ft.amount) AS total
    FROM public.finance_transactions ft
    LEFT JOIN public.finance_categories fc ON fc.id = ft.category_id
    WHERE ft.tenant_id = v_tenant AND ft.direction = 'in'
      AND ft.transaction_date BETWEEN p_from AND p_to
    GROUP BY 1
  ) r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'total', total) ORDER BY total DESC), '[]'::jsonb),
         COALESCE(sum(total), 0)
  INTO v_expenses, v_expenses_total
  FROM (
    SELECT COALESCE(fc.name, 'مصروفات أخرى') AS category, sum(ft.amount) AS total
    FROM public.finance_transactions ft
    LEFT JOIN public.finance_categories fc ON fc.id = ft.category_id
    WHERE ft.tenant_id = v_tenant AND ft.direction = 'out'
      AND ft.transaction_date BETWEEN p_from AND p_to
    GROUP BY 1
  ) e;

  RETURN jsonb_build_object(
    'subscriptions_total', v_subscriptions,
    'refunds_total', v_refunds,
    'other_revenue_total', v_other_revenue_total,
    'other_revenue_by_category', v_other_revenue,
    'expenses_total', v_expenses_total,
    'expenses_by_category', v_expenses,
    'revenue_total', v_subscriptions - v_refunds + v_other_revenue_total,
    'net_income', v_subscriptions - v_refunds + v_other_revenue_total - v_expenses_total
  );
END;
$$;

-- Current cash on hand (all-time in − out).
CREATE OR REPLACE FUNCTION public.finance_cash_balance()
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_students NUMERIC;
  v_other NUMERIC;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(sum(CASE WHEN type = 'payment' THEN amount WHEN type = 'refund' THEN -amount ELSE 0 END), 0)
  INTO v_students
  FROM public.student_ledger
  WHERE tenant_id = v_tenant AND status = 'approved' AND type IN ('payment', 'refund');

  SELECT COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
  INTO v_other
  FROM public.finance_transactions
  WHERE tenant_id = v_tenant;

  RETURN v_students + v_other;
END;
$$;

-- Outstanding student balances (debts): charges − payments/discounts > 0,
-- grouped in SQL — never computed row-by-row in the client.
CREATE OR REPLACE FUNCTION public.finance_outstanding_balances()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_rows JSONB;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.balance DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT p.id AS student_id, p.name, p.grade, p."group", p.parent_phone,
           sum(CASE WHEN sl.type IN ('charge', 'refund') THEN sl.amount ELSE -sl.amount END) AS balance
    FROM public.student_ledger sl
    JOIN public.profiles p ON p.id = sl.student_id
    WHERE sl.tenant_id = v_tenant AND sl.status = 'approved'
    GROUP BY p.id, p.name, p.grade, p."group", p.parent_phone
    HAVING sum(CASE WHEN sl.type IN ('charge', 'refund') THEN sl.amount ELSE -sl.amount END) > 0
  ) x;

  RETURN v_rows;
END;
$$;

-- Lock down execution (repo convention).
REVOKE EXECUTE ON FUNCTION public.finance_daily_ledger(DATE, DATE) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.finance_report(DATE, DATE) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.finance_cash_balance() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.finance_outstanding_balances() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_daily_ledger(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_report(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_cash_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_outstanding_balances() TO authenticated;
