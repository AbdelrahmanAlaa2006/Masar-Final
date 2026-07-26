-- =====================================================================
-- 2026_07_26_pre_video_assessments.sql
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- WHAT THIS REPLACES
--   The old "امتحان قبل الفيديو" lived entirely in `videos.quizzes` (JSONB).
--   Three problems:
--     1. Grading happened in the BROWSER (QuizRunner.jsx computed `passed`
--        and POSTed it). A student could set passed=true from devtools.
--     2. The answer key shipped to the client inside videos.quizzes, and the
--        score was shown after every attempt — so attempt #2 was free.
--     3. One hard-coded shape: an inline quiz, no link to the exams/تسميع
--        library, no passing percentage, attempts baked per quiz.
--
-- WHAT THIS BUILDS
--   * assessment_types        - registry so new types are DATA, not DDL.
--   * video_assessments       - the gate: (video, part) -> (type, id) plus
--                               allowed_attempts + passing_score.
--   * video_assessment_unlocks- permanent unlock, written ONLY by the RPC.
--   * exam_attempts.video_assessment_id - pre-video attempts reuse the
--                               already-hardened server-side scoring path
--                               but stay OUT of the regular exams report.
--   * RPCs that hide the score until the student passes or burns every
--     attempt, and that re-validate EVERYTHING server-side.
--
-- BACKWARD COMPATIBILITY
--   `videos.quizzes` and `quiz_attempts` are LEFT IN PLACE (not dropped) and
--   are migrated forward in section 9: every inline quiz becomes a real
--   assessment, and every student who already passed one gets an unlock row
--   so nobody is re-locked out of a video they had already earned.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Assessment type registry  (extensible without schema changes)
-- ---------------------------------------------------------------------
-- `source_table` tells the resolver where assessment_id points. Today both
-- types live in `exams` (distinguished by exams.exam_type), which is how the
-- rest of this codebase already models تسميع. A future type that needs its
-- own table only has to add a row here + a branch in resolve_assessment().
create table if not exists public.assessment_types (
  code          text primary key,
  label_ar      text not null,
  label_en      text not null,
  source_table  text not null default 'exams',
  source_filter text,                       -- e.g. exams.exam_type = 'tasmee3'
  icon          text,
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

insert into public.assessment_types (code, label_ar, label_en, source_table, source_filter, icon, sort_order)
values
  ('exam',    'امتحان', 'Exam',            'exams', 'exam',    'fa-file-pen',        1),
  ('tasmee3', 'تسميع',  'Oral Recitation', 'exams', 'tasmee3', 'fa-microphone-lines', 2)
on conflict (code) do update
  set label_ar      = excluded.label_ar,
      label_en      = excluded.label_en,
      source_table  = excluded.source_table,
      source_filter = excluded.source_filter,
      icon          = excluded.icon,
      sort_order    = excluded.sort_order;

alter table public.assessment_types enable row level security;

drop policy if exists assessment_types_read_all on public.assessment_types;
create policy assessment_types_read_all
  on public.assessment_types for select
  using (auth.uid() is not null);


-- ---------------------------------------------------------------------
-- 2. exams.origin  - keeps auto-migrated inline quizzes out of the
--    student-facing exams library while staying selectable as a gate.
-- ---------------------------------------------------------------------
alter table public.exams
  add column if not exists origin text not null default 'library';

-- Idempotency key for the legacy import in section 9. Kept as its own column
-- rather than reusing `exams.number`, whose type is owned by the exams UI.
alter table public.exams
  add column if not exists origin_ref text;

comment on column public.exams.origin is
  'library = created in the exams UI; video_quiz = auto-generated from a legacy videos.quizzes entry by the 2026_07_26 migration.';

create index if not exists idx_exams_origin_type
  on public.exams (tenant_id, origin, exam_type);

create unique index if not exists uq_exams_origin_ref
  on public.exams (origin_ref) where origin_ref is not null;


-- ---------------------------------------------------------------------
-- 3. video_assessments  - the gate configuration
-- ---------------------------------------------------------------------
-- part_id NULL  => gate applies to the WHOLE video.
-- part_id set   => gate applies to that single part (the old scope='part').
-- allowed_attempts 0 => unlimited.
-- passing_score is a PERCENTAGE (0-100) of the assessment's total points.
create table if not exists public.video_assessments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  video_id         uuid not null references public.videos(id) on delete cascade,
  part_id          uuid references public.video_parts(id) on delete cascade,
  assessment_type  text not null references public.assessment_types(code),
  assessment_id    uuid not null,
  allowed_attempts int  not null default 2,
  passing_score    numeric(5,2) not null default 50,
  trigger_type     text not null default 'before',   -- 'before' | 'timestamp'
  timestamp_seconds int,
  is_enabled       boolean not null default true,
  title_override   text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint video_assessments_attempts_chk  check (allowed_attempts between 0 and 99),
  constraint video_assessments_passing_chk   check (passing_score >= 0 and passing_score <= 100),
  constraint video_assessments_trigger_chk   check (trigger_type in ('before', 'timestamp')),
  constraint video_assessments_ts_chk        check (
    trigger_type <> 'timestamp' or timestamp_seconds is not null
  )
);

