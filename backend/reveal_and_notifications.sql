-- ============================================================
-- reveal_and_notifications.sql
-- Run once in the Supabase SQL editor.
--
-- Adds:
--   1. `exam_reveal` as a valid item_type on access_overrides so admins can
--      reveal an exam's results to a single student or a whole grade.
--   2. Flips the default of exams.reveal_grades to false (results are
--      hidden by default), and hides all existing exams too — the admin
--      re-reveals them explicitly from the control panel.
--   3. A `notifications` table + RLS so reveal actions (and manual admin
--      announcements) persist across devices instead of per-browser
--      localStorage.
-- ============================================================

-- 1. allow 'exam_reveal' on access_overrides -------------------
alter table public.access_overrides
  drop constraint if exists access_overrides_item_type_check;

alter table public.access_overrides
  add constraint access_overrides_item_type_check
  check (item_type in ('video','exam','exam_reveal'));

-- 2. default-hide exam results --------------------------------
alter table public.exams
  alter column reveal_grades set default false;

update public.exams set reveal_grades = false where reveal_grades is true;

-- 3. notifications --------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  message     text,
  level       text not null default 'info'
                check (level in ('info','warning','danger','success')),
  -- Targeting — exactly one of these three shapes should be filled:
  --   scope='all'     → visible to every authenticated user.
  --   scope='grade'   → target_grade set, visible to students with that grade.
  --   scope='student' → target_student set, visible to that one student.
  scope          text not null
                   check (scope in ('all','grade','student')),
  target_grade   text
                   check (target_grade is null
                          or target_grade in ('first-prep','second-prep','third-prep')),
  target_student uuid references public.profiles(id) on delete cascade,
  -- Optional deep-link payload (e.g. {"examId":"...","kind":"reveal"}).
  meta        jsonb not null default '{}'::jsonb,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_scope_idx
  on public.notifications (scope, created_at desc);
create index if not exists notifications_target_student_idx
  on public.notifications (target_student, created_at desc);
create index if not exists notifications_target_grade_idx
  on public.notifications (target_grade, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_targeted on public.notifications;
create policy notifications_select_targeted on public.notifications
  for select to authenticated
  using (
    public.is_admin()
    or scope = 'all'
    or (scope = 'student' and target_student = auth.uid())
    or (scope = 'grade'   and target_grade =
          (select grade from public.profiles where id = auth.uid()))
  );

drop policy if exists notifications_admin_write on public.notifications;
create policy notifications_admin_write on public.notifications
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Per-user read tracking. We don't try to be clever here — one row per
-- (notification, user) means we can show/hide a dot without touching the
-- shared notification row. Students can upsert their own read rows only.
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_reads enable row level security;

drop policy if exists nread_select_own on public.notification_reads;
create policy nread_select_own on public.notification_reads
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists nread_insert_own on public.notification_reads;
create policy nread_insert_own on public.notification_reads
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists nread_delete_own on public.notification_reads;
create policy nread_delete_own on public.notification_reads
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
