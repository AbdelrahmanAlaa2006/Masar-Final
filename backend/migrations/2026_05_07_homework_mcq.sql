-- =====================================================================
-- Homework: MCQ submissions with server-side auto-grading.
--
-- Run AFTER 2026_05_07_homeworks.sql.
-- Idempotent.
--
-- Adds:
--   • homeworks.answer_key             jsonb  — admin-set correct answers
--   • homework_submissions.responses    jsonb  — student-picked indices
--   • submit_homework(homework_id, responses) RPC — SECURITY DEFINER,
--     auto-grades by comparing responses to answer_key, writes the row
--   • RLS lockdown so students can NEVER write score/feedback/graded_*
--     directly — they go through the RPC, same pattern as exam_attempts.
--
-- answer_key shape:
--   [
--     { "options": 4, "correct": 1 },     -- question 1: 4 options, B is correct
--     { "options": 4, "correct": 0 },     -- question 2: 4 options, A is correct
--     { "options": 5, "correct": 3 },     -- question 3: 5 options, D is correct
--     ...
--   ]
--
-- responses shape (student):
--   [1, 0, 3, ...]   -- one selected option index per question, or null for skipped
-- =====================================================================

-- 1) Schema additions
alter table public.homeworks
  add column if not exists answer_key jsonb not null default '[]'::jsonb;

alter table public.homework_submissions
  add column if not exists responses jsonb not null default '[]'::jsonb;

-- 2) Auto-grade RPC. Reads answer_key from homeworks (server-side, not
--    trusting the client), counts matches, scales to max_score.
create or replace function public.submit_homework(
  p_homework_id uuid,
  p_responses   jsonb
)
returns table (score int, max_score int, correct int, total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_hw        public.homeworks;
  v_key       jsonb;
  v_total     int := 0;
  v_correct   int := 0;
  v_idx       int;
  v_correctIdx int;
  v_pickedIdx int;
  v_max       int;
  v_score     int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_hw from public.homeworks where id = p_homework_id;
  if not found then raise exception 'homework not found'; end if;

  -- Student must be in the same grade as the homework (or admin).
  if not exists (
    select 1 from public.profiles p
     where p.id = v_uid
       and (p.role = 'admin' or p.grade = v_hw.grade)
  ) then
    raise exception 'forbidden';
  end if;

  v_key   := coalesce(v_hw.answer_key, '[]'::jsonb);
  v_total := jsonb_array_length(v_key);
  v_max   := coalesce(v_hw.max_score, v_total);

  -- Score by walking the answer key. responses[i] may be null/missing.
  if v_total > 0 then
    for v_idx in 0 .. v_total - 1 loop
      v_correctIdx := nullif((v_key -> v_idx ->> 'correct'), '')::int;
      begin
        v_pickedIdx := nullif((p_responses -> v_idx)::text, 'null')::int;
      exception when others then
        v_pickedIdx := null;
      end;
      if v_correctIdx is not null
         and v_pickedIdx is not null
         and v_pickedIdx = v_correctIdx then
        v_correct := v_correct + 1;
      end if;
    end loop;
    v_score := round(v_correct::numeric / v_total::numeric * v_max);
  end if;

  -- Upsert the submission row. Score / feedback / graded_* are written
  -- HERE by the function (it runs as definer so it bypasses RLS).
  insert into public.homework_submissions
    (homework_id, student_id, responses, score, max_score,
     submitted_at, graded_at, graded_by, feedback)
  values
    (p_homework_id, v_uid, p_responses, v_score, v_max,
     now(), now(), null, null)
  on conflict (homework_id, student_id) do update
    set responses    = excluded.responses,
        score        = excluded.score,
        max_score    = excluded.max_score,
        submitted_at = excluded.submitted_at,
        graded_at    = excluded.graded_at;

  score    := v_score;
  max_score := v_max;
  correct  := v_correct;
  total    := v_total;
  return next;
end;
$$;

revoke all on function public.submit_homework(uuid, jsonb) from public;
grant execute on function public.submit_homework(uuid, jsonb) to authenticated;

-- 3) Tighten RLS on homework_submissions so the RPC is the only path
--    for students to set score/responses/graded_*.
do $$
declare r record;
begin
  for r in
    select polname
      from pg_policy
     where polrelid = 'public.homework_submissions'::regclass
  loop
    execute format('drop policy %I on public.homework_submissions;', r.polname);
  end loop;
end $$;

alter table public.homework_submissions enable row level security;

-- Read: own row, or admin sees all.
create policy hws_select_own_or_admin
  on public.homework_submissions for select
  using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'admin')
  );

-- Insert: only by the RPC (no direct INSERT path for students).
-- Direct PostgREST inserts fail because the policy requires the row's
-- score / graded_* to be NULL, but the RPC sets them. Practically, this
-- means a student MUST go through submit_homework() to record an answer.
-- (The legacy "upload a file" submission path is now disabled; if you
-- want to re-enable it later, add a separate insert policy.)
-- We also keep an admin-all policy so the grading UI can override.

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

-- 4) Sanity: confirm submit_homework is SECURITY DEFINER (otherwise it
--    cannot bypass the no-direct-write policies above).
do $$
declare prosec text;
begin
  select case when prosecdef then 'definer' else 'invoker' end into prosec
    from pg_proc
   where proname = 'submit_homework' and pronamespace = 'public'::regnamespace
   limit 1;
  if prosec is null    then raise exception 'submit_homework() missing'; end if;
  if prosec <> 'definer' then raise exception 'submit_homework() must be SECURITY DEFINER'; end if;
end $$;
