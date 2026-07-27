-- =====================================================================
-- 2026_07_26_pre_video_assessments_followup.sql
-- Run once, AFTER 2026_07_26_pre_video_assessments.sql. Idempotent.
--
-- Adds, per teacher feedback:
--   1. Per-student / per-grade BONUS attempts on a pre-video gate, granted
--      from ControlPanel → "إدارة الفيديوهات" the same way video-view and
--      exam attempts already work (access_overrides, item_type='video_assessment').
--      Enforced server-side in get_video_gate_status + start_pre_video_attempt.
--   2. An assessment-TYPE filter on the report so exam-before-video and
--      تسميع-before-video can each have their own report.
--   3. Gate pairs (video ↔ assessment) in the filter-options RPC, so the
--      report's assessment dropdown can narrow to the selected video.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Allow item_type = 'video_assessment' in access_overrides
-- ---------------------------------------------------------------------
-- The original table shipped `check (item_type in ('video','exam'))`, but the
-- running DB already stores 'exam_reveal' (and 'group' scope) — so that check
-- was relaxed long ago. We drop any surviving CHECK on item_type defensively
-- rather than assume a name, so inserting 'video_assessment' can't 42501.
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
     where c.relname = 'access_overrides'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%item_type%'
  loop
    execute format('alter table public.access_overrides drop constraint %I', r.conname);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2. Effective bonus for a gate, for the CURRENT student
-- ---------------------------------------------------------------------
-- Mirrors how the exams override resolves: most-specific scope wins
-- (student > group > prep), `attempts` is the bonus above the gate default,
-- and `updated_at` doubles as a reset point — attempts submitted before the
-- grant stop counting, so re-granting hands the student a clean allowance
-- exactly like the exams flow the teacher already knows.
create or replace function public.pre_video_gate_allowance(p_gate uuid)
returns table (bonus int, reset_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, grade, "group" as grp
      from public.profiles
     where id = auth.uid()
  )
  select o.attempts, o.updated_at
    from public.access_overrides o, me
   where o.item_type = 'video_assessment'
     and o.item_id = p_gate
     and (
       (o.scope = 'student' and o.target_id = me.id::text)
       or (o.scope = 'prep'  and o.target_id = me.grade)
       or (o.scope = 'group' and o.target_id = me.grade || ':' || coalesce(me.grp, ''))
     )
   order by case o.scope when 'student' then 3 when 'group' then 2 else 1 end desc
   limit 1;
$$;

