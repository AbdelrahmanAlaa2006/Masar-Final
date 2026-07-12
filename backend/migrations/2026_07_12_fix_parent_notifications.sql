-- ============================================================================
-- 2026_07_12_fix_parent_notifications.sql
-- Fix parent notifications queue regression by redirecting public report sharing
-- writes to unified_notifications.
-- Run once in the Supabase SQL editor. Idempotent.
-- ============================================================================

-- 1. Recreate the public.queue_public_notification function to write to unified_notifications
CREATE OR REPLACE FUNCTION public.queue_public_notification(
  p_student_id UUID,
  p_phone TEXT,
  p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = p_student_id;
  
  INSERT INTO public.unified_notifications (tenant_id, student_id, title, message, type, channels, status)
  VALUES (
    v_tenant_id,
    p_student_id,
    'تقرير الطالب',
    p_message,
    'grade_added',
    ARRAY['whatsapp', 'portal'],
    jsonb_build_object('whatsapp', 'pending', 'portal', 'pending')
  );
END;
$$;

-- Ensure proper execution grants are maintained
REVOKE EXECUTE ON FUNCTION public.queue_public_notification(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_public_notification(uuid, text, text) TO anon, authenticated, service_role;
