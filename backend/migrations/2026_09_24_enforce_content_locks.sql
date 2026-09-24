-- ============================================================================
-- 2026_09_24_enforce_content_locks.sql
--
-- Prerequisite locks (content_unlock_rules) were only enforced in the browser:
--   * an exam that belongs to a lecture could be started from a direct
--     /exam-taking?id=<id> link (no lecture in the URL), skipping both the
--     lecture's lock and the exam's own prerequisite;
--   * videos in a locked lecture played from the Videos page.
--
-- This adds:
--   1. content_unlocked_any_context(type, id): the caller's lock status for an
--      exam or video wherever it appears. Content inside lectures counts as
--      unlocked when it is unlocked in at least one of its lectures; content
--      in no lecture falls back to its own direct rule. Staff always get
--      unlocked. Used by the app and by the bunny-signed-url edge function.
--   2. A BEFORE INSERT trigger on exam_attempts, so a student can never start
--      an attempt on a locked exam, whichever path starts it.
--
-- Safe to re-run. Rollback: rollback/2026_09_24_enforce_content_locks.rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.content_unlocked_any_context(
  p_target_type TEXT,
  p_target_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant_id UUID := public.current_tenant_id();
  v_role      TEXT;
  v_lec       UUID;
  v_res       JSONB;
  v_first     JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_target_type NOT IN ('exam', 'video') THEN
    RAISE EXCEPTION 'invalid_target_type: %', p_target_type;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'student' THEN
    RETURN jsonb_build_object('unlocked', TRUE);
  END IF;

  FOR v_lec IN
    SELECT lecture_id FROM public.lecture_exams
     WHERE p_target_type = 'exam' AND exam_id = p_target_id AND tenant_id = v_tenant_id
    UNION
    SELECT lecture_id FROM public.lecture_videos
     WHERE p_target_type = 'video' AND video_id = p_target_id AND tenant_id = v_tenant_id
  LOOP
    v_res := public.check_content_unlocked(v_uid, p_target_type, p_target_id, v_lec);
    IF (v_res->>'unlocked')::BOOLEAN THEN
      RETURN v_res;
    END IF;
    v_first := COALESCE(v_first, v_res);
  END LOOP;

  IF v_first IS NOT NULL THEN
    RETURN v_first;
  END IF;

  -- Not inside any lecture: only its own direct rule applies.
  RETURN public.check_content_unlocked(v_uid, p_target_type, p_target_id, NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.content_unlocked_any_context(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.content_unlocked_any_context(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.content_unlocked_any_context(TEXT, UUID) TO authenticated;

-- ─── exam_attempts guard ────────────────────────────────────────────────────
-- Only rows a signed-in student creates for themselves are checked. Server
-- jobs (no auth.uid()) and staff are unaffected, and pre-video assessment
-- attempts (video_assessment_id set) are gates themselves, not gated content.
CREATE OR REPLACE FUNCTION public.enforce_exam_attempt_unlocked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  IF auth.uid() IS NULL
     OR NEW.student_id IS DISTINCT FROM auth.uid()
     OR NEW.video_assessment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_res := public.content_unlocked_any_context('exam', NEW.exam_id);
  IF (v_res->>'unlocked')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'content_locked: this exam is locked by a prerequisite'
      USING ERRCODE = 'P0001', DETAIL = v_res::TEXT;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_enforce_exam_attempt_unlocked ON public.exam_attempts;
CREATE TRIGGER trig_enforce_exam_attempt_unlocked
  BEFORE INSERT ON public.exam_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_exam_attempt_unlocked();
