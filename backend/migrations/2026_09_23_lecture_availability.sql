-- 2026_09_23_lecture_availability.sql
-- Add availability duration and window to course_lectures

ALTER TABLE public.course_lectures 
  ADD COLUMN IF NOT EXISTS available_hours INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;
