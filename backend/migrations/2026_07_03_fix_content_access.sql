-- =====================================================================
-- SQL MIGRATION: Fix content access function for regular/package content
-- Ensures regular content (grade != 'packages') remains visible to active 
-- students of the matching grade, while package content (grade = 'packages')
-- is restricted only to those who purchased it (via student_content_access).
-- =====================================================================

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
  -- Fetch the content's grade
  IF p_content_type = 'video' THEN
    SELECT grade INTO v_content_grade FROM public.videos WHERE id = p_content_id;
  ELSIF p_content_type = 'exam' THEN
    SELECT grade INTO v_content_grade FROM public.exams WHERE id = p_content_id;
  ELSIF p_content_type = 'homework' THEN
    SELECT grade INTO v_content_grade FROM public.homeworks WHERE id = p_content_id;
  END IF;

  IF v_content_grade IS NOT NULL AND v_content_grade <> 'packages' AND v_is_active = TRUE AND v_grade = v_content_grade THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
