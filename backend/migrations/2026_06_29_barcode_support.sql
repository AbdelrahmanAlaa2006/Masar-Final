-- 1. Add barcode_token column with default value to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS barcode_token TEXT;
ALTER TABLE public.profiles ALTER COLUMN barcode_token SET DEFAULT 'BC-' || substring(md5(random()::text), 1, 10);

-- 2. Backfill unique barcode values for existing student profiles
UPDATE public.profiles
SET barcode_token = 'BC-' || substring(md5(random()::text), 1, 10)
WHERE barcode_token IS NULL AND role = 'student';

-- 3. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_barcode ON public.profiles(barcode_token, tenant_id);

-- 4. Ensure barcode_token is unique within the same tenant to avoid collision
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tenant_barcode_token_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_barcode_token_key UNIQUE (tenant_id, barcode_token);

-- 5. Update handle_new_user trigger function to populate barcode_token as well
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, role, tenant_id, grade, is_active, parent_phone, qr_token, barcode_token)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce((new.raw_user_meta_data->>'tenant_id')::uuid, 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid),
    new.raw_user_meta_data->>'grade',
    false, -- New students are inactive until approved
    coalesce(new.raw_user_meta_data->>'parent_phone', ''),
    coalesce(new.raw_user_meta_data->>'qr_token', substring(md5(random()::text), 1, 16)),
    coalesce(new.raw_user_meta_data->>'barcode_token', 'BC-' || substring(md5(random()::text), 1, 10))
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    tenant_id = EXCLUDED.tenant_id,
    grade = EXCLUDED.grade,
    parent_phone = EXCLUDED.parent_phone,
    qr_token = EXCLUDED.qr_token,
    barcode_token = EXCLUDED.barcode_token;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create unified RPC get_student_identity to resolve both QR and barcode formats
CREATE OR REPLACE FUNCTION public.get_student_identity(
  p_code TEXT,
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_name TEXT;
  v_grade TEXT;
  v_status TEXT;
  v_enrollment_type TEXT;
  v_flags TEXT[];
  v_notes TEXT[];
  v_branch_name TEXT;
  v_academic_year_name TEXT;
  v_group_name TEXT;
  
  v_attendance_percentage NUMERIC;
  v_outstanding_balance NUMERIC;
  v_last_payment JSONB;
  v_recent_grades JSONB;
  v_today_attendance TEXT;
  v_warnings TEXT[] := '{}';
  
  v_result JSONB;
BEGIN
  -- Fetch student profile details matching p_code against either qr_token or barcode_token
  SELECT p.id, p.name, p.grade, p.status, p.enrollment_type, p.flags,
         b.name, a.name,
         (SELECT g.name FROM public.student_groups sg JOIN public.groups g ON g.id = sg.group_id WHERE sg.student_id = p.id AND sg.is_primary = true LIMIT 1)
  INTO v_student_id, v_name, v_grade, v_status, v_enrollment_type, v_flags,
       v_branch_name, v_academic_year_name, v_group_name
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = p.branch_id
  LEFT JOIN public.academic_years a ON a.id = p.academic_year_id
  WHERE (p.qr_token = p_code OR p.barcode_token = p_code) AND p.tenant_id = p_tenant_id AND p.role = 'student';

  IF v_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Calculate Attendance Percentage
  SELECT 
    CASE WHEN count(*) FILTER (WHERE status IN ('present', 'absent', 'late')) > 0 
         THEN round((count(*) FILTER (WHERE status IN ('present', 'late'))::numeric / count(*) FILTER (WHERE status IN ('present', 'absent', 'late'))::numeric) * 100, 1)
         ELSE 100.0 END
  INTO v_attendance_percentage
  FROM public.attendance_records
  WHERE student_id = v_student_id;

  -- 2. Calculate Outstanding Balance from ledger
  SELECT COALESCE(sum(
    CASE 
      WHEN type IN ('charge', 'refund') THEN amount 
      ELSE -amount 
    END
  ), 0) INTO v_outstanding_balance
  FROM public.student_ledger
  WHERE student_id = v_student_id AND status = 'approved';

  -- 3. Fetch Last Payment Details
  SELECT jsonb_build_object(
    'amount', amount,
    'payment_method', payment_method,
    'created_at', created_at,
    'description', description
  ) INTO v_last_payment
  FROM public.student_ledger
  WHERE student_id = v_student_id AND type = 'payment' AND status = 'approved'
  ORDER BY created_at DESC LIMIT 1;

  -- 4. Fetch Today's Attendance Status
  SELECT status INTO v_today_attendance
  FROM public.attendance_records r
  JOIN public.attendance_sessions s ON s.id = r.session_id
  WHERE r.student_id = v_student_id AND s.date = CURRENT_DATE
  LIMIT 1;

  -- 5. Fetch Recent Grades
  SELECT jsonb_agg(jsonb_build_object(
    'title', title,
    'type', type,
    'score', score,
    'max_score', max_score,
    'created_at', created_at
  )) INTO v_recent_grades
  FROM (
    SELECT title, type, score, max_score, created_at
    FROM public.grades
    WHERE student_id = v_student_id
    ORDER BY created_at DESC LIMIT 5
  ) g;

  -- 6. Fetch Student Notes
  SELECT ARRAY_AGG(note ORDER BY created_at DESC) INTO v_notes
  FROM public.student_notes
  WHERE student_id = v_student_id;

  -- Compute Warnings
  IF v_outstanding_balance > 0 THEN
    v_warnings := array_append(v_warnings, 'debt');
  END IF;
  IF v_attendance_percentage < 75.0 THEN
    v_warnings := array_append(v_warnings, 'excessive_absences');
  END IF;

  -- Return aggregated JSON object
  v_result := jsonb_build_object(
    'student_id', v_student_id,
    'name', v_name,
    'grade', v_grade,
    'status', v_status,
    'enrollment_type', v_enrollment_type,
    'flags', coalesce(v_flags, '{}'::text[]),
    'branch_name', coalesce(v_branch_name, 'الفرع الرئيسي'),
    'academic_year_name', coalesce(v_academic_year_name, ''),
    'group_name', coalesce(v_group_name, ''),
    'attendance_percentage', v_attendance_percentage,
    'outstanding_balance', v_outstanding_balance,
    'last_payment', coalesce(v_last_payment, '{}'::jsonb),
    'today_attendance', coalesce(v_today_attendance, '—'),
    'recent_grades', coalesce(v_recent_grades, '[]'::jsonb),
    'notes', coalesce(v_notes, '{}'::text[]),
    'warnings', v_warnings
  );

  RETURN v_result;
END;
$$;
