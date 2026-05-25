-- ============================================================
-- 2026_05_25_payment_settings.sql
-- Run once in the Supabase SQL editor.
--
-- Adds:
--   1. A `payment_settings` table to store dynamic InstaPay/Vodafone Cash details.
--   2. Enables Row Level Security (RLS) on the `payment_settings` table.
--   3. Sets up strict RLS policies so anyone can read details but only admins can edit.
--   4. Populates default configuration values.
-- ============================================================

-- Create payment_settings table
create table if not exists public.payment_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.payment_settings enable row level security;

-- Drop existing policies if they exist (to allow safe re-runs)
drop policy if exists "Anyone can read payment settings" on public.payment_settings;
drop policy if exists "Only admins can edit payment settings" on public.payment_settings;

-- 1. Anyone (including students) can select/read payment settings
create policy "Anyone can read payment settings" on public.payment_settings
  for select using (true);

-- 2. Only admins can insert, update or delete payment settings
create policy "Only admins can edit payment settings" on public.payment_settings
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Populate default configuration values if they do not exist
insert into public.payment_settings (key, value)
values 
  ('vodafoneCash', '{"number": "01007297960", "label": "01007297960", "qrOverride": ""}'::jsonb),
  ('instaPay', '{"address": "abdoalaa@instapay", "label": "abdoalaa@instapay", "link": "https://ipn.eg/S/abdoalaa", "qrOverride": ""}'::jsonb)
on conflict (key) do nothing;
