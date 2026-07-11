-- ============================================================
-- 2026_07_11_drop_hardcoded_grade_checks.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- WHY:
-- profiles_grade_check / notifications_target_grade_check (added in
-- 2026_06_04_add_secondary_grades.sql) hardcode a 6-value grade whitelist
-- (first/second/third prep + sec). But tenants now define their OWN grades
-- dynamically in tenants.config.stages (baccalaureate, azhar, programming
-- levels, …). Any student registering on such a tenant inserts a grade id
-- that is NOT in the whitelist, so the profiles INSERT inside handle_new_user
-- fails the CHECK and GoTrue surfaces the generic, misleading
-- "Database error saving new user". The default tenant (company site) never
-- hits it because it doesn't register students with those grades.
--
-- FIX:
-- Drop both hardcoded grade CHECK constraints. Grade validity is already
-- enforced at the application layer from each tenant's configured stages,
-- so the database must not second-guess it with a fixed list.
-- ============================================================

alter table public.profiles
  drop constraint if exists profiles_grade_check;

alter table public.notifications
  drop constraint if exists notifications_target_grade_check;

-- The same hardcoded grade whitelist also lives on the content tables, which
-- blocks admins from creating videos/exams/lectures for any tenant-specific
-- grade (23514 videos_grade_check / exams_grade_check / lectures_grade_check).
-- (homeworks has no such constraint.) Kept-as-is: the *_scope/type/status enum
-- checks are legitimate and untouched.
alter table public.videos
  drop constraint if exists videos_grade_check;

alter table public.exams
  drop constraint if exists exams_grade_check;

alter table public.lectures
  drop constraint if exists lectures_grade_check;
