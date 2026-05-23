-- =====================================================================
-- Auth: Create password_reset_requests table for in-platform zero-cost recovery.
-- Also adds plain-text password support for zero-reset lookups.
--
-- Run once in the Supabase SQL editor.
-- =====================================================================

-- 1. Ensure profiles has the password column for admin reference
alter table public.profiles
  add column if not exists "password" text;

-- 2. Create the password_reset_requests table
create table if not exists public.password_reset_requests (
  id uuid default gen_random_uuid() primary key,
  phone text not null,
  full_name text not null,
  status text not null default 'pending', -- 'pending' | 'resolved' | 'rejected'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.password_reset_requests enable row level security;

-- Policy: Allow anonymous users to insert requests (so logged-out students can request a reset)
drop policy if exists "Allow anonymous inserts" on public.password_reset_requests;
create policy "Allow anonymous inserts" on public.password_reset_requests
  for insert with check (true);

-- Policy: Allow authenticated admins full control (select, update, delete)
drop policy if exists "Allow admins full control" on public.password_reset_requests;
create policy "Allow admins full control" on public.password_reset_requests
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 3. Automatic recovery notifications for admins
create or replace function public.on_password_reset_request_changed()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.notifications (
      title,
      message,
      level,
      scope,
      meta
    )
    values (
      'طلب استعادة الحساب',
      'الاسم: ' || new.full_name || ' | الهاتف: ' || new.phone,
      'warning',
      'student',
      jsonb_build_object('kind', 'password_reset_request', 'requestId', new.id)
    );
  elsif TG_OP = 'UPDATE' and old.status = 'pending' and new.status in ('resolved', 'rejected') then
    delete from public.notifications
    where scope = 'student'
      and target_student is null
      and meta ->> 'kind' = 'password_reset_request'
      and (meta ->> 'requestId')::uuid = new.id;
  elsif TG_OP = 'DELETE' then
    delete from public.notifications
    where scope = 'student'
      and target_student is null
      and meta ->> 'kind' = 'password_reset_request'
      and (meta ->> 'requestId')::uuid = old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_password_reset_requests_changed on public.password_reset_requests;
create trigger trg_password_reset_requests_changed
  after insert or update or delete
  on public.password_reset_requests
  for each row
  execute function public.on_password_reset_request_changed();
