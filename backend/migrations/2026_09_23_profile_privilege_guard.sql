-- =====================================================================
-- 2026_09_23_profile_privilege_guard.sql
--
-- Closes two privilege escalations (found 2026-09-23):
--
-- 1. RLS "Profiles tenant isolation" is FOR ALL on `id = auth.uid()`, so a
--    student could UPDATE their own row freely — role → 'admin', another
--    tenant_id, is_active/is_approved/status, grade, discount... RLS cannot
--    restrict columns, so a BEFORE INSERT/UPDATE trigger now does:
--      * super_admin, service role, internal (GoTrue, SQL console): anything
--      * admin: accounts of their own tenant; roles only student ↔ assistant
--      * assistant with 'students' permission: student rows of their tenant,
--        no role changes
--      * everyone else (incl. a user on their own row): privileged columns
--        must not change; self-inserts only as an inactive student
--    Nobody but super_admin moves a profile to another tenant.
--
-- 2. handle_new_user() copied `role` from raw_user_meta_data, which anyone
--    controls through supabase.auth.signUp({ options: { data } }). Every
--    account is now created as 'student'; staff accounts are promoted by the
--    existing privileged paths (create-tenant-admin edge function, the
--    Assistants panel upsert by an admin, Super Admin role change,
--    sync-students / import-admins with the service role).
--    It also stores enrollment_type and academic_year_id from sign-up, which
--    Register used to write afterwards on the student's own (now guarded) row.
--
-- Idempotent. Rollback: rollback/2026_09_23_profile_privilege_guard.rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role    text;
  v_uid         uuid;
  v_role        text;
  v_tenant      uuid;
  v_is_staff    boolean;
BEGIN
  BEGIN
    v_jwt_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN others THEN
    v_jwt_role := NULL;
  END;

  -- Trusted: no end-user request (GoTrue's own triggers, SQL console,
  -- migrations) or the service role.
  IF v_jwt_role IS NULL OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT role, tenant_id INTO v_role, v_tenant FROM public.profiles WHERE id = v_uid;
  END IF;

  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  v_is_staff := v_role IN ('admin', 'assistant') AND public.has_permission(v_uid, 'students');

  IF TG_OP = 'INSERT' THEN
    -- Staff creating accounts in their own tenant.
    IF v_is_staff AND NEW.tenant_id IS NOT DISTINCT FROM v_tenant
       AND (NEW.role = 'student' OR (v_role = 'admin' AND NEW.role = 'assistant')) THEN
      RETURN NEW;
    END IF;
    -- Self-registration: only as a not-yet-approved student.
    IF (v_uid IS NULL OR NEW.id = v_uid)
       AND NEW.role = 'student'
       AND NOT COALESCE(NEW.is_active, false)
       AND NOT COALESCE(NEW.is_approved, false)
       AND COALESCE(NEW.status, 'inactive') <> 'active' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'غير مسموح: لا يمكن إنشاء حساب بهذه الصلاحيات.' USING ERRCODE = '42501';
  END IF;

  -- UPDATE: nothing privileged changed → allowed for whoever RLS let through
  -- (a student editing their name, avatar, password copy...).
  IF NEW.role                  IS NOT DISTINCT FROM OLD.role
     AND NEW.tenant_id         IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.is_active         IS NOT DISTINCT FROM OLD.is_active
     AND NEW.is_approved       IS NOT DISTINCT FROM OLD.is_approved
     AND NEW.status            IS NOT DISTINCT FROM OLD.status
     AND NEW.enrollment_type   IS NOT DISTINCT FROM OLD.enrollment_type
     AND NEW.subscription_discount IS NOT DISTINCT FROM OLD.subscription_discount
     AND NEW.flags             IS NOT DISTINCT FROM OLD.flags
     AND NEW.grade             IS NOT DISTINCT FROM OLD.grade
     AND NEW.branch_id         IS NOT DISTINCT FROM OLD.branch_id
     AND NEW."group"           IS NOT DISTINCT FROM OLD."group"
     AND NEW.academic_year_id  IS NOT DISTINCT FROM OLD.academic_year_id
     AND NEW.qr_token          IS NOT DISTINCT FROM OLD.qr_token
     AND NEW.barcode_token     IS NOT DISTINCT FROM OLD.barcode_token THEN
    RETURN NEW;
  END IF;

  IF v_is_staff
     AND OLD.tenant_id IS NOT DISTINCT FROM v_tenant
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND OLD.id <> v_uid
     AND (
       -- assistants: student accounts only, role unchanged
       (OLD.role = 'student' AND NEW.role = 'student')
       -- admins: students and assistants, may switch between the two
       OR (v_role = 'admin' AND OLD.role IN ('student', 'assistant') AND NEW.role IN ('student', 'assistant'))
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'غير مسموح: لا يمكنك تعديل هذه البيانات في الحساب.' USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_profile_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ---------------------------------------------------------------------
-- Sign-up trigger: never take the role from client metadata.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_group_id UUID;
BEGIN
  v_tenant_id := coalesce((new.raw_user_meta_data->>'tenant_id')::uuid, 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid);

  -- role is ALWAYS 'student' here: raw_user_meta_data is client-controlled.
  INSERT INTO public.profiles (id, name, phone, role, tenant_id, grade, is_active, parent_phone, qr_token, barcode_token, branch_id, "group", enrollment_type, academic_year_id)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'student',
    v_tenant_id,
    new.raw_user_meta_data->>'grade',
    false, -- New students are inactive until approved
    coalesce(new.raw_user_meta_data->>'parent_phone', ''),
    coalesce(new.raw_user_meta_data->>'qr_token', substring(md5(random()::text), 1, 16)),
    coalesce(new.raw_user_meta_data->>'barcode_token', 'BC-' || substring(md5(random()::text), 1, 10)),
    (new.raw_user_meta_data->>'branch_id')::uuid,
    new.raw_user_meta_data->>'group',
    coalesce(nullif(new.raw_user_meta_data->>'enrollment_type', ''), 'CENTER'),
    (nullif(new.raw_user_meta_data->>'academic_year_id', ''))::uuid
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    tenant_id = EXCLUDED.tenant_id,
    grade = EXCLUDED.grade,
    parent_phone = EXCLUDED.parent_phone,
    qr_token = EXCLUDED.qr_token,
    barcode_token = EXCLUDED.barcode_token,
    branch_id = EXCLUDED.branch_id,
    "group" = EXCLUDED."group";

  -- Handle student group assignment if group_id is specified in user metadata
  v_group_id := (new.raw_user_meta_data->>'group_id')::uuid;
  IF v_group_id IS NOT NULL THEN
    INSERT INTO public.student_groups (tenant_id, student_id, group_id, is_primary)
    VALUES (
      v_tenant_id,
      new.id,
      v_group_id,
      true
    )
    ON CONFLICT (student_id, group_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
