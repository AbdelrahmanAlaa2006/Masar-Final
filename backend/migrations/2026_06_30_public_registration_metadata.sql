-- 1. Create public function to fetch branches for a tenant without authentication
CREATE OR REPLACE FUNCTION public.get_public_branches(p_tenant_id UUID)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM public.branches WHERE tenant_id = p_tenant_id ORDER BY name;
$$;

-- 2. Create public function to fetch groups for a tenant and grade/stage without authentication
CREATE OR REPLACE FUNCTION public.get_public_groups(p_tenant_id UUID, p_grade TEXT)
RETURNS TABLE (id UUID, name TEXT, branch_id UUID)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, branch_id FROM public.groups WHERE tenant_id = p_tenant_id AND grade = p_grade ORDER BY name;
$$;

-- 3. Update trigger function handle_new_user() to process branch_id, group, and student_groups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
    false, -- New students are inactive until approved
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create public function to check if a user with the given phone number exists for a tenant (any role)
CREATE OR REPLACE FUNCTION public.check_student_phone_exists(p_phone TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE phone = p_phone 
      AND tenant_id = p_tenant_id
  );
END;
$$;
