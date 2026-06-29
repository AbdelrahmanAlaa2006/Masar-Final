-- =====================================================================
-- 2026_07_09_student_status_counts_rpc.sql
-- Run in Supabase SQL editor. Idempotent. No tables/columns/data changed.
--
-- WHY:
-- The AccountsPanel tab badges previously needed FIVE separate COUNT requests
-- (pending/active/inactive/suspended/total). This RPC returns all five in ONE
-- round-trip, cutting request fan-out on every panel open / grade change.
--
-- SECURITY:
-- SECURITY INVOKER (the default) so the caller's RLS on `profiles` still
-- applies — counts are automatically scoped to the caller's tenant. No
-- elevated access is granted. Returns only aggregate numbers, never rows.
--
-- The frontend (backend/profilesApi.js -> getStudentStatusCounts) calls this
-- first and falls back to the old five-query path if it isn't present, so the
-- app works with or without this migration.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_student_status_counts(p_grade TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'pending',   count(*) FILTER (WHERE is_approved = false),
    'active',    count(*) FILTER (WHERE status = 'active'),
    'inactive',  count(*) FILTER (WHERE status = 'inactive' AND is_approved = true),
    'suspended', count(*) FILTER (WHERE status = 'suspended'),
    'total',     count(*)
  )
  FROM public.profiles
  WHERE role = 'student'
    AND (p_grade IS NULL OR p_grade = 'all' OR grade = p_grade);
$$;
