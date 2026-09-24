-- Undoes 2026_09_24_exam_requires_questions.sql: removes the exam guard and
-- restores start_or_get_exam_attempt without the "no questions" check.

DROP TRIGGER IF EXISTS trig_guard_exam_questions_insert ON public.exams;
DROP TRIGGER IF EXISTS trig_guard_exam_questions_update ON public.exams;
DROP FUNCTION IF EXISTS public.guard_exam_questions();

CREATE OR REPLACE FUNCTION public.start_or_get_exam_attempt(p_exam_id uuid)
 RETURNS exam_attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_exam    public.exams;
  v_attempt public.exam_attempts;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select * into v_exam
    from public.exams
   where id = p_exam_id
     and tenant_id = public.current_tenant_id()
     and is_archived = false;
  if not found then
    raise exception 'exam not found or access denied';
  end if;
  if not (public.is_current_user_admin() or public.has_content_access(v_uid, 'exam', p_exam_id)) then
    raise exception 'forbidden: not authorized to take this exam';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_exam_id::text, 0));
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
$function$;
