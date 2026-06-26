-- =====================================================================
-- 2026_07_06_add_grade_to_attendance_sessions.sql
-- Run in Supabase SQL editor to add the grade column to attendance_sessions
-- =====================================================================

-- 1. Add grade column to public.attendance_sessions
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS grade TEXT;

-- 2. Backfill grade column from linked group's grade
UPDATE public.attendance_sessions s
SET grade = g.grade
FROM public.groups g
WHERE s.group_id = g.id AND s.grade IS NULL;

-- 3. Backfill grade column from linked attendance records' student profiles
UPDATE public.attendance_sessions s
SET grade = (
  SELECT p.grade 
  FROM public.attendance_records r
  JOIN public.profiles p ON p.id = r.student_id
  WHERE r.session_id = s.id
  LIMIT 1
)
WHERE s.grade IS NULL;

-- 4. Set a fallback default if still NULL (e.g. use first grade in system or leave it to be updated)
-- (Safe to leave as NULL, but new sessions will always have it populated)
