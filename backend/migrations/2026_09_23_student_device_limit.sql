-- =====================================================================
-- 2026_09_23_student_device_limit.sql
--
-- Student Device Limit — per-tenant feature, per-student device allowance.
--
-- NOT "MAC address limiting": a browser cannot read hardware identifiers.
-- A *device* here is a browser install that holds a server-minted random
-- token (256 bit). Only its SHA-256 hash is stored.
--
-- How it is enforced (server side, the client is never trusted):
--
--   1. After sign-in the app calls authorize_student_device(token). Under a
--      per-student advisory lock it either recognises the device, registers a
--      new one (if a slot is free) or denies — and on deny deletes the
--      auth session it was called with.
--   2. An authorized call BINDS the caller's auth session (JWT `session_id`)
--      to the device in student_device_sessions.
--   3. current_tenant_id() — used by ~130 RLS policies and the student RPCs —
--      returns NULL for a student of a device-limited tenant whose session is
--      not bound. Such a session therefore sees no tenant data at all, even if
--      the client skips step 1 and talks to PostgREST directly.
--   4. Revoking a device deletes its bindings and its auth sessions, so it
--      loses access immediately (current access token included).
--
-- Feature flag: tenants.config.features.student_device_limit (the existing
-- Super Admin toggle system). Default OFF. Mirrored into a stored generated
-- column so the RLS hot path reads a boolean instead of de-TOASTing config.
--
-- Existing sessions: nothing is registered up front. When the feature is
-- turned on, each student's next app start / login registers that device
-- lazily (first come, first served up to the allowance). Nobody is logged out
-- by the migration itself.
--
-- Idempotent. Rollback: rollback/2026_09_23_student_device_limit_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Feature flag column (read-only mirror of config.features)
-- ---------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS student_device_limit_enabled boolean
  GENERATED ALWAYS AS (
    COALESCE((config -> 'features' -> 'student_device_limit') = 'true'::jsonb, false)
  ) STORED;

-- ---------------------------------------------------------------------
-- 2. Tables. No RLS policies: nothing is reachable through PostgREST; every
--    read/write goes through the SECURITY DEFINER functions below.
-- ---------------------------------------------------------------------

-- Per-student allowance (absent row = default of 1) + last denied attempt,
-- so an admin can see why a student is blocked. Kept off `profiles` on
-- purpose: students can update their own profile row.
CREATE TABLE IF NOT EXISTS public.student_device_settings (
  student_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_devices       smallint NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 10),
  last_denied_at    timestamptz,
  last_denied_label text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid
);

CREATE TABLE IF NOT EXISTS public.student_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash    text NOT NULL,
  platform      text NOT NULL DEFAULT 'Other',
  browser       text NOT NULL DEFAULT 'Other',
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  revoked_by    uuid
);

-- One row per device token, ever: the same device can never be registered twice.
CREATE UNIQUE INDEX IF NOT EXISTS student_devices_token_hash_key
  ON public.student_devices (token_hash);
-- Active-device count and the admin list.
CREATE INDEX IF NOT EXISTS student_devices_student_idx
  ON public.student_devices (student_id, tenant_id, status);

