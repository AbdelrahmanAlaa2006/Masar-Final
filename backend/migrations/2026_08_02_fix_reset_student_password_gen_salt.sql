-- ============================================================================
-- Fix reset_student_password function schema search_path and pgcrypto calls.
-- Previously threw: "function gen_salt(unknown, integer) does not exist"
-- because pgcrypto functions reside in extensions schema and search_path was public.
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

  -- Update plain-text password in profiles for admin reference
  UPDATE public.profiles
  SET password = p_new_password
  WHERE id = p_student_id;
END;
$function$;
