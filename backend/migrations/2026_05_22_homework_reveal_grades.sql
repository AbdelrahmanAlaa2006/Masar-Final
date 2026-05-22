-- =====================================================================
-- Homework: Add reveal_grades column to homeworks table.
--
-- Run once in the Supabase SQL editor.
-- =====================================================================

alter table public.homeworks
  add column if not exists reveal_grades boolean not null default false;
