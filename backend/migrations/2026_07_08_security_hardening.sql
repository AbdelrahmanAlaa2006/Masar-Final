-- Security hardening — resolves the Supabase Security Advisor warnings
-- (91 warnings = 4 issue types). Safe to re-run (idempotent).
--
-- Verified against the actual frontend code before writing:
--   * every REVOKE here targets a function the client never calls with that
--     role (grep of all .rpc() calls in src/ + backend/), and
--   * every anon-callable public flow (Register page, PublicReport parent
--     portal) keeps its grants.
-- service_role (used by Edge Functions / scripts) is unaffected by these
-- revokes — it retains full access.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Pin search_path on all 16 flagged functions (lint 0011).
--    Prevents search_path hijacking inside SECURITY DEFINER bodies.
-- ─────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.on_devtools_violation_inserted() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;
ALTER FUNCTION public.set_tenant_id_on_insert() SET search_path = public;
ALTER FUNCTION public.admin_reset_student_password(text, text) SET search_path = public;
ALTER FUNCTION public.admin_create_student(text, text, text, text, text) SET search_path = public;
ALTER FUNCTION public.sync_profiles_passwords(jsonb) SET search_path = public;
ALTER FUNCTION public.on_password_reset_request_changed() SET search_path = public;
ALTER FUNCTION public.reset_student_password(uuid, text) SET search_path = public;
ALTER FUNCTION public.delete_student_account(uuid) SET search_path = public;
ALTER FUNCTION public.wipe_all_test_data(text, uuid) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.sync_access_on_purchase_approve() SET search_path = public;
ALTER FUNCTION public.sync_access_on_package_item_change() SET search_path = public;
ALTER FUNCTION public.sync_access_on_playlist_item_change() SET search_path = public;
ALTER FUNCTION public.on_scheduled_event_changes() SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Trigger/internal functions: not meant to be called over REST at all.
--    Triggers keep firing regardless of EXECUTE grants (privilege is not
--    checked at fire time), so this only closes the /rest/v1/rpc/ door.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_devtools_violation_inserted() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_password_reset_request_changed() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_scheduled_event_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_tenant_id_on_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_access_on_purchase_approve() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_access_on_package_item_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_access_on_playlist_item_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Dead/service-only endpoints: defined in the DB but never called from
--    the app with any role. Closing them removes attack surface entirely.
--    (Re-grant to authenticated if a future feature needs one of them.)
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.admin_create_student(text, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_student_password(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profiles_passwords(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_parent_otp(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_parent_otp(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_student_by_parent_phone(text) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Logged-in-only app RPCs: used by the app, but never before login.
--    Revoking anon means a logged-out visitor can no longer probe them.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.submit_homework(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_attendance_batch_v2(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_group_transfer(uuid[], uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_part_view(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_student_identity(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_student_identity_by_qr(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_student_account(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_student_password(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.wipe_all_test_data(text, uuid) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────
-- INTENTIONALLY LEFT CALLABLE (the remaining advisor warnings on these are
-- accepted by design — do NOT revoke):
--   * anon + authenticated, used by public pages (Register, parent report):
--       get_public_report, get_public_platform_reports,
--       get_parent_portal_summary, queue_public_notification,
--       get_public_branches, get_public_groups, check_student_phone_exists
--   * anon + authenticated, used inside RLS policies (revoking would break
--       row-level security evaluation for the querying role):
--       is_admin, is_current_user_admin, is_super_admin,
--       has_permission, has_content_access, current_tenant_id
-- ─────────────────────────────────────────────────────────────────────────
