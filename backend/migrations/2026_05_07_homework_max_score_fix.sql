-- =====================================================================
-- Hot-fix for the broken submit_homework() RPC.
--
-- The 2026_05_07_homework_mcq.sql migration's RPC inserts a `max_score`
-- value into public.homework_submissions, but that column was never
-- added to the table. Every student submission was failing with
-- "column max_score of relation homework_submissions does not exist"
-- and the UI showed "تعذر التسليم".
--
-- Fix:
--   1) Add the missing column.
--   2) Re-create submit_homework() unchanged (so the function refreshes
--      against the updated table schema).
--
-- Idempotent. Run after the May 7 MCQ migration.
-- =====================================================================

alter table public.homework_submissions
  add column if not exists max_score int;

-- Re-create the function with the same body so its plan caches refresh.
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
