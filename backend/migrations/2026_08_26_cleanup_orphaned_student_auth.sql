-- ============================================================================
-- 2026_08_26_cleanup_orphaned_student_auth.sql
--
-- Adds a safe RPC function to clean up orphaned auth.users records when a student
-- account was partially created or deleted from profiles but remains in auth.users.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_student_auth(p_phone TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_tenant UUID;
  v_email_custom TEXT;
  v_email_default TEXT;
  v_existing_profile_id UUID;
  v_clean_phone TEXT;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('admin', 'assistant', 'super_admin') THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً لتنفيذ هذه العملية.';
  END IF;

  v_clean_phone := lower(regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g'));
  IF v_clean_phone = '' THEN
    RETURN FALSE;
  END IF;

  v_email_custom := v_clean_phone || '-' || p_tenant_id::text || '@masaar.app';
  v_email_default := v_clean_phone || '@masaar.app';

  -- Check if an active profile already exists in this tenant for this phone
  SELECT id INTO v_existing_profile_id
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND phone = v_clean_phone;

  IF v_existing_profile_id IS NOT NULL THEN
    -- Real profile exists, do not delete auth user
    RETURN FALSE;
  END IF;

  -- Profile does NOT exist in this tenant. Delete any orphaned auth user for this email
  DELETE FROM auth.users
  WHERE email = v_email_custom
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.users.id);

  IF p_tenant_id = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid THEN
    DELETE FROM auth.users
    WHERE email = v_email_default
      AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.users.id);
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_student_auth(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_student_auth(TEXT, UUID) TO authenticated, service_role;
