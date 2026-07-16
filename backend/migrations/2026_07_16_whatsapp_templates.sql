-- ============================================================================
-- 2026_07_16_whatsapp_templates.sql
-- Create whatsapp_templates table supporting multi-tenant template versioning
-- and add grade_id referencing grades(id) to unified_notifications.
-- ============================================================================

-- 1. Create the whatsapp_templates table
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'attendance_absent', 'attendance_makeup', 'quiz', 'exam', 'homework', 'payment', 'behavior', 'participation', 'general'
  )),
  template TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for optimized template queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_lookup 
  ON public.whatsapp_templates(tenant_id, notification_type, is_active);

-- Prevent concurrent active templates for the same tenant and type
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_templates_active_unique 
  ON public.whatsapp_templates (tenant_id, notification_type) 
  WHERE (is_active = true);

-- 2. Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- 3. Setup dynamic tenant_id triggers
DROP TRIGGER IF EXISTS trig_set_tenant_id_whatsapp_templates ON public.whatsapp_templates;
CREATE TRIGGER trig_set_tenant_id_whatsapp_templates
  BEFORE INSERT ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

-- 4. Setup RLS Policy
DROP POLICY IF EXISTS "Whatsapp templates staff" ON public.whatsapp_templates;
CREATE POLICY "Whatsapp templates staff" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'whatsapp'));

-- 5. Extend unified_notifications table to link future grade notification rows directly to grades
ALTER TABLE public.unified_notifications 
  ADD COLUMN IF NOT EXISTS grade_id UUID REFERENCES public.grades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_unified_notifications_grade_id
  ON public.unified_notifications(grade_id);
