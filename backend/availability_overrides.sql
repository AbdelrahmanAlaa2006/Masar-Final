-- ============================================================
-- MIGRATION: add access_overrides.available_hours
-- Run once in Supabase SQL editor (idempotent).
--
-- Background: the Control Panel's "availability" feature used to be a
-- single number per item (exams.available_hours, videos.active_hours).
-- We now let admins set per-audience availability like reveal:
--     • "all students"      → updates the item column (existing behaviour)
--     • "specific grade"    → upsert into access_overrides with scope='prep'
--     • "specific student"  → upsert into access_overrides with scope='student'
--
-- Storage: one optional integer on the existing access_overrides row.
-- NULL means "no per-audience availability override; use the item default".
-- The column lives alongside the `allowed` and `attempts` fields, so a
-- single row can carry all three rules for a given (audience, item).
-- ============================================================

alter table public.access_overrides
  add column if not exists available_hours int;

-- Sanity shape: must be a positive number of hours (capped at one year).
alter table public.access_overrides
  drop constraint if exists access_overrides_hours_shape;
alter table public.access_overrides
  add  constraint access_overrides_hours_shape
    check (available_hours is null or (available_hours >= 1 and available_hours <= 24 * 365));
