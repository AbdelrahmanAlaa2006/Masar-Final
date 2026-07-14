-- ============================================================================
-- 2026_07_14_scanner_diagnostics.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- TEMPORARY evidence collection for the attendance barcode-scanner problem.
-- Every FAILED scan lookup automatically stores its full diagnostic report
-- here (raw keystrokes, char codes, normalization stages, lookup payload,
-- probe results — no secrets/tokens). The developer reads reports remotely:
--
--   select created_at, report from public.scanner_diagnostics
--   order by created_at desc limit 5;
--
-- Drop the table once the scanner issue is definitively closed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scanner_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report TEXT NOT NULL,
  raw_input TEXT,
  final_lookup_value TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scanner_diagnostics_tenant_created
  ON public.scanner_diagnostics(tenant_id, created_at DESC);

ALTER TABLE public.scanner_diagnostics ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trig_set_tenant_id_scanner_diagnostics ON public.scanner_diagnostics;
CREATE TRIGGER trig_set_tenant_id_scanner_diagnostics
  BEFORE INSERT ON public.scanner_diagnostics
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

-- Staff who can take attendance may file and view their tenant's reports.
DROP POLICY IF EXISTS "Scanner diagnostics staff" ON public.scanner_diagnostics;
CREATE POLICY "Scanner diagnostics staff" ON public.scanner_diagnostics
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'attendance'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(auth.uid(), 'attendance'));
