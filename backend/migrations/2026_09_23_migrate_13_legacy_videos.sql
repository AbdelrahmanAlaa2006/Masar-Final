-- =====================================================================
-- 2026_09_23_migrate_13_legacy_videos.sql
-- PHASE 10 — STEP 3E: EXACT 13 LEGACY VIDEOS -> STANDALONE LECTURES MIGRATION
--
-- TARGET ARCHITECTURE:
--   Standalone Lectures (chapter_id = NULL, package_id = NULL)
--   Original Videos preserved intact (video_id unchanged, zero modification)
--
-- SAFETY GUARDS:
--   - Single atomic transaction (BEGIN ... COMMIT)
--   - Pre-checks: Exactly 13 target videos exist, unarchived, non-package, unassociated
--   - Post-checks: Exactly 13 lectures created, exactly 13 associations created
--   - Rollback on any failure
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_target_ids UUID[] := ARRAY[
    '2e35827f-8ed0-4253-b19b-22266af72262'::uuid,
    '8649cc14-74f1-46a0-a4e5-6b1c37f8cb7f'::uuid,
    '7310b918-9537-45d0-aa2d-09f322def627'::uuid,
    '479644ef-4ea0-406e-a0e8-b5babe22b5b9'::uuid,
    'd1ad862b-8b1c-4c69-af96-1fe276c039ea'::uuid,
    '6b3d23a9-e153-4c73-96d1-39831f79bed5'::uuid,
    '4328413a-db14-4e95-afc5-ff45a0a0d95a'::uuid,
    '950b980c-86f0-4e30-92f2-f8e5024037e7'::uuid,
    '297625cb-fd3c-4b6e-a84e-1bf8a6a6eaef'::uuid,
    '935927fd-bfb6-4592-a6d4-19c5712cf871'::uuid,
    '6b6b3e9e-9bb8-4b87-9e0a-0056c1e311f4'::uuid,
    '34d76f66-df8c-4700-907a-f27bd9230d8e'::uuid,
    'c3253731-ff18-4065-b40d-10bf5f2fe74d'::uuid
  ];
  v_rec RECORD;
  v_new_lecture_id UUID;
  v_count INT;
BEGIN
  -- PRE-CHECK 1: Exactly 13 target videos exist
  SELECT count(*) INTO v_count FROM public.videos WHERE id = ANY(v_target_ids);
  IF v_count <> 13 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 13 target videos, found %', v_count;
  END IF;

  -- PRE-CHECK 2: None are archived, all have tenant and grade
  SELECT count(*) INTO v_count 
  FROM public.videos 
  WHERE id = ANY(v_target_ids) 
    AND (is_archived = true OR tenant_id IS NULL OR grade IS NULL OR trim(grade) = '' OR title IS NULL OR trim(title) = '');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: % videos are archived or have missing tenant/grade/title', v_count;
  END IF;

  -- PRE-CHECK 3: None are linked to packages in package_items
  SELECT count(*) INTO v_count 
  FROM public.package_items 
  WHERE item_id = ANY(v_target_ids) AND item_type = 'video';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: % target videos are linked to packages', v_count;
  END IF;

  -- PRE-CHECK 4: None have an existing lecture association in lecture_videos
  SELECT count(*) INTO v_count 
  FROM public.lecture_videos 
  WHERE video_id = ANY(v_target_ids);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: % target videos already have a lecture association', v_count;
  END IF;

  -- MIGRATION LOOP: Iterate through the EXACT 13 target IDs in deterministic sequence
  FOR v_rec IN 
    SELECT 
      v.id,
      v.tenant_id,
      v.title,
      v.grade,
      CASE v.id
        WHEN '2e35827f-8ed0-4253-b19b-22266af72262'::uuid THEN 10
        WHEN '8649cc14-74f1-46a0-a4e5-6b1c37f8cb7f'::uuid THEN 20
        WHEN '7310b918-9537-45d0-aa2d-09f322def627'::uuid THEN 30
        WHEN '479644ef-4ea0-406e-a0e8-b5babe22b5b9'::uuid THEN 40
        WHEN 'd1ad862b-8b1c-4c69-af96-1fe276c039ea'::uuid THEN 50
        WHEN '6b3d23a9-e153-4c73-96d1-39831f79bed5'::uuid THEN 60
        WHEN '4328413a-db14-4e95-afc5-ff45a0a0d95a'::uuid THEN 70
        WHEN '950b980c-86f0-4e30-92f2-f8e5024037e7'::uuid THEN 80
        WHEN '297625cb-fd3c-4b6e-a84e-1bf8a6a6eaef'::uuid THEN 90
        WHEN '935927fd-bfb6-4592-a6d4-19c5712cf871'::uuid THEN 100
        WHEN '6b6b3e9e-9bb8-4b87-9e0a-0056c1e311f4'::uuid THEN 110
        WHEN '34d76f66-df8c-4700-907a-f27bd9230d8e'::uuid THEN 120
        WHEN 'c3253731-ff18-4065-b40d-10bf5f2fe74d'::uuid THEN 130
      END AS planned_order
    FROM public.videos v
    WHERE v.id = ANY(v_target_ids)
    ORDER BY planned_order ASC
  LOOP
    -- 1. Create Standalone Lecture (chapter_id = NULL, package_id = NULL)
    INSERT INTO public.course_lectures (
      tenant_id,
      chapter_id,
      package_id,
      grade,
      title,
      description,
      sort_order,
      is_active
    ) VALUES (
      v_rec.tenant_id,
      NULL,
      NULL,
      v_rec.grade,
      v_rec.title,
      NULL,
      v_rec.planned_order,
      true
    ) RETURNING id INTO v_new_lecture_id;

    -- 2. Create lecture_videos association
    INSERT INTO public.lecture_videos (
      tenant_id,
      lecture_id,
      video_id,
      sort_order
    ) VALUES (
      v_rec.tenant_id,
      v_new_lecture_id,
      v_rec.id,
      0
    );
  END LOOP;

  -- POST-CHECK A: Exactly 13 lecture_videos associations created for the targets
  SELECT count(*) INTO v_count 
  FROM public.lecture_videos 
  WHERE video_id = ANY(v_target_ids);
  IF v_count <> 13 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Expected 13 lecture_videos rows, found %', v_count;
  END IF;

  -- POST-CHECK B: Every new lecture is standalone (chapter_id IS NULL AND package_id IS NULL)
  SELECT count(*) INTO v_count 
  FROM public.course_lectures cl
  JOIN public.lecture_videos lv ON lv.lecture_id = cl.id
  WHERE lv.video_id = ANY(v_target_ids)
    AND (cl.chapter_id IS NOT NULL OR cl.package_id IS NOT NULL);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: % lectures have non-null chapter_id or package_id', v_count;
  END IF;

  -- POST-CHECK C: Verify no excluded package video received an association
  SELECT count(*) INTO v_count 
  FROM public.lecture_videos lv
  WHERE lv.video_id IN (
    'f8e5af39-6c4f-4205-ae57-28e6a8199359'::uuid,
    'bfff8238-a777-4478-a00f-f7c40ff1703e'::uuid,
    '5d29f194-6f57-4ad9-b604-6f446251ad1b'::uuid,
    '253aadb3-0ec5-471e-89e7-8d2f2a44c9a2'::uuid,
    '9e03ab1c-0b7a-47bb-b639-cbf3cbc16a84'::uuid
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Excluded package video received a lecture association';
  END IF;
END;
$$;

COMMIT;
