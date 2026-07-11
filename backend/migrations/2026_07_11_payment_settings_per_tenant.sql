-- ============================================================================
-- 2026_07_11_payment_settings_per_tenant.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- ROOT CAUSE:
-- public.payment_settings was created with `key text PRIMARY KEY` — a GLOBAL
-- key. In a multi-tenant DB that means only ONE row can exist per key across
-- all tenants, and the seeded rows (vodafoneCash / instaPay) live under the
-- DEFAULT tenant. When any non-default tenant's admin saves settings, the
-- upsert collides on `key` with the default-tenant row and tries to UPDATE it,
-- which fails the tenant-isolation policy:
--   "new row violates row-level security policy (USING expression) for table
--    payment_settings".
--
-- FIX:
-- Make the table per-tenant by repointing the primary key to (tenant_id, key),
-- so each tenant gets its own settings rows and upserts target the tenant's own
-- row (which passes tenant isolation). Pairs with the paymentsApi.js upsert
-- change: onConflict: 'tenant_id,key'.
-- ============================================================================

-- Every row must have a tenant (older rows may be NULL before the default was
-- dropped). Park orphans under the default tenant so the composite key is valid.
update public.payment_settings
set tenant_id = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid
where tenant_id is null;

alter table public.payment_settings alter column tenant_id set not null;

-- Repoint the primary key from (key) to (tenant_id, key).
alter table public.payment_settings drop constraint if exists payment_settings_pkey;
alter table public.payment_settings add constraint payment_settings_pkey primary key (tenant_id, key);

-- Reads must be tenant-scoped now that rows are per-tenant; the old
-- "using (true)" policy returned every tenant's rows, so getPaymentSettings
-- (.select('*')) could surface another tenant's payment details. Authenticated
-- students/admins resolve current_tenant_id() from their own profile.
drop policy if exists "Anyone can read payment settings" on public.payment_settings;
create policy "Tenant read payment settings" on public.payment_settings
  for select using (tenant_id = public.current_tenant_id());
