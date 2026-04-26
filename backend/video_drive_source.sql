-- ============================================================
-- MIGRATION: video parts can now come from Google Drive too.
-- Run once in Supabase SQL editor. Idempotent.
--
-- Adds:
--   • source           — 'youtube' (default) | 'drive'
--   • drive_id         — Google Drive file id (when source='drive')
--   • duration_seconds — admin-entered total seconds for Drive parts
--                        (YouTube parts still get duration from the
--                         YouTube oEmbed/IFrame API at watch time, so
--                         this column is unused for them).
-- ============================================================

alter table public.video_parts
  add column if not exists source text default 'youtube' not null;

alter table public.video_parts
  add column if not exists drive_id text;

alter table public.video_parts
  add column if not exists duration_seconds integer;

-- Allowed sources
alter table public.video_parts
  drop constraint if exists video_parts_source_check;
alter table public.video_parts
  add  constraint video_parts_source_check
    check (source in ('youtube','drive'));

-- Either a youtube_id OR a drive_id must be present (depending on source).
-- We stay lenient on legacy rows (youtube_url-only) by allowing either id
-- when source='youtube'.
alter table public.video_parts
  drop constraint if exists video_parts_source_id_present;
alter table public.video_parts
  add  constraint video_parts_source_id_present
    check (
      (source = 'youtube' and (youtube_id is not null or youtube_url is not null))
      or
      (source = 'drive'   and drive_id is not null)
    );
