-- Restores the policies exactly as they were before
-- 2026_09_24_lock_down_tenant_write_policies.sql (including the holes it closed).

DROP POLICY IF EXISTS academic_years_select ON public.academic_years;
DROP POLICY IF EXISTS academic_years_staff_write ON public.academic_years;
CREATE POLICY "Academic years tenant isolation" ON public.academic_years
  FOR ALL USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS branches_select ON public.branches;
DROP POLICY IF EXISTS branches_staff_write ON public.branches;
CREATE POLICY "Branches tenant isolation" ON public.branches
  FOR ALL USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS ao_staff_all ON public.access_overrides;
DROP POLICY IF EXISTS ao_student_select ON public.access_overrides;
CREATE POLICY "Tenant isolation ON access_overrides" ON public.access_overrides
  FOR ALL USING (tenant_id = public.current_tenant_id());
CREATE POLICY ao_admin_all ON public.access_overrides
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ao_student_select ON public.access_overrides
  FOR SELECT USING (
    public.is_admin()
    OR (scope = 'student' AND target_id = auth.uid()::text)
    OR (scope = 'prep' AND target_id = (SELECT profiles.grade FROM public.profiles WHERE profiles.id = auth.uid()))
    OR (scope = 'group' AND target_id = (SELECT COALESCE(profiles.grade, '') || ':' || COALESCE(profiles."group", '') FROM public.profiles WHERE profiles.id = auth.uid()))
  );

DROP POLICY IF EXISTS chat_messages_update_own_thread ON public.chat_messages;
CREATE POLICY "Tenant update isolation ON chat_messages" ON public.chat_messages
  FOR UPDATE USING (tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant isolation ON homework_submissions" ON public.homework_submissions
  FOR ALL USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant insert isolation ON homework_submissions" ON public.homework_submissions
  FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()) AND (auth.uid() = student_id));
CREATE POLICY "Tenant update isolation ON homework_submissions" ON public.homework_submissions
  FOR UPDATE USING ((tenant_id = public.current_tenant_id()) AND ((auth.uid() = student_id) OR public.is_current_user_admin()));

CREATE POLICY "Tenant isolation ON homeworks" ON public.homeworks
  FOR ALL USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS notifications_select_targeted ON public.notifications;
CREATE POLICY "Tenant delete isolation ON notifications" ON public.notifications
  FOR DELETE USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant update isolation ON notifications" ON public.notifications
  FOR UPDATE USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant insert isolation ON notifications" ON public.notifications
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = notifications.tenant_id));
CREATE POLICY "Tenant select isolation ON notifications" ON public.notifications
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY notifications_select_targeted ON public.notifications
  FOR SELECT USING (
    (tenant_id = public.current_tenant_id()) AND (public.is_admin() OR (scope = 'all')
    OR ((scope = 'student') AND (target_student = auth.uid()))
    OR ((scope = 'grade') AND (target_grade = (SELECT profiles.grade FROM public.profiles WHERE profiles.id = auth.uid())))
    OR ((scope = 'group') AND (target_group = (SELECT COALESCE(profiles.grade, '') || ':' || COALESCE(profiles."group", '') FROM public.profiles WHERE profiles.id = auth.uid()))))
  );

DROP POLICY IF EXISTS payment_settings_staff_write ON public.payment_settings;
CREATE POLICY "Tenant isolation ON payment_settings" ON public.payment_settings
  FOR ALL USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS quiz_attempts_staff_all ON public.quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_select_own ON public.quiz_attempts;
CREATE POLICY "Tenant isolation ON quiz_attempts" ON public.quiz_attempts
  FOR ALL USING (tenant_id = public.current_tenant_id());
CREATE POLICY quiz_attempts_admin_all ON public.quiz_attempts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY quiz_attempts_select_own_or_admin ON public.quiz_attempts
  FOR SELECT USING ((student_id = auth.uid()) OR public.is_admin());

DROP TRIGGER IF EXISTS trig_guard_video_progress_views ON public.video_progress;
DROP FUNCTION IF EXISTS public.guard_video_progress_views();
DROP POLICY IF EXISTS video_progress_staff_all ON public.video_progress;
DROP POLICY IF EXISTS video_progress_select_own ON public.video_progress;
CREATE POLICY "Tenant isolation ON video_progress" ON public.video_progress
  FOR ALL USING (tenant_id = public.current_tenant_id());
CREATE POLICY video_progress_admin_all ON public.video_progress
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY video_progress_select_own_or_admin ON public.video_progress
  FOR SELECT USING ((student_id = auth.uid()) OR public.is_admin());

CREATE POLICY video_parts_admin_write ON public.video_parts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY video_parts_select ON public.video_parts
  FOR SELECT USING (
    public.is_admin() OR (public.student_session_authorized() AND EXISTS (
      SELECT 1 FROM public.videos v
       WHERE v.id = video_parts.video_id
         AND v.grade = (SELECT profiles.grade FROM public.profiles WHERE profiles.id = auth.uid())))
  );

DROP POLICY IF EXISTS whatsapp_provider_health_staff ON public.whatsapp_provider_health;
CREATE POLICY "Provider health tenant read/write" ON public.whatsapp_provider_health
  FOR ALL USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
