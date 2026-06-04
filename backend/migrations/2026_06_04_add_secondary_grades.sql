-- ============================================================
-- 2026_06_04_add_secondary_grades.sql
-- Run once in the Supabase SQL editor.
--
-- Extends grade check constraints to support the three
-- secondary stages ('first-sec', 'second-sec', 'third-sec').
-- ============================================================

-- 1. Drop existing target_grade check constraint if it exists on public.notifications
alter table public.notifications
  drop constraint if exists notifications_target_grade_check;

-- 2. Add updated check constraint supporting both preparatory and secondary grades
alter table public.notifications
  add constraint notifications_target_grade_check
  check (
    target_grade is null
    or target_grade in (
      'first-prep', 'second-prep', 'third-prep',
      'first-sec', 'second-sec', 'third-sec'
    )
  );

-- 3. Drop existing grade check constraint if it exists on public.profiles
alter table public.profiles
  drop constraint if exists profiles_grade_check;

-- 4. Add updated check constraint supporting both preparatory and secondary grades
alter table public.profiles
  add constraint profiles_grade_check
  check (
    grade is null
    or grade in (
      'first-prep', 'second-prep', 'third-prep',
      'first-sec', 'second-sec', 'third-sec'
    )
  );
