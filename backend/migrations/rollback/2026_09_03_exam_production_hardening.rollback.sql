-- =====================================================================
-- ROLLBACK MIGRATION: 2026_09_03_exam_production_hardening.rollback.sql
-- Description:
--   Exact production rollback script to revert start_or_get_exam_attempt
--   and restore the pre-migration definition of submit_exam_attempt.
-- =====================================================================

-- 1. Drop start_or_get_exam_attempt
drop function if exists public.start_or_get_exam_attempt(uuid);
drop function if exists public.start_or_get_exam_attempt(uuid, int);

-- 2. Restore exact pre-migration definition of submit_exam_attempt
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

-- 3. Restore permissions
revoke execute on function public.submit_exam_attempt(uuid, jsonb) from anon, public;
grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated, service_role;
