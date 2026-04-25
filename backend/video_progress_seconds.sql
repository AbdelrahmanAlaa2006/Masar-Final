-- Track real watch time per part. NULL/0 means "not watched".
-- We store the maximum seconds reached (not raw position) so seeking
-- backwards never reduces a student's recorded progress.

alter table public.video_progress
  add column if not exists seconds_watched int not null default 0;

alter table public.video_progress
  drop constraint if exists video_progress_seconds_shape;

alter table public.video_progress
  add constraint video_progress_seconds_shape
  check (seconds_watched >= 0 and seconds_watched <= 24 * 3600);
