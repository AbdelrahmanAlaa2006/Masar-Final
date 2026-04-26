-- ============================================================
-- ONE-TIME SETUP: storage bucket for question images
-- Run once in Supabase SQL editor.
--
-- Question images (optional, attached to a single question on an
-- exam or pre-video quiz) are stored here. Bucket is public so the
-- <img> tag can render the URL directly without signed URLs.
-- ============================================================

-- Create the bucket if it doesn't exist.
insert into storage.buckets (id, name, public)
values ('quiz-images', 'quiz-images', true)
on conflict (id) do update set public = true;

-- Allow authenticated admins to upload / overwrite / delete.
drop policy if exists "quiz-images admin write"  on storage.objects;
create policy "quiz-images admin write"
  on storage.objects for all
  to authenticated
  using  (bucket_id = 'quiz-images')
  with check (bucket_id = 'quiz-images');

-- Allow anyone (incl. anon students) to read.
drop policy if exists "quiz-images public read" on storage.objects;
create policy "quiz-images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'quiz-images');