-- One gate per scope target. NULL part_id is not distinct-safe in a plain
-- UNIQUE, so we key on coalesce(part_id, video_id) instead.
create unique index if not exists uq_video_assessments_scope
  on public.video_assessments (
    video_id,
    (coalesce(part_id, video_id)),
    trigger_type,
    (coalesce(timestamp_seconds, -1))
  );

create index if not exists idx_video_assessments_video
  on public.video_assessments (video_id) where is_enabled;

create index if not exists idx_video_assessments_lookup
  on public.video_assessments (assessment_type, assessment_id);

create index if not exists idx_video_assessments_tenant
  on public.video_assessments (tenant_id);

create or replace function public.touch_video_assessments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trig_touch_video_assessments on public.video_assessments;
create trigger trig_touch_video_assessments
  before update on public.video_assessments
  for each row execute function public.touch_video_assessments_updated_at();

drop trigger if exists trig_set_tenant_id_video_assessments on public.video_assessments;
create trigger trig_set_tenant_id_video_assessments
  before insert on public.video_assessments
  for each row execute function public.set_tenant_id_on_insert();

alter table public.video_assessments enable row level security;

-- Read: anyone in the tenant. The row carries NO answer key — only which
-- assessment gates which video, how many attempts, and the pass mark.
drop policy if exists video_assessments_select_tenant on public.video_assessments;
create policy video_assessments_select_tenant
  on public.video_assessments for select
  using (tenant_id = public.current_tenant_id());

-- Write: same bar as editing videos themselves.
drop policy if exists video_assessments_write_staff on public.video_assessments;
create policy video_assessments_write_staff
  on public.video_assessments for all
  using (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'videos') or public.is_super_admin(auth.uid()))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'videos') or public.is_super_admin(auth.uid()))
  );


-- ---------------------------------------------------------------------
-- 4. video_assessment_unlocks  - the permanent "you earned this" record
-- ---------------------------------------------------------------------
create table if not exists public.video_assessment_unlocks (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  video_assessment_id uuid not null references public.video_assessments(id) on delete cascade,
  video_id            uuid not null references public.videos(id) on delete cascade,
  student_id          uuid not null references public.profiles(id) on delete cascade,
  attempt_id          uuid references public.exam_attempts(id) on delete set null,
  score_percent       numeric(5,2),
  unlocked_at         timestamptz not null default now(),
  constraint uq_va_unlock unique (video_assessment_id, student_id)
);

create index if not exists idx_va_unlocks_student
  on public.video_assessment_unlocks (student_id, video_id);

drop trigger if exists trig_set_tenant_id_video_assessment_unlocks on public.video_assessment_unlocks;
create trigger trig_set_tenant_id_video_assessment_unlocks
  before insert on public.video_assessment_unlocks
  for each row execute function public.set_tenant_id_on_insert();

alter table public.video_assessment_unlocks enable row level security;

-- Students read their own unlocks; staff read the tenant's.
drop policy if exists va_unlocks_select on public.video_assessment_unlocks;
create policy va_unlocks_select
  on public.video_assessment_unlocks for select
  using (
    tenant_id = public.current_tenant_id()
    and (
      student_id = auth.uid()
      or public.has_permission(auth.uid(), 'videos')
      or public.has_permission(auth.uid(), 'reports')
      or public.is_super_admin(auth.uid())
    )
  );

-- NO student write policy on purpose. Rows are created exclusively by
-- submit_pre_video_attempt() (SECURITY DEFINER). Staff may revoke/reset.
drop policy if exists va_unlocks_write_staff on public.video_assessment_unlocks;
create policy va_unlocks_write_staff
  on public.video_assessment_unlocks for all
  using (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'videos') or public.is_super_admin(auth.uid()))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'videos') or public.is_super_admin(auth.uid()))
  );


-- ---------------------------------------------------------------------
-- 5. exam_attempts: tag pre-video attempts + STOP leaking their score
-- ---------------------------------------------------------------------
alter table public.exam_attempts
  add column if not exists video_assessment_id uuid references public.video_assessments(id) on delete cascade;

comment on column public.exam_attempts.video_assessment_id is
  'NULL = a normal exam sitting. Set = this attempt is a pre-video gate attempt; it is excluded from the exams report and its score is hidden until the student passes or exhausts attempts.';

-- Attempt counting + the report both key on (gate, student).
create index if not exists idx_exam_attempts_gate_student
  on public.exam_attempts (video_assessment_id, student_id, submitted_at)
  where video_assessment_id is not null;

