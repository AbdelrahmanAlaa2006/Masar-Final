-- ============================================================================
-- 2026_09_19_grade_notifications_cascade.sql
--
-- Bug: deleting a grading sheet failed with
--   new row for relation "unified_notifications" violates check constraint
--   "chk_notification_source_references"
--
-- unified_notifications.grade_id referenced grades(id) ON DELETE SET NULL,
-- while chk_notification_source_references requires a row of type
-- 'grade_added' to HAVE a grade_id. So deleting a grade tried to blank the
-- link, the check rejected the resulting row, and the whole delete failed —
-- an admin could not delete a sheet whose notifications had been generated.
--
-- attendance_record_id already cascades (its notifications are deleted with
-- the record). Grades now behave the same way: a notification about a grade
-- that no longer exists has nothing left to describe.
-- ============================================================================

ALTER TABLE public.unified_notifications
  DROP CONSTRAINT IF EXISTS unified_notifications_grade_id_fkey;

ALTER TABLE public.unified_notifications
  ADD CONSTRAINT unified_notifications_grade_id_fkey
  FOREIGN KEY (grade_id) REFERENCES public.grades(id) ON DELETE CASCADE;

SELECT 'grade notifications now cascade' AS result;
