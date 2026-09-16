-- ============================================================================
-- 2026_09_17_student_counts_by_grade.sql
--
-- Six report pages (attendance, exams, finance, grades, homework, videos) each
-- counted students per stage by downloading `profiles.grade` for EVERY student
-- and counting in the browser. PostgREST returns at most 1000 rows, so once a
-- tenant keeps more than 1000 students on record (students stay on record for
-- years) the counts on the stage buttons would silently be wrong.
--
-- Counting in the database returns one row per stage instead.
-- SECURITY INVOKER: the same row-level security as the old query, so staff
-- only count their own tenant's students.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.student_counts_by_grade()
RETURNS TABLE (grade text, students bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT p.grade, count(*) AS students
  FROM public.profiles p
  WHERE p.role = 'student'
    AND p.grade IS NOT NULL
  GROUP BY p.grade;
$$;

REVOKE EXECUTE ON FUNCTION public.student_counts_by_grade() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_counts_by_grade() TO authenticated, service_role;
-- Supabase grants EXECUTE on new public functions to anon directly, so
-- REVOKE ... FROM PUBLIC alone does not remove it. Staff-only: block anon.
REVOKE EXECUTE ON FUNCTION public.student_counts_by_grade() FROM anon;

SELECT 'student_counts_by_grade ready' AS result;
