-- ============================================================================
-- 2026_07_15_booklets.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Complete Booklets Management & Payment System, integrated with the existing
-- payment module (finance_transactions / finance_categories from
-- 2026_07_14_finance_ledger.sql) and the existing students / branches /
-- groups / academic-stage (profiles.grade) architecture.
--
--   1. booklets             : the catalog — stage + branch + optional group +
--                             academic scope (full year OR first/second term)
--                             + price + active/archived status.
--   2. student_booklets     : one row per (student, booklet) assignment with a
--                             price snapshot and unpaid/paid status. UNIQUE
--                             (student_id, booklet_id) makes duplicates
--                             impossible by construction.
--   3. booklet_payment_logs : append-only audit of every payment action
--                             (who, when, previous → new status, amount).
--   4. booklet_sync_assignments(booklet) : (re)assigns a booklet to every
--                             matching student, set-based, no duplicates.
--   5. Auto-assignment triggers on profiles + student_groups so students who
--                             join (or change stage/branch/group) later pick
--                             up their matching active booklets automatically.
--   6. booklet_mark_paid    : transactional multi-row payment — updates
--                             status, stamps date + admin, writes the audit
--                             log AND a finance_transactions revenue row
--                             (category «مبيعات الكتيبات») so booklet income
--                             shows up in the existing daily ledger/reports.
--   7. booklet_revert_payment : admin correction — back to unpaid, logged,
--                             with a compensating expense transaction so the
--                             cash ledger stays truthful. History is never
--                             deleted.
--   8. booklet_report       : one SQL pass returning filtered rows + totals
--                             (assigned / paid / unpaid / amounts) — no N+1.
--
-- All tables are tenant-isolated by RLS; every RPC is SECURITY DEFINER and
-- checks has_permission(auth.uid(), 'payments') + current_tenant_id()
-- (repo convention).
-- ============================================================================

-- 1) booklets ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booklets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  grade TEXT NOT NULL,                                        -- academic stage (profiles.grade key)
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,  -- NULL = every branch
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,     -- NULL = every group
  academic_scope TEXT NOT NULL CHECK (academic_scope IN ('year', 'term')),
  term TEXT CHECK (term IN ('first', 'second')),
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  -- Year booklets carry no term; term booklets must say which term.
  CONSTRAINT booklets_scope_term_chk CHECK (
    (academic_scope = 'year' AND term IS NULL) OR
    (academic_scope = 'term' AND term IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_booklets_tenant_grade
  ON public.booklets(tenant_id, grade, status);

ALTER TABLE public.booklets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_booklets ON public.booklets;
CREATE TRIGGER trig_set_tenant_id_booklets
  BEFORE INSERT ON public.booklets
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP POLICY IF EXISTS "Booklets staff" ON public.booklets;
CREATE POLICY "Booklets staff" ON public.booklets
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'));

-- 2) student_booklets ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_booklets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booklet_id UUID NOT NULL REFERENCES public.booklets(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),   -- snapshot at assignment time
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  payment_date TIMESTAMP WITH TIME ZONE,
  paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  -- One assignment per student per booklet — duplicates are impossible.
  CONSTRAINT student_booklets_uniq UNIQUE (student_id, booklet_id)
);

