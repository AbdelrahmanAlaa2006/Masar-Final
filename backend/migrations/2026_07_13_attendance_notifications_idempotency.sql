-- 1. Add attendance_record_id column to public.unified_notifications referencing attendance_records(id)
ALTER TABLE public.unified_notifications 
  ADD COLUMN IF NOT EXISTS attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE CASCADE;

-- 2. Create index for fast attendance-level lookup
CREATE INDEX IF NOT EXISTS idx_unified_notifications_attendance_record 
  ON public.unified_notifications(attendance_record_id);
