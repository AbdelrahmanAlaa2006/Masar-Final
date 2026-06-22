-- =====================================================================
-- SQL MIGRATION: Extend student_ledger for Packages V1
-- Adds the missing package_id column to student_ledger
-- and reloads the PostgREST schema cache to resolve query failures.
-- =====================================================================

-- 1. Add package_id for V1 packages if missing
ALTER TABLE public.student_ledger 
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL;

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_ledger_package_v1 ON public.student_ledger(package_id);

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
