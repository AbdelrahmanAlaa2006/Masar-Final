-- Rollback for 2026_09_23_profile_privilege_guard.sql
-- WARNING: re-opens both privilege escalations described in that file.

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
DROP FUNCTION IF EXISTS public.guard_profile_privileged_columns();

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

  INSERT INTO public.profiles (id, name, phone, role, tenant_id, grade, is_active, parent_phone, qr_token, barcode_token, branch_id, "group")
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    v_tenant_id,
    new.raw_user_meta_data->>'grade',
    false,
    coalesce(new.raw_user_meta_data->>'parent_phone', ''),
    coalesce(new.raw_user_meta_data->>'qr_token', substring(md5(random()::text), 1, 16)),
    coalesce(new.raw_user_meta_data->>'barcode_token', 'BC-' || substring(md5(random()::text), 1, 10)),
    (new.raw_user_meta_data->>'branch_id')::uuid,
    new.raw_user_meta_data->>'group'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    tenant_id = EXCLUDED.tenant_id,
    grade = EXCLUDED.grade,
    parent_phone = EXCLUDED.parent_phone,
    qr_token = EXCLUDED.qr_token,
    barcode_token = EXCLUDED.barcode_token,
    branch_id = EXCLUDED.branch_id,
    "group" = EXCLUDED."group";

  v_group_id := (new.raw_user_meta_data->>'group_id')::uuid;
  IF v_group_id IS NOT NULL THEN
    INSERT INTO public.student_groups (tenant_id, student_id, group_id, is_primary)
    VALUES (v_tenant_id, new.id, v_group_id, true)
    ON CONFLICT (student_id, group_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
