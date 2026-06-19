-- =====================================================================
-- Phase 1 - Architecture Refactor Database Migration Script
-- Run in Supabase SQL editor.
-- Idempotent: safe to run repeatedly.
-- =====================================================================

-- 1. Create Core Tables
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Alter profiles to support branches, academic years, status, enrollment, and warning flags
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('active', 'inactive', 'suspended', 'graduated', 'archived')) DEFAULT 'inactive';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enrollment_type TEXT CHECK (enrollment_type IN ('CENTER', 'ONLINE', 'HYBRID')) DEFAULT 'CENTER';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS flags TEXT[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS father_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mother_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mother_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_relation TEXT;

-- 3. Groups & Student-Group Assignments
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.student_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT student_groups_uniq UNIQUE(student_id, group_id)
);

-- 4. Session-Based Attendance System
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  original_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  attended_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  is_anomaly BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT attendance_records_uniq UNIQUE(session_id, student_id)
);

-- 5. Student Financial Ledger
CREATE TABLE IF NOT EXISTS public.student_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('charge', 'payment', 'discount', 'scholarship', 'waiver', 'refund')),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('InstaPay', 'Vodafone Cash', 'Cash', 'Credit Card', 'Other')),
  screenshot_url TEXT,
  screenshot_key TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  description TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 6. Notes, Attachments, Audit Logs, and Unified Notifications
CREATE TABLE IF NOT EXISTS public.student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('homework', 'report', 'student_document', 'receipt')),
  entity_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.unified_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('attendance_absent', 'attendance_makeup', 'grade_added', 'payment_warning', 'low_performance', 'general')),
  channels TEXT[] NOT NULL DEFAULT '{}',
  status JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"whatsapp": "pending", "portal": "pending"}
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on all new tables
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_notifications ENABLE ROW LEVEL SECURITY;

-- Dynamic tenant_id triggers
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'branches', 'academic_years', 'groups', 'student_groups', 
    'attendance_sessions', 'attendance_records', 'student_ledger',
    'student_notes', 'attachments', 'audit_logs', 'unified_notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trig_set_tenant_id_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert()', 'trig_set_tenant_id_' || t, t);
  END LOOP;
END $$;

-- 7. Additive RLS Policies
-- Branches
CREATE POLICY "Branches tenant isolation" ON public.branches FOR ALL USING (tenant_id = public.current_tenant_id());
-- Academic Years
CREATE POLICY "Academic years tenant isolation" ON public.academic_years FOR ALL USING (tenant_id = public.current_tenant_id());
-- Groups
CREATE POLICY "Groups staff write" ON public.groups FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'students'));
CREATE POLICY "Groups student read" ON public.groups FOR SELECT USING (tenant_id = public.current_tenant_id());
-- Student Groups
CREATE POLICY "Student groups staff write" ON public.student_groups FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'students'));
CREATE POLICY "Student groups select" ON public.student_groups FOR SELECT USING (tenant_id = public.current_tenant_id() AND (student_id = auth.uid() OR public.has_permission(auth.uid(), 'students')));
-- Attendance Sessions
CREATE POLICY "Attendance sessions staff" ON public.attendance_sessions FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'attendance'));
CREATE POLICY "Attendance sessions select" ON public.attendance_sessions FOR SELECT USING (tenant_id = public.current_tenant_id());
-- Attendance Records
CREATE POLICY "Attendance records staff" ON public.attendance_records FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'attendance'));
CREATE POLICY "Attendance records student" ON public.attendance_records FOR SELECT USING (tenant_id = public.current_tenant_id() AND student_id = auth.uid());
-- Student Ledger
CREATE POLICY "Student ledger staff" ON public.student_ledger FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'payments'));
CREATE POLICY "Student ledger student select" ON public.student_ledger FOR SELECT USING (tenant_id = public.current_tenant_id() AND student_id = auth.uid());
CREATE POLICY "Student ledger student insert" ON public.student_ledger FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id() AND student_id = auth.uid() AND status = 'pending' AND type = 'payment');
-- Student Notes
CREATE POLICY "Student notes staff" ON public.student_notes FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'students'));
-- Attachments
CREATE POLICY "Attachments staff" ON public.attachments FOR ALL USING (tenant_id = public.current_tenant_id() AND (public.has_permission(auth.uid(), 'homework') OR public.has_permission(auth.uid(), 'reports') OR public.has_permission(auth.uid(), 'payments')));
CREATE POLICY "Attachments student" ON public.attachments FOR SELECT USING (tenant_id = public.current_tenant_id());
-- Audit Logs
CREATE POLICY "Audit logs admins" ON public.audit_logs FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());
-- Unified Notifications
CREATE POLICY "Unified notifications staff" ON public.unified_notifications FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'));
CREATE POLICY "Unified notifications student" ON public.unified_notifications FOR SELECT USING (tenant_id = public.current_tenant_id() AND student_id = auth.uid());

