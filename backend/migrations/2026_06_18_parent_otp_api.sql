-- =====================================================================
-- Parent Phone OTP Verification API for Public Report Lookup
-- Run in Supabase SQL Editor to allow secure parent sign-ins without passwords.
-- =====================================================================

-- 1. Create parent OTP verification table
CREATE TABLE IF NOT EXISTS public.parent_otps (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Disable anonymous access, RPC functions run bypass it using SECURITY DEFINER)
ALTER TABLE public.parent_otps ENABLE ROW LEVEL SECURITY;

-- 2. Function to generate and queue OTP via WhatsApp
CREATE OR REPLACE FUNCTION public.send_parent_otp(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_count INT;
  v_otp_code TEXT;
  v_tenant_id UUID;
  v_student_id UUID;
  v_message TEXT;
BEGIN
  -- Check if phone is registered for any student
  SELECT count(*), min(tenant_id), min(id) INTO v_student_count, v_tenant_id, v_student_id
  FROM public.profiles
  WHERE role = 'student' AND replace(parent_phone, ' ', '') = replace(p_phone, ' ', '');
  
  IF v_student_count = 0 THEN
    RAISE EXCEPTION 'رقم الهاتف المدخل غير مسجل كولي أمر في النظام';
  END IF;
  
  -- Generate 6-digit OTP code
  v_otp_code := floor(random() * 900000 + 100000)::text;
  
  -- Save/Update OTP
  INSERT INTO public.parent_otps (phone, code, created_at)
  VALUES (p_phone, v_otp_code, now())
  ON CONFLICT (phone) DO UPDATE
  SET code = EXCLUDED.code, created_at = now();
  
  -- Formulate the verification message
  v_message := 'رمز التحقق الخاص بك لتسجيل الدخول كولي أمر على منصة مسار هو: ' || v_otp_code || ' (صالح لمدة 15 دقيقة).';
  
  -- Queue the WhatsApp notification using the tenant and student context
  INSERT INTO public.parent_notifications (tenant_id, student_id, phone, message, type, status)
  VALUES (
    v_tenant_id,
    v_student_id,
    p_phone,
    v_message,
    'grade_added', -- Matches constraint: attendance_absent/grade_added/etc.
    'pending'
  );
  
  RETURN TRUE;
END;
$$;

-- 3. Function to verify OTP and return children's profiles securely
CREATE OR REPLACE FUNCTION public.verify_parent_otp(p_phone TEXT, p_code TEXT)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  qr_token TEXT,
  grade TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_code TEXT;
  v_created_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get active OTP
  SELECT code, created_at INTO v_db_code, v_created_at
  FROM public.parent_otps
  WHERE phone = p_phone;
  
  IF v_db_code IS NULL OR v_db_code != p_code THEN
    RAISE EXCEPTION 'كود التحقق غير صحيح';
  END IF;
  
  IF v_created_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'انتهت صلاحية كود التحقق';
  END IF;
  
  -- Clean up OTP after successful verification
  DELETE FROM public.parent_otps WHERE phone = p_phone;
  
  -- Return children details
  RETURN QUERY
  SELECT id, name, profiles.qr_token, profiles.grade
  FROM public.profiles
  WHERE role = 'student' AND replace(parent_phone, ' ', '') = replace(p_phone, ' ', '');
END;
$$;
