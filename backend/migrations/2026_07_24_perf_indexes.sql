-- ============================================================================
-- Performance indexes (audit 2026-07-24). Additive & idempotent — no data
-- change, no lock of concern at current table sizes. Apply with:
--   supabase db query --linked --file backend/migrations/2026_07_24_perf_indexes.sql
-- (If a table has grown very large, swap CREATE INDEX for CREATE INDEX
--  CONCURRENTLY and run each statement on its own — CONCURRENTLY cannot run
--  inside a transaction block.)
-- ============================================================================

-- 1) Partial index for FAILED WhatsApp rows — mirrors the existing pending one
--    (idx_unified_notifications_wa_pending). Makes retryAllFailed's
--    status->>'whatsapp' = 'failed' filter an index scan instead of a table
--    scan, now that the query filters server-side instead of downloading all
--    rows and filtering in JS.
create index if not exists idx_unified_notifications_wa_failed
  on public.unified_notifications(tenant_id, created_at)
  where (status->>'whatsapp') = 'failed';

-- 2) Supports the center report evaluation/title lookups filtered by type
--    (listCenterUniqueEvaluations, listCenterGradesForEvaluation): grades are
--    filtered by (tenant_id, type) then deduped by title.
create index if not exists idx_grades_tenant_type_title
  on public.grades(tenant_id, type, title);
