-- =====================================================================
-- 2026_07_28_exam_shared_text_blocks.sql
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- FEATURE
--   A "Shared Text Block" is a reading passage / case study / code snippet /
--   image (a scanned passage, diagram or chart) written or uploaded once and
--   shown above EVERY question the teacher assigns it to.
--   The exam player shows one question at a time, so the passage has to
--   re-appear on each linked question — the student must never have to
--   navigate backwards to re-read it.
--
-- WHY question_index AND NOT question_id
--   This system does not store questions as rows. They live in the
--   `exams.questions` JSONB array, and BOTH builder save paths
--   (ExamAdd.jsx and the EditExamModal in Exams.jsx) strip the local `id`
--   field before writing — so a saved question has no identifier of its own.
--   Its only identity is its position in the array, which is also what
--   submit_exam_attempt() uses to score (`responses[].questionId` = index).
--
--   So the mapping keys on that same index. The invariant that keeps it
--   honest: questions and mappings are ALWAYS written together, in the same
--   save, by save_exam_shared_blocks() below. Reordering or deleting a
--   question rewrites both, so indices cannot drift apart. The RPC also
--   rejects any index outside the exam's current question count, so a stale
--   client payload fails loudly instead of silently mis-attaching a passage
--   to the wrong question.
--
-- BACKWARD COMPATIBILITY
--   Purely additive. No existing table, column, policy or function is
--   altered. An exam with no blocks behaves exactly as it does today — the
--   player renders nothing extra, and the scoring path is untouched.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. exam_shared_blocks — the passage itself, stored ONCE
-- ---------------------------------------------------------------------
create table if not exists public.exam_shared_blocks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  exam_id       uuid not null references public.exams(id) on delete cascade,
  title         text,
  -- A block carries text, an image, or both. `content` is nullable because an
  -- image-only block (a scanned passage, a diagram, a chart) is legitimate.
  content       text,
  image_url     text,
  display_order int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- "Prevent saving if the shared text is empty" — a block still has to say
  -- SOMETHING, but either medium satisfies that. Enforced in the schema so it
  -- holds no matter which client writes.
  constraint exam_shared_blocks_content_chk check (
    coalesce(btrim(content), '') <> '' or coalesce(btrim(image_url), '') <> ''
  )
);

-- Re-runnable upgrade path for a database that already has the text-only
-- version of this table from an earlier run of this file.
alter table public.exam_shared_blocks add column if not exists image_url text;
alter table public.exam_shared_blocks alter column content drop not null;
alter table public.exam_shared_blocks drop constraint if exists exam_shared_blocks_content_chk;
alter table public.exam_shared_blocks add  constraint exam_shared_blocks_content_chk check (
  coalesce(btrim(content), '') <> '' or coalesce(btrim(image_url), '') <> ''
);

create index if not exists idx_exam_shared_blocks_exam
  on public.exam_shared_blocks (exam_id, display_order);

create index if not exists idx_exam_shared_blocks_tenant
  on public.exam_shared_blocks (tenant_id);


-- ---------------------------------------------------------------------
-- 2. exam_shared_block_questions — which questions show which block
-- ---------------------------------------------------------------------
-- `exam_id` is denormalised from the parent block for ONE reason: it lets
-- us put a UNIQUE constraint on (exam_id, question_index), which guarantees
-- a question can be attached to at most one block. The renderer assumes
-- exactly that ("if the question has a shared text block"), so the database
-- should make a second block on the same question impossible rather than
-- leaving the player to pick one arbitrarily.
create table if not exists public.exam_shared_block_questions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  exam_id         uuid not null references public.exams(id) on delete cascade,
  shared_block_id uuid not null references public.exam_shared_blocks(id) on delete cascade,
  question_index  int  not null,
  created_at      timestamptz not null default now(),
  constraint esbq_index_chk check (question_index >= 0),
  constraint esbq_one_block_per_question unique (exam_id, question_index)
);

-- The player's lookup: every mapping for one exam, in one shot.
create index if not exists idx_esbq_exam
  on public.exam_shared_block_questions (exam_id);

-- Deleting a block cascades through this.
create index if not exists idx_esbq_block
  on public.exam_shared_block_questions (shared_block_id);


