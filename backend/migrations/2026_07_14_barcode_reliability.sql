-- ============================================================================
-- 2026_07_14_barcode_reliability.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Definitive fix for «لم يتم العثور على طالب مطابق لهذا الباركود أو البطاقة»:
--
--   1. Scanner keystroke garbling. USB barcode readers are keyboard wedges:
--      the SAME printed Code128 label produces different text depending on the
--      OS keyboard state (CapsLock => BC-4F2A…, Arabic layout => mapped
--      letters, some models wrap Code39 payloads in '*…*', some append CR/LF
--      or NBSP). The previous fix compared LOWER(token) = LOWER(code) — right
--      idea, but it never matched codes with stray whitespace/control chars
--      and it could not use the (barcode_token, tenant_id) btree index, so
--      every scan was a sequential scan over profiles.
--   2. Missing tokens. Students created before the barcode columns existed
--      (or through older import paths) can still have NULL qr_token /
--      barcode_token — their cards can never match anything.
--
-- Fix:
--   * normalize_scan_code(): one IMMUTABLE normalizer used on BOTH sides of
--     the comparison. Tokens only ever contain [A-Za-z0-9-] ('BC-' + 10 hex /
--     16 hex), so a whitelist drops '*' wrappers, CR/LF, NBSP, zero-width and
--     every other kind of scanner noise in one pass, then lowercases.
--   * Functional indexes per tenant on the normalized tokens => indexed
--     lookups at any roster size.
--   * get_student_identity() matches on normalized values (payload/contract
--     unchanged — the AttendancePanel client needs no schema changes).
--   * Backfill NULL tokens for every student in every tenant.
-- ============================================================================

-- 1) One canonical normalizer (IMMUTABLE so it is usable in indexes).
CREATE OR REPLACE FUNCTION public.normalize_scan_code(p_code TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9-]', '', 'g'));
$$;

-- 2) Backfill missing tokens (every tenant, students only).
UPDATE public.profiles
SET barcode_token = 'BC-' || substring(md5(random()::text || id::text), 1, 10)
WHERE role = 'student' AND (barcode_token IS NULL OR barcode_token = '');

UPDATE public.profiles
SET qr_token = substring(md5(random()::text || id::text), 1, 16)
WHERE role = 'student' AND (qr_token IS NULL OR qr_token = '');

-- 3) Indexed, normalized lookups (replaces seq-scan LOWER() comparisons).
CREATE INDEX IF NOT EXISTS idx_profiles_barcode_norm
  ON public.profiles (tenant_id, public.normalize_scan_code(barcode_token));
CREATE INDEX IF NOT EXISTS idx_profiles_qr_norm
  ON public.profiles (tenant_id, public.normalize_scan_code(qr_token));

-- 4) Redefine get_student_identity with normalized matching.
--    Body identical to 2026_07_13_fix_barcode_scanning.sql except the profile
--    lookup WHERE clause (+ LIMIT 1 so an unexpected duplicate can never make
--    the lookup fail).
CREATE OR REPLACE FUNCTION public.get_student_identity(
  p_code TEXT,
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := public.normalize_scan_code(p_code);
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

  v_present_count INTEGER := 0;
  v_late_count INTEGER := 0;
  v_absent_count INTEGER := 0;
  v_total_sessions INTEGER := 0;
  v_attendance_percentage NUMERIC;
  v_outstanding_balance NUMERIC;
  v_last_payment JSONB;
  v_recent_grades JSONB;
  v_today_attendance TEXT;
  v_warnings TEXT[] := '{}';

  v_result JSONB;
BEGIN
  IF v_code IS NULL OR v_code = '' THEN
    RETURN NULL;
  END IF;

  SELECT p.id, p.name, p.grade, p.status, p.enrollment_type, p.flags,
         b.name, a.name,
         (SELECT g.name FROM public.student_groups sg JOIN public.groups g ON g.id = sg.group_id WHERE sg.student_id = p.id AND sg.is_primary = true LIMIT 1)
  INTO v_student_id, v_name, v_grade, v_status, v_enrollment_type, v_flags,
       v_branch_name, v_academic_year_name, v_group_name
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = p.branch_id
  LEFT JOIN public.academic_years a ON a.id = p.academic_year_id
  WHERE p.tenant_id = p_tenant_id
    AND p.role = 'student'
    AND (public.normalize_scan_code(p.barcode_token) = v_code
         OR public.normalize_scan_code(p.qr_token) = v_code)
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Attendance counts and percentage (NULL percentage when nothing marked yet)
  SELECT
    count(*) FILTER (WHERE status = 'present'),
    count(*) FILTER (WHERE status = 'late'),
    count(*) FILTER (WHERE status = 'absent'),
    count(*) FILTER (WHERE status IN ('present', 'absent', 'late'))
  INTO v_present_count, v_late_count, v_absent_count, v_total_sessions
  FROM public.attendance_records
  WHERE student_id = v_student_id;

  IF v_total_sessions > 0 THEN
    v_attendance_percentage := round(((v_present_count + v_late_count)::numeric / v_total_sessions::numeric) * 100, 1);
  ELSE
    v_attendance_percentage := NULL;
  END IF;

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

  -- Compute Warnings (only flag absences when sessions actually exist)
  IF v_outstanding_balance > 0 THEN
    v_warnings := array_append(v_warnings, 'debt');
  END IF;
  IF v_total_sessions > 0 AND v_attendance_percentage < 75.0 THEN
    v_warnings := array_append(v_warnings, 'excessive_absences');
  END IF;

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
    'attended_sessions', v_present_count + v_late_count,
    'present_count', v_present_count,
    'late_count', v_late_count,
    'absent_count', v_absent_count,
    'total_sessions', v_total_sessions,
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
