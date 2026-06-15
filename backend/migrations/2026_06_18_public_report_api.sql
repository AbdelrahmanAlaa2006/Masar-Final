-- =====================================================================
-- Public Secure Student Report & WhatsApp Notification RPC Functions
-- Run in Supabase SQL Editor to allow unauthenticated parent lookups.
-- =====================================================================

-- 1. Function to retrieve complete report after verifying qr_token and phone number
CREATE OR REPLACE FUNCTION public.get_public_report(
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
  v_group TEXT;
  v_parent_phone TEXT;
  v_student_phone TEXT;
  v_qr_token TEXT;
  v_tenant_id UUID;
  
  v_attendance_summary JSONB;
  v_grades_summary JSONB;
  v_grades_list JSONB;
  v_attendance_history JSONB;
  v_homeworks_summary JSONB;
  
  v_result JSONB;
BEGIN
  -- Fetch student details
  SELECT name, grade, "group", parent_phone, phone, qr_token, tenant_id
  INTO v_student_name, v_grade, v_group, v_parent_phone, v_student_phone, v_qr_token, v_tenant_id
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
  
  -- Fetch Attendance Statistics (Center sessions)
  SELECT jsonb_build_object(
    'present', count(*) filter (where status = 'present'),
    'absent', count(*) filter (where status = 'absent'),
    'late', count(*) filter (where status = 'late'),
    'excused', count(*) filter (where status = 'excused'),
    'total', count(*),
    'percentage', CASE WHEN count(*) filter (where status in ('present', 'absent', 'late')) > 0 
                    THEN round((count(*) filter (where status in ('present', 'late'))::numeric / count(*) filter (where status in ('present', 'absent', 'late'))::numeric) * 100)
                    ELSE 100 END
  ) INTO v_attendance_summary
  FROM public.attendance
  WHERE student_id = p_student_id;
  
  -- Fetch Center Grades Summary (from public.grades table)
  SELECT jsonb_build_object(
    'homework_avg', round(coalesce(avg(score / max_score) filter (where type = 'homework') * 100, 0)),
    'exam_avg', round(coalesce(avg(score / max_score) filter (where type = 'exam') * 100, 0)),
    'participation_count', count(*) filter (where type = 'participation'),
    'behavior_count', count(*) filter (where type = 'behavior')
  ) INTO v_grades_summary
  FROM public.grades
  WHERE student_id = p_student_id;
  
  -- Fetch Online Homeworks & Exams statistics from submissions
  SELECT jsonb_build_object(
    'homework_submitted', (SELECT count(*) FROM public.homework_submissions WHERE student_id = p_student_id),
    'homework_total', (SELECT count(*) FROM public.homeworks WHERE grade = v_grade),
    'exam_submitted', (SELECT count(*) FROM public.exam_attempts WHERE student_id = p_student_id),
    'exam_total', (SELECT count(*) FROM public.exams WHERE grade = v_grade)
  ) INTO v_homeworks_summary;

  -- Fetch Detailed Grades History
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', type,
      'title', title,
      'subject', subject,
      'score', score,
      'max_score', max_score,
      'notes', notes,
      'created_at', created_at
    )
  ) INTO v_grades_list
  FROM (
    SELECT id, type, title, subject, score, max_score, notes, created_at
    FROM public.grades
    WHERE student_id = p_student_id
    ORDER BY created_at DESC
  ) g;
  
  -- Fetch Detailed Attendance History
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'date', a.date,
      'status', a.status,
      'lesson_title', h.title
    )
  ) INTO v_attendance_history
  FROM (
    SELECT id, date, status, session_id
    FROM public.attendance
    WHERE student_id = p_student_id
    ORDER BY date DESC
  ) a
  LEFT JOIN public.homeworks h ON h.id = a.session_id;

  -- Construct final result object
  v_result := jsonb_build_object(
    'student_name', v_student_name,
    'grade', v_grade,
    'group', v_group,
    'phone', v_student_phone,
    'parent_phone', v_parent_phone,
    'tenant_id', v_tenant_id,
    'attendance_summary', v_attendance_summary,
    'grades_summary', v_grades_summary,
    'homeworks_summary', v_homeworks_summary,
    'grades_history', coalesce(v_grades_list, '[]'::jsonb),
    'attendance_history', coalesce(v_attendance_history, '[]'::jsonb)
  );
  
  RETURN v_result;
END;
$$;


-- 2. Function to queue WhatsApp notification securely from public lookup page
CREATE OR REPLACE FUNCTION public.queue_public_notification(
  p_student_id UUID,
  p_phone TEXT,
  p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = p_student_id;
  
  INSERT INTO public.parent_notifications (tenant_id, student_id, phone, message, type, status)
  VALUES (
    v_tenant_id,
    p_student_id,
    p_phone,
    p_message,
    'grade_added', -- fits CHECK constraint (attendance_absent/grade_added/etc)
    'pending'
  );
END;
$$;
