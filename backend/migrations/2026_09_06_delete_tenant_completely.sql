-- =====================================================================
-- 2026_09_06_delete_tenant_completely.sql
-- Function to completely delete a tenant and all its associated records
-- Optimized with 300s timeout to handle large tenants safely.
-- Each delete is isolated so missing tables or schema variations never block deletion.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_tenant_completely(
  p_tenant_id UUID,
  p_confirm_slug TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300s'
AS $$
DECLARE
  v_tenant_slug TEXT;
  v_tenant_name TEXT;
  v_user_ids UUID[];
BEGIN
  -- 1. Verify caller is super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون سوبر أدمن لإجراء هذا الحذف.';
  END IF;

  -- 2. Fetch tenant slug and name
  SELECT slug, name INTO v_tenant_slug, v_tenant_name 
  FROM public.tenants 
  WHERE id = p_tenant_id;

  IF v_tenant_slug IS NULL THEN
    RAISE EXCEPTION 'المنصة غير موجودة أو تم حذفها بالفعل.';
  END IF;

  -- Prevent deleting default system tenant
  IF v_tenant_slug = 'default' THEN
    RAISE EXCEPTION 'لا يمكن حذف المنصة الافتراضية للنظام (default).';
  END IF;

  -- 3. Verify confirmation slug/name match
  IF TRIM(LOWER(p_confirm_slug)) NOT IN (TRIM(LOWER(v_tenant_slug)), TRIM(LOWER(v_tenant_name))) THEN
    RAISE EXCEPTION 'معرف أو اسم المنصة المدخل للتأكيد غير متطابق.';
  END IF;

  -- Collect all auth user IDs for this tenant in memory
  SELECT ARRAY_AGG(id) INTO v_user_ids
  FROM public.profiles
  WHERE tenant_id = p_tenant_id;

  -- 4. Delete child records in reverse dependency order (each in its own isolated block)

  -- Notifications & Chat & Logs
  BEGIN DELETE FROM public.parent_notifications WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.unified_notifications WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.notifications WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.password_reset_requests WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.devtools_violations WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.chat_messages WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.student_notes WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.attachments WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.audit_logs WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.message_templates WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.announcements WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.whatsapp_templates WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.whatsapp_tenant_locks WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Booklets & Logs
  BEGIN DELETE FROM public.booklet_payment_logs WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.student_booklets WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.booklets WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Attendance & Grades
  BEGIN DELETE FROM public.attendance_records WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.attendance_sessions WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.attendance WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.grades WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Video Gate & Unlocks
  BEGIN DELETE FROM public.video_assessment_unlocks WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.video_assessments WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Homeworks
  BEGIN DELETE FROM public.homework_submissions WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.homework_submissions WHERE homework_id IN (SELECT id FROM public.homeworks WHERE tenant_id = p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.homeworks WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Exam Shared Blocks & Attempts & Exams
  BEGIN DELETE FROM public.exam_shared_block_questions WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.exam_shared_block_questions WHERE exam_id IN (SELECT id FROM public.exams WHERE tenant_id = p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.exam_shared_blocks WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.exam_shared_blocks WHERE exam_id IN (SELECT id FROM public.exams WHERE tenant_id = p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.exam_attempts WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.exam_attempts WHERE exam_id IN (SELECT id FROM public.exams WHERE tenant_id = p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.quiz_attempts WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.access_overrides WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.exams WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Packages & Playlists & Video progress
  BEGIN DELETE FROM public.student_content_access WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.package_purchases WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.package_items WHERE package_id IN (SELECT id FROM public.packages WHERE tenant_id = p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.packages WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.playlist_items WHERE playlist_id IN (SELECT id FROM public.playlists WHERE tenant_id = p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.playlists WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Videos & Notes & Comments & Progress
  BEGIN DELETE FROM public.video_progress WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.video_comments WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.video_notes WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.videos WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Financial & Business
  BEGIN DELETE FROM public.financial_ledger WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.student_ledger WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.payments WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.subscription_fees WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.payment_settings WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.biz_transactions WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.biz_recurring WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.biz_contracts WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.biz_categories WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.biz_accounts WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.biz_settings WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.finance_transactions WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.finance_categories WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Groups & Branches & Academic Years
  BEGIN
    IF v_user_ids IS NOT NULL AND ARRAY_LENGTH(v_user_ids, 1) > 0 THEN
      DELETE FROM public.student_groups WHERE student_id = ANY(v_user_ids);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.student_groups WHERE group_id IN (SELECT id FROM public.groups WHERE tenant_id = p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.groups WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.branches WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.academic_years WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Settings & Features & Tenant Admins
  BEGIN DELETE FROM public.tenant_admins WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tenant_settings WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tenant_features WHERE tenant_id = p_tenant_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Delete profiles
  BEGIN
    DELETE FROM public.profiles WHERE tenant_id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Delete from auth.users (Admins, Assistants, Students)
  BEGIN
    IF v_user_ids IS NOT NULL AND ARRAY_LENGTH(v_user_ids, 1) > 0 THEN
      DELETE FROM auth.users WHERE id = ANY(v_user_ids);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Finally, delete the tenant record itself!
  DELETE FROM public.tenants WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tenant_completely(UUID, TEXT) TO authenticated, service_role;
