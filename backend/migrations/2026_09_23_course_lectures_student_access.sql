-- ============================================================================
-- 2026_09_23_course_lectures_student_access.sql
--
-- The course-lecture tables (2026_09_22_course_lectures_system.sql) let ANY
-- signed-in user of the tenant read EVERY row:
--
--   USING (tenant_id = current_tenant_id())
--
-- So a student could read the whole curriculum of their platform — chapter and
-- lecture titles for other grades, and the file list (names, sizes) of course
-- packages they never bought. The older content tables do not work that way:
--   * videos / exams  → tenant AND (admin OR has_content_access(...))
--   * lectures        → admin OR grade = the student's grade
--
-- This brings the new tables in line:
--   * staff (admin, or an assistant with the 'videos' permission) see all of
--     their tenant, exactly as before;
--   * a student sees a chapter/lecture only when its grade is their own (or it
--     has no grade), AND — when it belongs to a course package — only when they
--     have an APPROVED purchase of that package. That is the same rule the
--     r2-download-url edge function already enforces for downloads, so the
--     listing now matches what the student can actually open.
--
-- Writes are untouched.
-- ============================================================================

-- Shared by the three child tables, which have no grade/package of their own.
-- SECURITY DEFINER so it can read course_lectures without re-entering RLS.
CREATE OR REPLACE FUNCTION public.can_view_course_lecture(p_lecture_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_lectures l
    LEFT JOIN public.profiles me ON me.id = auth.uid()
    WHERE l.id = p_lecture_id
      AND l.tenant_id = public.current_tenant_id()
      AND (
        public.is_current_user_admin()
        OR public.has_permission(auth.uid(), 'videos')
        OR (
          (l.grade IS NULL OR l.grade = me.grade)
          AND (
            l.package_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.package_purchases pp
              WHERE pp.student_id = auth.uid()
                AND pp.package_id = l.package_id
                AND pp.payment_status = 'approved'
            )
          )
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_course_lecture(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_course_lecture(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_course_lecture(uuid) TO authenticated, service_role;

-- ─── chapters ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS course_chapters_select ON public.course_chapters;
CREATE POLICY course_chapters_select ON public.course_chapters
  FOR SELECT
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'videos')
      OR (
        (grade IS NULL OR grade = (SELECT p.grade FROM public.profiles p WHERE p.id = auth.uid()))
        AND (
          package_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.package_purchases pp
            WHERE pp.student_id = auth.uid()
              AND pp.package_id = course_chapters.package_id
              AND pp.payment_status = 'approved'
          )
        )
      )
    )
  );

-- ─── lectures ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS course_lectures_select ON public.course_lectures;
CREATE POLICY course_lectures_select ON public.course_lectures
  FOR SELECT
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'videos')
      OR (
        (grade IS NULL OR grade = (SELECT p.grade FROM public.profiles p WHERE p.id = auth.uid()))
        AND (
          package_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.package_purchases pp
            WHERE pp.student_id = auth.uid()
              AND pp.package_id = course_lectures.package_id
              AND pp.payment_status = 'approved'
          )
        )
      )
    )
  );

-- ─── the three child tables follow their lecture ────────────────────────────
DROP POLICY IF EXISTS lecture_videos_select ON public.lecture_videos;
CREATE POLICY lecture_videos_select ON public.lecture_videos
  FOR SELECT
  USING (tenant_id = public.current_tenant_id() AND public.can_view_course_lecture(lecture_id));

DROP POLICY IF EXISTS lecture_exams_select ON public.lecture_exams;
CREATE POLICY lecture_exams_select ON public.lecture_exams
  FOR SELECT
  USING (tenant_id = public.current_tenant_id() AND public.can_view_course_lecture(lecture_id));

DROP POLICY IF EXISTS lecture_files_select ON public.lecture_files;
CREATE POLICY lecture_files_select ON public.lecture_files
  FOR SELECT
  USING (tenant_id = public.current_tenant_id() AND public.can_view_course_lecture(lecture_id));

SELECT 'course lecture access tightened' AS result;