-- ---------------------------------------------------------------------
-- 3. Triggers: tenant stamping + updated_at
-- ---------------------------------------------------------------------
drop trigger if exists trig_set_tenant_id_exam_shared_blocks on public.exam_shared_blocks;
create trigger trig_set_tenant_id_exam_shared_blocks
  before insert on public.exam_shared_blocks
  for each row execute function public.set_tenant_id_on_insert();

drop trigger if exists trig_set_tenant_id_esbq on public.exam_shared_block_questions;
create trigger trig_set_tenant_id_esbq
  before insert on public.exam_shared_block_questions
  for each row execute function public.set_tenant_id_on_insert();

create or replace function public.touch_exam_shared_blocks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trig_touch_exam_shared_blocks on public.exam_shared_blocks;
create trigger trig_touch_exam_shared_blocks
  before update on public.exam_shared_blocks
  for each row execute function public.touch_exam_shared_blocks_updated_at();


-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.exam_shared_blocks          enable row level security;
alter table public.exam_shared_block_questions enable row level security;

-- READ: if you can see the exam, you can see its passages. Delegating to the
-- exams SELECT policy (via the EXISTS) means students automatically inherit
-- the same grade/package gating that already governs the exam itself, and we
-- never have to keep a second copy of that rule in sync.
-- A passage is prompt material, not an answer key, so this is safe to expose
-- to the students sitting the exam.
drop policy if exists exam_shared_blocks_select on public.exam_shared_blocks;
create policy exam_shared_blocks_select
  on public.exam_shared_blocks for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.exams e where e.id = exam_id)
  );

drop policy if exists esbq_select on public.exam_shared_block_questions;
create policy esbq_select
  on public.exam_shared_block_questions for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.exams e where e.id = exam_id)
  );

-- WRITE: same bar as editing the exam itself. In practice all writes go
-- through save_exam_shared_blocks() (SECURITY DEFINER), but keeping a real
-- policy here means a direct PostgREST write from an admin tool still works
-- and a student's still cannot.
drop policy if exists exam_shared_blocks_write on public.exam_shared_blocks;
create policy exam_shared_blocks_write
  on public.exam_shared_blocks for all
  using (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'exams') or public.is_super_admin(auth.uid()))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'exams') or public.is_super_admin(auth.uid()))
  );

drop policy if exists esbq_write on public.exam_shared_block_questions;
create policy esbq_write
  on public.exam_shared_block_questions for all
  using (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'exams') or public.is_super_admin(auth.uid()))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.has_permission(auth.uid(), 'exams') or public.is_super_admin(auth.uid()))
  );


-- ---------------------------------------------------------------------
-- 5. get_exam_shared_blocks — blocks + their question indices, one call
-- ---------------------------------------------------------------------
-- The frontend also reads this shape straight from PostgREST via the FK
-- embed; this function exists so save_exam_shared_blocks can return the
-- saved state, and as a single-round-trip option for the player.
create or replace function public.get_exam_shared_blocks(p_exam_id uuid)
returns jsonb
language sql
stable
-- SECURITY INVOKER on purpose: the RLS policies above already say who may
-- read a passage. Running this as DEFINER would bypass them and let any
-- authenticated user in the tenant read the passages of an exam they are
-- not entitled to see.
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',            b.id,
        'title',         b.title,
        'content',       coalesce(b.content, ''),
        'image_url',     b.image_url,
        'display_order', b.display_order,
        'question_indexes', coalesce(q.idxs, '[]'::jsonb)
      )
      order by b.display_order, b.created_at
    ),
    '[]'::jsonb
  )
  from public.exam_shared_blocks b
  left join lateral (
    select jsonb_agg(m.question_index order by m.question_index) as idxs
      from public.exam_shared_block_questions m
     where m.shared_block_id = b.id
  ) q on true
  where b.exam_id = p_exam_id
    and b.tenant_id = public.current_tenant_id();
$$;

