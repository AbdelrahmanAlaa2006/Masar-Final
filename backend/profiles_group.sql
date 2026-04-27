-- ============================================================
-- MIGRATION: add profiles.group
-- Run once in Supabase SQL editor.
-- Safe to run more than once (IF NOT EXISTS guard).
--
-- Background: students belong to a class/section ("group") in
-- addition to their grade. The label is free-text (e.g. "A1",
-- "السبت 4م"). Imported via the students CSV and surfaced on
-- the profile page + group reports.
-- ============================================================

alter table public.profiles
  add column if not exists "group" text;
