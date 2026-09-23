-- =====================================================================
-- 2026_09_22_phase2_deterministic_migration.sql
-- Master Plan v3.12 Final — PHASE 2: Deterministic Data Migration & Backfill
--
-- Features:
--   1. Deterministic Playlist -> course_chapters Migration
--      - Maps playlists to course_chapters ONLY where package_items proves the package relationship.
--      - Preserves tenant isolation, sort_order, title, and metadata.
--      - Preserves playlist ID as chapter ID where 1:1.
--   2. Strict Rejection of "One Video = One Lecture" Fallback:
--      - Does NOT fabricate artificial lectures.
--      - Does NOT recreate source_video_id.
--      - Does NOT duplicate videos or alter video IDs.
--   3. Unassigned Content Paradigm:
--      - Preserves all videos in public.videos.
--      - Preserves all exams in public.exams.
--      - Preserves all video_parts, attempts, progress, notes, and comments.
--   4. Zero Invented Prerequisite Rules:
--      - content_unlock_rules remains completely untouched (zero invented rules).
--   5. Strict Idempotency & Re-run Safety:
--      - Safe to run repeatedly; uses explicit existence checks.
--      - Non-destructive (zero DELETEs or DROPs on legacy tables).
-- =====================================================================

DO $$
DECLARE
  v_migrated_chapters INT := 0;
  v_unmapped_playlists INT := 0;
  v_total_videos INT := 0;
  v_unassigned_videos INT := 0;
  v_total_exams INT := 0;
  v_unassigned_exams INT := 0;
  v_unlock_rules_count INT := 0;
BEGIN
  -- -------------------------------------------------------------------
  -- 1. Deterministic Playlist -> Chapter Migration
  -- -------------------------------------------------------------------
  -- Only migrate playlists where package relationship is proven in package_items
  WITH candidate_playlists AS (
    SELECT 
      pl.id AS playlist_id,
      pl.tenant_id,
      pi.package_id,
      pl.title,
      pl.description,
      COALESCE(pl.sort_order, 0) AS sort_order,
      COALESCE(pl.is_active, true) AS is_active,
      pl.created_at,
      -- Row number to handle rare case where a playlist is attached to multiple packages
      ROW_NUMBER() OVER (PARTITION BY pl.id ORDER BY pi.created_at ASC) AS pkg_rank
    FROM public.playlists pl
    JOIN public.package_items pi 
      ON pi.item_type = 'playlist' 
     AND pi.item_id = pl.id
     AND pi.tenant_id = pl.tenant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.course_chapters cc
      WHERE cc.package_id = pi.package_id
        AND (cc.id = pl.id OR cc.title = pl.title)
    )
  ),
  inserted_chapters AS (
    INSERT INTO public.course_chapters (
      id,
      tenant_id,
      package_id,
      title,
      description,
      sort_order,
      is_active,
      created_at,
      updated_at
    )
    SELECT 
      CASE 
        -- If primary association and ID not yet taken in course_chapters, preserve original playlist ID
        WHEN cp.pkg_rank = 1 AND NOT EXISTS (SELECT 1 FROM public.course_chapters cc WHERE cc.id = cp.playlist_id) 
          THEN cp.playlist_id
        ELSE gen_random_uuid()
      END AS id,
      cp.tenant_id,
      cp.package_id,
      cp.title,
      cp.description,
      cp.sort_order,
      cp.is_active,
      cp.created_at,
      timezone('utc'::text, now()) AS updated_at
    FROM candidate_playlists cp
    RETURNING id
  )
  SELECT COUNT(*) INTO v_migrated_chapters FROM inserted_chapters;

  -- Count unmapped playlists (playlists not linked to any package in package_items)
  SELECT COUNT(*) INTO v_unmapped_playlists
  FROM public.playlists pl
  WHERE NOT EXISTS (
    SELECT 1 FROM public.package_items pi 
    WHERE pi.item_type = 'playlist' AND pi.item_id = pl.id
  );

  -- -------------------------------------------------------------------
  -- 2. Audit Unassigned Content (No artificial lectures created)
  -- -------------------------------------------------------------------
  SELECT COUNT(*) INTO v_total_videos FROM public.videos;
  SELECT COUNT(*) INTO v_unassigned_videos
  FROM public.videos v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lecture_videos lv WHERE lv.video_id = v.id
  );

  SELECT COUNT(*) INTO v_total_exams FROM public.exams;
  SELECT COUNT(*) INTO v_unassigned_exams
  FROM public.exams e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lecture_exams le WHERE le.exam_id = e.id
  );

  -- Verify zero invented unlock rules
  SELECT COUNT(*) INTO v_unlock_rules_count FROM public.content_unlock_rules;

  -- -------------------------------------------------------------------
  -- 3. Diagnostic Log
  -- -------------------------------------------------------------------
  RAISE NOTICE '=== PHASE 2 DETERMINISTIC MIGRATION AUDIT ===';
  RAISE NOTICE 'Course Chapters Migrated: %', v_migrated_chapters;
  RAISE NOTICE 'Unmapped Playlists (No Package in package_items): %', v_unmapped_playlists;
  RAISE NOTICE 'Total Videos in System: %, Unassigned Videos: %', v_total_videos, v_unassigned_videos;
  RAISE NOTICE 'Total Exams in System: %, Unassigned Exams: %', v_total_exams, v_unassigned_exams;
  RAISE NOTICE 'Total Content Unlock Rules in System: % (Invented rules: 0)', v_unlock_rules_count;
  RAISE NOTICE '=============================================';

END $$;