-- Which auth session was authorized on which device. PK lookup on every
-- current_tenant_id() call of a device-limited student.
CREATE TABLE IF NOT EXISTS public.student_device_sessions (
  session_id  uuid PRIMARY KEY,
  device_id   uuid NOT NULL REFERENCES public.student_devices(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_device_sessions_device_idx  ON public.student_device_sessions (device_id);
CREATE INDEX IF NOT EXISTS student_device_sessions_student_idx ON public.student_device_sessions (student_id);

ALTER TABLE public.student_device_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_devices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_device_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_device_settings, public.student_devices, public.student_device_sessions
  FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Session gate
-- ---------------------------------------------------------------------

-- TRUE when the current request's auth session may use tenant data as student
-- p_uid of p_tenant: the tenant has no device limit, or this session was
-- authorized on an active device. Internal — callers pass trusted values.
CREATE OR REPLACE FUNCTION public.device_limit_session_ok(p_uid uuid, p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.tenants t
           WHERE t.id = p_tenant AND t.student_device_limit_enabled
         )
      OR EXISTS (
           SELECT 1 FROM public.student_device_sessions s
           WHERE s.session_id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid
             AND s.student_id = p_uid
             AND s.tenant_id  = p_tenant
         );
$$;
REVOKE EXECUTE ON FUNCTION public.device_limit_session_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Same gate for the caller, for policies and edge functions that do not go
-- through current_tenant_id(). Non-students are always authorized.
CREATE OR REPLACE FUNCTION public.student_session_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT p.role IS DISTINCT FROM 'student'
           OR public.device_limit_session_ok(p.id, p.tenant_id)
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), true);
$$;
REVOKE EXECUTE ON FUNCTION public.student_session_authorized() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_session_authorized() TO authenticated, service_role;

-- current_tenant_id(): unchanged for staff and for tenants without the limit.
-- The gate is inlined (not a call to device_limit_session_ok) because this
-- function runs per row under RLS: inline statements keep cached plans, and
-- staff pay nothing extra, feature-off students one PK lookup.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT tenant_id, role INTO v_tenant_id, v_role FROM public.profiles WHERE id = v_uid;
  -- Student Device Limit: an unauthorized device gets no tenant at all.
  IF v_role = 'student'
     AND EXISTS (SELECT 1 FROM public.tenants t
                 WHERE t.id = v_tenant_id AND t.student_device_limit_enabled)
     AND NOT EXISTS (SELECT 1 FROM public.student_device_sessions s
                     WHERE s.session_id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid
                       AND s.student_id = v_uid
                       AND s.tenant_id  = v_tenant_id) THEN
    RETURN NULL;
  END IF;
  RETURN v_tenant_id;
END;
$function$;