-- Report scan path: tenant + gate + date window.
create index if not exists idx_exam_attempts_gate_report
  on public.exam_attempts (tenant_id, video_assessment_id, submitted_at desc)
  where video_assessment_id is not null;

-- Regular exam reports filter these rows OUT, so give that predicate an index.
create index if not exists idx_exam_attempts_regular
  on public.exam_attempts (tenant_id, student_id, submitted_at desc)
  where video_assessment_id is null;

-- The report's cohort is (gate x eligible student). That student lookup is
-- "every student of this tenant in this grade", run once per gate, so it is
-- the hottest path in the whole report.
create index if not exists idx_profiles_tenant_role_grade
  on public.profiles (tenant_id, role, grade);

create index if not exists idx_student_groups_group_student
  on public.student_groups (group_id, student_id);

-- --- 5a. Re-cut the exam_attempts policies -----------------------------
-- A student must NOT be able to SELECT their own pre-video attempt row:
-- the row holds `score`, which is exactly what requirement #1 says to hide
-- while attempts remain. They get a gated view through the RPCs instead.
-- NOTE: staff access is deliberately left exactly as the 2026_05_06 migration
-- had it (role = 'admin'), plus super_admin to match every policy written
-- since 2026_07_02. Assistants do NOT need a wider grant here: the new report
-- reaches this table through pre_assessment_report(), which is SECURITY
-- DEFINER and does its own has_permission() check.
drop policy if exists exam_attempts_select_own_or_admin on public.exam_attempts;
create policy exam_attempts_select_own_or_admin
  on public.exam_attempts for select
  using (
    (student_id = auth.uid() and video_assessment_id is null)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or public.is_super_admin(auth.uid())
  );

-- A student may only open a BLANK, NON-gate attempt for themselves. Gate
-- attempts are created solely by start_pre_video_attempt() so the eligibility
-- checks can't be skipped by inserting a row directly.
drop policy if exists exam_attempts_insert_self_blank on public.exam_attempts;
create policy exam_attempts_insert_self_blank
  on public.exam_attempts for insert
  with check (
    student_id = auth.uid()
    and submitted_at is null
    and coalesce(score, 0) = 0
    and video_assessment_id is null
  );

drop policy if exists exam_attempts_admin_all on public.exam_attempts;
create policy exam_attempts_admin_all
  on public.exam_attempts for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or public.is_super_admin(auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or public.is_super_admin(auth.uid())
  );

