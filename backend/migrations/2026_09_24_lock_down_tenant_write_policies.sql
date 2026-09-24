-- ============================================================================
-- 2026_09_24_lock_down_tenant_write_policies.sql
--
-- Follow-up to 2026_09_24_lock_down_exam_attempts.sql. The same two mistakes
-- existed on more tables (mostly from 2026_05_26_multitenant.sql):
--
--   1. Permissive policies whose only condition is tenant_id =
--      current_tenant_id(). Permissive policies are OR'd, so any signed-in
--      student of the tenant could insert/update/delete these rows, e.g.
--      change the teacher's payment numbers, grant themselves extra exam
--      attempts (access_overrides), edit homework, grade their own homework
--      submission, or delete other people's notifications.
--   2. Policies that trust is_admin() / role = 'admin' with no tenant check,
--      so an admin of one teacher's platform could read and write another
--      teacher's rows (access_overrides, quiz_attempts, video_progress,
--      video_parts). video_parts_select also let a student of one tenant
--      read another tenant's video parts for the same grade name.
--
-- Legitimate student writes that stay allowed:
--   * homework hand-in and video view counts go through SECURITY DEFINER
--     functions (submit_homework, increment_part_view), which bypass RLS;
--   * video_progress: a student may insert/update their own row (watch
--     position). A trigger now stops them lowering views_used, which would
--     bypass the per-video view limit;
--   * chat_messages: a student may mark messages in their own thread read;
--   * quiz_attempts (legacy): own rows, unchanged.
--
-- "Staff" below = is_current_user_admin() (admin, assistant, super_admin) in
-- the caller's own tenant. Tables with a finer permission policy
-- (homeworks, homework_submissions) keep it.
--
-- Not changed: the legacy `lectures` table (4 rows, no tenant_id column).
--
-- Safe to re-run. Rollback: rollback/2026_09_24_lock_down_tenant_write_policies.rollback.sql
-- ============================================================================

-- ─── academic_years / branches: everyone in the tenant reads, staff write ──
DROP POLICY IF EXISTS "Academic years tenant isolation" ON public.academic_years;
DROP POLICY IF EXISTS academic_years_select ON public.academic_years;
DROP POLICY IF EXISTS academic_years_staff_write ON public.academic_years;
CREATE POLICY academic_years_select ON public.academic_years
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY academic_years_staff_write ON public.academic_years
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

DROP POLICY IF EXISTS "Branches tenant isolation" ON public.branches;
DROP POLICY IF EXISTS branches_select ON public.branches;
DROP POLICY IF EXISTS branches_staff_write ON public.branches;
CREATE POLICY branches_select ON public.branches
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY branches_staff_write ON public.branches
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

-- ─── access_overrides: staff manage; students read the ones aimed at them ──
DROP POLICY IF EXISTS "Tenant isolation ON access_overrides" ON public.access_overrides;
DROP POLICY IF EXISTS ao_admin_all ON public.access_overrides;
DROP POLICY IF EXISTS ao_student_select ON public.access_overrides;
DROP POLICY IF EXISTS ao_staff_all ON public.access_overrides;
CREATE POLICY ao_staff_all ON public.access_overrides
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());
CREATE POLICY ao_student_select ON public.access_overrides
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (scope = 'student' AND target_id = auth.uid()::text)
      OR (scope = 'prep' AND target_id = (SELECT p.grade FROM public.profiles p WHERE p.id = auth.uid()))
      OR (scope = 'group' AND target_id = (
            SELECT COALESCE(p.grade, '') || ':' || COALESCE(p."group", '')
              FROM public.profiles p WHERE p.id = auth.uid()))
    )
  );

-- ─── chat_messages: update only inside your own thread (mark as read) ─────
DROP POLICY IF EXISTS "Tenant update isolation ON chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_update_own_thread ON public.chat_messages;
CREATE POLICY chat_messages_update_own_thread ON public.chat_messages
  FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND (student_id = auth.uid() OR public.is_current_user_admin()))
  WITH CHECK (tenant_id = public.current_tenant_id() AND (student_id = auth.uid() OR public.is_current_user_admin()));

-- ─── homework_submissions: hand-in is the submit_homework() function ───────
-- Kept: hws_admin_all (tenant + 'homework' permission), hws_select_own_or_admin,
-- "Tenant select isolation", "Tenant delete isolation" (staff).
DROP POLICY IF EXISTS "Tenant isolation ON homework_submissions" ON public.homework_submissions;
DROP POLICY IF EXISTS "Tenant insert isolation ON homework_submissions" ON public.homework_submissions;
DROP POLICY IF EXISTS "Tenant update isolation ON homework_submissions" ON public.homework_submissions;

