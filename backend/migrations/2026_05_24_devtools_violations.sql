-- =====================================================================
-- Security: Create devtools_violations table for DevTools Access Protection logs
-- and automatic admin notifications on security breach.
--
-- Run once in the Supabase SQL editor.
-- =====================================================================

-- 1. Create the devtools_violations table
create table if not exists public.devtools_violations (
  id uuid default gen_random_uuid() primary key,
  username text not null default 'غير مسجل الدخول',
  ip_address text,
  page text,
  user_agent text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.devtools_violations enable row level security;

-- Policy: Allow anyone (anonymous or authenticated) to log a DevTools violation
drop policy if exists "Allow anonymous inserts" on public.devtools_violations;
create policy "Allow anonymous inserts" on public.devtools_violations
  for insert with check (true);

-- Policy: Allow authenticated admins full control to view and manage violations
drop policy if exists "Allow admins full control" on public.devtools_violations;
create policy "Allow admins full control" on public.devtools_violations
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 2. Automatic security alerts/notifications for admins
create or replace function public.on_devtools_violation_inserted()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.notifications (
    title,
    message,
    level,
    scope,
    meta
  )
  values (
    'انتهاك أمني (أدوات المطور)',
    'المستخدم: ' || new.username || ' | IP: ' || coalesce(new.ip_address, 'مجهول') || ' | الصفحة: ' || coalesce(new.page, '/'),
    'danger',
    'student', -- student scope with null target_student is hidden from all students, visible only to admins
    jsonb_build_object('kind', 'devtools_violation', 'violationId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_devtools_violation_inserted on public.devtools_violations;
create trigger trg_devtools_violation_inserted
  after insert
  on public.devtools_violations
  for each row
  execute function public.on_devtools_violation_inserted();
