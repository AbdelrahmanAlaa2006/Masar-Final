-- =====================================================================
-- 2026_07_08_student_pagination_indexes.sql
-- Run in Supabase SQL editor. Idempotent and additive (no table/column
-- changes, no data changes). Safe to run repeatedly.
--
-- WHY (query-analysis justified, not speculative):
-- Phase "Student pagination" introduced two hot query shapes in
-- backend/profilesApi.js, both implicitly filtered by tenant_id via RLS
-- (tenant_id = current_tenant_id()):
--
--   1) listStudentsPaged():
--        WHERE role = 'student' [AND status = ?] [AND grade = ?]
--        ORDER BY name  ... LIMIT/OFFSET (.range())
--      The ORDER BY name + role filter benefits from a composite index whose
--      leading columns match the equality predicates (tenant_id, role) and
--      whose trailing column matches the sort (name) — letting Postgres return
--      a page without a full filter+sort of the tenant's students.
--
--   2) getStudentStatusCounts():
--        SELECT count(*) WHERE role = 'student' [AND status = ?] [AND grade = ?]
--      Benefits from (tenant_id, role, status) for the per-tab COUNT queries.
--
-- Only `tenant_id` is indexed today (idx_profiles_tenant_id), so the role
-- filter and the name sort are not index-assisted. At a large tenant (5k–10k+
-- students) this is the difference between an index range scan and a
-- filter+sort over the whole tenant on every admin page load.
--
-- VALIDATION:
-- Before/after, run EXPLAIN ANALYZE on a seeded large tenant, e.g.:
--   EXPLAIN ANALYZE
--   SELECT id, name FROM public.profiles
--   WHERE tenant_id = '<tenant-uuid>' AND role = 'student'
--   ORDER BY name LIMIT 50 OFFSET 0;
-- Expect a switch from Seq Scan + Sort to an Index Scan using the new index.
--
-- NOTE: Add further indexes ONLY when an EXPLAIN ANALYZE shows a real plan
-- improvement — do not add speculative indexes (they slow writes).
-- =====================================================================

-- Supports the paged list's (tenant_id, role) equality + ORDER BY name.
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_role_name
  ON public.profiles (tenant_id, role, name);

-- Supports the per-tab COUNT queries and status-filtered pages.
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_role_status
  ON public.profiles (tenant_id, role, status);
