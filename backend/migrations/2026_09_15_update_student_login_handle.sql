-- ============================================================================
-- 2026_09_15_update_student_login_handle.sql
--
-- Bug: editing a student's phone/code in the control panel only changed
-- profiles.phone. The credential the student actually logs in with lives in
-- Supabase Auth as a synthetic email derived from that value
-- ({handle}@masaar.app on the default tenant, {handle}-{tenant_id}@masaar.app
-- elsewhere — see phoneToEmail in backend/authApi.js). The old email stayed
-- behind, so the student could only log in with the OLD number.
--
-- This RPC changes the login email (auth.users + auth.identities) and the
-- profile phone in one transaction, so the two can no longer drift apart.
-- auth.identities.email is a generated column (lower(identity_data->>'email')),
-- which is why identity_data is what gets rewritten.
--
-- Idempotent: calling it with the value a student already has is a no-op write.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_student_login_handle(p_student_id uuid, p_new_handle text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  c_default_tenant CONSTANT uuid := 'd3b07384-d113-4ec2-a5d6-d005b6be4979';
  v_caller_role   text;
  v_caller_tenant uuid;
  v_target_role   text;
  v_target_tenant uuid;
  v_handle        text;
  v_new_email     text;
  v_old_email     text;
  v_clash_id      uuid;
BEGIN
  -- ── who is calling ──
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'assistant', 'super_admin') THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً لتعديل بيانات دخول الطالب.';
  END IF;

  -- ── who is being changed ──
  SELECT role, tenant_id INTO v_target_role, v_target_tenant
  FROM public.profiles WHERE id = p_student_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'الحساب المطلوب غير موجود.';
  END IF;
  IF v_target_role <> 'student' THEN
    RAISE EXCEPTION 'غير مسموح: يمكن تعديل بيانات دخول حسابات الطلاب فقط من هنا.';
  END IF;
  IF v_caller_role <> 'super_admin' AND (v_caller_tenant IS NULL OR v_caller_tenant <> v_target_tenant) THEN
    RAISE EXCEPTION 'غير مسموح: لا يمكنك تعديل حساب من منصة أخرى.';
  END IF;

  -- ── normalise exactly like phoneToEmail() does at login ──
  v_handle := regexp_replace(coalesce(p_new_handle, ''), '\s+', '', 'g');
  IF v_handle = '' THEN
    RAISE EXCEPTION 'رقم الهاتف أو الكود مطلوب.';
  END IF;
  -- Same acceptance rule as the login form, so a saved value can always log in.
  IF NOT (length(v_handle) >= 8 OR v_handle ~ '^[A-Za-z0-9]{4,20}$') THEN
    RAISE EXCEPTION 'رقم الهاتف أو الكود (%) غير صالح لتسجيل الدخول: يجب أن يكون رقماً من 8 خانات على الأقل أو كوداً من 4 إلى 20 حرفاً أو رقماً.', v_handle;
  END IF;

  IF v_target_tenant = c_default_tenant THEN
    v_new_email := lower(v_handle) || '@masaar.app';
  ELSE
    v_new_email := lower(v_handle) || '-' || v_target_tenant::text || '@masaar.app';
  END IF;

  -- ── uniqueness: another student in this centre ──
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = v_target_tenant
      AND id <> p_student_id
      AND lower(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = lower(v_handle)
  ) THEN
    RAISE EXCEPTION 'رقم الهاتف أو الكود (%) مسجل بالفعل لطالب آخر في هذه المنصة.', v_handle;
  END IF;

  -- ── uniqueness: another login already owns that email ──
  SELECT id INTO v_clash_id FROM auth.users
  WHERE email = v_new_email AND id <> p_student_id
  LIMIT 1;

  IF v_clash_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_clash_id) THEN
      RAISE EXCEPTION 'رقم الهاتف أو الكود (%) مستخدم بالفعل كبيانات دخول لحساب آخر.', v_handle;
    END IF;
    -- Orphaned login with no profile behind it (a half-created account).
    -- Same rule cleanup_orphaned_student_auth already applies.
    DELETE FROM auth.users WHERE id = v_clash_id;
  END IF;

  -- ── apply ──
  SELECT email INTO v_old_email FROM auth.users WHERE id = p_student_id;

  UPDATE auth.users
  SET email              = v_new_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('phone', v_handle),
      updated_at         = now()
  WHERE id = p_student_id;

  UPDATE auth.identities
  SET identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_new_email),
      -- Older email identities used the email itself as provider_id.
      provider_id   = CASE WHEN provider_id = v_old_email THEN v_new_email ELSE provider_id END,
      updated_at    = now()
  WHERE user_id = p_student_id AND provider = 'email';

  UPDATE public.profiles
  SET phone = v_handle
  WHERE id = p_student_id;

  RETURN v_handle;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_student_login_handle(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_student_login_handle(uuid, text) TO authenticated, service_role;