-- ─── homeworks: kept hw_admin_write (tenant + 'homework') and hw_select ───
DROP POLICY IF EXISTS "Tenant isolation ON homeworks" ON public.homeworks;

-- ─── notifications: staff write; everyone reads only what targets them ────
-- Kept: notifications_admin_write, "Super admins full control on
-- notifications", "Tenant write isolation" (tenant + staff),
-- notifications_whatsapp_staff_insert. System notifications are inserted by
-- SECURITY DEFINER triggers, which bypass RLS.
DROP POLICY IF EXISTS "Tenant delete isolation ON notifications" ON public.notifications;
DROP POLICY IF EXISTS "Tenant update isolation ON notifications" ON public.notifications;
DROP POLICY IF EXISTS "Tenant insert isolation ON notifications" ON public.notifications;
DROP POLICY IF EXISTS "Tenant select isolation ON notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_targeted ON public.notifications;
CREATE POLICY notifications_select_targeted ON public.notifications
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.is_current_user_admin()
      OR scope = 'all'
      OR (scope = 'student' AND target_student = auth.uid())
      OR (scope = 'grade' AND target_grade = (SELECT p.grade FROM public.profiles p WHERE p.id = auth.uid()))
      OR (scope = 'group' AND target_group = (
            SELECT COALESCE(p.grade, '') || ':' || COALESCE(p."group", '')
              FROM public.profiles p WHERE p.id = auth.uid()))
    )
  );

-- ─── payment_settings: everyone in the tenant reads, staff write ──────────
-- Kept: "Tenant read payment settings".
DROP POLICY IF EXISTS "Tenant isolation ON payment_settings" ON public.payment_settings;
DROP POLICY IF EXISTS payment_settings_staff_write ON public.payment_settings;
CREATE POLICY payment_settings_staff_write ON public.payment_settings
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

-- ─── quiz_attempts (legacy): own rows, staff of the same tenant ───────────
-- Kept: quiz_attempts_upsert_own, quiz_attempts_update_own.
DROP POLICY IF EXISTS "Tenant isolation ON quiz_attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_admin_all ON public.quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_select_own_or_admin ON public.quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_staff_all ON public.quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_select_own ON public.quiz_attempts;
CREATE POLICY quiz_attempts_staff_all ON public.quiz_attempts
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());
CREATE POLICY quiz_attempts_select_own ON public.quiz_attempts
  FOR SELECT USING (student_id = auth.uid());

-- ─── video_progress: own rows, staff of the same tenant ───────────────────
-- Kept: video_progress_upsert_own, video_progress_update_own.
DROP POLICY IF EXISTS "Tenant isolation ON video_progress" ON public.video_progress;
DROP POLICY IF EXISTS video_progress_admin_all ON public.video_progress;
DROP POLICY IF EXISTS video_progress_select_own_or_admin ON public.video_progress;
DROP POLICY IF EXISTS video_progress_staff_all ON public.video_progress;
DROP POLICY IF EXISTS video_progress_select_own ON public.video_progress;
CREATE POLICY video_progress_staff_all ON public.video_progress
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());
CREATE POLICY video_progress_select_own ON public.video_progress
  FOR SELECT USING (student_id = auth.uid());

-- A student may save their own watch position but must not lower the view
-- counter (that would bypass the per-video view limit). Staff resets and
-- increment_part_view() are unaffected.
CREATE OR REPLACE FUNCTION public.guard_video_progress_views()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_current_user_admin()
     AND COALESCE(NEW.views_used, 0) < COALESCE(OLD.views_used, 0) THEN
    NEW.views_used := OLD.views_used;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_guard_video_progress_views ON public.video_progress;
CREATE TRIGGER trig_guard_video_progress_views
  BEFORE UPDATE ON public.video_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_video_progress_views();

-- ─── video_parts: drop the two tenant-less policies ───────────────────────
-- Kept: "Tenant select isolation ON video_parts", "Tenant write isolation ON
-- video_parts" (both scoped through videos.tenant_id).
DROP POLICY IF EXISTS video_parts_admin_write ON public.video_parts;
DROP POLICY IF EXISTS video_parts_select ON public.video_parts;

-- ─── whatsapp_provider_health: staff only (the gateway uses the service role)
DROP POLICY IF EXISTS "Provider health tenant read/write" ON public.whatsapp_provider_health;
DROP POLICY IF EXISTS whatsapp_provider_health_staff ON public.whatsapp_provider_health;
CREATE POLICY whatsapp_provider_health_staff ON public.whatsapp_provider_health
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());
