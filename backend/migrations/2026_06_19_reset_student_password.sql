-- =====================================================================
-- 2026_06_19_reset_student_password.sql
-- Run in Supabase SQL editor.
--
-- Security definer function allowing admins to securely reset any
-- student's password in auth.users and profiles.password.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reset_student_password(p_student_id UUID, p_new_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the caller is an admin (or assistant with student management permissions)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR role = 'assistant')
  ) THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً أو مساعداً لتغيير كلمة المرور.';
  END IF;

  -- Update auth.users encrypted_password using pgcrypto crypt
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10))
  WHERE id = p_student_id;

  -- Update plain-text password in profiles for admin reference
  UPDATE public.profiles
  SET password = p_new_password
  WHERE id = p_student_id;
END;
$$;
