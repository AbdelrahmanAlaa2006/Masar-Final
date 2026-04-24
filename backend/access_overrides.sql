-- ============================================================
-- access_overrides — admin-controlled per-target allow/attempts
-- Run once in the Supabase SQL editor.
-- ============================================================

create table if not exists public.access_overrides (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('prep','student')),
  -- For scope='prep': target_id is the DB grade enum value ('first-prep' ...).
  -- For scope='student': target_id is profiles.id cast to text.
  target_id   text not null,
  item_type   text not null check (item_type in ('video','exam')),
  item_id     uuid not null,
  allowed     boolean not null default true,
  attempts    int,                         -- null → use item default
  updated_at  timestamptz not null default now(),
  unique (scope, target_id, item_type, item_id)
);

create index if not exists ao_target_idx
  on public.access_overrides (scope, target_id, item_type);
create index if not exists ao_item_idx
  on public.access_overrides (item_type, item_id);

-- keep updated_at fresh on writes
drop trigger if exists ao_set_updated_at on public.access_overrides;
create trigger ao_set_updated_at
  before update on public.access_overrides
  for each row execute function public.tg_set_updated_at();

alter table public.access_overrides enable row level security;

-- Admins do anything.
drop policy if exists ao_admin_all on public.access_overrides;
create policy ao_admin_all on public.access_overrides
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Students may read only overrides that apply to them (their own row,
-- or their grade).
drop policy if exists ao_student_select on public.access_overrides;
create policy ao_student_select on public.access_overrides
  for select to authenticated
  using (
    public.is_admin()
    or (scope = 'student' and target_id = auth.uid()::text)
    or (scope = 'prep'    and target_id = (select grade from public.profiles where id = auth.uid()))
  );
