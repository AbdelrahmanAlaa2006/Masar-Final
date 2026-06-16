-- =====================================================================
-- Public Secure Student Platform Reports RPC Functions
-- Run in Supabase SQL Editor to retrieve detailed online platform reports for parents.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_public_platform_reports(
  p_student_id UUID,
  p_qr_token TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
  v_grade TEXT;
  v_parent_phone TEXT;
  v_qr_token TEXT;
  v_tenant_id UUID;
  
  v_videos_list JSONB;
  v_exams_list JSONB;
  v_homeworks_list JSONB;
  
  v_result JSONB;
BEGIN
  -- Fetch student details
  SELECT name, grade, parent_phone, qr_token, tenant_id
  INTO v_student_name, v_grade, v_parent_phone, v_qr_token, v_tenant_id
  FROM public.profiles
  WHERE id = p_student_id AND role = 'student';
  
  IF v_student_name IS NULL THEN
    RAISE EXCEPTION 'الطالب غير موجود في النظام';
  END IF;
  
  -- Validate QR Token
  IF v_qr_token IS NULL OR v_qr_token != p_qr_token THEN
    RAISE EXCEPTION 'رمز التحقق الخاص بالبطاقة غير صالح';
  END IF;
  
  -- Validate phone number (must match parent phone)
  IF p_phone IS NULL OR replace(p_phone, ' ', '') != replace(coalesce(v_parent_phone, ''), ' ', '') THEN
    RAISE EXCEPTION 'رقم الهاتف المدخل غير مطابق لرقم ولي الأمر المسجل للطالب';
  END IF;

  -- 1. Fetch Videos list & Student Watch Progress
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'title', v.title,
      'video_parts', v.video_parts,
      'progress_rows', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'part_id', vp.part_id,
            'seconds_watched', vp.seconds_watched,
            'views_used', vp.views_used,
            'last_watched_at', vp.last_watched_at
          )
        )
        FROM public.video_progress vp
        WHERE vp.video_id = v.id AND vp.student_id = p_student_id
      )
    )
  ) INTO v_videos_list
  FROM public.videos v
  WHERE v.grade = v_grade AND v.tenant_id = v_tenant_id;

  -- 2. Fetch Exams List & Attempts
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'max_score', e.max_score,
      'attempt', (
        SELECT jsonb_build_object(
          'id', ea.id,
          'score', ea.score,
          'max_score', ea.max_score,
          'completed_at', ea.completed_at,
          'created_at', ea.created_at
        )
        FROM public.exam_attempts ea
        WHERE ea.exam_id = e.id AND ea.student_id = p_student_id
        ORDER BY ea.created_at DESC
        LIMIT 1
      )
    )
  ) INTO v_exams_list
  FROM public.exams e
  WHERE e.grade = v_grade AND e.tenant_id = v_tenant_id;

  -- 3. Fetch Homeworks List & Submissions
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
          'created_at', hs.created_at
        )
        FROM public.homework_submissions hs
        WHERE hs.homework_id = h.id AND hs.student_id = p_student_id
        ORDER BY hs.created_at DESC
        LIMIT 1
      )
    )
  ) INTO v_homeworks_list
  FROM public.homeworks h
  WHERE h.grade = v_grade AND h.tenant_id = v_tenant_id;

  -- Build final output
  v_result := jsonb_build_object(
    'videos', coalesce(v_videos_list, '[]'::jsonb),
    'exams', coalesce(v_exams_list, '[]'::jsonb),
    'homeworks', coalesce(v_homeworks_list, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;
