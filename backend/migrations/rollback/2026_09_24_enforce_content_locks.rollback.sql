-- Rollback for 2026_09_24_enforce_content_locks.sql
DROP TRIGGER IF EXISTS trig_enforce_exam_attempt_unlocked ON public.exam_attempts;
DROP FUNCTION IF EXISTS public.enforce_exam_attempt_unlocked();
DROP FUNCTION IF EXISTS public.content_unlocked_any_context(TEXT, UUID);
