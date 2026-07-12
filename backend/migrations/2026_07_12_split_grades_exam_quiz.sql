-- =====================================================================
-- 2026_07_12_split_grades_exam_quiz.sql
-- Run in Supabase SQL editor to split grades categories (exam vs quiz/تسميع)
-- =====================================================================

-- 1. Alter check constraint on grades.type
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_type_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_type_check CHECK (type IN ('homework', 'exam', 'quiz', 'participation', 'behavior'));

-- 2. Safe data backfill (map existing exams with "تسميع" in their title to the new quiz type)
UPDATE public.grades 
SET type = 'quiz' 
WHERE type = 'exam' AND (title LIKE '%تسميع%' OR title LIKE '%التسميع%');

-- 3. Update get_public_report RPC function to include quiz_avg
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
  v_payments_list JSONB;
  v_homeworks_summary JSONB;
  
  v_result JSONB;
BEGIN
  -- Fetch student details
  SELECT p.name, p.grade, 
         (SELECT g.name FROM public.student_groups sg JOIN public.groups g ON g.id = sg.group_id WHERE sg.student_id = p.id AND sg.is_primary = true LIMIT 1),
         p.parent_phone, p.phone, p.qr_token, p.tenant_id
  INTO v_student_name, v_grade, v_group, v_parent_phone, v_student_phone, v_qr_token, v_tenant_id
  FROM public.profiles p
  WHERE p.id = p_student_id AND p.role = 'student';
  
  IF v_student_name IS NULL THEN
    RAISE EXCEPTION 'الطالب غير موجود في النظام';
  END IF;
  
  IF v_qr_token IS NULL OR v_qr_token != p_qr_token THEN
    RAISE EXCEPTION 'رمز التحقق الخاص بالبطاقة غير صالح';
  END IF;
  
  IF p_phone IS NULL OR replace(p_phone, ' ', '') != replace(coalesce(v_parent_phone, ''), ' ', '') THEN
    RAISE EXCEPTION 'رقم الهاتف المدخل غير مطابق لرقم ولي الأمر المسجل للطالب';
  END IF;
  
  -- Fetch Attendance Statistics
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
  FROM public.attendance_records
  WHERE student_id = p_student_id;
  
  -- Fetch Center Grades Summary
  SELECT jsonb_build_object(
    'homework_avg', round(coalesce(avg(score / max_score) filter (where type = 'homework') * 100, 0)),
    'exam_avg', round(coalesce(avg(score / max_score) filter (where type = 'exam') * 100, 0)),
    'quiz_avg', round(coalesce(avg(score / max_score) filter (where type = 'quiz') * 100, 0)),
    'participation_count', count(*) filter (where type = 'participation'),
    'behavior_count', count(*) filter (where type = 'behavior')
  ) INTO v_grades_summary
  FROM public.grades
  WHERE student_id = p_student_id;
  
  -- Fetch Online Homeworks & Exams statistics
  SELECT jsonb_build_object(
    'homework_submitted', (SELECT count(*) FROM public.homework_submissions WHERE student_id = p_student_id),
    'homework_total', (SELECT count(*) FROM public.homeworks WHERE grade = v_grade AND tenant_id = v_tenant_id),
    'exam_submitted', (SELECT count(*) FROM public.exam_attempts WHERE student_id = p_student_id),
    'exam_total', (SELECT count(*) FROM public.exams WHERE grade = v_grade AND tenant_id = v_tenant_id)
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
      'created_at', created_at,
      'class_average', (
        SELECT round(coalesce(avg(sub_g.score), 0)::numeric, 1)
        FROM public.grades sub_g
        WHERE sub_g.tenant_id = v_tenant_id
          AND (
            (sub_g.session_id IS NOT NULL AND g.session_id IS NOT NULL AND sub_g.session_id = g.session_id)
            OR
            (sub_g.title = g.title AND sub_g.type = g.type AND (sub_g.subject = g.subject OR (sub_g.subject IS NULL AND g.subject IS NULL)))
          )
      )
    )
  ) INTO v_grades_list
  FROM (
    SELECT id, type, title, subject, score, max_score, notes, created_at, session_id
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
      'lesson_title', a.title
    )
  ) INTO v_attendance_history
  FROM (
    SELECT r.id, s.date, r.status, s.title
    FROM public.attendance_records r
    JOIN public.attendance_sessions s ON s.id = r.session_id
    WHERE r.student_id = p_student_id
    ORDER BY s.date DESC
  ) a;

  -- Fetch Detailed Payments History
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'amount', amount,
      'status', status,
      'package_name', coalesce(description, ''),
      'payment_method', payment_method,
      'created_at', created_at
    )
  ) INTO v_payments_list
  FROM (
    SELECT id, amount, status, description, payment_method, created_at
    FROM public.student_ledger
    WHERE student_id = p_student_id AND type = 'payment'
    ORDER BY created_at DESC
  ) p;

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
    'attendance_history', coalesce(v_attendance_history, '[]'::jsonb),
    'payments_history', coalesce(v_payments_list, '[]'::jsonb)
  );
  
  RETURN v_result;
END;
$$;
