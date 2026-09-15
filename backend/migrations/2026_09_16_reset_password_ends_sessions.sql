-- ============================================================================
-- 2026_09_16_reset_password_ends_sessions.sql
--
-- Logins can now stay on a device (backend/authStorage.js): students are kept
-- logged in until they press logout. A password reset by an admin must
-- therefore also END every existing session of that student — otherwise
-- whoever else knew the old password simply stays logged in.
--
-- Deleting from auth.sessions cascades to auth.refresh_tokens, so no device
-- can refresh again. Access tokens already issued still expire on their own
-- (about an hour); JWTs cannot be revoked. The app clears its own stored login
-- when Supabase reports the session is gone (AuthContext).
--
-- Otherwise identical to 2026_08_02_fix_reset_student_password_gen_salt.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_student_password(p_student_id uuid, p_new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_tenant UUID;
  v_target_role TEXT;
  v_target_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'assistant', 'super_admin') THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً أو مساعداً لتغيير كلمة المرور.';
  END IF;

  SELECT role, tenant_id INTO v_target_role, v_target_tenant
  FROM public.profiles WHERE id = p_student_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'الحساب المطلوب غير موجود.';
  END IF;

  IF v_target_role != 'student' THEN
    RAISE EXCEPTION 'غير مسموح: يمكن تغيير كلمة مرور حسابات الطلاب فقط من هنا.';
  END IF;

  IF v_caller_role != 'super_admin' AND (v_caller_tenant IS NULL OR v_caller_tenant != v_target_tenant) THEN
    RAISE EXCEPTION 'غير مسموح: لا يمكنك تعديل حساب من منصة أخرى.';
  END IF;

  -- Update auth.users encrypted_password using pgcrypto extensions.crypt / extensions.gen_salt
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  WHERE id = p_student_id;

  -- End every live login of this student, on every device.
  DELETE FROM auth.sessions
  WHERE user_id = p_student_id;

  -- Update plain-text password in profiles for admin reference
  UPDATE public.profiles
  SET password = p_new_password
  WHERE id = p_student_id;
END;
$function$;
