-- Security hardening v2 — closes the remaining "Public Can Execute SECURITY
-- DEFINER Function" warnings.
--
-- Why v1 wasn't enough: Postgres grants EXECUTE on every new function to the
-- PUBLIC pseudo-role by default, and anon/authenticated inherit it. Revoking
-- from anon/authenticated alone leaves the PUBLIC grant in place, so the
-- function stays callable. The correct pattern is: revoke from PUBLIC, then
-- grant back exactly the roles each function needs.
--
-- service_role is granted everywhere so Edge Functions and admin scripts are
-- never affected. Safe to re-run (idempotent).

-- ─────────────────────────────────────────────────────────────────────────
-- A. No REST access at all — trigger functions, internal utilities, and
--    endpoints the app never calls. (Triggers keep firing: EXECUTE is not
--    checked at fire time.)
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_devtools_violation_inserted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_password_reset_request_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_scheduled_event_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_tenant_id_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_access_on_purchase_approve() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_access_on_package_item_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_access_on_playlist_item_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_student(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_student_password(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profiles_passwords(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_parent_otp(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_parent_otp(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_student_by_parent_phone(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_create_student(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_student_password(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_profiles_passwords(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_parent_otp(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_parent_otp(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_student_by_parent_phone(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- B. Logged-in users only — RPCs the app calls after login.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.submit_homework(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_attendance_batch_v2(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_group_transfer(uuid[], uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_part_view(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_student_identity(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_student_identity_by_qr(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_student_account(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_student_password(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wipe_all_test_data(text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_homework(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_attendance_batch_v2(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_group_transfer(uuid[], uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_part_view(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_identity(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_identity_by_qr(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_student_account(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_student_password(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wipe_all_test_data(text, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- C. Public flows (Register page, parent report portal) and RLS helper
--    predicates — must stay callable by anon + authenticated, but we still
--    remove the blanket PUBLIC grant and make the intended roles explicit.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_public_report(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_platform_reports(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_parent_portal_summary(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_public_notification(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_branches(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_groups(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_student_phone_exists(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_content_access(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_report(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_platform_reports(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_portal_summary(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_public_notification(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_branches(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_groups(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_student_phone_exists(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_content_access(uuid, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO anon, authenticated, service_role;
