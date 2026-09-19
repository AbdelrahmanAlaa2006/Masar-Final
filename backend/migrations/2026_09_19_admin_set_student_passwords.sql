-- ============================================================================
-- 2026_09_19_admin_set_student_passwords.sql
--
-- Login cards: the admin panel prints a card per student (name, login code,
-- password, parent phone). A password can never be read back from the stored
-- hash, so for students whose password the app does not hold, the admin can
-- generate a new one and print it. That means setting the password for a whole
-- group — up to several hundred students — in one action.
--
-- reset_student_password() already does this for ONE student. Doing it in a
-- loop from the browser would be one request per student; this takes the whole
-- batch in a single call, with the same permission rules:
--   * caller must be admin / assistant / super_admin
--   * every target must be a student in the caller's own tenant
--   * every target's sessions are ended, so an old password cannot keep a
--     device logged in (same rule as 2026_09_16_reset_password_ends_sessions)
--
-- Nothing is applied unless EVERY item passes its checks: a half-finished
-- batch would mean printed cards that do not match the real passwords.
--
-- p_items: [{"id": "<uuid>", "password": "miracle4837"}, ...]
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_student_passwords(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_caller_role   text;
  v_caller_tenant uuid;
  v_item          jsonb;
  v_id            uuid;
  v_password      text;
  v_target_role   text;
  v_target_tenant uuid;
  v_count         integer := 0;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'assistant', 'super_admin') THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً أو مساعداً لتغيير كلمات المرور.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'قائمة الطلاب غير صحيحة.';
  END IF;

  IF jsonb_array_length(p_items) > 1000 THEN
    RAISE EXCEPTION 'الحد الأقصى 1000 طالب في المرة الواحدة.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id := (v_item->>'id')::uuid;
    v_password := v_item->>'password';

    IF v_id IS NULL OR v_password IS NULL OR char_length(v_password) < 6 THEN
      RAISE EXCEPTION 'بيانات غير صحيحة: كلمة المرور يجب أن تكون 6 حروف أو أرقام على الأقل.';
    END IF;

    SELECT role, tenant_id INTO v_target_role, v_target_tenant
    FROM public.profiles WHERE id = v_id;

    IF v_target_role IS NULL THEN
      RAISE EXCEPTION 'حساب غير موجود ضمن القائمة.';
    END IF;
    IF v_target_role <> 'student' THEN
      RAISE EXCEPTION 'غير مسموح: يمكن تغيير كلمات مرور حسابات الطلاب فقط.';
    END IF;
    IF v_caller_role <> 'super_admin'
       AND (v_caller_tenant IS NULL OR v_caller_tenant <> v_target_tenant) THEN
      RAISE EXCEPTION 'غير مسموح: لا يمكنك تعديل حساب من منصة أخرى.';
    END IF;

    UPDATE auth.users
    SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf'))
    WHERE id = v_id;

    -- End every live login of this student, on every device.
    DELETE FROM auth.sessions WHERE user_id = v_id;

    -- Readable copy, so the admin can reprint the same card later.
    UPDATE public.profiles SET password = v_password WHERE id = v_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_student_passwords(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_student_passwords(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_student_passwords(jsonb) TO authenticated, service_role;

SELECT 'admin_set_student_passwords ready' AS result;