-- --- 5b. Seal the old scoring RPC against gate attempts ----------------
-- submit_exam_attempt() returns the score immediately. If a gate attempt
-- could be pushed through it, the "hide the score" rule would be one API
-- call away from bypass.
create or replace function public.submit_exam_attempt(
  p_attempt_id uuid,
  p_responses  jsonb
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

  -- NEW: pre-video gate attempts must go through submit_pre_video_attempt(),
  -- which withholds the score until the student passes or runs out.
  if v_attempt.video_assessment_id is not null then
    raise exception 'use submit_pre_video_attempt for pre-video assessments';
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  if not found then raise exception 'exam not found'; end if;

  v_questions := coalesce(v_exam.questions, '[]'::jsonb);

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
-- 5c. Close the answer-key bypass on `exams`
-- ---------------------------------------------------------------------
-- get_assessment_questions() carefully strips `answers` before sending a gate's
-- questions to the browser. That is worth nothing on its own: the `exams` RLS
-- policy is `USING (tenant_id = current_tenant_id())` with no column
-- restriction, so a student could simply request
--     /rest/v1/exams?id=eq.<gate exam>&select=questions
-- and read the answer key directly. Requirement: "students must NOT be able to
-- bypass the assessment using browser developer tools or API manipulation."
--
-- Postgres RLS is row-level, not column-level, so we cannot hide just
-- `questions`. Instead we hide the ROW from students for exams that are used as
-- a gate. A RESTRICTIVE policy is AND-ed with the existing permissive tenant
-- policy, so this narrows access without touching what is already there.
--
-- CONSEQUENCE, by design: attaching an exam as a pre-video gate removes it from
-- the student-facing exams list. That is not a side effect to work around — a
-- gate exam that could also be sat from the exams page (where the score is
-- shown immediately) would hand the student exactly the feedback this feature
-- exists to withhold. Use a dedicated assessment for gating, or accept that it
-- leaves the exams section.
create index if not exists idx_video_assessments_assessment_id
  on public.video_assessments (assessment_id);

drop policy if exists exams_hide_gate_assessments on public.exams;
create policy exams_hide_gate_assessments
  on public.exams
  as restrictive
  for select
  using (
    public.has_permission(auth.uid(), 'exams')
    or public.has_permission(auth.uid(), 'videos')
    or public.has_permission(auth.uid(), 'reports')
    or public.is_super_admin(auth.uid())
    or not exists (
      select 1 from public.video_assessments va
       where va.assessment_id = exams.id
    )
  );


-- ---------------------------------------------------------------------
-- 6. Internal helpers
-- ---------------------------------------------------------------------

-- Resolve an (assessment_type, assessment_id) pair to its concrete row.
-- This is the ONE place that knows how a type maps to storage — adding a
-- future type means adding a branch here plus a row in assessment_types.
create or replace function public.resolve_assessment(
  p_type text,
  p_id   uuid
)
returns table (
  id              uuid,
  title           text,
  grade           text,
  total_points    int,
  questions_count int,
  duration_minutes int,
  tenant_id       uuid,
  questions       jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_src text;
begin
  select source_table into v_src
    from public.assessment_types
   where code = p_type and is_active;

  if v_src is null then
    raise exception 'unknown assessment type: %', p_type;
  end if;

  if v_src = 'exams' then
    return query
      select e.id, e.title, e.grade,
             coalesce(e.total_points, 0)::int,
             coalesce(e.questions_count, 0)::int,
             coalesce(e.duration_minutes, 0)::int,
             e.tenant_id,
             coalesce(e.questions, '[]'::jsonb)
        from public.exams e
       where e.id = p_id;
    return;
  end if;

  raise exception 'assessment type % has no resolver for source table %', p_type, v_src;
end;
$$;

-- CRITICAL: this function returns `questions`, i.e. the ANSWER KEY. It is a
-- server-side helper only. Without this revoke, PostgREST would expose it as
-- /rpc/resolve_assessment and any logged-in student could read every answer.
revoke all on function public.resolve_assessment(text, uuid) from public;
revoke all on function public.resolve_assessment(text, uuid) from authenticated, anon;

-- Total points straight from the answer key, so passing_score is a percentage
-- of what the assessment is actually worth (exams.total_points is admin-typed
-- and can drift from the questions array).
create or replace function public.assessment_max_points(p_questions jsonb)
returns int
language sql
immutable
as $$
  select coalesce(sum(coalesce((q ->> 'points')::int, 1)), 0)::int
    from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) q;
$$;


-- ---------------------------------------------------------------------
-- 7. Student-facing RPCs
-- ---------------------------------------------------------------------

-- 7a. Gate status for a set of videos — ONE round trip, no N+1.
--     Returns everything the player needs to draw lock state and the
--     "attempts remaining" counter. Never returns a score or an answer.
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
  used as (
    select ea.video_assessment_id as gid, count(*)::int as n
      from public.exam_attempts ea
     where ea.student_id = v_uid
       and ea.video_assessment_id in (select g.id from gates g)
       and ea.submitted_at is not null
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
    g.allowed_attempts,
    g.passing_score,
    g.trigger_type,
    g.timestamp_seconds,
    coalesce(us.n, 0) as attempts_used,
    case
      when g.allowed_attempts = 0 then 999
      else greatest(0, g.allowed_attempts - coalesce(us.n, 0))
    end as attempts_remaining,
    (uk.gid is not null) as unlocked,
    -- The score may only be shown once the student has passed, or has
    -- spent every attempt they were given.
    (uk.gid is not null)
      or (g.allowed_attempts > 0 and coalesce(us.n, 0) >= g.allowed_attempts) as reveal
  from gates g
  join public.assessment_types ty on ty.code = g.assessment_type
  left join lateral public.resolve_assessment(g.assessment_type, g.assessment_id) r on true
  left join used us   on us.gid = g.id
  left join unlocks uk on uk.gid = g.id
  order by g.video_id, g.part_id nulls first, g.timestamp_seconds nulls first;
end;
$$;

revoke all on function public.get_video_gate_status(uuid[]) from public;
grant execute on function public.get_video_gate_status(uuid[]) to authenticated;


-- 7b. Questions WITHOUT the answer key. The old flow shipped `answers`
--     to the browser inside videos.quizzes; this strips it every time.
create or replace function public.get_assessment_questions(p_video_assessment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_gate  public.video_assessments;
  v_qs    jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_q     jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_gate
    from public.video_assessments
   where id = p_video_assessment_id
     and tenant_id = public.current_tenant_id();
  if not found then raise exception 'assessment not found'; end if;

  if not v_gate.is_enabled then raise exception 'assessment is disabled'; end if;

  -- The student must actually be allowed to watch the video this gate guards.
  if not (public.has_permission(v_uid, 'videos') or public.is_super_admin(v_uid)) then
    if not public.has_content_access(v_uid, 'video', v_gate.video_id) then
      raise exception 'forbidden';
    end if;
  end if;

  select r.questions into v_qs
    from public.resolve_assessment(v_gate.assessment_type, v_gate.assessment_id) r;

  for v_q in select value from jsonb_array_elements(coalesce(v_qs, '[]'::jsonb))
  loop
    -- Drop `answers` (and any future key that would give the answer away).
    v_out := v_out || jsonb_build_array(v_q - 'answers' - 'correct' - 'explanation');
  end loop;

  return v_out;
end;
$$;

revoke all on function public.get_assessment_questions(uuid) from public;
grant execute on function public.get_assessment_questions(uuid) to authenticated;


-- 7c. Open an attempt. Every rule is re-checked here; the client is never
--     trusted for enrollment, attempts left, tenancy, or ownership.
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
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Gate exists, is enabled, and belongs to the caller's tenant.
  select * into v_gate
    from public.video_assessments
   where id = p_video_assessment_id
     and tenant_id = v_tenant;
  if not found then raise exception 'assessment not found'; end if;
  if not v_gate.is_enabled then raise exception 'assessment is disabled'; end if;

  -- The referenced assessment must exist AND live in the same tenant, so a
  -- gate can never be pointed at another tenant's exam.
  select r.tenant_id, r.duration_minutes into v_a_tenant, v_dur
    from public.resolve_assessment(v_gate.assessment_type, v_gate.assessment_id) r;
  if v_a_tenant is null then raise exception 'assessment target not found'; end if;
  if v_a_tenant <> v_tenant then raise exception 'assessment belongs to another tenant'; end if;

  -- The student must be enrolled / have purchased access to this video.
  if not public.has_content_access(v_uid, 'video', v_gate.video_id) then
    raise exception 'not enrolled for this video';
  end if;

  -- Already earned it? Nothing to sit.
  if exists (
    select 1 from public.video_assessment_unlocks
     where video_assessment_id = v_gate.id and student_id = v_uid
  ) then
    raise exception 'already unlocked';
  end if;

  select count(*)::int into v_used
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is not null;

  if v_gate.allowed_attempts > 0 and v_used >= v_gate.allowed_attempts then
    raise exception 'no attempts remaining';
  end if;

  -- Reuse an in-flight row (a refresh mid-assessment must not burn an
  -- attempt) instead of piling up blank rows.
  select id into v_open
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is null
   order by started_at desc
   limit 1;

  select public.assessment_max_points(r.questions) into v_max
    from public.resolve_assessment(v_gate.assessment_type, v_gate.assessment_id) r;

  -- A question-less assessment can never be scored above 0%, so any pass mark
  -- above 0 would lock the video permanently with no way for the student to
  -- tell why. Fail loudly at the teacher instead of silently at the student.
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
  allowed_attempts   := v_gate.allowed_attempts;
  attempts_remaining := case when v_gate.allowed_attempts = 0 then 999
                             else greatest(0, v_gate.allowed_attempts - v_used) end;
  duration_minutes   := coalesce(v_dur, 0);
  return next;
end;
$$;

revoke all on function public.start_pre_video_attempt(uuid) from public;
grant execute on function public.start_pre_video_attempt(uuid) to authenticated;


-- 7d. Submit. Scores on the server, then decides how much the student is
--     allowed to see. This is the heart of requirement #1: while attempts
--     remain and the student has not passed, score / percent / max_score all
--     come back NULL and no review is available.
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

  if v_max = 0 then
    -- Same guard as start_pre_video_attempt: never write a 0/0 attempt that
    -- can only ever read as a failure.
    raise exception 'assessment has no questions';
  end if;

  v_pct := round((v_score::numeric * 100) / v_max, 2);
  v_passed := v_pct >= v_gate.passing_score;

  -- `where submitted_at is null` makes this the atomic claim on the attempt.
  -- Two tabs share the same in-flight row (start_pre_video_attempt reuses it),
  -- so without this guard a student could submit twice concurrently and get
  -- two scoring passes for one attempt.
  update public.exam_attempts
     set score        = v_score,
         max_score    = v_max,
         responses    = p_responses,
         submitted_at = now()
   where id = p_attempt_id
     and submitted_at is null;

  if not found then raise exception 'already submitted'; end if;

  select count(*)::int into v_used
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is not null;

  if v_passed then
    insert into public.video_assessment_unlocks
      (tenant_id, video_assessment_id, video_id, student_id, attempt_id, score_percent)
    values
      (v_gate.tenant_id, v_gate.id, v_gate.video_id, v_uid, p_attempt_id, v_pct)
    on conflict (video_assessment_id, student_id) do nothing;
  end if;

  v_exhausted := (v_gate.allowed_attempts > 0 and v_used >= v_gate.allowed_attempts);
  v_reveal    := v_passed or v_exhausted;

  attempt_number     := v_used;
  allowed_attempts   := v_gate.allowed_attempts;
  attempts_remaining := case when v_gate.allowed_attempts = 0 then 999
                             else greatest(0, v_gate.allowed_attempts - v_used) end;
  passed             := v_passed;
  unlocked           := v_passed;
  exhausted          := v_exhausted;
  reveal             := v_reveal;
  passing_score      := v_gate.passing_score;
  -- Withheld until the student has passed or used every attempt.
  score              := case when v_reveal then v_score else null end;
  max_score          := case when v_reveal then v_max   else null end;
  percent            := case when v_reveal then v_pct   else null end;
  return next;
end;
$$;

revoke all on function public.submit_pre_video_attempt(uuid, jsonb) from public;
grant execute on function public.submit_pre_video_attempt(uuid, jsonb) to authenticated;


-- 7e. Answer review — only served once the student is allowed to see it.
create or replace function public.get_pre_video_attempt_review(p_video_assessment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_gate    public.video_assessments;
  v_used    int;
  v_unlocked boolean;
  v_attempt public.exam_attempts;
  v_qs      jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_gate
    from public.video_assessments
   where id = p_video_assessment_id
     and tenant_id = public.current_tenant_id();
  if not found then raise exception 'assessment not found'; end if;

  select count(*)::int into v_used
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is not null;

  v_unlocked := exists (
    select 1 from public.video_assessment_unlocks
     where video_assessment_id = v_gate.id and student_id = v_uid
  );

  -- Same rule as everywhere else: pass, or spend every attempt.
  if not (v_unlocked or (v_gate.allowed_attempts > 0 and v_used >= v_gate.allowed_attempts)) then
    raise exception 'review not available yet';
  end if;

  select * into v_attempt
    from public.exam_attempts
   where video_assessment_id = v_gate.id
     and student_id = v_uid
     and submitted_at is not null
   order by submitted_at desc
   limit 1;
  if not found then return null; end if;

  select r.questions into v_qs
    from public.resolve_assessment(v_gate.assessment_type, v_gate.assessment_id) r;

  return jsonb_build_object(
    'attempt_id',   v_attempt.id,
    'score',        v_attempt.score,
    'max_score',    v_attempt.max_score,
    'submitted_at', v_attempt.submitted_at,
    'responses',    coalesce(v_attempt.responses, '[]'::jsonb),
    'questions',    coalesce(v_qs, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_pre_video_attempt_review(uuid) from public;
grant execute on function public.get_pre_video_attempt_review(uuid) to authenticated;


-- 7f. Staff remedy: wipe a student's attempts on one gate (and re-lock).
--     One transaction, one permission bar. Doing this as two client-side
--     deletes would half-apply for an assistant, since the exam_attempts
--     policy admits only admin/super_admin while the unlocks policy also
--     admits assistants holding the 'videos' permission.
create or replace function public.reset_pre_video_gate(
  p_video_assessment_id uuid,
  p_student_id          uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (public.has_permission(v_uid, 'videos') or public.is_super_admin(v_uid)) then
    raise exception 'forbidden';
  end if;

  -- Never let a staff member of tenant A reset a gate belonging to tenant B.
  if not exists (
    select 1 from public.video_assessments
     where id = p_video_assessment_id and tenant_id = v_tenant
  ) then
    raise exception 'assessment not found';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = p_student_id and tenant_id = v_tenant
  ) then
    raise exception 'student not found';
  end if;

  delete from public.exam_attempts
   where video_assessment_id = p_video_assessment_id
     and student_id = p_student_id;

  delete from public.video_assessment_unlocks
   where video_assessment_id = p_video_assessment_id
     and student_id = p_student_id;
end;
$$;

revoke all on function public.reset_pre_video_gate(uuid, uuid) from public;
grant execute on function public.reset_pre_video_gate(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 8. Reporting RPCs  (paginated, aggregated in SQL, no N+1)
-- ---------------------------------------------------------------------

-- The cohort: every (gate, eligible student) pair, with that student's
-- attempt aggregates folded in. Students with no attempt still appear, so
-- "لم يبدأ" is reportable. Defined once and shared by rows + stats.
create or replace function public.pre_assessment_report_base(
  p_grade         text,
  p_branch_id     uuid,
  p_group_id      uuid,
  p_teacher_id    uuid,
  p_video_id      uuid,
  p_assessment_id uuid,
  p_from          timestamptz,
  p_to            timestamptz,
  p_search        text
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
  ),
  cohort as (
    -- Eligible students for each gate: same grade as the video, or (for
    -- 'packages' videos) an explicit content-access grant.
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
     where (p_grade  is null or p.grade = p_grade)
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
    c.student_id,
    c.student_name,
    c.student_phone,
    c.grade,
    b.name,
    coalesce(gr.name, c.legacy_group),
    c.video_id,
    c.video_title,
    c.gate_id,
    c.assessment_id,
    c.assessment_type,
    c.assessment_title,
    c.allowed_attempts,
    c.passing_score,
    coalesce(a.attempts_used, 0),
    a.best_percent,
    a.latest_percent,
    a.best_score,
    a.latest_score,
    a.max_score,
    (u.student_id is not null) as passed,
    (coalesce(a.attempts_used, 0) > 0) as completed,
    a.last_submitted_at,
    a.seconds_taken,
    c.teacher_id,
    t.name
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

-- Server-side helper only: it has no permission check of its own, so it must
-- never be reachable through PostgREST. The two wrappers below do the authz.
revoke all on function public.pre_assessment_report_base(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.pre_assessment_report_base(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) from authenticated, anon;

-- 8a. Paginated rows.
create or replace function public.pre_assessment_report(
  p_search        text        default null,
  p_grade         text        default null,
  p_branch_id     uuid        default null,
  p_group_id      uuid        default null,
  p_teacher_id    uuid        default null,
  p_video_id      uuid        default null,
  p_assessment_id uuid        default null,
  p_status        text        default null,   -- passed|failed|completed|not_completed
  p_from          timestamptz default null,
  p_to            timestamptz default null,
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
-- RETURNS TABLE names (passed, completed, grade, ...) collide with the column
-- names in the body; resolve those to the COLUMN, never the OUT parameter.
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
      p_video_id, p_assessment_id, p_from, p_to, p_search
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

revoke all on function public.pre_assessment_report(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int, int) from public;
grant execute on function public.pre_assessment_report(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int, int) to authenticated;

-- 8b. Statistics over the SAME filtered set (aggregated in SQL, not in JS).
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
  p_to            timestamptz default null
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
-- RETURNS TABLE names (passed, completed, grade, ...) collide with the column
-- names in the body; resolve those to the COLUMN, never the OUT parameter.
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
      p_video_id, p_assessment_id, p_from, p_to, p_search
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

revoke all on function public.pre_assessment_report_stats(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz) from public;
grant execute on function public.pre_assessment_report_stats(text, text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz) to authenticated;

-- 8c. Filter option lists for the report UI (videos + assessments that
--     actually have a gate). Cheap, cached client-side.
create or replace function public.pre_assessment_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
-- RETURNS TABLE names (passed, completed, grade, ...) collide with the column
-- names in the body; resolve those to the COLUMN, never the OUT parameter.
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


-- ---------------------------------------------------------------------
-- 9. DATA MIGRATION  - videos.quizzes -> exams + video_assessments,
--                      quiz_attempts  -> video_assessment_unlocks
-- ---------------------------------------------------------------------
-- Runs once; guarded so re-running the file is a no-op. Nothing is deleted:
-- videos.quizzes and quiz_attempts stay on disk as a rollback path.
do $migrate$
declare
  v_video     record;
  v_quiz      jsonb;
  v_exam_id   uuid;
  v_gate_id   uuid;
  v_part_id   uuid;
  v_total_q   int;
  v_pass_q    int;
  v_pass_pct  numeric;
  v_attempts  int;
  v_trigger   text;
  v_ts        int;
  v_points    int;
  v_local_id  text;
  v_made      int := 0;
begin
  for v_video in
    select v.id, v.title, v.grade, v.tenant_id, v.created_by, v.quizzes
      from public.videos v
     where jsonb_typeof(v.quizzes) = 'array'
       and jsonb_array_length(v.quizzes) > 0
  loop
    for v_quiz in select value from jsonb_array_elements(v_video.quizzes)
    loop
      v_local_id := coalesce(v_quiz ->> 'localId', '');

      -- Already migrated? `exams.origin_ref` is the idempotency key, so
      -- re-running this whole file converts nothing twice.
      select e.id into v_exam_id
        from public.exams e
       where e.origin_ref = 'VQ:' || v_video.id::text || ':' || v_local_id
       limit 1;

      if v_exam_id is null then
        v_total_q := coalesce(jsonb_array_length(v_quiz -> 'questions'), 0);
        if v_total_q = 0 then
          continue;  -- an empty quiz gated nothing; skip it
        end if;

        select public.assessment_max_points(v_quiz -> 'questions') into v_points;

        insert into public.exams (
          tenant_id, origin_ref, title, grade, duration_minutes, max_attempts,
          available_hours, questions, total_points, created_by, exam_type,
          origin, is_archived
        ) values (
          v_video.tenant_id,
          'VQ:' || v_video.id::text || ':' || v_local_id,
          coalesce(nullif(v_quiz ->> 'title', ''), 'امتحان قبل المشاهدة — ' || v_video.title),
          v_video.grade,
          greatest(1, coalesce((v_quiz ->> 'durationMinutes')::int, 10)),
          greatest(1, coalesce((v_quiz ->> 'maxAttempts')::int, 2)),
          72,
          coalesce(v_quiz -> 'questions', '[]'::jsonb),
          coalesce(v_points, 0),
          v_video.created_by,
          'exam',
          'video_quiz',
          false
        )
        returning id into v_exam_id;
        v_made := v_made + 1;
      end if;

      -- passingQuestions (a COUNT) -> passing_score (a PERCENT).
      v_total_q  := greatest(1, coalesce(jsonb_array_length(v_quiz -> 'questions'), 1));
      v_pass_q   := coalesce((v_quiz ->> 'passingQuestions')::int, v_total_q);
      v_pass_pct := round((least(v_pass_q, v_total_q)::numeric * 100) / v_total_q, 2);
      v_attempts := greatest(1, coalesce((v_quiz ->> 'maxAttempts')::int, 2));

      v_trigger := case when (v_quiz ->> 'triggerType') = 'timestamp' then 'timestamp' else 'before' end;
      v_ts      := case when v_trigger = 'timestamp'
                        then coalesce((v_quiz ->> 'timestampSeconds')::int, 0)
                        else null end;

      -- scope 'part' carried a partIndex; resolve it to the real part id.
      v_part_id := null;
      if (v_quiz ->> 'scope') = 'part' then
        select vp.id into v_part_id
          from public.video_parts vp
         where vp.video_id = v_video.id
           and vp.part_index = coalesce((v_quiz ->> 'partIndex')::int, 0)
         limit 1;
      end if;

      -- `insert ... on conflict do nothing returning` leaves the variable
      -- UNTOUCHED when nothing is inserted, so it would otherwise still hold
      -- the previous loop iteration's gate id. Clear it first.
      v_gate_id := null;

      insert into public.video_assessments (
        tenant_id, video_id, part_id, assessment_type, assessment_id,
        allowed_attempts, passing_score, trigger_type, timestamp_seconds,
        is_enabled, title_override, created_by
      ) values (
        v_video.tenant_id, v_video.id, v_part_id, 'exam', v_exam_id,
        v_attempts, v_pass_pct, v_trigger, v_ts,
        true, nullif(v_quiz ->> 'title', ''), v_video.created_by
      )
      on conflict do nothing
      returning id into v_gate_id;

      if v_gate_id is null then
        select va.id into v_gate_id
          from public.video_assessments va
         where va.video_id = v_video.id
           and coalesce(va.part_id, va.video_id) = coalesce(v_part_id, v_video.id)
           and va.trigger_type = v_trigger
           and coalesce(va.timestamp_seconds, -1) = coalesce(v_ts, -1)
         limit 1;
      end if;

      -- Carry every existing PASS forward so no student is re-locked.
      if v_gate_id is not null and v_local_id <> '' then
        insert into public.video_assessment_unlocks
          (tenant_id, video_assessment_id, video_id, student_id, score_percent, unlocked_at)
        select qa.tenant_id, v_gate_id, v_video.id, qa.student_id,
               null, coalesce(qa.last_attempt_at, now())
          from public.quiz_attempts qa
         where qa.video_id = v_video.id
           and qa.quiz_local_id = v_local_id
           and qa.passed
        on conflict (video_assessment_id, student_id) do nothing;
      end if;
    end loop;
  end loop;

  raise notice 'pre-video assessment migration: % legacy quizzes converted to exams', v_made;
end
$migrate$;


-- ---------------------------------------------------------------------
-- 10. Post-conditions
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'submit_pre_video_attempt'
                   and pronamespace = 'public'::regnamespace and prosecdef) then
    raise exception 'submit_pre_video_attempt() must exist and be SECURITY DEFINER';
  end if;

  if exists (
    select 1 from pg_policy
     where polrelid = 'public.exam_attempts'::regclass
       and polname = 'exam_attempts_insert_self_blank'
       and pg_get_expr(polwithcheck, polrelid) not like '%video_assessment_id%'
  ) then
    raise exception 'exam_attempts insert policy must block student-created gate attempts';
  end if;

  -- Without this one, get_assessment_questions() stripping `answers` is
  -- decorative: students could read the key straight off /rest/v1/exams.
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.exams'::regclass
       and polname = 'exams_hide_gate_assessments'
       and not polpermissive
  ) then
    raise exception 'exams_hide_gate_assessments must exist and be RESTRICTIVE';
  end if;

  -- These two return the answer key; PostgREST must not expose them.
  if has_function_privilege('authenticated', 'public.resolve_assessment(text, uuid)', 'execute') then
    raise exception 'resolve_assessment must not be executable by authenticated';
  end if;
end $$;

-- =====================================================================
-- VERIFY (paste into the SQL editor after running):
--   select count(*) from public.video_assessments;
--   select count(*) from public.video_assessment_unlocks;
--   select code, label_ar from public.assessment_types;
--   -- as a student: this must return 0 rows, never a score
--   select * from public.exam_attempts where video_assessment_id is not null;
-- =====================================================================
