-- Rollback for 2026_09_23_student_device_limit.sql
-- Restores current_tenant_id() and the two student SELECT policies exactly as
-- they were, then drops everything the feature added (device data included).

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  RETURN v_tenant_id;
END;
$function$;

DROP POLICY IF EXISTS video_parts_select ON public.video_parts;
CREATE POLICY video_parts_select ON public.video_parts
  FOR SELECT TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM videos v
    WHERE v.id = video_parts.video_id
      AND v.grade = (SELECT profiles.grade FROM profiles WHERE profiles.id = auth.uid()))));

DROP POLICY IF EXISTS lectures_select_by_grade ON public.lectures;
CREATE POLICY lectures_select_by_grade ON public.lectures
  FOR SELECT TO authenticated
  USING (is_admin() OR (grade = (SELECT profiles.grade FROM profiles WHERE profiles.id = auth.uid())));

DROP TRIGGER IF EXISTS trg_audit_student_device_limit_toggle ON public.tenants;
DROP FUNCTION IF EXISTS public.tg_audit_student_device_limit_toggle();
DROP FUNCTION IF EXISTS public.admin_revoke_student_device(uuid);
DROP FUNCTION IF EXISTS public.admin_set_student_max_devices(uuid, int);
DROP FUNCTION IF EXISTS public.admin_get_student_devices(uuid);
DROP FUNCTION IF EXISTS public.device_admin_guard(uuid);
DROP FUNCTION IF EXISTS public.authorize_student_device(text);
DROP FUNCTION IF EXISTS public.device_label_from_request();
DROP FUNCTION IF EXISTS public.student_session_authorized();
DROP FUNCTION IF EXISTS public.device_limit_session_ok(uuid, uuid);

DROP TABLE IF EXISTS public.student_device_sessions;
DROP TABLE IF EXISTS public.student_devices;
DROP TABLE IF EXISTS public.student_device_settings;

ALTER TABLE public.tenants DROP COLUMN IF EXISTS student_device_limit_enabled;
