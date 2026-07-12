-- ============================================================================
-- 2026_07_11_notifications_tenant_scope.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- WHY:
-- notifications had three permissive policies that granted reads WITHOUT a
-- tenant filter, so every admin (and every super admin) saw every tenant's
-- notifications — e.g. the super-admin bell aggregated all tenants'
-- "new student pending activation" alerts:
--   1. notifications_select_targeted           (is_admin() OR ...)   -- FOR SELECT
--   2. notifications_admin_write               (is_admin())          -- FOR ALL (USING covers SELECT)
--   3. "Super admins full control on notifications" (is_super_admin) -- FOR ALL
-- Because permissive policies are OR'd, any one of them leaking cross-tenant is
-- enough. tenant_id is already populated on every row (set_tenant_id_on_insert
-- trigger), so we can safely scope every branch to the current tenant.
--
-- FIX: add `tenant_id = current_tenant_id()` to all three. Each admin/student
-- now sees only their own tenant's notifications; the super admin sees only
-- their (default) tenant's. Trigger-created rows (signup alerts) are SECURITY
-- DEFINER and unaffected.
-- ============================================================================

-- 1) Targeted read (admins + scope-based student/grade visibility), tenant-scoped.
drop policy if exists notifications_select_targeted on public.notifications;
create policy notifications_select_targeted on public.notifications
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_admin()
      or scope = 'all'
      or (scope = 'student' and target_student = auth.uid())
      or (scope = 'grade'   and target_grade = (select grade from public.profiles where id = auth.uid()))
    )
  );

-- 2) Admin write (FOR ALL — its USING also gates SELECT), tenant-scoped.
drop policy if exists notifications_admin_write on public.notifications;
create policy notifications_admin_write on public.notifications
  for all to authenticated
  using      (public.is_admin() and tenant_id = public.current_tenant_id())
  with check (public.is_admin() and tenant_id = public.current_tenant_id());

-- 3) Super-admin full control, tenant-scoped (they manage within their own tenant).
drop policy if exists "Super admins full control on notifications" on public.notifications;
create policy "Super admins full control on notifications" on public.notifications
  for all to authenticated
  using      (public.is_super_admin(auth.uid()) and tenant_id = public.current_tenant_id())
  with check (public.is_super_admin(auth.uid()) and tenant_id = public.current_tenant_id());
