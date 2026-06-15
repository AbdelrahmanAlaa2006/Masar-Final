-- =====================================================================
-- Student Attendance, Grades, QR Check-in & RBAC Assistant System Migration
-- Run once in Supabase SQL editor.
-- Idempotent: safe to re-run.
-- =====================================================================

-- 1. Alter profiles table to add parent_phone and qr_token columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS qr_token TEXT;

-- Set a default generator for new rows
ALTER TABLE public.profiles ALTER COLUMN qr_token SET DEFAULT substring(md5(random()::text), 1, 16);

-- Populate existing students with a random secure token
UPDATE public.profiles 
SET qr_token = substring(md5(random()::text), 1, 16) 
WHERE qr_token IS NULL AND role = 'student';

-- Ensure qr_token is unique within the same tenant to avoid collision
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tenant_qr_token_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_qr_token_key UNIQUE (tenant_id, qr_token);

-- Update handle_new_user trigger function to handle qr_token and parent_phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, role, tenant_id, grade, is_active, parent_phone, qr_token)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce((new.raw_user_meta_data->>'tenant_id')::uuid, 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid),
    new.raw_user_meta_data->>'grade',
    false, -- New students are inactive until approved
    coalesce(new.raw_user_meta_data->>'parent_phone', ''),
    coalesce(new.raw_user_meta_data->>'qr_token', substring(md5(random()::text), 1, 16))
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    tenant_id = EXCLUDED.tenant_id,
    grade = EXCLUDED.grade,
    parent_phone = EXCLUDED.parent_phone,
    qr_token = EXCLUDED.qr_token;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create the tenant_admins (Assistant RBAC) table
CREATE TABLE IF NOT EXISTS public.tenant_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('teacher', 'assistant')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT tenant_admins_tenant_user_key UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_admins_user ON public.tenant_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admins_tenant ON public.tenant_admins(tenant_id);


-- 3. Create the attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.homeworks(id) ON DELETE SET NULL, -- references homeworks representing lectures/sessions
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for attendance
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON public.attendance(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_lookup ON public.attendance(student_id, date, status);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.attendance(session_id);

-- Enforce unique attendance record per student per session or per date if session is null
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_student_session_uniq 
  ON public.attendance(student_id, session_id) 
  WHERE session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_student_date_uniq 
  ON public.attendance(student_id, date) 
  WHERE session_id IS NULL;


-- 4. Create the grades table
CREATE TABLE IF NOT EXISTS public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.homeworks(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('homework', 'exam', 'participation', 'behavior')),
  title TEXT NOT NULL,
  subject TEXT,
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for grades
CREATE INDEX IF NOT EXISTS idx_grades_tenant_student ON public.grades(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_lookup ON public.grades(student_id, type);
CREATE INDEX IF NOT EXISTS idx_grades_session ON public.grades(session_id);


-- 5. Create the parent_notifications table
CREATE TABLE IF NOT EXISTS public.parent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('attendance_absent', 'grade_added', 'homework_missing', 'low_attendance')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for parent notifications
CREATE INDEX IF NOT EXISTS idx_parent_notifications_tenant_status ON public.parent_notifications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_parent_notifications_queue ON public.parent_notifications(status, created_at);


-- 6. Helper check-permission function (runs under SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_perms TEXT[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;

  IF v_role = 'admin' THEN
    RETURN TRUE; -- Primary admin (teacher) has all permissions
  ELSIF v_role = 'assistant' THEN
    SELECT permissions INTO v_perms FROM public.tenant_admins WHERE user_id = p_user_id;
    RETURN p_permission = ANY(v_perms);
  END IF;

  RETURN FALSE;
END;
$$;


-- 7. Update is_current_user_admin() to include assistants so they pass basic admin gates in multi-tenant SQL files
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role IN ('admin', 'assistant');
END;
$$;


-- 8. Enable Row-Level Security (RLS) on new tables
ALTER TABLE public.tenant_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_notifications ENABLE ROW LEVEL SECURITY;


-- 9. Setup RLS policies

-- tenant_admins
DROP POLICY IF EXISTS "Admins full control on tenant_admins" ON public.tenant_admins;
CREATE POLICY "Admins full control on tenant_admins" ON public.tenant_admins
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'students'));

DROP POLICY IF EXISTS "Assistants read own permissions" ON public.tenant_admins;
CREATE POLICY "Assistants read own permissions" ON public.tenant_admins
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND user_id = auth.uid());

-- attendance
DROP POLICY IF EXISTS "Staff full control on attendance" ON public.attendance;
CREATE POLICY "Staff full control on attendance" ON public.attendance
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'attendance'));

