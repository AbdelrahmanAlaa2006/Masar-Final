-- =====================================================================
-- Hardening + performance + Bunny migration  (run once in Supabase SQL editor)
-- =====================================================================
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------
-- 1. Indexes for the hot queries
-- ---------------------------------------------------------------------
create index if not exists idx_videos_grade_created   on public.videos   (grade, created_at desc);
create index if not exists idx_lectures_grade_created on public.lectures (grade, created_at desc);
create index if not exists idx_exams_grade_created    on public.exams    (grade, created_at desc);

create index if not exists idx_video_parts_video on public.video_parts (video_id, part_index);

create index if not exists idx_quiz_attempts_user_video    on public.quiz_attempts   (student_id, video_id);
create index if not exists idx_video_progress_user_video   on public.video_progress  (student_id, video_id);
create index if not exists idx_video_progress_user_part    on public.video_progress  (student_id, part_id);
create index if not exists idx_exam_attempts_user_exam     on public.exam_attempts   (student_id, exam_id);
create index if not exists idx_exam_attempts_submitted     on public.exam_attempts   (exam_id, submitted_at desc);

create index if not exists idx_access_overrides_lookup
  on public.access_overrides (scope, target_id, item_type, item_id);

create index if not exists idx_notifications_recent on public.notifications (created_at desc);
create index if not exists idx_notifications_target_grade   on public.notifications (target_grade);
create index if not exists idx_notifications_target_student on public.notifications (target_student);
create index if not exists idx_notification_reads_user on public.notification_reads (user_id);

create index if not exists idx_profiles_role_grade on public.profiles (role, grade);

-- ---------------------------------------------------------------------
-- 2. Bunny Stream columns on video_parts
-- ---------------------------------------------------------------------
alter table public.video_parts
  add column if not exists bunny_video_id   uuid,
  add column if not exists bunny_library_id integer;

create index if not exists idx_video_parts_bunny on public.video_parts (bunny_video_id);

-- The existing `source` column is text — allow 'bunny' alongside 'youtube'/'drive'.
-- (No CHECK constraint exists in the current schema; nothing to alter. If you
-- later add one, include 'bunny'.)

-- ---------------------------------------------------------------------
-- 3. Atomic per-part view counter  (replaces read-modify-write JS)
-- ---------------------------------------------------------------------
create or replace function public.increment_part_view(
  p_video_id uuid,
  p_part_id  uuid
)
returns public.video_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.video_progress;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.video_progress (student_id, video_id, part_id, views_used, last_watched_at)
  values (v_uid, p_video_id, p_part_id, 1, now())
  on conflict (student_id, part_id) do update
    set views_used      = public.video_progress.views_used + 1,
        last_watched_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.increment_part_view(uuid, uuid) from public;
grant execute on function public.increment_part_view(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Server-side exam scoring  (the client never computes the score)
-- ---------------------------------------------------------------------
-- Frontend submits raw responses; this function reads exams.questions from
-- the DB, computes the score, and writes it. Students cannot inflate scores.
create or replace function public.submit_exam_attempt(
  p_attempt_id uuid,
  p_responses  jsonb        -- [{questionId, selected:[idx,..]}, ...]
)
returns table (score int, max_score int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_attempt   public.exam_attempts;
  v_exam      public.exams;
  v_questions jsonb;
  v_q         jsonb;
  v_picked    int[];
  v_correct   int[];
  v_pts       int;
  v_score     int := 0;
  v_max       int := 0;
  v_idx       int;
  v_resp      jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found then raise exception 'attempt not found'; end if;
  if v_attempt.student_id <> v_uid then raise exception 'forbidden'; end if;
  if v_attempt.submitted_at is not null then raise exception 'already submitted'; end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  if not found then raise exception 'exam not found'; end if;

  v_questions := coalesce(v_exam.questions, '[]'::jsonb);

  for v_idx in 0 .. (jsonb_array_length(v_questions) - 1) loop
    v_q := v_questions -> v_idx;
    v_pts := coalesce((v_q ->> 'points')::int, 1);
    v_max := v_max + v_pts;

    -- Correct answers from DB
    select array_agg((value)::int order by (value)::int)
      into v_correct
      from jsonb_array_elements_text(coalesce(v_q -> 'answers', '[]'::jsonb));

    -- Student-picked answers from request
    v_resp := null;
    select r into v_resp
      from jsonb_array_elements(p_responses) r
      where coalesce((r ->> 'questionId')::int, -1) = v_idx
      limit 1;

    if v_resp is not null then
      select array_agg((value)::int order by (value)::int)
        into v_picked
        from jsonb_array_elements_text(coalesce(v_resp -> 'selected', '[]'::jsonb));
    else
      v_picked := '{}'::int[];
    end if;

    if coalesce(v_picked, '{}') = coalesce(v_correct, '{}') then
      v_score := v_score + v_pts;
    end if;
  end loop;

  update public.exam_attempts
     set score        = v_score,
         max_score    = v_max,
         responses    = p_responses,
         submitted_at = now()
   where id = p_attempt_id;

  score := v_score;
  max_score := v_max;
  return next;
end;
$$;

revoke all on function public.submit_exam_attempt(uuid, jsonb) from public;
grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS guard-rails: enable RLS on every public table
--    (Run the audit query first to see what's currently exposed.)
-- ---------------------------------------------------------------------
-- AUDIT — paste this into the SQL editor and review:
--   select schemaname, tablename, rowsecurity
--   from pg_tables where schemaname = 'public' order by tablename;
--
-- If any row has rowsecurity = false, enable it. Below is a safe default
-- that turns RLS ON; existing policies keep working, and tables WITHOUT
-- policies become deny-by-default — which is what you want.
do $$
declare r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'videos','video_parts','lectures','exams','exam_attempts',
        'quiz_attempts','video_progress','profiles',
        'access_overrides','notifications','notification_reads'
      )
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;

-- IMPORTANT: enabling RLS on a table with no policies blocks all access.
-- Confirm each table has at least one SELECT policy and the appropriate
-- write policies before deploying. The .sql files in backend/ already
-- define policies for access_overrides, notifications, notification_reads,
-- and group scope. Verify that videos / video_parts / lectures / exams /
-- exam_attempts / quiz_attempts / video_progress / profiles have policies.

-- ---------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------
