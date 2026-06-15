-- =====================================================================
-- Allow Tenant Config Updates by Administrators
-- Run once in the Supabase SQL Editor to grant permissions.
-- =====================================================================

DROP POLICY IF EXISTS "Admins can update own tenant config" ON public.tenants;
CREATE POLICY "Admins can update own tenant config" ON public.tenants
  FOR UPDATE USING (id = public.current_tenant_id() AND public.is_current_user_admin());
