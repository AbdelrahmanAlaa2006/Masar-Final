-- ============================================================================
-- 2026_07_11_super_admin_set_password.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Lets a SUPER ADMIN set a known login password for any account when promoting
-- them to admin/assistant, so the new staff member can sign in immediately
-- (previously the super-admin promote flow only changed `role`, leaving the
-- account with an unknown/registration password → "phone or password incorrect").
--
-- Security: SECURITY DEFINER but hard-gated to super admins via is_super_admin.
-- Uses pgcrypto (extensions.crypt / gen_salt 'bf') — the same bcrypt scheme
-- GoTrue uses — so the resulting hash validates on normal sign-in.
-- ============================================================================

create or replace function public.super_admin_set_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'super admin only';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      email_confirmed_at  = coalesce(email_confirmed_at, now()),
      updated_at          = now()
  where id = p_user_id;
end;
$$;

revoke execute on function public.super_admin_set_password(uuid, text) from public, anon;
grant execute on function public.super_admin_set_password(uuid, text) to authenticated;
