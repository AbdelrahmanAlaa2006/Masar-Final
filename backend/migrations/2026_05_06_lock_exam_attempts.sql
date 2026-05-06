-- =====================================================================
-- Lock down exam_attempts so the score is only writable via the
-- submit_exam_attempt() RPC (which is SECURITY DEFINER and bypasses RLS).
--
-- Bug found 2026-05-06: a student PATCH'd their own exam_attempts row
-- and inflated score from 0/2 to 9999/9999. This file is the fix.
-- Idempotent: safe to re-run.
-- =====================================================================

-- 1) Drop EVERY existing policy on exam_attempts so we start clean.
do $$
declare r record;
begin
  for r in
    select polname
      from pg_policy
     where polrelid = 'public.exam_attempts'::regclass
  loop
    execute format('drop policy %I on public.exam_attempts;', r.polname);
  end loop;
end $$;

-- 2) Make sure RLS is on (it should already be from the May 5 migration).
alter table public.exam_attempts enable row level security;

-- 3) Helper: are we an admin? (Inline subquery; cheap with profiles index.)
--    We avoid creating a SQL function so the policy is self-contained.

-- 4) Read: students see their own rows; admins see everything.
create policy exam_attempts_select_own_or_admin
  on public.exam_attempts
  for select
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 5) Insert: a student may only create a fresh in-flight attempt for
--    themselves. score must be 0 (or null), and submitted_at must be null.
--    This is what startAttempt() in backend/examsApi.js does.
create policy exam_attempts_insert_self_blank
  on public.exam_attempts
  for insert
  with check (
    student_id = auth.uid()
    and submitted_at is null
    and coalesce(score, 0) = 0
  );

-- 6) Update / Delete: NO direct policy for students. The submit_exam_attempt
--    RPC runs as SECURITY DEFINER and updates the row server-side after
--    computing the score from the exam's answer key. Without a student-side
--    update policy, a direct PATCH from the browser is silently denied.

-- 7) Admins keep full control (reveal grades, fix bad rows, delete cheats).
create policy exam_attempts_admin_all
  on public.exam_attempts
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 8) Sanity: confirm submit_exam_attempt is still SECURITY DEFINER
--    (otherwise it would also be blocked by the new policies).
do $$
declare prosec text;
begin
  select case when prosecdef then 'definer' else 'invoker' end
    into prosec
    from pg_proc
   where proname = 'submit_exam_attempt'
     and pronamespace = 'public'::regnamespace
   limit 1;

  if prosec is null then
    raise exception 'submit_exam_attempt() is missing — run the May 5 hardening migration first';
  elsif prosec <> 'definer' then
    raise exception 'submit_exam_attempt() must be SECURITY DEFINER, found %', prosec;
  end if;
end $$;

-- =====================================================================
-- After running this, re-test 5a from the security plan: a direct PATCH
-- to exam_attempts.score should now return [] (silently filtered by RLS)
-- and the row should NOT be modified. submit_exam_attempt() still works.
-- =====================================================================
