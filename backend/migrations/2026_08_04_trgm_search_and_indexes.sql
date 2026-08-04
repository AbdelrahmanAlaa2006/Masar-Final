-- =====================================================================
-- 2026_08_04_trgm_search_and_indexes.sql
-- Optimizes student search latency and WhatsApp queue queries under high concurrency
-- =====================================================================

-- 1. Enable pg_trgm extension for wildcard substring search (ilike %term%)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Trigram GIN Index on profiles.name for high-performance student search
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm 
  ON public.profiles USING gin (name gin_trgm_ops);

-- 3. Composite Index on profiles for student role and grade lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role_grade_tenant
  ON public.profiles (tenant_id, role, grade) WHERE role = 'student';

-- 4. Composite Index on unified_notifications status & tenant for WhatsApp worker queries
CREATE INDEX IF NOT EXISTS idx_unified_notifs_tenant_status
  ON public.unified_notifications (tenant_id, (status->>'whatsapp'));
