-- ============================================================
-- MIGRATION: add video_parts.youtube_id
-- Run once in Supabase SQL editor.
-- Safe to run more than once (all IF NOT EXISTS guards).
--
-- Background: we switched from storing full YouTube URLs to just
-- the 11-char video id. The id is embedded in a wrapped player
-- that hides all YouTube branding / link-outs. The legacy
-- `youtube_url` column stays (nullable) so older rows keep working.
-- ============================================================

alter table public.video_parts
  add column if not exists youtube_id text;

-- Make youtube_url nullable (it was NOT NULL) so new writes that
-- only set youtube_id don't fail.
alter table public.video_parts
  alter column youtube_url drop not null;

-- Backfill: try to extract the id from any existing youtube_url.
update public.video_parts
  set youtube_id = substring(youtube_url from 'v=([A-Za-z0-9_-]{11})')
  where youtube_id is null
    and youtube_url ~ 'v=([A-Za-z0-9_-]{11})';

update public.video_parts
  set youtube_id = substring(youtube_url from 'youtu\.be/([A-Za-z0-9_-]{11})')
  where youtube_id is null
    and youtube_url ~ 'youtu\.be/([A-Za-z0-9_-]{11})';

update public.video_parts
  set youtube_id = substring(youtube_url from '/embed/([A-Za-z0-9_-]{11})')
  where youtube_id is null
    and youtube_url ~ '/embed/([A-Za-z0-9_-]{11})';

-- Sanity-shape check (optional, allows either null or an 11-char id).
alter table public.video_parts
  drop constraint if exists video_parts_youtube_id_shape;
alter table public.video_parts
  add  constraint video_parts_youtube_id_shape
    check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$');