CREATE INDEX IF NOT EXISTS idx_student_booklets_tenant_student
  ON public.student_booklets(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_booklets_tenant_booklet
  ON public.student_booklets(tenant_id, booklet_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_student_booklets_payment_date
  ON public.student_booklets(tenant_id, payment_date)
  WHERE payment_date IS NOT NULL;

ALTER TABLE public.student_booklets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_student_booklets ON public.student_booklets;
CREATE TRIGGER trig_set_tenant_id_student_booklets
  BEFORE INSERT ON public.student_booklets
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP POLICY IF EXISTS "Student booklets staff" ON public.student_booklets;
CREATE POLICY "Student booklets staff" ON public.student_booklets
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'));

-- Students may see their own booklet assignments (read-only).
DROP POLICY IF EXISTS "Student booklets self read" ON public.student_booklets;
CREATE POLICY "Student booklets self read" ON public.student_booklets
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- 3) booklet_payment_logs (append-only — payment history is never lost) -------
CREATE TABLE IF NOT EXISTS public.booklet_payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_booklet_id UUID REFERENCES public.student_booklets(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  booklet_id UUID REFERENCES public.booklets(id) ON DELETE SET NULL,
  -- Denormalized names so the log survives deletion of the referenced rows.
  student_name TEXT,
  booklet_name TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_booklet_payment_logs_tenant
  ON public.booklet_payment_logs(tenant_id, created_at);

ALTER TABLE public.booklet_payment_logs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_booklet_payment_logs ON public.booklet_payment_logs;
CREATE TRIGGER trig_set_tenant_id_booklet_payment_logs
  BEFORE INSERT ON public.booklet_payment_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

-- Read-only for staff; rows are written exclusively by the SECURITY DEFINER
-- payment RPCs below (append-only audit trail).
DROP POLICY IF EXISTS "Booklet payment logs staff read" ON public.booklet_payment_logs;
CREATE POLICY "Booklet payment logs staff read" ON public.booklet_payment_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'));

-- 4) Assignment sync -----------------------------------------------------------
-- (Re)assigns one booklet to every matching student. Set-based, idempotent:
--   * inserts missing assignments (ON CONFLICT skips existing → no duplicates)
--   * refreshes the price snapshot on rows still UNPAID
--   * removes UNPAID assignments that no longer match (criteria edited);
--     PAID rows are always preserved — they are financial history.
-- Matching rules: stage (grade) + branch (when set) + group (when set, via the
-- student_groups join table or the legacy profiles."group" name).
CREATE OR REPLACE FUNCTION public.booklet_sync_assignments(p_booklet_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_booklet public.booklets%ROWTYPE;
  v_group_name TEXT;
  v_added INTEGER := 0;
  v_removed INTEGER := 0;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_booklet
  FROM public.booklets
  WHERE id = p_booklet_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booklet not found';
  END IF;

  IF v_booklet.group_id IS NOT NULL THEN
    SELECT name INTO v_group_name FROM public.groups WHERE id = v_booklet.group_id;
  END IF;

  -- Drop unpaid assignments for students who no longer match.
  WITH removed AS (
    DELETE FROM public.student_booklets sb
    WHERE sb.booklet_id = v_booklet.id
      AND sb.tenant_id = v_tenant
      AND sb.payment_status = 'unpaid'
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = sb.student_id
          AND p.role = 'student'
          AND p.grade = v_booklet.grade
          AND (v_booklet.branch_id IS NULL OR p.branch_id = v_booklet.branch_id)
          AND (v_booklet.group_id IS NULL
               OR EXISTS (SELECT 1 FROM public.student_groups sg
                          WHERE sg.student_id = p.id AND sg.group_id = v_booklet.group_id)
               OR (v_group_name IS NOT NULL AND p."group" = v_group_name))
      )
    RETURNING sb.id
  )
  SELECT count(*) INTO v_removed FROM removed;

  -- Unpaid rows follow the current booklet price.
  UPDATE public.student_booklets
  SET price = v_booklet.price, updated_at = now()
  WHERE booklet_id = v_booklet.id
    AND tenant_id = v_tenant
    AND payment_status = 'unpaid'
    AND price IS DISTINCT FROM v_booklet.price;

  -- Assign to every matching student not yet assigned (default: unpaid).
  WITH added AS (
    INSERT INTO public.student_booklets (tenant_id, student_id, booklet_id, price)
    SELECT v_tenant, p.id, v_booklet.id, v_booklet.price
    FROM public.profiles p
    WHERE p.tenant_id = v_tenant
      AND p.role = 'student'
      AND p.grade = v_booklet.grade
      AND (v_booklet.branch_id IS NULL OR p.branch_id = v_booklet.branch_id)
      AND (v_booklet.group_id IS NULL
           OR EXISTS (SELECT 1 FROM public.student_groups sg
                      WHERE sg.student_id = p.id AND sg.group_id = v_booklet.group_id)
           OR (v_group_name IS NOT NULL AND p."group" = v_group_name))
    ON CONFLICT ON CONSTRAINT student_booklets_uniq DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_added FROM added;

  RETURN jsonb_build_object('added', v_added, 'removed', v_removed);
END;
$$;

-- 5) Auto-assignment for future students ---------------------------------------
-- New students (or stage/branch/group changes) pick up matching ACTIVE
-- booklets automatically. Exception-safe: a failure here must never block
-- registration or profile edits (same convention as the audit logger).
CREATE OR REPLACE FUNCTION public.booklet_auto_assign_student()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM 'student' OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.student_booklets (tenant_id, student_id, booklet_id, price)
  SELECT b.tenant_id, NEW.id, b.id, b.price
  FROM public.booklets b
  WHERE b.tenant_id = NEW.tenant_id
    AND b.status = 'active'
    AND b.grade = NEW.grade
    AND (b.branch_id IS NULL OR NEW.branch_id = b.branch_id)
    AND (b.group_id IS NULL
         OR EXISTS (SELECT 1 FROM public.student_groups sg
                    WHERE sg.student_id = NEW.id AND sg.group_id = b.group_id)
         OR NEW."group" = (SELECT g.name FROM public.groups g WHERE g.id = b.group_id))
  ON CONFLICT ON CONSTRAINT student_booklets_uniq DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- never block signup / profile updates
END;
$$;

DROP TRIGGER IF EXISTS trig_booklet_auto_assign_profiles ON public.profiles;
CREATE TRIGGER trig_booklet_auto_assign_profiles
  AFTER INSERT OR UPDATE OF grade, branch_id, "group" ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.booklet_auto_assign_student();

-- Joining a group can also make new booklets match.
CREATE OR REPLACE FUNCTION public.booklet_auto_assign_group_member()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.student_booklets (tenant_id, student_id, booklet_id, price)
  SELECT b.tenant_id, p.id, b.id, b.price
  FROM public.booklets b
  JOIN public.profiles p ON p.id = NEW.student_id
  WHERE b.group_id = NEW.group_id
    AND b.status = 'active'
    AND b.tenant_id = p.tenant_id
    AND p.role = 'student'
    AND b.grade = p.grade
    AND (b.branch_id IS NULL OR p.branch_id = b.branch_id)
  ON CONFLICT ON CONSTRAINT student_booklets_uniq DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_booklet_auto_assign_student_groups ON public.student_groups;
CREATE TRIGGER trig_booklet_auto_assign_student_groups
  AFTER INSERT ON public.student_groups
  FOR EACH ROW EXECUTE FUNCTION public.booklet_auto_assign_group_member();

-- 6) Payment (transactional, duplicate-proof) -----------------------------------
-- Marks a set of assignments paid in ONE transaction:
--   * only rows still 'unpaid' are touched (already-paid rows are skipped →
--     duplicate payments are impossible, even under concurrent clicks)
--   * stamps payment_date + the acting admin
--   * appends the audit log rows
--   * records the revenue in finance_transactions under «مبيعات الكتيبات»
--     so booklet income flows into the existing daily ledger and reports.
CREATE OR REPLACE FUNCTION public.booklet_mark_paid(p_ids UUID[], p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_actor UUID := auth.uid();
  v_category UUID;
  v_updated INTEGER := 0;
  v_amount NUMERIC := 0;
BEGIN
  IF NOT public.has_permission(v_actor, 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('updated', 0, 'skipped', 0, 'total_amount', 0);
  END IF;

  -- Booklet revenue lands in the finance ledger under its own category.
  INSERT INTO public.finance_categories (tenant_id, name, kind)
  VALUES (v_tenant, 'مبيعات الكتيبات', 'revenue')
  ON CONFLICT ON CONSTRAINT finance_categories_uniq DO NOTHING;
  SELECT id INTO v_category
  FROM public.finance_categories
  WHERE tenant_id = v_tenant AND name = 'مبيعات الكتيبات' AND kind = 'revenue';

  WITH paid AS (
    UPDATE public.student_booklets sb
    SET payment_status = 'paid',
        payment_date = now(),
        paid_by = v_actor,
        notes = COALESCE(NULLIF(p_notes, ''), sb.notes),
        updated_at = now()
    WHERE sb.id = ANY(p_ids)
      AND sb.tenant_id = v_tenant
      AND sb.payment_status = 'unpaid'
    RETURNING sb.id, sb.student_id, sb.booklet_id, sb.price
  ),
  logged AS (
    INSERT INTO public.booklet_payment_logs
      (tenant_id, student_booklet_id, student_id, booklet_id, student_name,
       booklet_name, amount, previous_status, new_status, performed_by, notes)
    SELECT v_tenant, pd.id, pd.student_id, pd.booklet_id, sp.name,
           b.name, pd.price, 'unpaid', 'paid', v_actor, NULLIF(p_notes, '')
    FROM paid pd
    JOIN public.booklets b ON b.id = pd.booklet_id
    LEFT JOIN public.profiles sp ON sp.id = pd.student_id
  ),
  cash AS (
    INSERT INTO public.finance_transactions
      (tenant_id, category_id, direction, amount, description, student_id,
       transaction_date, created_by)
    SELECT v_tenant, v_category, 'in', pd.price,
           'كتيب: ' || b.name ||
             CASE b.academic_scope
               WHEN 'year' THEN ' (العام الدراسي)'
               ELSE CASE b.term WHEN 'first' THEN ' (الترم الأول)' ELSE ' (الترم الثاني)' END
             END,
           pd.student_id, CURRENT_DATE, v_actor
    FROM paid pd
    JOIN public.booklets b ON b.id = pd.booklet_id
    WHERE pd.price > 0
  )
  SELECT count(*), COALESCE(sum(price), 0) INTO v_updated, v_amount FROM paid;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', array_length(p_ids, 1) - v_updated,
    'total_amount', v_amount
  );
END;
$$;

-- Admin correction: revert a payment back to unpaid. The original payment is
-- never erased — the revert is logged and offset by a compensating expense
-- transaction so the cash ledger stays truthful.
CREATE OR REPLACE FUNCTION public.booklet_revert_payment(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_actor UUID := auth.uid();
  v_row public.student_booklets%ROWTYPE;
  v_booklet_name TEXT;
  v_student_name TEXT;
  v_category UUID;
BEGIN
  IF NOT public.has_permission(v_actor, 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.student_booklets
  SET payment_status = 'unpaid',
      payment_date = NULL,
      paid_by = NULL,
      updated_at = now()
  WHERE id = p_id AND tenant_id = v_tenant AND payment_status = 'paid'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found or already unpaid';
  END IF;

  SELECT name INTO v_booklet_name FROM public.booklets WHERE id = v_row.booklet_id;
  SELECT name INTO v_student_name FROM public.profiles WHERE id = v_row.student_id;

  INSERT INTO public.booklet_payment_logs
    (tenant_id, student_booklet_id, student_id, booklet_id, student_name,
     booklet_name, amount, previous_status, new_status, performed_by)
  VALUES
    (v_tenant, v_row.id, v_row.student_id, v_row.booklet_id, v_student_name,
     v_booklet_name, v_row.price, 'paid', 'unpaid', v_actor);

  IF v_row.price > 0 THEN
    INSERT INTO public.finance_categories (tenant_id, name, kind)
    VALUES (v_tenant, 'مبيعات الكتيبات', 'expense')
    ON CONFLICT ON CONSTRAINT finance_categories_uniq DO NOTHING;
    SELECT id INTO v_category
    FROM public.finance_categories
    WHERE tenant_id = v_tenant AND name = 'مبيعات الكتيبات' AND kind = 'expense';

    INSERT INTO public.finance_transactions
      (tenant_id, category_id, direction, amount, description, student_id,
       transaction_date, created_by)
    VALUES
      (v_tenant, v_category, 'out', v_row.price,
       'استرجاع دفع كتيب: ' || COALESCE(v_booklet_name, ''),
       v_row.student_id, CURRENT_DATE, v_actor);
  END IF;

  RETURN jsonb_build_object('reverted', true);
END;
$$;

-- 7) Report ---------------------------------------------------------------------
-- Filtered rows + totals in one SQL pass (no N+1). The date range filters by
-- payment date, so setting it implicitly narrows the result to paid rows.
-- Year and term booklets never mix: each row carries exactly one scope, and
-- the scope/term filters partition them cleanly.
CREATE OR REPLACE FUNCTION public.booklet_report(
  p_search TEXT DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_branch UUID DEFAULT NULL,
  p_group UUID DEFAULT NULL,
  p_scope TEXT DEFAULT NULL,
  p_term TEXT DEFAULT NULL,
  p_booklet UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_group_name TEXT;
  v_result JSONB;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'payments') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_group IS NOT NULL THEN
    SELECT name INTO v_group_name FROM public.groups WHERE id = p_group;
  END IF;

  WITH rows AS (
    SELECT sb.id,
           sb.student_id,
           p.name AS student_name,
           p.grade,
           br.name AS branch_name,
           p."group" AS group_name,
           b.id AS booklet_id,
           b.name AS booklet_name,
           b.academic_scope,
           b.term,
           sb.price,
           sb.payment_status,
           sb.payment_date,
           payer.name AS paid_by_name
    FROM public.student_booklets sb
    JOIN public.booklets b ON b.id = sb.booklet_id
    JOIN public.profiles p ON p.id = sb.student_id
    LEFT JOIN public.branches br ON br.id = p.branch_id
    LEFT JOIN public.profiles payer ON payer.id = sb.paid_by
    WHERE sb.tenant_id = v_tenant
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%')
      AND (p_grade IS NULL OR p.grade = p_grade)
      AND (p_branch IS NULL OR p.branch_id = p_branch)
      AND (p_group IS NULL
           OR EXISTS (SELECT 1 FROM public.student_groups sg
                      WHERE sg.student_id = p.id AND sg.group_id = p_group)
           OR (v_group_name IS NOT NULL AND p."group" = v_group_name))
      AND (p_scope IS NULL OR b.academic_scope = p_scope)
      AND (p_term IS NULL OR b.term = p_term)
      AND (p_booklet IS NULL OR b.id = p_booklet)
      AND (p_status IS NULL OR sb.payment_status = p_status)
      AND (p_from IS NULL OR (sb.payment_date IS NOT NULL AND sb.payment_date::date >= p_from))
      AND (p_to IS NULL OR (sb.payment_date IS NOT NULL AND sb.payment_date::date <= p_to))
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(row_to_json(r) ORDER BY r.student_name, r.booklet_name)
                      FROM rows r), '[]'::jsonb),
    'totals', (SELECT jsonb_build_object(
        'assigned', count(*),
        'paid', count(*) FILTER (WHERE payment_status = 'paid'),
        'unpaid', count(*) FILTER (WHERE payment_status = 'unpaid'),
        'paid_amount', COALESCE(sum(price) FILTER (WHERE payment_status = 'paid'), 0),
        'remaining_amount', COALESCE(sum(price) FILTER (WHERE payment_status = 'unpaid'), 0)
      ) FROM rows)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Lock down execution (repo convention).
REVOKE EXECUTE ON FUNCTION public.booklet_sync_assignments(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.booklet_mark_paid(UUID[], TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.booklet_revert_payment(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.booklet_report(TEXT, TEXT, UUID, UUID, TEXT, TEXT, UUID, TEXT, DATE, DATE) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.booklet_sync_assignments(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booklet_mark_paid(UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booklet_revert_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booklet_report(TEXT, TEXT, UUID, UUID, TEXT, TEXT, UUID, TEXT, DATE, DATE) TO authenticated;
