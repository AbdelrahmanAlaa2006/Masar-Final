-- ============================================================
-- ONE-TIME SETUP: storage bucket for question images
--
-- TWO WAYS to set this up. Pick whichever works for you:
--
-- ── Option A (easiest): Supabase Dashboard ────────────────────
--   1. Go to your project → Storage in the sidebar
--   2. Click "New bucket"
--   3. Name: quiz-images
--   4. Toggle "Public bucket" ON
--   5. Create — done. Skip the SQL below.
--
-- ── Option B: SQL Editor ──────────────────────────────────────
--   Paste this whole file into Supabase → SQL Editor → Run.
--   Idempotent (safe to re-run).
-- ============================================================

-- 1) Create the public bucket
insert into storage.buckets (id, name, public)
values ('quiz-images', 'quiz-images', true)
on conflict (id) do update set public = true;

-- 2) Allow ANY authenticated user (admins) to upload / overwrite / delete.
--    If you want to restrict to admins only, replace the role with a check
--    like   exists (select 1 from public.profiles
--                   where id = auth.uid() and role = 'admin')
--    inside the using/with check clauses below.
drop policy if exists "quiz-images authenticated write" on storage.objects;
create policy "quiz-images authenticated write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'quiz-images');

drop policy if exists "quiz-images authenticated update" on storage.objects;
create policy "quiz-images authenticated update"
  on storage.objects for update
  to authenticated
  using  (bucket_id = 'quiz-images')
  with check (bucket_id = 'quiz-images');

drop policy if exists "quiz-images authenticated delete" on storage.objects;
create policy "quiz-images authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'quiz-images');

-- 3) Allow anyone (including anonymous students viewing an exam) to read
--    the images. Without this, the <img> tag returns 400.
drop policy if exists "quiz-images public read" on storage.objects;
create policy "quiz-images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'quiz-images');
