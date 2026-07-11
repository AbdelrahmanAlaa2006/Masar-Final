-- ============================================================================
-- 2026_07_11_fix_tenant_id_column_defaults.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- ROOT CAUSE (multi-tenant write failures on every non-default tenant):
--   These tables were given a column DEFAULT of the DEFAULT tenant's id:
--     tenant_id uuid DEFAULT 'd3b07384-d113-4ec2-a5d6-d005b6be4979'
--   The set_tenant_id_on_insert() trigger only fills tenant_id when it is NULL
--   (IF NEW.tenant_id IS NULL ...). Because the column DEFAULT makes it never
--   NULL, the trigger no-ops and every inserted row is stamped with the DEFAULT
--   tenant. The RLS write policies check `tenant_id = current_tenant_id()`, so:
--     - default tenant:      default_id = default_id      -> OK
--     - every other tenant:  default_id = <their tenant>  -> 42501 RLS violation
--   Symptom: admins on non-default tenants cannot add videos/exams/homework/etc,
--   while the default tenant works. Confirmed by reproducing the insert under
--   `set role authenticated` with a real admin's auth.uid().
--
-- FIX:
--   Drop the bogus column DEFAULT so the trigger can stamp the REAL tenant from
--   current_tenant_id(). The 13 content/RLS tables already have the trigger, so
--   dropping the default is safe. profiles has no such trigger, so we add it
--   first (handle_new_user still sets tenant_id explicitly during signup, so the
--   trigger is a no-op there; for any other insert path it now stamps the
--   acting user's real tenant instead of silently defaulting).
-- ============================================================================

-- --- 13 tables that already have trig_set_tenant_id_<table> ------------------
alter table public.access_overrides        alter column tenant_id drop default;
alter table public.devtools_violations      alter column tenant_id drop default;
alter table public.exam_attempts            alter column tenant_id drop default;
alter table public.exams                    alter column tenant_id drop default;
alter table public.homework_submissions     alter column tenant_id drop default;
alter table public.homeworks                alter column tenant_id drop default;
alter table public.notifications            alter column tenant_id drop default;
alter table public.password_reset_requests  alter column tenant_id drop default;
alter table public.payment_settings         alter column tenant_id drop default;
alter table public.payments                 alter column tenant_id drop default;
alter table public.quiz_attempts            alter column tenant_id drop default;
alter table public.video_progress           alter column tenant_id drop default;
alter table public.videos                   alter column tenant_id drop default;

-- --- profiles: has no auto-stamp trigger; add it, then drop the default ------
drop trigger if exists trig_set_tenant_id_profiles on public.profiles;
create trigger trig_set_tenant_id_profiles
  before insert on public.profiles
  for each row execute function public.set_tenant_id_on_insert();

alter table public.profiles                 alter column tenant_id drop default;
