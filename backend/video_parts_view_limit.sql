-- Per-part view limit. NULL means "unlimited".
-- The student's effective limit = (view_limit) + (override.attempts || 0).
-- views_used in video_progress is checked against this before play.

alter table public.video_parts
  add column if not exists view_limit int;

alter table public.video_parts
  drop constraint if exists video_parts_view_limit_shape;

alter table public.video_parts
  add constraint video_parts_view_limit_shape
  check (view_limit is null or (view_limit >= 1 and view_limit <= 99));