revoke all on function public.get_exam_shared_blocks(uuid) from public;
grant execute on function public.get_exam_shared_blocks(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6. save_exam_shared_blocks — the ONLY write path the builders use
-- ---------------------------------------------------------------------
-- Replaces the whole block set for one exam atomically (function body = one
-- transaction), so a half-applied save is impossible: the teacher either gets
-- the new blocks + mappings or keeps the old ones untouched.
--
-- p_blocks shape:
--   [ { "title": "Reading Passage",
--       "content": "...",
--       "display_order": 0,
--       "question_indexes": [0, 2, 4] }, ... ]
--
-- Passing '[]' deletes every block for the exam — which is exactly what
-- "the teacher removed them all" means, and what an exam that never had any
-- keeps doing (a no-op delete).
create or replace function public.save_exam_shared_blocks(
  p_exam_id uuid,
  p_blocks  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid := public.current_tenant_id();
  v_qcount   int;
  v_block    jsonb;
  v_new_id   uuid;
  v_order    int := 0;
  v_content  text;
  v_image    text;
  v_title    text;
  v_idx      jsonb;
  v_index    int;
  v_seen     int[] := '{}';
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if not (public.has_permission(v_uid, 'exams') or public.is_super_admin(v_uid)) then
    raise exception 'forbidden';
  end if;

  -- The exam must exist AND belong to the caller's tenant. Without the tenant
  -- check a staff member of tenant A could attach passages to tenant B's exam.
  select coalesce(jsonb_array_length(questions), 0) into v_qcount
    from public.exams
   where id = p_exam_id and tenant_id = v_tenant;

  if not found then raise exception 'exam not found'; end if;

  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array' then
    raise exception 'blocks payload must be an array';
  end if;

  -- Full replace. ON DELETE CASCADE clears the mappings with the blocks, so
  -- deleting a block never touches a question — it only drops the link.
  delete from public.exam_shared_blocks where exam_id = p_exam_id;

  for v_block in select value from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb))
  loop
    v_content := btrim(coalesce(v_block ->> 'content', ''));
    v_image   := btrim(coalesce(v_block ->> 'image_url', ''));

    -- A block must carry text OR an image; empty-and-imageless is rejected.
    if v_content = '' and v_image = '' then
      raise exception 'shared text block % has empty content', v_order + 1;
    end if;

    v_title := nullif(btrim(coalesce(v_block ->> 'title', '')), '');

    insert into public.exam_shared_blocks
      (tenant_id, exam_id, title, content, image_url, display_order)
    values
      (v_tenant, p_exam_id, v_title, nullif(v_content, ''), nullif(v_image, ''), v_order)
    returning id into v_new_id;

    for v_idx in
      select value from jsonb_array_elements(coalesce(v_block -> 'question_indexes', '[]'::jsonb))
    loop
      -- jsonb_typeof guards against "3" / null / {} arriving as an index.
      if jsonb_typeof(v_idx) <> 'number' then
        raise exception 'invalid question reference in block %', v_order + 1;
      end if;

      v_index := (v_idx)::text::int;

      -- "Prevent saving if the teacher selects a question that does not exist."
      if v_index < 0 or v_index >= v_qcount then
        raise exception
          'block % references question %, but this exam has % questions',
          v_order + 1, v_index + 1, v_qcount;
      end if;

      -- One block per question. The UNIQUE constraint would catch this too,
      -- but a named error tells the teacher which question is doubled up.
      if v_index = any(v_seen) then
        raise exception
          'question % is assigned to more than one shared text block',
          v_index + 1;
      end if;
      v_seen := array_append(v_seen, v_index);

      insert into public.exam_shared_block_questions
        (tenant_id, exam_id, shared_block_id, question_index)
      values
        (v_tenant, p_exam_id, v_new_id, v_index);
    end loop;

    v_order := v_order + 1;
  end loop;

  return public.get_exam_shared_blocks(p_exam_id);
end;
$$;

revoke all on function public.save_exam_shared_blocks(uuid, jsonb) from public;
grant execute on function public.save_exam_shared_blocks(uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 7. Post-conditions
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'esbq_one_block_per_question'
  ) then
    raise exception 'esbq_one_block_per_question must exist — the player assumes one block per question';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_exam_shared_blocks' and p.prosecdef
  ) then
    raise exception 'save_exam_shared_blocks() must exist and be SECURITY DEFINER';
  end if;
end $$;

-- =====================================================================
-- VERIFY:
--   select public.get_exam_shared_blocks('<exam-uuid>');   -- []
--   -- attach a passage to questions 1 and 3 (0-based indices 0 and 2):
--   select public.save_exam_shared_blocks('<exam-uuid>', '[{
--     "title": "Reading Passage",
--     "content": "Read the following passage...",
--     "question_indexes": [0, 2]
--   }]'::jsonb);
--   -- out-of-range index must FAIL:
--   select public.save_exam_shared_blocks('<exam-uuid>', '[{
--     "content": "x", "question_indexes": [9999] }]'::jsonb);
-- =====================================================================
