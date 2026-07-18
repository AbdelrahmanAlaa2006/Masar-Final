-- =====================================================================
-- 2026_07_17_add_updated_at_to_grades_and_attendance.sql
-- Run in Supabase SQL editor to add audit fields for modification tracking
-- =====================================================================

-- Add updated_at column to grades table
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Add updated_at column to attendance_records table
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Create set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to grades table
DROP TRIGGER IF EXISTS trig_set_updated_at_grades ON public.grades;
CREATE TRIGGER trig_set_updated_at_grades BEFORE UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to attendance_records table
DROP TRIGGER IF EXISTS trig_set_updated_at_attendance_records ON public.attendance_records;
CREATE TRIGGER trig_set_updated_at_attendance_records BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
