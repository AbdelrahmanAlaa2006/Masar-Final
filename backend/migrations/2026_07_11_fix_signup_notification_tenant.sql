-- ============================================================================
-- 2026_07_11_fix_signup_notification_tenant.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- WHY:
-- on_student_signup_changed() (the "new student pending activation" bell alert)
-- inserts into notifications WITHOUT a tenant_id, relying on the
-- set_tenant_id_on_insert trigger. But that trigger derives the tenant from
-- current_tenant_id() -> auth.uid(), and during GoTrue sign-up there is no user
-- JWT yet, so auth.uid() is NULL and the row is stamped with the DEFAULT tenant.
-- Result: every tenant's signup alert pools into the default tenant, so the
-- default-tenant admin sees them all (cross-tenant bleed the RLS scoping can't
-- fix, because the rows are tagged wrong).
--
-- FIX:
-- The trigger fires on public.profiles and already has the student's real tenant
-- as new.tenant_id — stamp the notification with it explicitly. Also backfill
-- existing pending_student notifications to their student's actual tenant.
-- ============================================================================

create or replace function public.on_student_signup_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if new.role = 'student' and coalesce(new.is_approved, false) = false then
      insert into public.notifications (tenant_id, title, message, level, scope, meta)
      values (
        new.tenant_id,                       -- stamp the STUDENT's tenant, not auth.uid()'s
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

-- Backfill: move already-created pending-student alerts to the correct tenant.
update public.notifications n
set tenant_id = p.tenant_id
from public.profiles p
where n.meta ->> 'kind' = 'pending_student'
  and (n.meta ->> 'studentId')::uuid = p.id
  and n.tenant_id is distinct from p.tenant_id;
