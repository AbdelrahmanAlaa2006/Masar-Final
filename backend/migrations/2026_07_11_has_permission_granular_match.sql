-- ============================================================================
-- 2026_07_11_has_permission_granular_match.sql
-- Run once in the Supabase SQL editor. Idempotent.
--
-- WHY:
-- The Assistants panel (AssistantsPanel.jsx) stores GRANULAR permission keys in
-- tenant_admins.permissions, e.g. 'videos:view', 'videos:edit', 'attendance:take'.
-- But the RLS write policies (and the control-panel tab gates) ask for the
-- COARSE key: has_permission(auth.uid(), 'videos'). The old function did
-- `p_permission = ANY(v_perms)`, so 'videos' never matched 'videos:edit' and an
-- assistant granted permissions from the panel still couldn't do anything.
--
-- FIX:
-- Treat a coarse permission as satisfied by the coarse key itself OR by any
-- granular key in that category ('videos:%'). This matches the frontend
-- AuthContext.hasPermission change. The current RLS model is all-or-nothing per
-- category (policies are FOR ALL gated on the coarse key), so granting any
-- 'videos:*' correctly implies full videos access — consistent, not an
-- over-grant. role='admin' still short-circuits to full access.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_perms TEXT[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;

  IF v_role = 'admin' THEN
    RETURN TRUE; -- Primary admin (teacher) has all permissions
  ELSIF v_role = 'assistant' THEN
    SELECT permissions INTO v_perms FROM public.tenant_admins WHERE user_id = p_user_id;
    IF v_perms IS NULL THEN
      RETURN FALSE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM unnest(v_perms) AS perm
      WHERE perm = p_permission                 -- exact (coarse or granular) match
         OR perm LIKE p_permission || ':%'      -- any granular grant in this category
    );
  END IF;

  RETURN FALSE;
END;
$$;
