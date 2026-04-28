-- ============================================================
-- group_scope.sql
-- Run once in the Supabase SQL editor (after profiles_group.sql).
--
-- Adds 'group' as a first-class targeting scope on both
-- access_overrides and notifications, so admins can reveal
-- results / grant access / announce things to a single class
-- group inside a grade — not just the whole grade or one student.
--
-- Convention: target_id (and target_group on notifications) is
-- the literal label "<grade>:<group>", e.g. "first-prep:A1" or
-- "second-prep:السبت 4م". This avoids needing a separate groups
-- table; the group label is already free-text on profiles.group.
-- ============================================================

-- 1. access_overrides: allow scope='group' --------------------
alter table public.access_overrides
  drop constraint if exists access_overrides_scope_check;

alter table public.access_overrides
  add constraint access_overrides_scope_check
  check (scope in ('prep','student','group'));

-- Refresh the student-side select policy so a student can read
-- group rows that match their own (grade, group). Admins still
-- see everything via is_admin().
drop policy if exists ao_student_select on public.access_overrides;
create policy ao_student_select on public.access_overrides
  for select to authenticated
  using (
    public.is_admin()
    or (scope = 'student' and target_id = auth.uid()::text)
    or (scope = 'prep'    and target_id =
          (select grade from public.profiles where id = auth.uid()))
    or (scope = 'group'   and target_id =
          (select coalesce(grade, '') || ':' || coalesce("group", '')
             from public.profiles where id = auth.uid()))
  );

-- 2. notifications: allow scope='group' + target_group column -
alter table public.notifications
  drop constraint if exists notifications_scope_check;

alter table public.notifications
  add constraint notifications_scope_check
  check (scope in ('all','grade','student','group'));

alter table public.notifications
  add column if not exists target_group text;

create index if not exists notifications_target_group_idx
  on public.notifications (target_group, created_at desc);

-- Refresh the targeted-select policy so students see notifications
-- whose target_group matches their own "<grade>:<group>".
drop policy if exists notifications_select_targeted on public.notifications;
create policy notifications_select_targeted on public.notifications
  for select to authenticated
  using (
    public.is_admin()
    or scope = 'all'
    or (scope = 'student' and target_student = auth.uid())
    or (scope = 'grade'   and target_grade =
          (select grade from public.profiles where id = auth.uid()))
    or (scope = 'group'   and target_group =
          (select coalesce(grade, '') || ':' || coalesce("group", '')
             from public.profiles where id = auth.uid()))
  );
