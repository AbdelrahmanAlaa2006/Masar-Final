-- =====================================================================
-- 2026_06_26_super_admin_utilities.sql
-- Run in Supabase SQL editor to create security definer functions
-- and database policies for Super Admins.
-- =====================================================================

-- 1. Security definer function allowing admins/assistants to securely delete student accounts
CREATE OR REPLACE FUNCTION public.delete_student_account(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is admin, assistant, or super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR role = 'assistant' OR role = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً لإجراء هذا التعديل.';
  END IF;

  -- Delete from auth.users (cascades automatically to public.profiles and related tables)
  DELETE FROM auth.users
  WHERE id = p_student_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.wipe_all_test_data(p_confirm_email TEXT, p_tenant_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  -- Fetch current authenticated user's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  -- Verify user is super_admin and matches the secure developer email
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ) OR v_user_email IS NULL OR v_user_email != p_confirm_email THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون المطور الرئيسي ومالك المنصة لتنظيف قاعدة البيانات.';
  END IF;

  IF p_tenant_id IS NULL THEN
    -- Global wipe (Truncate activity logs and test records across all tenants)
    TRUNCATE public.parent_notifications CASCADE;
    TRUNCATE public.password_reset_requests CASCADE;
    TRUNCATE public.devtools_violations CASCADE;
    TRUNCATE public.homework_submissions CASCADE;
    TRUNCATE public.exam_attempts CASCADE;
    TRUNCATE public.video_progress CASCADE;
    TRUNCATE public.video_comments CASCADE;
    TRUNCATE public.video_notes CASCADE;
    TRUNCATE public.chat_messages CASCADE;
    TRUNCATE public.attendance CASCADE;
    TRUNCATE public.grades CASCADE;
    TRUNCATE public.payments CASCADE;

    -- Delete all non-admin auth user records (Students and Assistants)
    DELETE FROM auth.users WHERE id IN (
      SELECT id FROM public.profiles WHERE role IN ('student', 'assistant')
    );

    -- Delete non-admin profiles (if any orphans remain)
    DELETE FROM public.profiles WHERE role IN ('student', 'assistant');
  ELSE
    -- Tenant-specific wipe (Avoid truncating tables globally, delete scoped data)
    DELETE FROM public.parent_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.password_reset_requests WHERE tenant_id = p_tenant_id;
    DELETE FROM public.devtools_violations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.homework_submissions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.exam_attempts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.video_progress WHERE tenant_id = p_tenant_id;
    DELETE FROM public.video_comments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.video_notes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.chat_messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.attendance WHERE tenant_id = p_tenant_id;
    DELETE FROM public.grades WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;

    -- Delete all non-admin auth user records for this tenant
    DELETE FROM auth.users WHERE id IN (
      SELECT id FROM public.profiles WHERE tenant_id = p_tenant_id AND role IN ('student', 'assistant')
    );

    -- Delete non-admin profiles for this tenant
    DELETE FROM public.profiles WHERE tenant_id = p_tenant_id AND role IN ('student', 'assistant');
  END IF;
END;
$$;


-- 3. Security definer helper to check super_admin role without causing policy recursion
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'super_admin'
  );
END;
$$;

-- 4. Grant Super Admins full bypass access on Tenants and Profiles tables
DROP POLICY IF EXISTS "Super admins have full control on tenants" ON public.tenants;
CREATE POLICY "Super admins have full control on tenants" ON public.tenants
  FOR ALL TO authenticated USING (
    public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Super admins full control on profiles" ON public.profiles;
CREATE POLICY "Super admins full control on profiles" ON public.profiles
  FOR ALL TO authenticated USING (
    public.is_super_admin(auth.uid())
  );

-- 5. Update profiles role check constraint to support 'super_admin' role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('student', 'teacher', 'admin', 'assistant', 'super_admin'));
