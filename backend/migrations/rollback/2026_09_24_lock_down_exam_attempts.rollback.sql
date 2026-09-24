-- Restores the exam_attempts policies exactly as they were before
-- 2026_09_24_lock_down_exam_attempts.sql (including the holes it closed).

DROP POLICY IF EXISTS exam_attempts_insert_self_blank ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_staff_update      ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_super_admin_all   ON public.exam_attempts;

CREATE POLICY "Tenant isolation ON exam_attempts" ON public.exam_attempts
  FOR ALL USING (tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant insert isolation ON exam_attempts" ON public.exam_attempts
  FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()) AND (auth.uid() = student_id));

CREATE POLICY "Tenant update isolation ON exam_attempts" ON public.exam_attempts
  FOR UPDATE USING ((tenant_id = public.current_tenant_id()) AND ((auth.uid() = student_id) OR public.is_current_user_admin()));

CREATE POLICY exam_attempts_admin_all ON public.exam_attempts
  FOR ALL
  USING ((EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) OR public.is_super_admin(auth.uid()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) OR public.is_super_admin(auth.uid()));

CREATE POLICY exam_attempts_insert_self_blank ON public.exam_attempts
  FOR INSERT WITH CHECK ((student_id = auth.uid()) AND (submitted_at IS NULL) AND (COALESCE(score, 0) = 0) AND (video_assessment_id IS NULL));

CREATE POLICY exam_attempts_select_own_or_admin ON public.exam_attempts
  FOR SELECT
  USING (((student_id = auth.uid()) AND (video_assessment_id IS NULL)) OR (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) OR public.is_super_admin(auth.uid()));
