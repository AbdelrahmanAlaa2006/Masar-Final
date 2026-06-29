-- =====================================================================
-- 2026_07_07_fix_videos_write_policy.sql
-- Run in Supabase SQL editor. Idempotent: safe to run repeatedly.
--
-- WHY:
-- The videos WRITE policy created in 2026_07_01_playlists_packages.sql used
--   USING (tenant_id = current_tenant_id() AND public.is_current_user_admin())
-- but is_current_user_admin() returns TRUE for EVERY assistant
-- (role IN ('admin','assistant','super_admin')). That let any assistant —
-- even one without the 'videos' permission — INSERT/UPDATE/DELETE videos by
-- calling Supabase directly. This is inconsistent with exams/homeworks, which
-- already gate writes with the granular has_permission(..., 'exams'|'homework').
--
-- FIX:
-- Replace ONLY the videos WRITE policy so it requires the granular 'videos'
-- permission, while still allowing super admins (who have no per-permission
-- row but legitimately manage content in their tenant). The SELECT policy is
-- left untouched, so student/teacher read access is unchanged.
--
-- BACKWARD COMPATIBILITY:
--   - role 'admin'      -> has_permission returns TRUE  (unchanged: can write)
--   - assistant w/ 'videos'   -> TRUE  (unchanged: can write)
--   - assistant w/o 'videos'  -> FALSE (FIXED: previously could write, now blocked)
--   - role 'super_admin'      -> is_super_admin() TRUE (unchanged: can write)
-- No tables, columns, or other policies are created or dropped.
-- =====================================================================

DROP POLICY IF EXISTS "Tenant write isolation ON videos" ON public.videos;

CREATE POLICY "Tenant write isolation ON videos" ON public.videos
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission(auth.uid(), 'videos')
      OR public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission(auth.uid(), 'videos')
      OR public.is_super_admin(auth.uid())
    )
  );
