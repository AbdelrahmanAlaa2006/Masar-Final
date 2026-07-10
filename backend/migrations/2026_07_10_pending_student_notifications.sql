-- New-signup notifications for the admin bell.
-- Mirrors the proven password-reset-request pattern: a profiles trigger
-- inserts an admin-facing row into public.notifications when a student signs
-- up pending approval, and removes it automatically once the account is
-- approved (or the profile is deleted). Students never see these rows: the
-- bell's client filter discards scope='student' rows not targeted at them.
-- Safe to re-run.

create or replace function public.on_student_signup_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if new.role = 'student' and coalesce(new.is_approved, false) = false then
      insert into public.notifications (title, message, level, scope, meta)
      values (
        'طالب جديد بانتظار التفعيل',
        'الاسم: ' || coalesce(new.name, '—') || ' | الهاتف: ' || coalesce(new.phone, '—'),
        'warning',
        'student',
        jsonb_build_object('kind', 'pending_student', 'studentId', new.id)
      );
    end if;
    return new;
  elsif TG_OP = 'UPDATE' then
    if old.role = 'student'
       and coalesce(old.is_approved, false) = false
       and coalesce(new.is_approved, false) = true then
      delete from public.notifications
      where target_student is null
        and meta ->> 'kind' = 'pending_student'
        and (meta ->> 'studentId')::uuid = new.id;
    end if;
    return new;
  elsif TG_OP = 'DELETE' then
    delete from public.notifications
    where target_student is null
      and meta ->> 'kind' = 'pending_student'
      and (meta ->> 'studentId')::uuid = old.id;
    return old;
  end if;
  return new;
end;
$$;

-- Trigger functions must not be callable over REST (same hardening as the rest)
revoke execute on function public.on_student_signup_changed() from PUBLIC, anon, authenticated;

drop trigger if exists trg_profiles_student_signup on public.profiles;
create trigger trg_profiles_student_signup
  after insert or update of is_approved or delete
  on public.profiles
  for each row
  execute function public.on_student_signup_changed();

-- Backfill: create notifications for students who are ALREADY waiting for
-- approval right now (so the admin sees them without a new signup).
insert into public.notifications (title, message, level, scope, meta)
select
  'طالب جديد بانتظار التفعيل',
  'الاسم: ' || coalesce(p.name, '—') || ' | الهاتف: ' || coalesce(p.phone, '—'),
  'warning',
  'student',
  jsonb_build_object('kind', 'pending_student', 'studentId', p.id)
from public.profiles p
where p.role = 'student'
  and coalesce(p.is_approved, false) = false
  and not exists (
    select 1 from public.notifications n
    where n.meta ->> 'kind' = 'pending_student'
      and (n.meta ->> 'studentId')::uuid = p.id
  );
