-- ============================================================
-- 2026_05_25_payments.sql
-- Run once in the Supabase SQL editor.
--
-- Adds:
--   1. A `payments` table to store InstaPay and Vodafone Cash confirmations.
--   2. Enables Row Level Security (RLS) on the `payments` table.
--   3. Sets up strict policies so students can only view/insert their own payments,
--      while admins can view, review, and approve/reject all payments.
-- ============================================================

-- 1. Create payments table
create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.profiles(id) on delete cascade not null,
  amount numeric not null,
  payment_method text not null check (payment_method in ('InstaPay', 'Vodafone Cash')),
  screenshot_url text not null,
  screenshot_key text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  resolved_at timestamp with time zone,
  resolved_by uuid references public.profiles(id) on delete set null
);

-- Enable RLS
alter table public.payments enable row level security;

-- 2. Drop existing policies if they exist (to allow safe re-runs)
drop policy if exists "Admins see all payments" on public.payments;
drop policy if exists "Students see own payments" on public.payments;
drop policy if exists "Students can insert own payments" on public.payments;
drop policy if exists "Admins can update payments" on public.payments;
drop policy if exists "Admins can delete payments" on public.payments;

-- 3. Create strict RLS policies
-- Admins can select all payments
create policy "Admins see all payments" on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Students can select their own payments
create policy "Students see own payments" on public.payments
  for select to authenticated
  using (auth.uid() = student_id);

-- Students can insert their own payments (must start as pending)
create policy "Students can insert own payments" on public.payments
  for insert to authenticated
  with check (auth.uid() = student_id and status = 'pending');

-- Only admins can update payments (for approval / rejection)
create policy "Admins can update payments" on public.payments
  for update to authenticated
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

-- Only admins can delete payments
create policy "Admins can delete payments" on public.payments
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Create index on student_id for faster lookups
create index if not exists payments_student_id_idx on public.payments (student_id);
create index if not exists payments_status_idx on public.payments (status);