-- 8. Data Migration & Backfilling Script
DO $$
DECLARE
  v_default_branch_id UUID;
  v_default_year_id UUID;
  r RECORD;
BEGIN
  -- Backfill Branches
  FOR r IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.branches (tenant_id, name)
    VALUES (r.id, 'الفرع الرئيسي')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Backfill Academic Years
  FOR r IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.academic_years (tenant_id, name, is_active)
    VALUES (r.id, '2026/2027', true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Backfill Students Status & Defaults
  UPDATE public.profiles p
  SET 
    branch_id = (SELECT id FROM public.branches b WHERE b.tenant_id = p.tenant_id LIMIT 1),
    academic_year_id = (SELECT id FROM public.academic_years a WHERE a.tenant_id = p.tenant_id AND a.is_active = true LIMIT 1),
    status = CASE 
      WHEN p.is_approved = true AND p.is_active = true THEN 'active'
      ELSE 'inactive'
    END,
    enrollment_type = 'CENTER'
  WHERE p.role = 'student' AND (p.status IS NULL OR p.status = 'inactive');

  -- Migrate Groups
  INSERT INTO public.groups (tenant_id, branch_id, academic_year_id, name, grade)
  SELECT DISTINCT 
    p.tenant_id,
    (SELECT id FROM public.branches b WHERE b.tenant_id = p.tenant_id LIMIT 1),
    (SELECT id FROM public.academic_years a WHERE a.tenant_id = p.tenant_id AND a.is_active = true LIMIT 1),
    p."group",
    p.grade
  FROM public.profiles p
  WHERE p.role = 'student' AND p."group" IS NOT NULL AND p."group" != ''
  ON CONFLICT DO NOTHING;

  -- Map Student Groups
  INSERT INTO public.student_groups (tenant_id, student_id, group_id, is_primary)
  SELECT 
    p.tenant_id,
    p.id,
    g.id,
    true
  FROM public.profiles p
  JOIN public.groups g ON g.tenant_id = p.tenant_id AND g.name = p."group" AND g.grade = p.grade
  WHERE p.role = 'student' AND p."group" IS NOT NULL AND p."group" != ''
  ON CONFLICT ON CONSTRAINT student_groups_uniq DO NOTHING;

  -- Migrate Attendance Sessions (For session_id pointing to homeworks)
  INSERT INTO public.attendance_sessions (id, tenant_id, branch_id, academic_year_id, group_id, title, date, created_by, created_at)
  SELECT DISTINCT ON (a.session_id)
    a.session_id,
    a.tenant_id,
    (SELECT id FROM public.branches b WHERE b.tenant_id = a.tenant_id LIMIT 1),
    (SELECT id FROM public.academic_years ac WHERE ac.tenant_id = a.tenant_id AND ac.is_active = true LIMIT 1),
    NULL,
    COALESCE((SELECT title FROM public.homeworks h WHERE h.id = a.session_id), 'حصة دراسية'),
    a.date,
    a.created_by,
    a.created_at
  FROM public.attendance a
  WHERE a.session_id IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  -- Migrate Attendance Sessions (For custom dates where session_id is NULL)
  INSERT INTO public.attendance_sessions (id, tenant_id, branch_id, academic_year_id, group_id, title, date, created_by, created_at)
  SELECT DISTINCT ON (a.date, a.tenant_id, p.grade)
    cast(md5(a.date::text || '-' || a.tenant_id::text || '-' || COALESCE(p.grade, 'all')) as uuid),
    a.tenant_id,
    (SELECT id FROM public.branches b WHERE b.tenant_id = a.tenant_id LIMIT 1),
    (SELECT id FROM public.academic_years ac WHERE ac.tenant_id = a.tenant_id AND ac.is_active = true LIMIT 1),
    NULL,
    'تحضير يدوي - تاريخ ' || a.date::text,
    a.date,
    a.created_by,
    a.created_at
  FROM public.attendance a
  LEFT JOIN public.profiles p ON p.id = a.student_id
  WHERE a.session_id IS NULL
  ON CONFLICT (id) DO NOTHING;

  -- Migrate Attendance Records
  INSERT INTO public.attendance_records (tenant_id, session_id, student_id, status, original_group_id, attended_group_id, is_anomaly, notes, created_by, created_at)
  SELECT 
    a.tenant_id,
    COALESCE(
      a.session_id,
      cast(md5(a.date::text || '-' || a.tenant_id::text || '-' || COALESCE(p.grade, 'all')) as uuid)
    ),
    a.student_id,
    a.status,
    (SELECT sg.group_id FROM public.student_groups sg WHERE sg.student_id = a.student_id LIMIT 1),
    (SELECT sg.group_id FROM public.student_groups sg WHERE sg.student_id = a.student_id LIMIT 1),
    false,
    NULL,
    a.created_by,
    a.created_at
  FROM public.attendance a
  LEFT JOIN public.profiles p ON p.id = a.student_id
  ON CONFLICT (session_id, student_id) DO NOTHING;

  -- Migrate Payments
  INSERT INTO public.student_ledger (id, tenant_id, student_id, branch_id, academic_year_id, type, amount, payment_method, screenshot_url, screenshot_key, status, description, notes, created_by, created_at, resolved_at, resolved_by)
  SELECT 
    p.id,
    p.tenant_id,
    p.student_id,
    (SELECT id FROM public.branches b WHERE b.tenant_id = p.tenant_id LIMIT 1),
    (SELECT id FROM public.academic_years a WHERE a.tenant_id = p.tenant_id AND a.is_active = true LIMIT 1),
    'payment',
    p.amount,
    p.payment_method,
    p.screenshot_url,
    p.screenshot_key,
    p.status,
    p.package_name,
    p.admin_notes,
    p.student_id,
    p.created_at,
    p.resolved_at,
    p.resolved_by
  FROM public.payments p
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Indexes for performance lookups
CREATE INDEX IF NOT EXISTS idx_profiles_parent_phone ON public.profiles(parent_phone);
CREATE INDEX IF NOT EXISTS idx_profiles_qr_token_tenant ON public.profiles(qr_token, tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_ledger_lookup ON public.student_ledger(student_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_records_lookup ON public.attendance_records(student_id, session_id);
CREATE INDEX IF NOT EXISTS idx_student_groups_lookup ON public.student_groups(student_id, group_id);

-- 9. Optimized RPC Functions

-- A. QR Identity card single-lookup function
CREATE OR REPLACE FUNCTION public.get_student_identity_by_qr(
  p_qr_token TEXT,
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
  -- Fetch student profile details
  SELECT p.id, p.name, p.grade, p.status, p.enrollment_type, p.flags,
         b.name, a.name,
         (SELECT g.name FROM public.student_groups sg JOIN public.groups g ON g.id = sg.group_id WHERE sg.student_id = p.id AND sg.is_primary = true LIMIT 1)
  INTO v_student_id, v_name, v_grade, v_status, v_enrollment_type, v_flags,
       v_branch_name, v_academic_year_name, v_group_name
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = p.branch_id
  LEFT JOIN public.academic_years a ON a.id = p.academic_year_id
  WHERE p.qr_token = p_qr_token AND p.tenant_id = p_tenant_id AND p.role = 'student';

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

-- B. Parent portal aggregated lookup
CREATE OR REPLACE FUNCTION public.get_parent_portal_summary(
  p_parent_phone TEXT,
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_children JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'grade', p.grade,
    'qr_token', p.qr_token,
    'status', p.status,
    'group_name', (SELECT g.name FROM public.student_groups sg JOIN public.groups g ON g.id = sg.group_id WHERE sg.student_id = p.id AND sg.is_primary = true LIMIT 1),
    'branch_name', (SELECT b.name FROM public.branches b WHERE b.id = p.branch_id LIMIT 1),
    'academic_year_name', (SELECT a.name FROM public.academic_years a WHERE a.id = p.academic_year_id LIMIT 1)
  )) INTO v_children
  FROM public.profiles p
  WHERE replace(p.parent_phone, ' ', '') = replace(p_parent_phone, ' ', '') AND p.tenant_id = p_tenant_id AND p.role = 'student';

  RETURN coalesce(v_children, '[]'::jsonb);
END;
$$;

-- C. Transactional bulk attendance saver
CREATE OR REPLACE FUNCTION public.save_attendance_batch_v2(
  p_records JSONB -- [{student_id, session_id, status, notes, created_by}]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_orig_group_id UUID;
  v_cur_group_id UUID;
  v_session_group_id UUID;
  v_tenant_id UUID;
BEGIN
  FOR r IN SELECT * FROM jsonb_to_recordset(p_records) AS x(
    student_id UUID,
    session_id UUID,
    status TEXT,
    notes TEXT,
    created_by UUID
  ) LOOP
    -- Fetch student primary group, session group, and student tenant
    SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = r.student_id;
    SELECT group_id INTO v_session_group_id FROM public.attendance_sessions WHERE id = r.session_id;
    SELECT group_id INTO v_orig_group_id FROM public.student_groups WHERE student_id = r.student_id AND is_primary = true LIMIT 1;
    
    -- Insert or Update
    INSERT INTO public.attendance_records (
      tenant_id, session_id, student_id, status, original_group_id, attended_group_id, is_anomaly, notes, created_by
    )
    VALUES (
      v_tenant_id,
      r.session_id,
      r.student_id,
      r.status,
      v_orig_group_id,
      v_session_group_id,
      CASE WHEN v_session_group_id IS NOT NULL AND v_orig_group_id != v_session_group_id THEN true ELSE false END,
      r.notes,
      r.created_by
    )
    ON CONFLICT (session_id, student_id) DO UPDATE
    SET 
      status = EXCLUDED.status,
      notes = COALESCE(EXCLUDED.notes, attendance_records.notes),
      created_by = EXCLUDED.created_by;
  END LOOP;
END;
$$;

-- D. Transactional bulk group transfer
CREATE OR REPLACE FUNCTION public.bulk_group_transfer(
  p_student_ids UUID[],
  p_target_group_id UUID,
  p_tenant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark previous primary groups as non-primary
  UPDATE public.student_groups
  SET is_primary = false
  WHERE student_id = ANY(p_student_ids) AND tenant_id = p_tenant_id;

  -- Insert new student group assignments as primary
  -- If record already exists for this group, update it to primary
  INSERT INTO public.student_groups (tenant_id, student_id, group_id, is_primary)
  SELECT p_tenant_id, s_id, p_target_group_id, true
  FROM unnest(p_student_ids) s_id
  ON CONFLICT (student_id, group_id) DO UPDATE
  SET is_primary = true;

  -- Also update the legacy text "group" on profile table for backwards compatibility
  UPDATE public.profiles
  SET "group" = (SELECT name FROM public.groups WHERE id = p_target_group_id)
  WHERE id = ANY(p_student_ids) AND tenant_id = p_tenant_id;
END;
$$;