revoke all on function public.pre_video_gate_allowance(uuid) from public;
grant execute on function public.pre_video_gate_allowance(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. get_video_gate_status — fold the bonus + reset point into the counts
-- ---------------------------------------------------------------------
create or replace function public.get_video_gate_status(p_video_ids uuid[])
returns table (
  video_assessment_id uuid,
  video_id            uuid,
  part_id             uuid,
  assessment_type     text,
  assessment_id       uuid,
  type_label          text,
  title               text,
  questions_count     int,
  duration_minutes    int,
  allowed_attempts    int,
  passing_score       numeric,
  trigger_type        text,
  timestamp_seconds   int,
  attempts_used       int,
  attempts_remaining  int,
  unlocked            boolean,
  reveal              boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_tenant := public.current_tenant_id();

  return query
  with gates as (
    select va.*
      from public.video_assessments va
     where va.video_id = any(p_video_ids)
       and va.tenant_id = v_tenant
       and va.is_enabled
  ),
  -- Per-gate bonus + reset point for this student.
  allow as (
    select g.id as gid,
           coalesce(a.bonus, 0) as bonus,
           a.reset_at
      from gates g
      left join lateral public.pre_video_gate_allowance(g.id) a on true
  ),
  used as (
    select ea.video_assessment_id as gid, count(*)::int as n
      from public.exam_attempts ea
      join allow al on al.gid = ea.video_assessment_id
     where ea.student_id = v_uid
       and ea.submitted_at is not null
       -- attempts before an admin re-grant no longer count
       and (al.reset_at is null or ea.submitted_at >= al.reset_at)
     group by ea.video_assessment_id
  ),
  unlocks as (
    select u.video_assessment_id as gid
      from public.video_assessment_unlocks u
     where u.student_id = v_uid
       and u.video_assessment_id in (select g.id from gates g)
  )
  select
    g.id,
    g.video_id,
    g.part_id,
    g.assessment_type,
    g.assessment_id,
    ty.label_ar,
    coalesce(g.title_override, r.title, 'تقييم') as title,
    r.questions_count,
    r.duration_minutes,
    -- effective cap = gate default + admin bonus (0 default stays unlimited)
    (case when g.allowed_attempts = 0 then 0
          else g.allowed_attempts + coalesce(al.bonus, 0) end) as allowed_attempts,
    g.passing_score,
    g.trigger_type,
    g.timestamp_seconds,
    coalesce(us.n, 0) as attempts_used,
    case
      when g.allowed_attempts = 0 then 999
      else greatest(0, g.allowed_attempts + coalesce(al.bonus, 0) - coalesce(us.n, 0))
    end as attempts_remaining,
    (uk.gid is not null) as unlocked,
    (uk.gid is not null)
      or (g.allowed_attempts > 0
          and coalesce(us.n, 0) >= g.allowed_attempts + coalesce(al.bonus, 0)) as reveal
  from gates g
  join public.assessment_types ty on ty.code = g.assessment_type
  left join lateral public.resolve_assessment(g.assessment_type, g.assessment_id) r on true
  left join allow al  on al.gid = g.id
  left join used us   on us.gid = g.id
  left join unlocks uk on uk.gid = g.id
  order by g.video_id, g.part_id nulls first, g.timestamp_seconds nulls first;
end;
$$;

revoke all on function public.get_video_gate_status(uuid[]) from public;
grant execute on function public.get_video_gate_status(uuid[]) to authenticated;


-- ---------------------------------------------------------------------
-- 4. start_pre_video_attempt — honour the same bonus + reset point
-- ---------------------------------------------------------------------
create or replace function public.start_pre_video_attempt(p_video_assessment_id uuid)
returns table (
  attempt_id         uuid,
  attempt_number     int,
  allowed_attempts   int,
  attempts_remaining int,
  duration_minutes   int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid := public.current_tenant_id();
  v_gate     public.video_assessments;
  v_used     int;
  v_open     uuid;
  v_max      int;
  v_dur      int;
  v_a_tenant uuid;
  v_new      uuid;
  v_bonus    int := 0;
  v_reset    timestamptz;
  v_eff      int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_gate
    from public.video_assessments
   where id = p_video_assessment_id
     and tenant_id = v_tenant;
  if not found then raise exception 'assessment not found'; end if;
  if not v_gate.is_enabled then raise exception 'assessment is disabled'; end if;

  select r.tenant_id, r.duration_minutes into v_a_tenant, v_dur
    from public.resolve_assessment(v_gate.assessment_type, v_gate.assessment_id) r;
  if v_a_tenant is null then raise exception 'assessment target not found'; end if;
  if v_a_tenant <> v_tenant then raise exception 'assessment belongs to another tenant'; end if;

  if not public.has_content_access(v_uid, 'video', v_gate.video_id) then
    raise exception 'not enrolled for this video';
  end if;

  if exists (
    select 1 from public.video_assessment_unlocks
     where video_assessment_id = v_gate.id and student_id = v_uid
  ) then
    raise exception 'already unlocked';
  end if;

  -- Admin-granted bonus + reset point for this student.
  select coalesce(bonus, 0), reset_at into v_bonus, v_reset
    from public.pre_video_gate_allowance(v_gate.id);
  v_bonus := coalesce(v_bonus, 0);

  select count(*)::int into v_used
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is not null
     and (v_reset is null or submitted_at >= v_reset);

  v_eff := v_gate.allowed_attempts + v_bonus;   -- meaningful only when base > 0
  if v_gate.allowed_attempts > 0 and v_used >= v_eff then
    raise exception 'no attempts remaining';
  end if;

  select id into v_open
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is null
   order by started_at desc
   limit 1;

  select public.assessment_max_points(r.questions) into v_max
    from public.resolve_assessment(v_gate.assessment_type, v_gate.assessment_id) r;

  if coalesce(v_max, 0) = 0 then
    raise exception 'assessment has no questions';
  end if;

  if v_open is not null then
    v_new := v_open;
  else
    insert into public.exam_attempts (exam_id, student_id, max_score, tenant_id, video_assessment_id)
    values (v_gate.assessment_id, v_uid, coalesce(v_max, 0), v_tenant, v_gate.id)
    returning id into v_new;
  end if;

  attempt_id         := v_new;
  attempt_number     := v_used + 1;
  allowed_attempts   := case when v_gate.allowed_attempts = 0 then 0 else v_eff end;
  attempts_remaining := case when v_gate.allowed_attempts = 0 then 999
                             else greatest(0, v_eff - v_used) end;
  duration_minutes   := coalesce(v_dur, 0);
  return next;
end;
$$;

revoke all on function public.start_pre_video_attempt(uuid) from public;
grant execute on function public.start_pre_video_attempt(uuid) to authenticated;

-- submit_pre_video_attempt must ALSO honour the bonus + reset, otherwise a
-- student with granted attempts would be told "exhausted" (and shown the
-- answers) after the BASE count — revealing the key while attempts remain.
create or replace function public.submit_pre_video_attempt(
  p_attempt_id uuid,
  p_responses  jsonb
)
returns table (
  attempt_number     int,
  allowed_attempts   int,
  attempts_remaining int,
  passed             boolean,
  unlocked           boolean,
  exhausted          boolean,
  reveal             boolean,
  passing_score      numeric,
  score              int,
  max_score          int,
  percent            numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_attempt   public.exam_attempts;
  v_gate      public.video_assessments;
  v_questions jsonb;
  v_q         jsonb;
  v_picked    int[];
  v_correct   int[];
  v_pts       int;
  v_score     int := 0;
  v_max       int := 0;
  v_idx       int;
  v_resp      jsonb;
  v_pct       numeric := 0;
  v_passed    boolean;
  v_used      int;
  v_exhausted boolean;
  v_reveal    boolean;
  v_bonus     int := 0;
  v_reset     timestamptz;
  v_eff       int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found then raise exception 'attempt not found'; end if;
  if v_attempt.student_id <> v_uid then raise exception 'forbidden'; end if;
  if v_attempt.submitted_at is not null then raise exception 'already submitted'; end if;
  if v_attempt.video_assessment_id is null then
    raise exception 'not a pre-video attempt';
  end if;

  select * into v_gate
    from public.video_assessments
   where id = v_attempt.video_assessment_id
     and tenant_id = public.current_tenant_id();
  if not found then raise exception 'assessment not found'; end if;

  select r.questions into v_questions
    from public.resolve_assessment(v_gate.assessment_type, v_gate.assessment_id) r;
  v_questions := coalesce(v_questions, '[]'::jsonb);

  for v_idx in 0 .. (jsonb_array_length(v_questions) - 1) loop
    v_q := v_questions -> v_idx;
    v_pts := coalesce((v_q ->> 'points')::int, 1);
    v_max := v_max + v_pts;

    select array_agg((value)::int order by (value)::int)
      into v_correct
      from jsonb_array_elements_text(coalesce(v_q -> 'answers', '[]'::jsonb));

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

  if v_max = 0 then raise exception 'assessment has no questions'; end if;

  v_pct := round((v_score::numeric * 100) / v_max, 2);
  v_passed := v_pct >= v_gate.passing_score;

  update public.exam_attempts
     set score = v_score, max_score = v_max, responses = p_responses, submitted_at = now()
   where id = p_attempt_id
     and submitted_at is null;
  if not found then raise exception 'already submitted'; end if;

  -- Admin-granted bonus + reset point for this student.
  select coalesce(bonus, 0), reset_at into v_bonus, v_reset
    from public.pre_video_gate_allowance(v_gate.id);
  v_bonus := coalesce(v_bonus, 0);

  select count(*)::int into v_used
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is not null
     and (v_reset is null or submitted_at >= v_reset);

  if v_passed then
    insert into public.video_assessment_unlocks
      (tenant_id, video_assessment_id, video_id, student_id, attempt_id, score_percent)
    values
      (v_gate.tenant_id, v_gate.id, v_gate.video_id, v_uid, p_attempt_id, v_pct)
    on conflict (video_assessment_id, student_id) do nothing;
  end if;

  v_eff       := v_gate.allowed_attempts + v_bonus;   -- meaningful when base > 0
  v_exhausted := (v_gate.allowed_attempts > 0 and v_used >= v_eff);
  v_reveal    := v_passed or v_exhausted;

  attempt_number     := v_used;
  allowed_attempts   := case when v_gate.allowed_attempts = 0 then 0 else v_eff end;
  attempts_remaining := case when v_gate.allowed_attempts = 0 then 999
                             else greatest(0, v_eff - v_used) end;
  passed             := v_passed;
  unlocked           := v_passed;
  exhausted          := v_exhausted;
  reveal             := v_reveal;
  passing_score      := v_gate.passing_score;
  score              := case when v_reveal then v_score else null end;
  max_score          := case when v_reveal then v_max   else null end;
  percent            := case when v_reveal then v_pct   else null end;
  return next;
end;
$$;

revoke all on function public.submit_pre_video_attempt(uuid, jsonb) from public;
grant execute on function public.submit_pre_video_attempt(uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 5. Report: add the assessment-TYPE filter (exam | tasmee3)
-- ---------------------------------------------------------------------
-- Signatures change (new p_type + p_student_id args), so the live functions
-- must be dropped before recreation. We drop EVERY overload by name rather
-- than naming one signature: this file may be re-run after an earlier version
-- of itself, and a leftover overload is worse than none — PostgREST would be
-- free to resolve a call to the stale one.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'pre_assessment_report_base',
         'pre_assessment_report',
         'pre_assessment_report_stats'
       )
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

create or replace function public.pre_assessment_report_base(
  p_grade         text,
  p_branch_id     uuid,
  p_group_id      uuid,
  p_teacher_id    uuid,
  p_video_id      uuid,
  p_assessment_id uuid,
  p_from          timestamptz,
  p_to            timestamptz,
  p_search        text,
  p_type          text default null,          -- 'exam' | 'tasmee3' | null (all)
  p_student_id    uuid default null           -- set = individual student report
)
returns table (
  student_id       uuid,
  student_name     text,
  student_phone    text,
  grade            text,
  branch_name      text,
  group_name       text,
  video_id         uuid,
  video_title      text,
  gate_id          uuid,
  assessment_id    uuid,
  assessment_type  text,
  assessment_title text,
  allowed_attempts int,
  passing_score    numeric,
  attempts_used    int,
  best_percent     numeric,
  latest_percent   numeric,
  best_score       int,
  latest_score     int,
  max_score        int,
  passed           boolean,
  completed        boolean,
  last_submitted_at timestamptz,
  seconds_taken    int,
  teacher_id       uuid,
  teacher_name     text
)
language sql
stable
security definer
set search_path = public
as $$
  with gates as (
    select va.id as gate_id, va.video_id, va.assessment_id, va.assessment_type,
           va.allowed_attempts, va.passing_score, va.tenant_id,
           coalesce(va.title_override, e.title, 'تقييم') as assessment_title,
           v.title as video_title, v.grade as video_grade,
           coalesce(v.created_by, e.created_by) as teacher_id
      from public.video_assessments va
      join public.videos v on v.id = va.video_id
      left join public.exams e on e.id = va.assessment_id
     where va.tenant_id = public.current_tenant_id()
       and va.is_enabled
       and (p_video_id      is null or va.video_id = p_video_id)
       and (p_assessment_id is null or va.assessment_id = p_assessment_id)
       and (p_type is null or p_type = 'all' or va.assessment_type = p_type)
  ),
  cohort as (
    select g.gate_id, g.video_id, g.assessment_id, g.assessment_type,
           g.allowed_attempts, g.passing_score, g.assessment_title,
           g.video_title, g.teacher_id,
           p.id as student_id, p.name as student_name, p.phone as student_phone,
           p.grade, p.branch_id, p."group" as legacy_group
      from gates g
      join public.profiles p
        on p.tenant_id = g.tenant_id
       and p.role = 'student'
       and (
         (g.video_grade <> 'packages' and p.grade = g.video_grade)
         or (g.video_grade = 'packages' and exists (
              select 1 from public.student_content_access sca
               where sca.student_id = p.id
                 and sca.content_type = 'video'
                 and sca.content_id = g.video_id
                 and (sca.expires_at is null or sca.expires_at > now())
            ))
       )
     where (p_student_id is null or p.id = p_student_id)
       and (p_grade  is null or p.grade = p_grade)
       and (p_branch_id is null or p.branch_id = p_branch_id)
       and (p_teacher_id is null or g.teacher_id = p_teacher_id)
       and (p_group_id is null or exists (
             select 1 from public.student_groups sg
              where sg.student_id = p.id and sg.group_id = p_group_id
           ))
       and (
         p_search is null or p_search = ''
         or p.name  ilike '%' || p_search || '%'
         or p.phone ilike '%' || p_search || '%'
       )
  ),
  att as (
    select ea.video_assessment_id as gate_id,
           ea.student_id,
           count(*)::int as attempts_used,
           max(case when ea.max_score > 0
                    then round((ea.score::numeric * 100) / ea.max_score, 2)
                    else 0 end) as best_percent,
           max(ea.score)::int as best_score,
           max(ea.max_score)::int as max_score,
           max(ea.submitted_at) as last_submitted_at,
           (array_agg(ea.score order by ea.submitted_at desc))[1]::int as latest_score,
           (array_agg(case when ea.max_score > 0
                           then round((ea.score::numeric * 100) / ea.max_score, 2)
                           else 0 end order by ea.submitted_at desc))[1] as latest_percent,
           (array_agg(extract(epoch from (ea.submitted_at - ea.started_at))
                      order by ea.submitted_at desc))[1]::int as seconds_taken
      from public.exam_attempts ea
     where ea.video_assessment_id is not null
       and ea.submitted_at is not null
       and ea.tenant_id = public.current_tenant_id()
       and (p_from is null or ea.submitted_at >= p_from)
       and (p_to   is null or ea.submitted_at <= p_to)
     group by ea.video_assessment_id, ea.student_id
  )
  select
    c.student_id, c.student_name, c.student_phone, c.grade,
    b.name, coalesce(gr.name, c.legacy_group),
    c.video_id, c.video_title, c.gate_id, c.assessment_id, c.assessment_type,
    c.assessment_title, c.allowed_attempts, c.passing_score,
    coalesce(a.attempts_used, 0),
    a.best_percent, a.latest_percent, a.best_score, a.latest_score, a.max_score,
    (u.student_id is not null) as passed,
    (coalesce(a.attempts_used, 0) > 0) as completed,
    a.last_submitted_at, a.seconds_taken, c.teacher_id, t.name
  from cohort c
  left join att a  on a.gate_id = c.gate_id and a.student_id = c.student_id
  left join public.video_assessment_unlocks u
         on u.video_assessment_id = c.gate_id and u.student_id = c.student_id
  left join public.branches b on b.id = c.branch_id
  left join lateral (
    select g2.name
      from public.student_groups sg
      join public.groups g2 on g2.id = sg.group_id
     where sg.student_id = c.student_id
     order by sg.is_primary desc
     limit 1
  ) gr on true
  left join public.profiles t on t.id = c.teacher_id;
$$;

revoke all on function public.pre_assessment_report_base(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) from public;
revoke all on function public.pre_assessment_report_base(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) from authenticated, anon;

create or replace function public.pre_assessment_report(
  p_search        text        default null,
  p_grade         text        default null,
  p_branch_id     uuid        default null,
  p_group_id      uuid        default null,
  p_teacher_id    uuid        default null,
  p_video_id      uuid        default null,
  p_assessment_id uuid        default null,
  p_status        text        default null,
  p_from          timestamptz default null,
  p_to            timestamptz default null,
  p_type          text        default null,
  p_student_id    uuid        default null,
  p_limit         int         default 50,
  p_offset        int         default 0
)
returns table (
  student_id       uuid,
  student_name     text,
  student_phone    text,
  grade            text,
  branch_name      text,
  group_name       text,
  video_id         uuid,
  video_title      text,
  gate_id          uuid,
  assessment_id    uuid,
  assessment_type  text,
  assessment_title text,
  allowed_attempts int,
  passing_score    numeric,
  attempts_used    int,
  best_percent     numeric,
  latest_percent   numeric,
  best_score       int,
  latest_score     int,
  max_score        int,
  passed           boolean,
  completed        boolean,
  last_submitted_at timestamptz,
  seconds_taken    int,
  teacher_id       uuid,
  teacher_name     text,
  total_count      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (public.has_permission(v_uid, 'reports')
          or public.has_permission(v_uid, 'videos')
          or public.is_super_admin(v_uid)) then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select * from public.pre_assessment_report_base(
      p_grade, p_branch_id, p_group_id, p_teacher_id,
      p_video_id, p_assessment_id, p_from, p_to, p_search, p_type, p_student_id
    )
  ),
  filtered as (
    select * from base b
     where p_status is null or p_status = 'all'
        or (p_status = 'passed'        and b.passed)
        or (p_status = 'failed'        and b.completed and not b.passed)
        or (p_status = 'completed'     and b.completed)
        or (p_status = 'not_completed' and not b.completed)
  ),
  counted as (
    select f.*, count(*) over () as total_count from filtered f
  )
  select * from counted
   order by counted.passed asc nulls first,
            counted.last_submitted_at desc nulls last,
            counted.student_name asc
   limit greatest(1, least(coalesce(p_limit, 50), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.pre_assessment_report(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, uuid, int, int) from public;
grant execute on function public.pre_assessment_report(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, uuid, int, int) to authenticated;

create or replace function public.pre_assessment_report_stats(
  p_search        text        default null,
  p_grade         text        default null,
  p_branch_id     uuid        default null,
  p_group_id      uuid        default null,
  p_teacher_id    uuid        default null,
  p_video_id      uuid        default null,
  p_assessment_id uuid        default null,
  p_status        text        default null,
  p_from          timestamptz default null,
  p_to            timestamptz default null,
  p_type          text        default null,
  p_student_id    uuid        default null
)
returns table (
  total_students   bigint,
  passed_count     bigint,
  failed_count     bigint,
  completed_count  bigint,
  not_started_count bigint,
  average_score    numeric,
  highest_score    numeric,
  lowest_score     numeric,
  average_attempts numeric,
  pass_rate        numeric,
  failure_rate     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (public.has_permission(v_uid, 'reports')
          or public.has_permission(v_uid, 'videos')
          or public.is_super_admin(v_uid)) then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select * from public.pre_assessment_report_base(
      p_grade, p_branch_id, p_group_id, p_teacher_id,
      p_video_id, p_assessment_id, p_from, p_to, p_search, p_type, p_student_id
    )
  ),
  filtered as (
    select * from base b
     where p_status is null or p_status = 'all'
        or (p_status = 'passed'        and b.passed)
        or (p_status = 'failed'        and b.completed and not b.passed)
        or (p_status = 'completed'     and b.completed)
        or (p_status = 'not_completed' and not b.completed)
  )
  select
    count(*)::bigint,
    count(*) filter (where f.passed)::bigint,
    count(*) filter (where f.completed and not f.passed)::bigint,
    count(*) filter (where f.completed)::bigint,
    count(*) filter (where not f.completed)::bigint,
    round(coalesce(avg(f.best_percent) filter (where f.completed), 0), 2),
    round(coalesce(max(f.best_percent), 0), 2),
    round(coalesce(min(f.best_percent) filter (where f.completed), 0), 2),
    round(coalesce(avg(f.attempts_used) filter (where f.completed), 0), 2),
    case when count(*) filter (where f.completed) = 0 then 0
         else round(count(*) filter (where f.passed)::numeric * 100
                    / count(*) filter (where f.completed), 2) end,
    case when count(*) filter (where f.completed) = 0 then 0
         else round(count(*) filter (where f.completed and not f.passed)::numeric * 100
                    / count(*) filter (where f.completed), 2) end
  from filtered f;
end;
$$;

revoke all on function public.pre_assessment_report_stats(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, uuid) from public;
grant execute on function public.pre_assessment_report_stats(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6. filter-options: add the (video ↔ assessment) gate pairs so the report
--    can show only the assessments attached to the chosen video.
-- ---------------------------------------------------------------------
create or replace function public.pre_assessment_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (public.has_permission(v_uid, 'reports')
          or public.has_permission(v_uid, 'videos')
          or public.is_super_admin(v_uid)) then
    raise exception 'forbidden';
  end if;

  return jsonb_build_object(
    'videos', (
      select coalesce(jsonb_agg(distinct jsonb_build_object('id', v.id, 'title', v.title, 'grade', v.grade)), '[]'::jsonb)
        from public.video_assessments va join public.videos v on v.id = va.video_id
       where va.tenant_id = public.current_tenant_id()
    ),
    'assessments', (
      select coalesce(jsonb_agg(distinct jsonb_build_object('id', e.id, 'title', e.title, 'type', va.assessment_type)), '[]'::jsonb)
        from public.video_assessments va join public.exams e on e.id = va.assessment_id
       where va.tenant_id = public.current_tenant_id()
    ),
    -- one row per gate: lets the client filter assessments by the picked video
    'gates', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'video_id', va.video_id,
               'assessment_id', va.assessment_id,
               'title', coalesce(va.title_override, e.title, 'تقييم'),
               'type', va.assessment_type
             )), '[]'::jsonb)
        from public.video_assessments va
        left join public.exams e on e.id = va.assessment_id
       where va.tenant_id = public.current_tenant_id()
    ),
    'teachers', (
      select coalesce(jsonb_agg(distinct jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
        from public.video_assessments va
        join public.videos v on v.id = va.video_id
        join public.profiles p on p.id = v.created_by
       where va.tenant_id = public.current_tenant_id()
    )
  );
end;
$$;

revoke all on function public.pre_assessment_filter_options() from public;
grant execute on function public.pre_assessment_filter_options() to authenticated;

-- =====================================================================
-- VERIFY:
--   select public.pre_assessment_filter_options();          -- has 'gates'
--   select count(*) from public.pre_assessment_report(p_type => 'exam');
--   -- grant a student a bonus, then check get_video_gate_status reflects it
-- =====================================================================
