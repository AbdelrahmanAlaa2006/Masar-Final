-- ============================================================================
-- 2026_09_17_leads_and_site_events.sql
--
-- Marketing groundwork for the company site (gitfekra.com):
--
--   1. public.leads       — a teacher who asks for a platform. Until now the
--                           only way to reach GitFekra was a mailto: link, so
--                           an interested teacher who did not have mail set up
--                           simply left.
--   2. public.site_events — first-party counting of what visitors do (page
--                           view, WhatsApp click, form submit). No third-party
--                           account needed, no cookies, no personal data.
--
-- Neither table is writable directly by the public. Writes go through two
-- SECURITY DEFINER functions that validate, normalise and rate-limit, so an
-- anon key cannot be used to fill the tables with junk. Reading is super admin
-- only — leads carry a teacher's name and phone.
-- ============================================================================

-- ─── leads ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  phone        text NOT NULL CHECK (char_length(phone) BETWEEN 6 AND 20),
  subject      text CHECK (subject IS NULL OR char_length(subject) <= 120),
  stage        text CHECK (stage IS NULL OR char_length(stage) <= 120),
  message      text CHECK (message IS NULL OR char_length(message) <= 2000),
  source       text NOT NULL DEFAULT 'site_form'
               CHECK (source IN ('site_form', 'whatsapp', 'phone', 'referral', 'other')),
  page         text CHECK (page IS NULL OR char_length(page) <= 300),
  referrer     text CHECK (referrer IS NULL OR char_length(referrer) <= 300),
  utm          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Sales pipeline, so the list doubles as a follow-up board.
  status       text NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'contacted', 'negotiating', 'won', 'lost')),
  notes        text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  handled_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at   timestamptz
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx     ON public.leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_phone_idx      ON public.leads (phone);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- No anon policy on purpose: the only way in is submit_lead().
DROP POLICY IF EXISTS "Super admins manage leads" ON public.leads;
CREATE POLICY "Super admins manage leads" ON public.leads
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ─── site_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL CHECK (char_length(name) <= 60),
  path        text CHECK (path IS NULL OR char_length(path) <= 300),
  referrer    text CHECK (referrer IS NULL OR char_length(referrer) <= 300),
  -- Random per-browser-tab id, so visits can be counted without cookies or
  -- anything that identifies a person.
  session_id  text CHECK (session_id IS NULL OR char_length(session_id) <= 64),
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS site_events_created_at_idx ON public.site_events (created_at DESC);
CREATE INDEX IF NOT EXISTS site_events_name_idx       ON public.site_events (name, created_at DESC);

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read site events" ON public.site_events;
CREATE POLICY "Super admins read site events" ON public.site_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ─── submit_lead ────────────────────────────────────────────────────────────
-- Returns the lead id. Re-sending the same phone within 10 minutes returns the
-- existing row instead of creating a duplicate (double-tap on a phone, or a
-- teacher who submits twice).
CREATE OR REPLACE FUNCTION public.submit_lead(
  p_name     text,
  p_phone    text,
  p_subject  text DEFAULT NULL,
  p_stage    text DEFAULT NULL,
  p_message  text DEFAULT NULL,
  p_source   text DEFAULT 'site_form',
  p_page     text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_utm      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name    text;
  v_phone   text;
  v_recent  uuid;
  v_burst   int;
  v_id      uuid;
BEGIN
  v_name := btrim(coalesce(p_name, ''));
  -- Arabic-Indic digits → Latin, then keep digits and a leading +.
  v_phone := translate(coalesce(p_phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  v_phone := regexp_replace(v_phone, '[^0-9+]', '', 'g');

  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'اكتب اسمك من فضلك.';
  END IF;
  IF char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'رقم الموبايل غير صحيح.';
  END IF;

  -- Cheap flood guard: never accept more than 30 new leads per minute overall.
  SELECT count(*) INTO v_burst FROM public.leads WHERE created_at > now() - interval '1 minute';
  IF v_burst >= 30 THEN
    RAISE EXCEPTION 'حصل ضغط على الفورم دلوقتي، حاول كمان شوية.';
  END IF;

  SELECT id INTO v_recent
  FROM public.leads
  WHERE phone = left(v_phone, 20)
    AND created_at > now() - interval '10 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_recent IS NOT NULL THEN
    RETURN v_recent;
  END IF;

  INSERT INTO public.leads (name, phone, subject, stage, message, source, page, referrer, utm)
  VALUES (
    left(v_name, 120),
    left(v_phone, 20),
    nullif(left(btrim(coalesce(p_subject, '')), 120), ''),
    nullif(left(btrim(coalesce(p_stage, '')), 120), ''),
    nullif(left(btrim(coalesce(p_message, '')), 2000), ''),
    CASE WHEN p_source IN ('site_form', 'whatsapp', 'phone', 'referral', 'other') THEN p_source ELSE 'other' END,
    left(coalesce(p_page, ''), 300),
    left(coalesce(p_referrer, ''), 300),
    coalesce(p_utm, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_lead(text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(text, text, text, text, text, text, text, text, jsonb)
  TO anon, authenticated, service_role;

-- ─── track_site_event ───────────────────────────────────────────────────────
-- Fire-and-forget counting. Unknown event names are ignored rather than
-- rejected, so a stale cached page can never spam the table with new names.
CREATE OR REPLACE FUNCTION public.track_site_event(
  p_name     text,
  p_path     text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_session  text DEFAULT NULL,
  p_meta     jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_burst int;
BEGIN
  IF p_name IS NULL OR p_name NOT IN (
    'page_view', 'whatsapp_click', 'lead_submitted', 'cta_click',
    'work_card_click', 'tour_open', 'contact_email_click'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_burst FROM public.site_events WHERE created_at > now() - interval '1 minute';
  IF v_burst >= 600 THEN
    RETURN;
  END IF;

  INSERT INTO public.site_events (name, path, referrer, session_id, meta)
  VALUES (
    p_name,
    left(coalesce(p_path, ''), 300),
    left(coalesce(p_referrer, ''), 300),
    left(coalesce(p_session, ''), 64),
    coalesce(p_meta, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.track_site_event(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_site_event(text, text, text, text, jsonb)
  TO anon, authenticated, service_role;

SELECT 'leads + site_events ready' AS result;

-- ─── site_events_summary ────────────────────────────────────────────────────
-- Counts for the admin panel. Super admin only: the is_super_admin() check
-- lives in the WHERE clause, so anyone else simply gets no rows back.
CREATE OR REPLACE FUNCTION public.site_events_summary(p_days int DEFAULT 30)
RETURNS TABLE (name text, total bigint, sessions bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.name, count(*)::bigint AS total, count(DISTINCT e.session_id)::bigint AS sessions
  FROM public.site_events e
  WHERE public.is_super_admin(auth.uid())
    AND e.created_at > now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  GROUP BY e.name
  ORDER BY total DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.site_events_summary(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_events_summary(int) TO authenticated, service_role;
-- Supabase grants EXECUTE on new public functions to anon directly, so
-- REVOKE ... FROM PUBLIC alone does not remove it. Staff-only: block anon.
REVOKE EXECUTE ON FUNCTION public.site_events_summary(int) FROM anon;
