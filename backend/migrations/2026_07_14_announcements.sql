-- ============================================================================
-- 2026_07_14_announcements.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Manual announcements (WhatsApp + portal) with saved messages & templates.
-- Reuses the EXISTING delivery rails — the portal `notifications` table for
-- in-app fan-out and the `unified_notifications` WhatsApp queue — instead of
-- building a parallel messaging system.
--
--   1. message_templates : saved messages (kind='saved') and placeholder
--      templates (kind='template') — reusable / editable / deletable /
--      searchable / optionally categorized. Tenant-scoped, 'whatsapp' staff.
--   2. announcements     : audit log of every manual send (scope, targets,
--      channels, recipient counts).
--   3. unified_notifications extensions:
--        recipient       'parent' | 'student' (who the WhatsApp goes to)
--        recipient_phone phone snapshot resolved at queue time; every sender
--                        uses COALESCE(recipient_phone, profiles.parent_phone)
--                        so ALL pre-existing rows keep working unchanged.
--        announcement_id backlink for auditing/status per announcement.
--        type CHECK gains 'announcement'.
--   4. REGRESSION FIX: 2026_07_11_notifications_tenant_scope.sql recreated
--      notifications_select_targeted WITHOUT the scope='group' branch that
--      group_scope.sql had added, so group-targeted portal notifications are
--      currently invisible to students. Restored here WITH tenant scoping.
-- ============================================================================

-- 1) Saved messages & templates ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'saved' CHECK (kind IN ('saved', 'template')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant_kind
  ON public.message_templates(tenant_id, kind, created_at DESC);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_message_templates ON public.message_templates;
CREATE TRIGGER trig_set_tenant_id_message_templates
  BEFORE INSERT ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP POLICY IF EXISTS "Message templates staff" ON public.message_templates;
CREATE POLICY "Message templates staff" ON public.message_templates
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'));

-- 2) Announcements audit log ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Targeting mirrors the portal notifications model so new scopes can be
  -- added in one place later.
  scope TEXT NOT NULL CHECK (scope IN ('all', 'grade', 'group', 'student')),
  target_grade TEXT,
  target_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  target_student UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  channels TEXT[] NOT NULL DEFAULT '{portal,whatsapp}',
  recipients_total INT NOT NULL DEFAULT 0,
  whatsapp_queued INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_tenant_created
  ON public.announcements(tenant_id, created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_announcements ON public.announcements;
CREATE TRIGGER trig_set_tenant_id_announcements
  BEFORE INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

DROP POLICY IF EXISTS "Announcements staff" ON public.announcements;
CREATE POLICY "Announcements staff" ON public.announcements
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'));

-- 3) unified_notifications queue extensions ------------------------------------
ALTER TABLE public.unified_notifications
  ADD COLUMN IF NOT EXISTS recipient TEXT NOT NULL DEFAULT 'parent'
    CHECK (recipient IN ('parent', 'student'));
ALTER TABLE public.unified_notifications
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE public.unified_notifications
  ADD COLUMN IF NOT EXISTS announcement_id UUID
    REFERENCES public.announcements(id) ON DELETE SET NULL;

-- Allow the new 'announcement' type (recreate the CHECK additively).
ALTER TABLE public.unified_notifications
  DROP CONSTRAINT IF EXISTS unified_notifications_type_check;
ALTER TABLE public.unified_notifications
  ADD CONSTRAINT unified_notifications_type_check CHECK (type IN (
    'attendance_absent', 'attendance_makeup', 'grade_added',
    'payment_warning', 'low_performance', 'general', 'announcement'
  ));

-- Fast queue drains: only pending-whatsapp rows are indexed.
CREATE INDEX IF NOT EXISTS idx_unified_notifications_wa_pending
  ON public.unified_notifications(tenant_id, created_at)
  WHERE (status->>'whatsapp') = 'pending';

CREATE INDEX IF NOT EXISTS idx_unified_notifications_announcement
  ON public.unified_notifications(announcement_id)
  WHERE announcement_id IS NOT NULL;

-- 4a) Let assistants (secretaries) with the 'whatsapp' permission publish
--     portal announcements. notifications_admin_write only covers
--     role='admin' (is_admin()), so assistant sends would silently fail the
--     portal channel. Additive INSERT-only policy, tenant-scoped;
--     has_permission() already returns true for admins as well.
DROP POLICY IF EXISTS notifications_whatsapp_staff_insert ON public.notifications;
CREATE POLICY notifications_whatsapp_staff_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'));

-- 4b) Portal notifications: restore the scope='group' visibility branch --------
--    (kept tenant-scoped exactly like 2026_07_11_notifications_tenant_scope).
DROP POLICY IF EXISTS notifications_select_targeted ON public.notifications;
CREATE POLICY notifications_select_targeted ON public.notifications
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.is_admin()
      OR scope = 'all'
      OR (scope = 'student' AND target_student = auth.uid())
      OR (scope = 'grade'   AND target_grade =
            (SELECT grade FROM public.profiles WHERE id = auth.uid()))
      OR (scope = 'group'   AND target_group =
            (SELECT coalesce(grade, '') || ':' || coalesce("group", '')
               FROM public.profiles WHERE id = auth.uid()))
    )
  );
