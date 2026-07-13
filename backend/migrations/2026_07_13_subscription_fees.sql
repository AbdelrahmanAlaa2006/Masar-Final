-- ============================================================================
-- 2026_07_13_subscription_fees.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Adds a real monthly subscription-fee model so a student who hasn't paid this
-- month shows the ACTUAL amount due (not 0):
--   1. subscription_fees: the monthly fee per grade, PER TENANT. Managed by any
--      staff member (admin or assistant) who holds the 'payments' permission.
--   2. profiles.subscription_discount: a per-student EGP discount for special
--      cases, set by staff with 'payments' via a gated RPC.
-- Each tenant owns its own fees/discounts (tenant-scoped RLS). The "amount due
-- this month" is then: paid this month -> 0, else max(0, grade_fee - discount).
-- ============================================================================

create table if not exists public.subscription_fees (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  grade      text not null,
  amount     numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint subscription_fees_tenant_grade_key unique (tenant_id, grade)
);

alter table public.subscription_fees enable row level security;

-- tenant_id auto-stamped from the acting staff's tenant (fires before the
-- WITH CHECK below, so upserts land in the correct tenant).
drop trigger if exists trig_set_tenant_id_subscription_fees on public.subscription_fees;
create trigger trig_set_tenant_id_subscription_fees
  before insert on public.subscription_fees
  for each row execute function public.set_tenant_id_on_insert();

-- Staff with the 'payments' permission manage their own tenant's fees.
drop policy if exists "Subscription fees staff" on public.subscription_fees;
create policy "Subscription fees staff" on public.subscription_fees
  for all to authenticated
  using      (tenant_id = public.current_tenant_id() and public.has_permission(auth.uid(),'payments'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission(auth.uid(),'payments'));

-- Anyone in the tenant may READ fees (used by reports/UI); still tenant-scoped.
drop policy if exists "Subscription fees read" on public.subscription_fees;
create policy "Subscription fees read" on public.subscription_fees
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- Per-student exception discount (EGP).
alter table public.profiles
  add column if not exists subscription_discount numeric not null default 0;

-- Set a student's discount — gated to staff with 'payments' and to the caller's
-- own tenant, so assistants can use it without broad profiles-update rights.
create or replace function public.set_student_discount(p_student_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'payments') then
    raise exception 'not authorized';
  end if;
  update public.profiles
  set subscription_discount = greatest(0, coalesce(p_amount, 0))
  where id = p_student_id and tenant_id = public.current_tenant_id();
end;
$$;

revoke execute on function public.set_student_discount(uuid, numeric) from public, anon;
grant execute on function public.set_student_discount(uuid, numeric) to authenticated;
