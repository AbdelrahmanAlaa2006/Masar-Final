-- =====================================================================
-- Migration: 2026_09_03_exam_production_hardening.sql
-- Description:
--   1. Atomic start_or_get_exam_attempt with 64-bit advisory xact lock
--      (hashtextextended) and authoritative access verification
--      (tenant isolation, archive check, and has_content_access).
--   2. Idempotent submit_exam_attempt with row-level locking (FOR UPDATE)
--      protecting against concurrent submission retries and double scoring,
--      with defensive validation against empty question sets.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Atomic Start or Get In-Flight Exam Attempt
-- ---------------------------------------------------------------------
create or replace function public.start_or_get_exam_attempt(
  p_exam_id uuid
)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_exam    public.exams;
  v_attempt public.exam_attempts;
begin
  if v_uid is null then 
    raise exception 'not authenticated'; 
  end if;

  -- 1. Authoritative Exam & Tenant Access Verification
  select * into v_exam
    from public.exams
   where id = p_exam_id
     and tenant_id = public.current_tenant_id()
     and is_archived = false;

  if not found then
    raise exception 'exam not found or access denied';
  end if;

  -- Verify student has legitimate content access (grade / package gating)
  if not (public.is_current_user_admin() or public.has_content_access(v_uid, 'exam', p_exam_id)) then
    raise exception 'forbidden: not authorized to take this exam';
  end if;

  -- 2. Practical low-collision 64-bit deterministic transaction-level advisory lock
  -- Scoped strictly to this student + exam combination. Released automatically (< 2ms).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_exam_id::text, 0));

  -- 3. Return existing in-flight open attempt if one is already in progress
  select * into v_attempt
    from public.exam_attempts
   where exam_id = p_exam_id
     and student_id = v_uid
     and submitted_at is null
     and video_assessment_id is null
   order by started_at desc
   limit 1;

  if v_attempt.id is not null then
    return v_attempt;
  end if;

  -- 4. Atomically create new attempt row with authoritative server points and timestamp
  insert into public.exam_attempts (exam_id, student_id, max_score, started_at)
  values (
    p_exam_id, 
    v_uid, 
    coalesce(
      v_exam.total_points, 
      (select coalesce(sum(coalesce((q->>'points')::int, 1)), 0) from jsonb_array_elements(coalesce(v_exam.questions, '[]'::jsonb)) q)
    ), 
    now()
  )
  returning * into v_attempt;

  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Idempotent & Concurrency-Safe Exam Attempt Submission
-- ---------------------------------------------------------------------
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
  if v_uid is null then 
    raise exception 'not authenticated'; 
  end if;

  -- Row-level lock exclusively locks this attempt record (FOR UPDATE).
  -- Concurrent retries will serialize cleanly; the second request reads
  -- the freshly submitted record and returns the existing score safely.
  select * into v_attempt 
    from public.exam_attempts 
   where id = p_attempt_id 
     for update;

  if not found then 
    raise exception 'attempt not found'; 
  end if;
  if v_attempt.student_id <> v_uid then 
    raise exception 'forbidden'; 
  end if;

  -- Idempotency Check: If already submitted (e.g. client retry after network blip),
  -- return the stored official score without throwing an exception or re-scoring.
  if v_attempt.submitted_at is not null then
    score := coalesce(v_attempt.score, 0);
    max_score := coalesce(v_attempt.max_score, 0);
    return next;
    return;
  end if;

  select * into v_exam 
    from public.exams 
   where id = v_attempt.exam_id;

  if not found then 
    raise exception 'exam not found'; 
  end if;

  v_questions := coalesce(v_exam.questions, '[]'::jsonb);

  -- Defensive validation: verify exam has questions before entering grading loop
  if jsonb_typeof(v_questions) <> 'array' or jsonb_array_length(v_questions) = 0 then
    raise exception 'exam has no questions';
  end if;

  -- Server-side authoritative grading loop
  for v_idx in 0 .. (jsonb_array_length(v_questions) - 1) loop
    v_q := v_questions -> v_idx;
    v_pts := coalesce((v_q ->> 'points')::int, 1);
    v_max := v_max + v_pts;

    -- Correct answers from DB exam record
    select array_agg((value)::int order by (value)::int)
      into v_correct
      from jsonb_array_elements_text(coalesce(v_q -> 'answers', '[]'::jsonb));

    -- Student answers from request payload
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

  -- Atomically record final score, responses JSON, and submission timestamp
  update public.exam_attempts
     set score        = v_score,
         max_score    = v_max,
         responses    = coalesce(p_responses, '[]'::jsonb),
         submitted_at = now()
   where id = p_attempt_id;

  score := v_score;
  max_score := v_max;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Explicit Function Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.start_or_get_exam_attempt(uuid) from anon, public;
grant execute on function public.start_or_get_exam_attempt(uuid) to authenticated, service_role;

revoke execute on function public.submit_exam_attempt(uuid, jsonb) from anon, public;
grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated, service_role;

