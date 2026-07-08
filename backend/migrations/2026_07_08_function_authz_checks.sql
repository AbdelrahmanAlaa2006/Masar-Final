-- Internal authorization checks for privileged SECURITY DEFINER functions.
-- Audit findings on the previous definitions:
--   * bulk_group_transfer / save_attendance_batch_v2: NO caller check at all —
--     any logged-in student could move students between groups or write
--     attendance records for anyone, in any tenant.
--   * delete_student_account / reset_student_password: checked the caller's
--     role but not the caller's tenant nor the target's role — an assistant
--     could delete/reset an ADMIN (or the super admin) or act across tenants.
--   * wipe_all_test_data: already safe (super_admin + email confirmation).
-- CREATE OR REPLACE preserves existing grants, so the v2 grant hardening
-- stays in effect. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- bulk_group_transfer: staff only, and only within the caller's own tenant
-- (super_admin may operate on any tenant).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_group_transfer(p_student_ids uuid[], p_target_group_id uuid, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'assistant', 'super_admin') THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً أو مساعداً لنقل الطلاب بين المجموعات.';
  END IF;

  IF v_caller_role != 'super_admin' AND (v_caller_tenant IS NULL OR v_caller_tenant != p_tenant_id) THEN
    RAISE EXCEPTION 'غير مسموح: لا يمكنك إجراء تعديلات على منصة أخرى.';
  END IF;

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
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- delete_student_account: staff only, target must be a STUDENT in the
-- caller's own tenant (super_admin may delete a student in any tenant).
-- Staff/admin accounts can no longer be deleted through this endpoint.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_student_account(p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً لإجراء هذا التعديل.';
  END IF;

  SELECT role, tenant_id INTO v_target_role, v_target_tenant
  FROM public.profiles WHERE id = p_student_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'الحساب المطلوب حذفه غير موجود.';
  END IF;

  IF v_target_role != 'student' THEN
    RAISE EXCEPTION 'غير مسموح: هذه الدالة تحذف حسابات الطلاب فقط.';
  END IF;

  IF v_caller_role != 'super_admin' AND (v_caller_tenant IS NULL OR v_caller_tenant != v_target_tenant) THEN
    RAISE EXCEPTION 'غير مسموح: لا يمكنك حذف حساب من منصة أخرى.';
  END IF;

  -- Delete from auth.users (cascades automatically to public.profiles and related tables)
  DELETE FROM auth.users
  WHERE id = p_student_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- reset_student_password: staff only, target must be a STUDENT in the
-- caller's own tenant. An assistant can no longer reset an admin's (or the
-- super admin's) password. super_admin may reset any student's password.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_student_password(p_student_id uuid, p_new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- Update auth.users encrypted_password using pgcrypto crypt
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10))
  WHERE id = p_student_id;

  -- Update plain-text password in profiles for admin reference
  UPDATE public.profiles
  SET password = p_new_password
  WHERE id = p_student_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- save_attendance_batch_v2: staff only; every record must belong to a
-- student of the caller's own tenant (super_admin exempt from tenant check).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_attendance_batch_v2(p_records jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_orig_group_id UUID;
  v_cur_group_id UUID;
  v_session_group_id UUID;
  v_tenant_id UUID;
  v_caller_role TEXT;
  v_caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'assistant', 'super_admin') THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً أو مساعداً لتسجيل الحضور.';
  END IF;

  FOR r IN SELECT * FROM jsonb_to_recordset(p_records) AS x(
    student_id UUID,
    session_id UUID,
    status TEXT,
    notes TEXT,
    created_by UUID
  ) LOOP
    -- Fetch student primary group, session group, and student tenant
    SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = r.student_id;

    IF v_caller_role != 'super_admin' AND (v_tenant_id IS NULL OR v_tenant_id != v_caller_tenant) THEN
      RAISE EXCEPTION 'غير مسموح: لا يمكنك تسجيل حضور طالب من منصة أخرى.';
    END IF;

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
$function$;
