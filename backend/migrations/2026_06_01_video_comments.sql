-- =====================================================================
-- Schema: Video Comments & Discussion Board Migration
-- Adds a nested comment system to support student Q&A under videos.
-- =====================================================================

-- 1. Create a secure, tenant-isolated public profiles view
-- Bypasses general profiles RLS to let students fetch names/avatars/roles
-- of comment authors in the same tenant, without exposing phone numbers.
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, name, role, avatar_url, tenant_id FROM public.profiles
WHERE tenant_id = public.current_tenant_id();

-- Grant permissions to access the view
GRANT SELECT ON public.public_profiles TO authenticated;

-- 2. Create the video_comments table
CREATE TABLE IF NOT EXISTS public.video_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.video_comments(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_video_comments_video_id ON public.video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_parent_id ON public.video_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_tenant_id ON public.video_comments(tenant_id);

-- Enable RLS
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;

-- 3. Automatic tenant_id trigger for video_comments
DROP TRIGGER IF EXISTS trig_set_tenant_id_video_comments ON public.video_comments;
CREATE TRIGGER trig_set_tenant_id_video_comments
  BEFORE INSERT
  ON public.video_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_on_insert();

-- 4. RLS Policies

-- Policy: Select comments inside the user's tenant
DROP POLICY IF EXISTS "Tenant select isolation ON video_comments" ON public.video_comments;
CREATE POLICY "Tenant select isolation ON video_comments" ON public.video_comments
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- Policy: Insert comments under the user's own profile and tenant
DROP POLICY IF EXISTS "Tenant insert isolation ON video_comments" ON public.video_comments;
CREATE POLICY "Tenant insert isolation ON video_comments" ON public.video_comments
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

-- Policy: Update comments (must own the comment or be an admin)
DROP POLICY IF EXISTS "Tenant update isolation ON video_comments" ON public.video_comments;
CREATE POLICY "Tenant update isolation ON video_comments" ON public.video_comments
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND (profile_id = auth.uid() OR public.is_current_user_admin())
  );

-- Policy: Delete comments (must own the comment or be an admin)
DROP POLICY IF EXISTS "Tenant delete isolation ON video_comments" ON public.video_comments;
CREATE POLICY "Tenant delete isolation ON video_comments" ON public.video_comments
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND (profile_id = auth.uid() OR public.is_current_user_admin())
  );

-- Grant authenticated roles permissions to perform operations
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_comments TO authenticated;
