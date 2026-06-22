-- =====================================================================
-- 2026_07_04_packages_grade_column.sql
-- Run in Supabase SQL editor to add grade column to packages table.
-- =====================================================================

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT 'first-sec';

-- Force reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
