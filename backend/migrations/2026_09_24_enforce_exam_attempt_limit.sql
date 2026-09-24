-- ============================================================================
-- 2026_09_24_enforce_exam_attempt_limit.sql
--
-- The per-exam attempt limit (exams.max_attempts + teacher overrides) was
-- only checked in the browser. start_or_get_exam_attempt() opened a new
-- attempt whenever the previous one was submitted, so a student calling it
-- directly could retake a 1-attempt exam any number of times (e.g. to force
-- a prerequisite lock open). Verified 2026-09-24 on the default tenant.
--
-- The server now applies the same rules the Exams page shows the student
-- (src/pages/Exams.jsx, backend/overridesApi.js reduceEffective):
--   * the most specific override for this student wins: student > group > grade
--     (access_overrides, item_type = 'exam');
--   * allowed = false  -> the exam is blocked for them;
--   * attempts         -> a BONUS on top of exams.max_attempts;
--   * updated_at       -> reset point: only attempts submitted since the
--                         override was last saved count.
-- Pre-video gate attempts (video_assessment_id set) don't count. Staff are
-- not limited. An attempt that is already open is still returned (resume).
--
-- Safe to re-run. Rollback: re-apply 2026_09_24_exam_requires_questions.sql
-- (its start_or_get_exam_attempt has no limit check).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_or_get_exam_attempt(p_exam_id uuid)
 RETURNS exam_attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_exam      public.exams;
  v_attempt   public.exam_attempts;
  v_is_staff  boolean;
  v_grade     text;
  v_group     text;
  v_allowed   boolean;
  v_bonus     integer;
  v_since     timestamptz;
  v_used      integer;
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

  -- An exam without questions can never be submitted (submit_exam_attempt
  -- refuses it), so don't open attempts on it.
  if jsonb_typeof(coalesce(v_exam.questions, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_exam.questions, '[]'::jsonb)) = 0 then
    raise exception 'exam has no questions';
  end if;

  v_is_staff := public.is_current_user_admin();

  -- Verify student has legitimate content access (grade / package gating)
  if not (v_is_staff or public.has_content_access(v_uid, 'exam', p_exam_id)) then
    raise exception 'forbidden: not authorized to take this exam';
  end if;

  -- 2. The teacher's most specific override for this student (student > group > grade).
  if not v_is_staff then
    select p.grade, p."group" into v_grade, v_group from public.profiles p where p.id = v_uid;

    select o.allowed, o.attempts, o.updated_at
      into v_allowed, v_bonus, v_since
      from public.access_overrides o
     where o.tenant_id = v_exam.tenant_id
       and o.item_type = 'exam'
       and o.item_id = p_exam_id
       and (   (o.scope = 'student' and o.target_id = v_uid::text)
            or (o.scope = 'group'   and o.target_id = coalesce(v_grade, '') || ':' || coalesce(v_group, ''))
            or (o.scope = 'prep'    and o.target_id = v_grade))
     order by case o.scope when 'student' then 3 when 'group' then 2 else 1 end desc
     limit 1;

    if v_allowed is false then
      raise exception 'exam_blocked: this exam was restricted by the administration';
    end if;
  end if;

  -- 3. Practical low-collision 64-bit deterministic transaction-level advisory lock
  -- Scoped strictly to this student + exam combination. Released automatically (< 2ms).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_exam_id::text, 0));

  -- 4. Return existing in-flight open attempt if one is already in progress
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

  -- 5. Attempt limit: exams.max_attempts + override bonus, counting only
  -- attempts submitted since the override was last saved.
  if not v_is_staff then
    select count(*) into v_used
      from public.exam_attempts
     where exam_id = p_exam_id
       and student_id = v_uid
       and submitted_at is not null
       and video_assessment_id is null
       and (v_since is null or submitted_at >= v_since);

    if v_used >= coalesce(v_exam.max_attempts, 1) + coalesce(v_bonus, 0) then
      raise exception 'no_attempts_left: all allowed attempts for this exam are used';
    end if;
  end if;

  -- 6. Atomically create new attempt row with authoritative server points and timestamp
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
