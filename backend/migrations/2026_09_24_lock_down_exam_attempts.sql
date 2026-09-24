-- ============================================================================
-- 2026_09_24_lock_down_exam_attempts.sql
--
-- exam_attempts had permissive policies that let any signed-in user of a
-- tenant read, insert, update and delete EVERY attempt in that tenant:
--   * "Tenant isolation ON exam_attempts"   FOR ALL, USING only tenant_id
--     (from 2026_05_26_multitenant.sql). Permissive policies are OR'd, so
--     this one alone let a student rescore their own attempt, insert a
--     submitted attempt with any score, or delete other students' attempts.
--     Verified 2026-09-24: a default-tenant student could read 348 attempts
--     of other students.
--   * "Tenant insert isolation" / "Tenant update isolation": a student could
--     insert or update their own row with any score / submitted_at.
--   * exam_attempts_admin_all / exam_attempts_select_own_or_admin checked
--     role = 'admin' with no tenant, so an admin of one tenant could read
--     and change every other tenant's attempts.
--
-- The app never writes attempts directly as a student: start, submit and the
-- pre-video gate all go through SECURITY DEFINER functions, which bypass RLS.
-- The only direct write is the teacher "reset attempts" button (DELETE), kept
-- below for staff of the same tenant.
--
-- After this:
--   SELECT  own rows, or staff (admin/assistant) of the same tenant, or super admin
--   INSERT  own blank row only (not submitted, no score, not a gate attempt)
--   UPDATE  staff of the same tenant, or super admin
--   DELETE  staff of the same tenant, or super admin
--
-- Safe to re-run. Rollback: rollback/2026_09_24_lock_down_exam_attempts.rollback.sql
-- ============================================================================

DROP POLICY IF EXISTS "Tenant isolation ON exam_attempts"        ON public.exam_attempts;
DROP POLICY IF EXISTS "Tenant insert isolation ON exam_attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Tenant update isolation ON exam_attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_admin_all                    ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_select_own_or_admin          ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_insert_self_blank            ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_staff_update                 ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_super_admin_all              ON public.exam_attempts;

-- Kept as is (already correct):
--   "Tenant select isolation ON exam_attempts": tenant AND (own OR staff)
--   "Tenant delete isolation ON exam_attempts": tenant AND staff

CREATE POLICY exam_attempts_insert_self_blank ON public.exam_attempts
  FOR INSERT
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND student_id = auth.uid()
    AND submitted_at IS NULL
    AND COALESCE(score, 0) = 0
    AND video_assessment_id IS NULL
  );

CREATE POLICY exam_attempts_staff_update ON public.exam_attempts
  FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

CREATE POLICY exam_attempts_super_admin_all ON public.exam_attempts
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