DROP POLICY IF EXISTS "Students read own attendance" ON public.attendance;
CREATE POLICY "Students read own attendance" ON public.attendance
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND student_id = auth.uid());

-- grades
DROP POLICY IF EXISTS "Staff full control on grades" ON public.grades;
CREATE POLICY "Staff full control on grades" ON public.grades
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'grades'));

DROP POLICY IF EXISTS "Students read own grades" ON public.grades;
CREATE POLICY "Students read own grades" ON public.grades
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND student_id = auth.uid());

-- parent_notifications
DROP POLICY IF EXISTS "Staff full control on parent_notifications" ON public.parent_notifications;
CREATE POLICY "Staff full control on parent_notifications" ON public.parent_notifications
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'));


-- 10. Automatically scope tenant_id triggers on new tables
DROP TRIGGER IF EXISTS trig_set_tenant_id_tenant_admins ON public.tenant_admins;
CREATE TRIGGER trig_set_tenant_id_tenant_admins BEFORE INSERT ON public.tenant_admins 
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP TRIGGER IF EXISTS trig_set_tenant_id_attendance ON public.attendance;
CREATE TRIGGER trig_set_tenant_id_attendance BEFORE INSERT ON public.attendance 
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP TRIGGER IF EXISTS trig_set_tenant_id_grades ON public.grades;
CREATE TRIGGER trig_set_tenant_id_grades BEFORE INSERT ON public.grades 
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP TRIGGER IF EXISTS trig_set_tenant_id_parent_notifications ON public.parent_notifications;
CREATE TRIGGER trig_set_tenant_id_parent_notifications BEFORE INSERT ON public.parent_notifications 
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();


-- 11. Re-define and update existing tables policies to support permission checks

-- homeworks
DROP POLICY IF EXISTS hw_admin_write ON public.homeworks;
CREATE POLICY hw_admin_write ON public.homeworks FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'homework'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'homework'));

DROP POLICY IF EXISTS hw_select_grade_or_admin ON public.homeworks;
CREATE POLICY hw_select_grade_or_admin ON public.homeworks FOR SELECT
  USING (
    tenant_id = public.current_tenant_id() AND (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and (p.role IN ('admin', 'assistant') or p.grade = homeworks.grade)
      )
    )
  );

-- homework_submissions
DROP POLICY IF EXISTS hws_admin_all ON public.homework_submissions;
CREATE POLICY hws_admin_all ON public.homework_submissions FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'homework'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'homework'));

DROP POLICY IF EXISTS hws_select_own_or_admin ON public.homework_submissions;
CREATE POLICY hws_select_own_or_admin ON public.homework_submissions FOR SELECT
  USING (
    tenant_id = public.current_tenant_id() AND (
      student_id = auth.uid()
      OR public.has_permission(auth.uid(), 'homework')
    )
  );

-- exams
DROP POLICY IF EXISTS "Tenant isolation ON exams" ON public.exams;
DROP POLICY IF EXISTS "Tenant select isolation ON exams" ON public.exams;
DROP POLICY IF EXISTS "Tenant write isolation ON exams" ON public.exams;

CREATE POLICY "Tenant select isolation ON exams" ON public.exams FOR SELECT
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant write isolation ON exams" ON public.exams FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'exams'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'exams'));

-- exam_attempts
DROP POLICY IF EXISTS exam_attempts_admin_all ON public.exam_attempts;
CREATE POLICY exam_attempts_admin_all ON public.exam_attempts FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'exams'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'exams'));

DROP POLICY IF EXISTS exam_attempts_select_own_or_admin ON public.exam_attempts;
CREATE POLICY exam_attempts_select_own_or_admin ON public.exam_attempts FOR SELECT
  USING (
    tenant_id = public.current_tenant_id() AND (
      student_id = auth.uid()
      OR public.has_permission(auth.uid(), 'exams')
    )
  );

-- profiles
DROP POLICY IF EXISTS "Profiles tenant isolation" ON public.profiles;
CREATE POLICY "Profiles tenant isolation" ON public.profiles FOR ALL
  USING (
    id = auth.uid() OR (
      tenant_id = public.current_tenant_id() AND 
      public.has_permission(auth.uid(), 'students')
    )
  );
