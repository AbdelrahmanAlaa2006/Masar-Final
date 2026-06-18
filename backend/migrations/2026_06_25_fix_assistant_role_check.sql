-- =====================================================================
-- 2026_06_25_fix_assistant_role_check.sql
-- Fixes constraint check error: violates check constraint "profiles_role_check"
-- when creating assistant accounts.
-- =====================================================================

-- 1. Drop existing role constraint on profiles table
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Add updated role constraint allowing 'student', 'teacher', 'admin', and 'assistant'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('student', 'teacher', 'admin', 'assistant'));
