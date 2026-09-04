-- =====================================================================
-- Migration: 2026_09_04_exam_scheduling_and_targeting.sql
-- Description:
--   1. Adds opens_at, availability_days, expires_at, target_audience,
--      target_group_id to public.exams with minimal constraints.
--   2. Authoritative trigger compute_exam_expiration to calculate expires_at
--      or reset to NULL if invalid/missing.
--   3. Centralized has_content_access supporting Stage and Group targeting
--      with fail-closed deleted-group safeguard.
--   4. Timing enforcement in start_or_get_exam_attempt (opens_at & expires_at).
--   5. Public/parent report query filtering to respect group targeting.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns and Minimal Constraints on public.exams
-- ---------------------------------------------------------------------
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS opens_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS availability_days INTEGER,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'stage',
  ADD COLUMN IF NOT EXISTS target_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exams_availability_days'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT chk_exams_availability_days
      CHECK (availability_days IS NULL OR availability_days > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exams_target_audience'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT chk_exams_target_audience
      CHECK (target_audience IN ('stage', 'group'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exams_targeting
  ON public.exams (grade, target_audience, target_group_id, opens_at, expires_at);

-- ---------------------------------------------------------------------
-- 2. Fully-Safe Expiration Trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_exam_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opens_at IS NOT NULL AND NEW.availability_days IS NOT NULL AND NEW.availability_days > 0 THEN
    NEW.expires_at := NEW.opens_at + (NEW.availability_days || ' days')::interval;
  ELSE
    NEW.expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_exam_expiration ON public.exams;
CREATE TRIGGER trg_compute_exam_expiration
  BEFORE INSERT OR UPDATE OF opens_at, availability_days ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_exam_expiration();

-- ---------------------------------------------------------------------
-- 3. Centralized Content Access Authorization Function
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_content_access(p_user_id UUID, p_content_type TEXT, p_content_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
  v_grade TEXT;
  v_group TEXT;
  v_is_active BOOLEAN;
  v_content_grade TEXT;
  v_target_audience TEXT;
  v_target_group_id UUID;
BEGIN
  -- 1. Check if user is admin or assistant
  IF public.is_current_user_admin() THEN
    RETURN TRUE;
  END IF;

  -- Fetch student's grade, group and is_active status
  SELECT grade, "group", is_active INTO v_grade, v_group, v_is_active FROM public.profiles WHERE id = p_user_id;

  -- 2. Check access overrides for student scope (highest priority manual override)
  SELECT allowed INTO v_allowed FROM public.access_overrides 
  WHERE scope = 'student' AND target_id = p_user_id::text AND item_type = p_content_type AND item_id = p_content_id;
  
  IF v_allowed IS NOT NULL THEN
    RETURN v_allowed;
  END IF;

  -- 3. Check access overrides for group scope
  IF v_group IS NOT NULL THEN
    SELECT allowed INTO v_allowed FROM public.access_overrides 
    WHERE scope = 'group' AND target_id = (v_grade || ':' || v_group) AND item_type = p_content_type AND item_id = p_content_id;
    
    IF v_allowed IS NOT NULL THEN
      RETURN v_allowed;
    END IF;
  END IF;

  -- 4. Check access overrides for prep/grade scope
  IF v_grade IS NOT NULL THEN
    SELECT allowed INTO v_allowed FROM public.access_overrides 
    WHERE scope = 'prep' AND target_id = v_grade AND item_type = p_content_type AND item_id = p_content_id;
    
    IF v_allowed IS NOT NULL THEN
      RETURN v_allowed;
    END IF;
  END IF;

  -- 5. Check if student has purchased this content (i.e. has record in student_content_access)
  IF EXISTS (
    SELECT 1 FROM public.student_content_access 
    WHERE student_id = p_user_id AND content_type = p_content_type AND content_id = p_content_id
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN TRUE;
  END IF;

  -- 6. Check if it's regular content and user is active and grades match
  IF p_content_type = 'video' THEN
    SELECT grade INTO v_content_grade FROM public.videos WHERE id = p_content_id;
  ELSIF p_content_type = 'exam' THEN
    SELECT grade, target_audience, target_group_id
      INTO v_content_grade, v_target_audience, v_target_group_id
      FROM public.exams 
     WHERE id = p_content_id;
  ELSIF p_content_type = 'homework' THEN
    SELECT grade INTO v_content_grade FROM public.homeworks WHERE id = p_content_id;
  END IF;

  IF v_content_grade IS NOT NULL AND v_content_grade <> 'packages' AND v_is_active = TRUE AND v_grade = v_content_grade THEN
    -- If exam is targeted to a specific group
    IF p_content_type = 'exam' AND v_target_audience = 'group' THEN
      -- Fail-closed security guard: if target_group_id is NULL (e.g. group was deleted), access is DENIED
      IF v_target_group_id IS NULL THEN
        RETURN FALSE;
      END IF;

      -- Student must belong to that group, and the group must belong to that stage
      IF EXISTS (
        SELECT 1 
          FROM public.student_groups sg
          JOIN public.groups g ON g.id = sg.group_id
         WHERE sg.student_id = p_user_id 
           AND sg.group_id = v_target_group_id
           AND g.grade = v_grade
      ) THEN
        RETURN TRUE;
      ELSE
        RETURN FALSE;
      END IF;
    END IF;

    -- Stage-targeted or legacy exam: matching stage is sufficient
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Authoritative Attempt Start RPC with Time Windows
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_or_get_exam_attempt(
  p_exam_id uuid
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_exam    public.exams;
  v_attempt public.exam_attempts;
BEGIN
  IF v_uid IS NULL THEN 
    RAISE EXCEPTION 'not authenticated'; 
  END IF;

  -- 1. Authoritative Exam & Tenant Access Verification
  SELECT * INTO v_exam
    FROM public.exams
   WHERE id = p_exam_id
     AND tenant_id = public.current_tenant_id()
     AND is_archived = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'exam not found or access denied';
  END IF;

  -- Verify student has legitimate content access (grade / group / package gating)
  IF NOT (public.is_current_user_admin() OR public.has_content_access(v_uid, 'exam', p_exam_id)) THEN
    RAISE EXCEPTION 'forbidden: not authorized to take this exam';
  END IF;

  -- Authoritative time window verification for students
  IF NOT public.is_current_user_admin() THEN
    -- 1. Opening time check (new exams)
    IF v_exam.opens_at IS NOT NULL AND now() < v_exam.opens_at THEN
      RAISE EXCEPTION 'exam is not open yet';
    END IF;

    -- 2. Expiration check (new exams with expires_at)
    IF v_exam.expires_at IS NOT NULL THEN
      IF now() >= v_exam.expires_at THEN
        RAISE EXCEPTION 'exam availability period has ended';
      END IF;
    -- 3. Legacy fallback (existing exams relying on available_hours)
    ELSIF v_exam.available_hours IS NOT NULL THEN
      IF now() >= v_exam.created_at + (v_exam.available_hours || ' hours')::interval THEN
        RAISE EXCEPTION 'exam availability period has ended';
      END IF;
    END IF;
  END IF;

  -- 2. Practical low-collision 64-bit deterministic transaction-level advisory lock
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_exam_id::text, 0));

  -- 3. Return existing in-flight open attempt if one is already in progress
  SELECT * INTO v_attempt
    FROM public.exam_attempts
   WHERE exam_id = p_exam_id
     AND student_id = v_uid
     AND submitted_at IS NULL
     AND video_assessment_id IS NULL
   ORDER BY started_at DESC
   LIMIT 1;

  IF v_attempt.id IS NOT NULL THEN
    RETURN v_attempt;
  END IF;

  -- 4. Atomically create new attempt row with authoritative server points and timestamp
  INSERT INTO public.exam_attempts (exam_id, student_id, max_score, started_at)
  VALUES (
    p_exam_id, 
    v_uid, 
    COALESCE(
      v_exam.total_points, 
      (SELECT COALESCE(sum(COALESCE((q->>'points')::int, 1)), 0) FROM jsonb_array_elements(COALESCE(v_exam.questions, '[]'::jsonb)) q)
    ), 
    now()
  )
  RETURNING * INTO v_attempt;

  RETURN v_attempt;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Public / Parent Report Functions (Group Targeting Support)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_platform_reports(
  p_student_id UUID,
  p_qr_token TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_grade TEXT;
  v_tenant_id UUID;
  v_videos_list JSONB;
  v_exams_list JSONB;
  v_homeworks_list JSONB;
  v_result JSONB;
BEGIN
  -- Authenticate student context
  SELECT id, grade, tenant_id INTO v_student_id, v_grade, v_tenant_id
  FROM public.profiles
  WHERE id = p_student_id
    AND (
      (p_qr_token IS NOT NULL AND barcode_token = p_qr_token)
      OR
      (p_phone IS NOT NULL AND (phone = p_phone OR parent_phone = p_phone))
    );

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'invalid credentials or student not found';
  END IF;

  -- 1. Videos
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'title', v.title,
      'progress', (
        SELECT jsonb_build_object(
          'completed', vpr.completed,
          'progress_percentage', vpr.progress_percentage
        )
        FROM public.video_progress vpr
        WHERE vpr.video_id = v.id AND vpr.student_id = p_student_id
      )
    )
  ) INTO v_videos_list
  FROM public.videos v
  WHERE v.grade = v_grade AND v.tenant_id = v_tenant_id;

  -- 2. Exams List (Filtered by Stage and Student's Group)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'max_score', e.total_points,
      'attempt', (
        SELECT jsonb_build_object(
          'id', ea.id,
          'score', ea.score,
          'max_score', ea.max_score,
          'completed_at', ea.submitted_at,
          'created_at', ea.started_at
        )
        FROM public.exam_attempts ea
        WHERE ea.exam_id = e.id AND ea.student_id = p_student_id
        ORDER BY ea.started_at DESC
        LIMIT 1
      )
    )
  ) INTO v_exams_list
  FROM public.exams e
  WHERE e.grade = v_grade 
    AND e.tenant_id = v_tenant_id
    AND (
      e.target_audience = 'stage'
      OR (
        e.target_audience = 'group' AND EXISTS (
          SELECT 1 FROM public.student_groups sg
          WHERE sg.student_id = p_student_id AND sg.group_id = e.target_group_id
        )
      )
    );

  -- 3. Homeworks
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'title', h.title,
      'max_score', h.max_score,
      'submission', (
        SELECT jsonb_build_object(
          'id', hs.id,
          'score', hs.score,
          'max_score', hs.max_score,
          'created_at', hs.submitted_at
        )
        FROM public.homework_submissions hs
        WHERE hs.homework_id = h.id AND hs.student_id = p_student_id
        ORDER BY hs.submitted_at DESC
        LIMIT 1
      )
    )
  ) INTO v_homeworks_list
  FROM public.homeworks h
  WHERE h.grade = v_grade AND h.tenant_id = v_tenant_id;

  v_result := jsonb_build_object(
    'videos', COALESCE(v_videos_list, '[]'::jsonb),
    'exams', COALESCE(v_exams_list, '[]'::jsonb),
    'homeworks', COALESCE(v_homeworks_list, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;
