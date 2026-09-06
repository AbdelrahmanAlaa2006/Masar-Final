-- =====================================================================
-- 2026_09_06_tenant_suspension.sql
-- Adds platform status column (active / suspended) and management RPC
-- =====================================================================

-- 1. Add status column to tenants if not exists
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. Backfill null statuses to 'active'
UPDATE public.tenants SET status = 'active' WHERE status IS NULL;

-- 3. Stored procedure to toggle tenant status
CREATE OR REPLACE FUNCTION public.set_tenant_status(
  p_tenant_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_slug TEXT;
BEGIN
  -- Verify caller is super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون سوبر أدمن لتعديل حالة المنصة.';
  END IF;

  -- Validate status value
  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'حالة غير صالحة: يجب أن تكون active أو suspended';
  END IF;

  SELECT slug INTO v_tenant_slug FROM public.tenants WHERE id = p_tenant_id;
  IF v_tenant_slug IS NULL THEN
    RAISE EXCEPTION 'المنصة غير موجودة.';
  END IF;

  -- Default tenant cannot be suspended
  IF v_tenant_slug = 'default' AND p_status = 'suspended' THEN
    RAISE EXCEPTION 'لا يمكن إيقاف المنصة الافتراضية للنظام (default).';
  END IF;

  -- Update column and config JSONB for complete consistency
  UPDATE public.tenants
  SET status = p_status,
      config = jsonb_set(COALESCE(config, '{}'::jsonb), '{status}', to_jsonb(p_status))
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_status(UUID, TEXT) TO authenticated, service_role;
