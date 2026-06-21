-- =====================================================================
-- 2026_07_02_super_admin_policies.sql
-- Run in Supabase SQL editor to update RLS policies and admin functions
-- to support Super Admins.
-- =====================================================================

-- 1. Update is_current_user_admin() to include 'super_admin' role
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role IN ('admin', 'assistant', 'super_admin');
END;
$$;

-- 2. Add Super Admin policies to devtools_violations
DROP POLICY IF EXISTS "Super admins full control on devtools_violations" ON public.devtools_violations;
CREATE POLICY "Super admins full control on devtools_violations" ON public.devtools_violations
  FOR ALL TO authenticated USING (
    public.is_super_admin(auth.uid())
  );

-- 3. Add Super Admin policies to notifications
DROP POLICY IF EXISTS "Super admins full control on notifications" ON public.notifications;
CREATE POLICY "Super admins full control on notifications" ON public.notifications
  FOR ALL TO authenticated USING (
    public.is_super_admin(auth.uid())
  );

-- 4. Add Super Admin policies to password_reset_requests
DROP POLICY IF EXISTS "Super admins full control on password_reset_requests" ON public.password_reset_requests;
CREATE POLICY "Super admins full control on password_reset_requests" ON public.password_reset_requests
  FOR ALL TO authenticated USING (
    public.is_super_admin(auth.uid())
  );
