-- =====================================================================
-- Replace "Lectures" with a real Homework feature.
-- Run this once in Supabase SQL Editor.
-- Idempotent: safe to re-run.
--
-- What you get:
--   • homeworks                 — the assignment posted by an admin
--                                 (same fields as lectures + due_at + max_score)
--   • homework_submissions      — one row per (homework, student)
--   • RLS policies              — students see/upload only their own; admins all
--   • indexes                   — for the hot queries
--   • a one-shot copy of any rows from lectures → homeworks so existing
--     content keeps showing up (new rows get a sensible default due_at).
--   • OPTIONAL last block to drop the legacy lectures table — commented
--     out so you can verify the migration before removing data.
-- =====================================================================

-- ── 1. Homeworks table ────────────────────────────────────────────────
create table if not exists public.homeworks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  subject     text,
  teacher     text,
  week        text,
  grade       text not null,                 -- 'first-prep' | 'second-prep' | 'third-prep'
  cover_url   text,
  pdf_url     text,                          -- the assignment PDF (problem set)
  pdf_key     text,
  due_at      timestamptz,                   -- nullable = no deadline
  max_score   int default 100,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now()
);

create index if not exists idx_homeworks_grade_created on public.homeworks (grade, created_at desc);
create index if not exists idx_homeworks_due           on public.homeworks (due_at);

-- ── 2. Submissions table ──────────────────────────────────────────────
create table if not exists public.homework_submissions (
  id              uuid primary key default gen_random_uuid(),
  homework_id     uuid not null references public.homeworks(id) on delete cascade,
  student_id      uuid not null references public.profiles(id)  on delete cascade,

  -- Student's answer file (optional — they may submit a note only)
  submission_url  text,
  submission_key  text,
  note            text,
  submitted_at    timestamptz default now(),

  -- Admin grading
  score           int,
  feedback        text,
  graded_at       timestamptz,
  graded_by       uuid references public.profiles(id),

  unique (homework_id, student_id)            -- one submission per student per homework
);

create index if not exists idx_homework_submissions_hw      on public.homework_submissions (homework_id);
create index if not exists idx_homework_submissions_student on public.homework_submissions (student_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────
alter table public.homeworks            enable row level security;
alter table public.homework_submissions enable row level security;

-- Drop any old policies so this migration is idempotent.
do $$
declare r record;
begin
  for r in
    select polname, polrelid::regclass::text as tbl
      from pg_policy
     where polrelid in (
       'public.homeworks'::regclass,
       'public.homework_submissions'::regclass
     )
  loop
    execute format('drop policy %I on %s;', r.polname, r.tbl);
  end loop;
end $$;

-- 3a. homeworks: students see their grade; admins see all; only admins write.
create policy hw_select_grade_or_admin
  on public.homeworks for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.grade = homeworks.grade)
    )
  );

create policy hw_admin_write
  on public.homeworks for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- 3b. homework_submissions: student sees their own + can insert/update
--     their own row; admins see all + can grade.
create policy hws_select_own_or_admin
  on public.homework_submissions for select
  using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'admin')
  );

create policy hws_insert_own
  on public.homework_submissions for insert
  with check (
    student_id = auth.uid()
    -- Score / feedback / graded_at / graded_by must be NULL on insert
    -- so a student cannot pre-grade themselves.
    and score      is null
    and feedback   is null
    and graded_at  is null
    and graded_by  is null
  );

-- Students may update only their own submission, and only the answer
-- fields — not the grading fields. Everything below uses both USING
-- (which row?) and WITH CHECK (what shape after?) — together they prevent
-- a student from PATCH'ing score = 100.
create policy hws_update_own_answer_only
  on public.homework_submissions for update
  using (student_id = auth.uid())
  with check (
    student_id = auth.uid()
    and score      is null
    and feedback   is null
    and graded_at  is null
    and graded_by  is null
  );

-- Admins keep full control (grade / fix / delete).
create policy hws_admin_all
  on public.homework_submissions for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- ── 4. One-shot copy of lectures into homeworks ───────────────────────
-- Skip a row if a homework with the same id already exists (re-run safe).
-- Sets due_at to NULL by default; admins can edit on the homework after.
insert into public.homeworks
  (id, title, description, subject, teacher, week, grade,
   cover_url, pdf_url, pdf_key, created_by, created_at)
select id, title, description, subject, teacher, week, grade,
       cover_url, pdf_url, pdf_key, created_by, created_at
  from public.lectures
 where not exists (
   select 1 from public.homeworks h where h.id = lectures.id
 );

-- ── 5. OPTIONAL: drop the legacy lectures table ───────────────────────
-- Once you've verified the homework UI works AND that R2 cleanup paths
-- look right, uncomment and run the line below to remove the old table.
-- The R2 PDFs/covers themselves are reused (same urls/keys), so dropping
-- the table just frees the schema name.
--
--   drop table public.lectures cascade;

-- =====================================================================
-- Done. Refresh the app — students will see their grade's homeworks and
-- can upload an answer file; admins can grade them inline.
-- =====================================================================
