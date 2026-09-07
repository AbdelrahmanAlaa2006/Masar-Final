-- =====================================================================
-- Migration: 2026_09_07_exam_hourly_availability.sql
-- Description:
--   1. Updates compute_exam_expiration() trigger to support both
--      available_hours and availability_days.
--   2. Fixes PostgreSQL trigger syntax (BEFORE INSERT OR UPDATE ON public.exams).
--   3. Backfills expires_at for existing scheduled exams if null.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.compute_exam_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opens_at IS NOT NULL THEN
    IF NEW.availability_days IS NOT NULL AND NEW.availability_days > 0 THEN
      NEW.expires_at := NEW.opens_at + (NEW.availability_days || ' days')::interval;
    ELSIF NEW.available_hours IS NOT NULL AND NEW.available_hours > 0 THEN
      NEW.expires_at := NEW.opens_at + (NEW.available_hours || ' hours')::interval;
    ELSE
      NEW.expires_at := COALESCE(NEW.expires_at, NULL);
    END IF;
  ELSIF NEW.available_hours IS NOT NULL AND NEW.available_hours > 0 THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + (NEW.available_hours || ' hours')::interval;
  ELSE
    NEW.expires_at := COALESCE(NEW.expires_at, NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_exam_expiration ON public.exams;
CREATE TRIGGER trg_compute_exam_expiration
  BEFORE INSERT OR UPDATE ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_exam_expiration();

-- Backfill expires_at for existing scheduled exams if currently null
UPDATE public.exams
   SET expires_at = CASE
     WHEN opens_at IS NOT NULL AND availability_days IS NOT NULL AND availability_days > 0
       THEN opens_at + (availability_days || ' days')::interval
     WHEN opens_at IS NOT NULL AND available_hours IS NOT NULL AND available_hours > 0
       THEN opens_at + (available_hours || ' hours')::interval
     ELSE expires_at
   END
 WHERE expires_at IS NULL AND opens_at IS NOT NULL;
