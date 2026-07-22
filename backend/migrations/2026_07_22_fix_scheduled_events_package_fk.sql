-- =====================================================================
-- 2026_07_22_fix_scheduled_events_package_fk.sql
-- Fix scheduled_events.package_id foreign key to point to public.packages
-- instead of legacy public.packages_v2.
-- =====================================================================

ALTER TABLE public.scheduled_events 
  DROP CONSTRAINT IF EXISTS scheduled_events_package_id_fkey;

ALTER TABLE public.scheduled_events 
  ADD CONSTRAINT scheduled_events_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL;
