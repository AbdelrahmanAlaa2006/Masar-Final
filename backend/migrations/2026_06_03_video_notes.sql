-- =====================================================================
-- Schema: Personal Video Notes & Timestamps
-- Adds a video_notes table to store private timestamped student notes.
-- =====================================================================

-- Drop the old table if it exists to ensure a fresh, clean schema recreation
DROP TABLE IF EXISTS public.video_notes CASCADE;

CREATE TABLE public.video_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.video_parts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  timestamp_seconds INT NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for speed
CREATE INDEX IF NOT EXISTS idx_video_notes_profile_id ON public.video_notes(profile_id);
CREATE INDEX IF NOT EXISTS idx_video_notes_part_id ON public.video_notes(part_id);
CREATE INDEX IF NOT EXISTS idx_video_notes_tenant_id ON public.video_notes(tenant_id);

-- Enable RLS
ALTER TABLE public.video_notes ENABLE ROW LEVEL SECURITY;

-- Automatic tenant_id trigger on insert
DROP TRIGGER IF EXISTS trig_set_tenant_id_video_notes ON public.video_notes;
CREATE TRIGGER trig_set_tenant_id_video_notes
  BEFORE INSERT
  ON public.video_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_on_insert();

-- RLS Policies

-- Policy: Select notes (all authenticated users in the tenant see the notes)
DROP POLICY IF EXISTS "Tenant select isolation ON video_notes" ON public.video_notes;
CREATE POLICY "Tenant select isolation ON video_notes" ON public.video_notes
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
  );

-- Policy: Insert notes (only admins/teachers can insert notes)
DROP POLICY IF EXISTS "Tenant insert isolation ON video_notes" ON public.video_notes;
CREATE POLICY "Tenant insert isolation ON video_notes" ON public.video_notes
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.is_current_user_admin()
  );

-- Policy: Delete notes (only admins/teachers can delete notes)
DROP POLICY IF EXISTS "Tenant delete isolation ON video_notes" ON public.video_notes;
CREATE POLICY "Tenant delete isolation ON public.video_notes" ON public.video_notes
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND public.is_current_user_admin()
  );

-- Grant privileges
GRANT SELECT, INSERT, DELETE ON public.video_notes TO authenticated;