-- The two permissive student SELECT policies that do not use
-- current_tenant_id() (they OR with the tenant policies, so they would
-- otherwise still expose video parts / legacy lectures). Same rules + gate.
DROP POLICY IF EXISTS video_parts_select ON public.video_parts;
CREATE POLICY video_parts_select ON public.video_parts
  FOR SELECT TO authenticated
  USING (
    is_admin() OR (
      public.student_session_authorized() AND EXISTS (
        SELECT 1 FROM public.videos v
        WHERE v.id = video_parts.video_id
          AND v.grade = (SELECT profiles.grade FROM public.profiles WHERE profiles.id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS lectures_select_by_grade ON public.lectures;
CREATE POLICY lectures_select_by_grade ON public.lectures
  FOR SELECT TO authenticated
  USING (
    is_admin() OR (
      public.student_session_authorized()
      AND grade = (SELECT profiles.grade FROM public.profiles WHERE profiles.id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 4. Device authorization (called by the student app after sign-in and on
--    app start). Returns only a status — never ids, hashes or counts.
--      not_required  feature off / not a student
--      allowed       known active device (or session already authorized)
--      registered    new device registered; device_token must be stored
--      denied        allowance reached or device revoked; session deleted
-- ---------------------------------------------------------------------

-- Coarse, non-invasive label from the request's User-Agent header.
CREATE OR REPLACE FUNCTION public.device_label_from_request(OUT platform text, OUT browser text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_ua text;
BEGIN
  BEGIN
    v_ua := NULLIF(current_setting('request.headers', true), '')::json ->> 'user-agent';
  EXCEPTION WHEN others THEN
    v_ua := NULL;
  END;
  v_ua := COALESCE(v_ua, '');

  platform := CASE
    WHEN v_ua ~ 'iPhone|iPod'        THEN 'iPhone'
    WHEN v_ua ~ 'iPad'               THEN 'iPad'
    WHEN v_ua ~ 'Android'            THEN 'Android'
    WHEN v_ua ~ 'Windows'            THEN 'Windows'
    WHEN v_ua ~ 'CrOS'               THEN 'ChromeOS'
    WHEN v_ua ~ 'Macintosh|Mac OS X' THEN 'macOS'
    WHEN v_ua ~ 'Linux'              THEN 'Linux'
    ELSE 'Other'
  END;

  browser := CASE
    WHEN v_ua ~ '; wv\)'                THEN 'App'
    WHEN v_ua ~ 'Edg/|EdgA/|EdgiOS/'    THEN 'Edge'
    WHEN v_ua ~ 'SamsungBrowser/'       THEN 'Samsung Internet'
    WHEN v_ua ~ 'OPR/|OPiOS/'           THEN 'Opera'
    WHEN v_ua ~ 'Firefox/|FxiOS/'       THEN 'Firefox'
    WHEN v_ua ~ 'Chrome/|CriOS/'        THEN 'Chrome'
    WHEN v_ua ~ 'Safari/'               THEN 'Safari'
    ELSE 'Other'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_student_device(p_device_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_sid     uuid := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  v_role    text;
  v_tenant  uuid;
  v_enabled boolean;
  v_dev     public.student_devices%ROWTYPE;
  v_max     int;
  v_active  int;
  v_token   text;
  v_new_id  uuid;
  v_label   record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Role and tenant come from the database, never from the client.
  SELECT role, tenant_id INTO v_role, v_tenant FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'student' THEN
    RETURN jsonb_build_object('status', 'not_required');
  END IF;

  SELECT student_device_limit_enabled INTO v_enabled FROM public.tenants WHERE id = v_tenant;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('status', 'not_required');
  END IF;

  IF v_sid IS NULL THEN
    RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
  END IF;

  -- Serialize every device decision of this student: two browsers logging in
  -- at the same moment cannot both take the last free slot.
  PERFORM pg_advisory_xact_lock(hashtextextended('student_device:' || v_uid::text, 0));

  -- Forget bindings whose auth session has ended (logout, expiry, reset).
  DELETE FROM public.student_device_sessions s
  WHERE s.student_id = v_uid
    AND NOT EXISTS (SELECT 1 FROM auth.sessions a WHERE a.id = s.session_id);

  -- 1. Known token?
  IF p_device_token ~ '^[0-9a-f]{64}$' THEN
    SELECT * INTO v_dev FROM public.student_devices
    WHERE token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
      AND student_id = v_uid
      AND tenant_id  = v_tenant;
  END IF;

  IF v_dev.id IS NOT NULL AND v_dev.status = 'active' THEN
    UPDATE public.student_devices SET last_seen_at = now()
    WHERE id = v_dev.id AND last_seen_at < now() - interval '5 minutes';
    INSERT INTO public.student_device_sessions (session_id, device_id, student_id, tenant_id)
    VALUES (v_sid, v_dev.id, v_uid, v_tenant)
    ON CONFLICT (session_id) DO UPDATE
      SET device_id = EXCLUDED.device_id, student_id = EXCLUDED.student_id, tenant_id = EXCLUDED.tenant_id;
    RETURN jsonb_build_object('status', 'allowed');
  END IF;

  -- 2. This very session was already authorized on an active device (the
  --    browser lost its stored token mid-session). Same browser → allow.
  IF v_dev.id IS NULL AND EXISTS (
       SELECT 1 FROM public.student_device_sessions s
       JOIN public.student_devices d ON d.id = s.device_id
       WHERE s.session_id = v_sid AND s.student_id = v_uid AND s.tenant_id = v_tenant
         AND d.status = 'active'
     ) THEN
    RETURN jsonb_build_object('status', 'allowed');
  END IF;

  SELECT * INTO v_label FROM public.device_label_from_request();

  -- 3. New device (or a revoked one — revocation is final for that token).
  SELECT COALESCE((SELECT max_devices FROM public.student_device_settings
                   WHERE student_id = v_uid AND tenant_id = v_tenant), 1)
    INTO v_max;
  SELECT count(*) INTO v_active FROM public.student_devices
  WHERE student_id = v_uid AND tenant_id = v_tenant AND status = 'active';

  IF v_dev.status = 'revoked' OR v_active >= v_max THEN
    INSERT INTO public.student_device_settings (student_id, tenant_id, last_denied_at, last_denied_label)
    VALUES (v_uid, v_tenant, now(), v_label.platform || ' · ' || v_label.browser)
    ON CONFLICT (student_id) DO UPDATE
      SET last_denied_at = EXCLUDED.last_denied_at, last_denied_label = EXCLUDED.last_denied_label;
    -- End the session this login just created; the app signs out locally.
    DELETE FROM auth.sessions WHERE id = v_sid;
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.student_devices (tenant_id, student_id, token_hash, platform, browser)
  VALUES (v_tenant, v_uid, encode(digest(v_token, 'sha256'), 'hex'), v_label.platform, v_label.browser)
  RETURNING id INTO v_new_id;

  INSERT INTO public.student_device_sessions (session_id, device_id, student_id, tenant_id)
  VALUES (v_sid, v_new_id, v_uid, v_tenant)
  ON CONFLICT (session_id) DO UPDATE
    SET device_id = EXCLUDED.device_id, student_id = EXCLUDED.student_id, tenant_id = EXCLUDED.tenant_id;

  INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, new_values)
  VALUES (v_tenant, v_uid, 'student_device_registered', 'student_devices', v_new_id,
          jsonb_build_object('student_id', v_uid, 'platform', v_label.platform, 'browser', v_label.browser));

  RETURN jsonb_build_object('status', 'registered', 'device_token', v_token);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.authorize_student_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_student_device(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Admin management (existing RBAC: admin, or assistant with the
--    'students' permission, same tenant; super_admin anywhere)
-- ---------------------------------------------------------------------

-- Returns the target student's tenant, or raises.
CREATE OR REPLACE FUNCTION public.device_admin_guard(p_student_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_role   text;
  v_caller_tenant uuid;
  v_target_role   text;
  v_target_tenant uuid;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant FROM public.profiles WHERE id = auth.uid();
  SELECT role, tenant_id INTO v_target_role, v_target_tenant FROM public.profiles WHERE id = p_student_id;

  IF v_target_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'الحساب المطلوب غير موجود أو ليس حساب طالب.';
  END IF;
  IF v_caller_role = 'super_admin' THEN
    RETURN v_target_tenant;
  END IF;
  IF v_caller_tenant IS NULL OR v_caller_tenant IS DISTINCT FROM v_target_tenant
     OR NOT public.has_permission(auth.uid(), 'students') THEN
    RAISE EXCEPTION 'غير مسموح: لا تملك صلاحية إدارة أجهزة هذا الطالب.';
  END IF;
  RETURN v_target_tenant;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.device_admin_guard(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_devices(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.device_admin_guard(p_student_id);
  v_set    public.student_device_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_set FROM public.student_device_settings
  WHERE student_id = p_student_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'enabled',       (SELECT student_device_limit_enabled FROM public.tenants WHERE id = v_tenant),
    'max_devices',   COALESCE(v_set.max_devices, 1),
    'active_count',  (SELECT count(*) FROM public.student_devices
                      WHERE student_id = p_student_id AND tenant_id = v_tenant AND status = 'active'),
    'last_denied_at',    v_set.last_denied_at,
    'last_denied_label', v_set.last_denied_label,
    'devices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'platform', d.platform, 'browser', d.browser, 'status', d.status,
               'created_at', d.created_at, 'last_seen_at', d.last_seen_at, 'revoked_at', d.revoked_at)
             ORDER BY (d.status = 'active') DESC, d.last_seen_at DESC)
      FROM (SELECT * FROM public.student_devices
            WHERE student_id = p_student_id AND tenant_id = v_tenant
            ORDER BY (status = 'active') DESC, last_seen_at DESC
            LIMIT 30) d
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_get_student_devices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_student_devices(uuid) TO authenticated;

-- Lowering the allowance never removes devices: existing registrations stay,
-- new ones are refused until the active count is below the new limit.
CREATE OR REPLACE FUNCTION public.admin_set_student_max_devices(p_student_id uuid, p_max_devices int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.device_admin_guard(p_student_id);
  v_old    int;
BEGIN
  IF p_max_devices IS NULL OR p_max_devices < 1 OR p_max_devices > 10 THEN
    RAISE EXCEPTION 'عدد الأجهزة يجب أن يكون بين 1 و 10.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('student_device:' || p_student_id::text, 0));

  SELECT max_devices INTO v_old FROM public.student_device_settings
  WHERE student_id = p_student_id AND tenant_id = v_tenant;

  INSERT INTO public.student_device_settings (student_id, tenant_id, max_devices, updated_at, updated_by)
  VALUES (p_student_id, v_tenant, p_max_devices, now(), auth.uid())
  ON CONFLICT (student_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id, max_devices = EXCLUDED.max_devices,
        updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

  IF COALESCE(v_old, 1) <> p_max_devices THEN
    INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (v_tenant, auth.uid(), 'student_device_limit_changed', 'profiles', p_student_id,
            jsonb_build_object('max_devices', COALESCE(v_old, 1)),
            jsonb_build_object('max_devices', p_max_devices));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_student_max_devices(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_student_max_devices(uuid, int) TO authenticated;

-- Revoke = device no longer active + its sessions end now (bindings and
-- auth sessions are deleted, so even the current access token loses data).
CREATE OR REPLACE FUNCTION public.admin_revoke_student_device(p_device_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dev    public.student_devices%ROWTYPE;
  v_tenant uuid;
BEGIN
  SELECT * INTO v_dev FROM public.student_devices WHERE id = p_device_id;
  IF v_dev.id IS NULL THEN
    RAISE EXCEPTION 'الجهاز غير موجود.';
  END IF;
  v_tenant := public.device_admin_guard(v_dev.student_id);
  IF v_dev.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'غير مسموح.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('student_device:' || v_dev.student_id::text, 0));

  UPDATE public.student_devices
  SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  WHERE id = p_device_id AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;

  WITH gone AS (
    DELETE FROM public.student_device_sessions WHERE device_id = p_device_id RETURNING session_id
  )
  DELETE FROM auth.sessions a USING gone WHERE a.id = gone.session_id;

  INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_tenant, auth.uid(), 'student_device_revoked', 'student_devices', p_device_id,
          jsonb_build_object('status', 'active'),
          jsonb_build_object('status', 'revoked', 'student_id', v_dev.student_id,
                             'platform', v_dev.platform, 'browser', v_dev.browser));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_student_device(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_student_device(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Audit the feature toggle itself (Super Admin saves tenants.config)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_audit_student_device_limit_toggle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (NEW.id, auth.uid(),
          CASE WHEN NEW.student_device_limit_enabled
               THEN 'student_device_limit_enabled' ELSE 'student_device_limit_disabled' END,
          'tenants', NEW.id,
          jsonb_build_object('enabled', OLD.student_device_limit_enabled),
          jsonb_build_object('enabled', NEW.student_device_limit_enabled));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_student_device_limit_toggle ON public.tenants;
CREATE TRIGGER trg_audit_student_device_limit_toggle
  AFTER UPDATE ON public.tenants
  FOR EACH ROW
  WHEN (OLD.student_device_limit_enabled IS DISTINCT FROM NEW.student_device_limit_enabled)
  EXECUTE FUNCTION public.tg_audit_student_device_limit_toggle();
