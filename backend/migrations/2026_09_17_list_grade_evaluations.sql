-- ============================================================================
-- 2026_09_17_list_grade_evaluations.sql
--
-- Bug: grading sessions disappeared from «التقييم السابق» in the grades panel.
--
-- listUniqueEvaluations() downloaded EVERY grade row of the tenant (newest
-- first) and filtered by stage in the browser. PostgREST returns at most 1000
-- rows per request, so once a tenant passed 1000 grade rows the oldest
-- sessions were silently cut off. The Miracle in English had 2476 rows: its
-- «تسميع 01-09» and «تسميع 05-09» sat at rows 1578-1763 and never arrived,
-- although every grade was still in the table.
--
-- The report page had the same problem waiting: it filtered by stage and type
-- in SQL, but still returned one row per student per session, so a full school
-- year would pass 1000 rows for a single stage.
--
-- This function groups in the database and returns one row per session —
-- a few dozen rows no matter how many grades exist.
--
-- SECURITY INVOKER (the default): row-level security on grades and profiles
-- applies exactly as it did for the old direct queries, so staff still only
-- see their own tenant.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_grade_evaluations(p_grade text, p_type text DEFAULT NULL)
RETURNS TABLE (type text, title text, created_at timestamptz, max_score numeric, row_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    g.type,
    btrim(g.title)                         AS title,
    max(g.created_at)                      AS created_at,
    max(g.max_score)::numeric              AS max_score,
    count(*)                               AS row_count
  FROM public.grades g
  JOIN public.profiles p ON p.id = g.student_id
  WHERE p.grade = p_grade
    AND (p_type IS NULL OR g.type = p_type)
    AND btrim(coalesce(g.title, '')) <> ''
  GROUP BY g.type, btrim(g.title)
  ORDER BY max(g.created_at) DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_grade_evaluations(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_grade_evaluations(text, text) TO authenticated, service_role;

SELECT 'list_grade_evaluations ready' AS result;
