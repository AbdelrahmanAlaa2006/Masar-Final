-- =====================================================================
-- 2026_07_01_playlists_packages.sql
-- Run in Supabase SQL editor to enable content playlists, packages, 
-- online purchases, and database-level content visibility controls.
-- =====================================================================

-- 1. Create playlists table
CREATE TABLE IF NOT EXISTS public.playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create playlist_items table
CREATE TABLE IF NOT EXISTS public.playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'exam', 'homework')),
  content_id UUID NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT playlist_items_uniq UNIQUE(playlist_id, content_type, content_id)
);

-- 3. Create packages table
CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN DEFAULT true NOT NULL,
  thumbnail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create package_items table
CREATE TABLE IF NOT EXISTS public.package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('playlist', 'video', 'exam', 'homework')),
  item_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT package_items_uniq UNIQUE(package_id, item_type, item_id)
);

-- 5. Create student_content_access table
CREATE TABLE IF NOT EXISTS public.student_content_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'exam', 'homework')),
  content_id UUID NOT NULL,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'package', 'admin')),
  source_id UUID,
  CONSTRAINT student_content_access_uniq UNIQUE(student_id, content_type, content_id, source_type, source_id)
);

-- 6. Create package_purchases table
CREATE TABLE IF NOT EXISTS public.package_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('InstaPay', 'Vodafone Cash', 'Cash', 'Other')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'rejected')),
  screenshot_url TEXT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_playlists_tenant ON public.playlists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON public.playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_packages_tenant ON public.packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_package_items_package ON public.package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_student_content_access_lookup ON public.student_content_access(student_id, content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_package_purchases_lookup ON public.package_purchases(student_id, package_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_content_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_purchases ENABLE ROW LEVEL SECURITY;

-- Auto-assign tenant_id triggers
CREATE TRIGGER trig_set_tenant_id_playlists BEFORE INSERT ON public.playlists FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();
CREATE TRIGGER trig_set_tenant_id_playlist_items BEFORE INSERT ON public.playlist_items FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();
CREATE TRIGGER trig_set_tenant_id_packages BEFORE INSERT ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();
CREATE TRIGGER trig_set_tenant_id_package_items BEFORE INSERT ON public.package_items FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();
CREATE TRIGGER trig_set_tenant_id_student_content_access BEFORE INSERT ON public.student_content_access FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();
CREATE TRIGGER trig_set_tenant_id_package_purchases BEFORE INSERT ON public.package_purchases FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert();

-- Access checker helper function
CREATE OR REPLACE FUNCTION public.has_content_access(p_user_id UUID, p_content_type TEXT, p_content_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
  v_grade TEXT;
  v_group TEXT;
BEGIN
  -- 1. Check if user is admin or assistant
  IF public.is_current_user_admin() THEN
    RETURN TRUE;
  END IF;

  -- Fetch student's grade and group
  SELECT grade, "group" INTO v_grade, v_group FROM public.profiles WHERE id = p_user_id;

  -- 2. Check access overrides for student scope (highest priority manual override)
  SELECT allowed INTO v_allowed FROM public.access_overrides 
  WHERE scope = 'student' AND target_id = p_user_id::text AND item_type = p_content_type AND item_id = p_content_id;
  
  IF v_allowed IS NOT NULL THEN
    RETURN v_allowed;
  END IF;

  -- 3. Check access overrides for group scope
  IF v_group IS NOT NULL THEN
    SELECT allowed INTO v_allowed FROM public.access_overrides 
    WHERE scope = 'group' AND target_id = (v_grade || ':' || v_group) AND item_type = p_content_type AND item_id = p_content_id;
    
    IF v_allowed IS NOT NULL THEN
      RETURN v_allowed;
    END IF;
  END IF;

  -- 4. Check access overrides for prep/grade scope
  IF v_grade IS NOT NULL THEN
    SELECT allowed INTO v_allowed FROM public.access_overrides 
    WHERE scope = 'prep' AND target_id = v_grade AND item_type = p_content_type AND item_id = p_content_id;
    
    IF v_allowed IS NOT NULL THEN
      RETURN v_allowed;
    END IF;
  END IF;

  -- 5. Check if student has valid student_content_access record
  RETURN EXISTS (
    SELECT 1 FROM public.student_content_access 
    WHERE student_id = p_user_id AND content_type = p_content_type AND content_id = p_content_id
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Trigger to sync access on purchase approval
CREATE OR REPLACE FUNCTION public.sync_access_on_purchase_approve()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_sub_item RECORD;
BEGIN
  IF NEW.payment_status = 'approved' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'approved') THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    
    -- Find all package items
    FOR v_item IN 
      SELECT item_type, item_id FROM public.package_items WHERE package_id = NEW.package_id
    LOOP
      IF v_item.item_type = 'playlist' THEN
        -- If item is a playlist, grant access to all its content items
        FOR v_sub_item IN 
          SELECT content_type, content_id FROM public.playlist_items WHERE playlist_id = v_item.item_id
        LOOP
          INSERT INTO public.student_content_access (
            tenant_id, student_id, content_type, content_id, granted_by, granted_at, source_type, source_id
          ) VALUES (
            NEW.tenant_id, NEW.student_id, v_sub_item.content_type, v_sub_item.content_id, NEW.approved_by, now(), 'package', NEW.package_id
          ) ON CONFLICT (student_id, content_type, content_id, source_type, source_id) DO NOTHING;
        END LOOP;
      ELSE
        -- Standalone item (video, exam, homework)
        INSERT INTO public.student_content_access (
          tenant_id, student_id, content_type, content_id, granted_by, granted_at, source_type, source_id
        ) VALUES (
          NEW.tenant_id, NEW.student_id, v_item.item_type, v_item.item_id, NEW.approved_by, now(), 'package', NEW.package_id
        ) ON CONFLICT (student_id, content_type, content_id, source_type, source_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trig_sync_access_on_purchase_approve
BEFORE UPDATE ON public.package_purchases
FOR EACH ROW EXECUTE FUNCTION public.sync_access_on_purchase_approve();

-- Trigger for package_items updates propagating to students who bought the package
CREATE OR REPLACE FUNCTION public.sync_access_on_package_item_change()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase RECORD;
  v_sub_item RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Grant new item access to all students who have approved purchases of this package
    FOR v_purchase IN 
      SELECT student_id, tenant_id, approved_by FROM public.package_purchases 
      WHERE package_id = NEW.package_id AND payment_status = 'approved'
    LOOP
      IF NEW.item_type = 'playlist' THEN
        FOR v_sub_item IN 
          SELECT content_type, content_id FROM public.playlist_items WHERE playlist_id = NEW.item_id
        LOOP
          INSERT INTO public.student_content_access (
            tenant_id, student_id, content_type, content_id, granted_by, granted_at, source_type, source_id
          ) VALUES (
            v_purchase.tenant_id, v_purchase.student_id, v_sub_item.content_type, v_sub_item.content_id, v_purchase.approved_by, now(), 'package', NEW.package_id
          ) ON CONFLICT (student_id, content_type, content_id, source_type, source_id) DO NOTHING;
        END LOOP;
      ELSE
        INSERT INTO public.student_content_access (
          tenant_id, student_id, content_type, content_id, granted_by, granted_at, source_type, source_id
        ) VALUES (
          v_purchase.tenant_id, v_purchase.student_id, NEW.item_type, NEW.item_id, v_purchase.approved_by, now(), 'package', NEW.package_id
        ) ON CONFLICT (student_id, content_type, content_id, source_type, source_id) DO NOTHING;
      END IF;
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    -- Remove content access granted by this package
    IF OLD.item_type = 'playlist' THEN
      DELETE FROM public.student_content_access 
      WHERE source_type = 'package' AND source_id = OLD.package_id AND content_id IN (
        SELECT content_id FROM public.playlist_items WHERE playlist_id = OLD.item_id
      );
    ELSE
      DELETE FROM public.student_content_access 
      WHERE source_type = 'package' AND source_id = OLD.package_id AND content_type = OLD.item_type AND content_id = OLD.item_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trig_sync_access_on_package_item_change
AFTER INSERT OR DELETE ON public.package_items
FOR EACH ROW EXECUTE FUNCTION public.sync_access_on_package_item_change();

-- Trigger for playlist_items updates propagating to students who bought the containing package
CREATE OR REPLACE FUNCTION public.sync_access_on_playlist_item_change()
RETURNS TRIGGER AS $$
DECLARE
  v_pkg_item RECORD;
  v_purchase RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR v_pkg_item IN 
      SELECT package_id FROM public.package_items WHERE item_type = 'playlist' AND item_id = NEW.playlist_id
    LOOP
      FOR v_purchase IN 
        SELECT student_id, tenant_id, approved_by FROM public.package_purchases 
        WHERE package_id = v_pkg_item.package_id AND payment_status = 'approved'
      LOOP
        INSERT INTO public.student_content_access (
          tenant_id, student_id, content_type, content_id, granted_by, granted_at, source_type, source_id
        ) VALUES (
          v_purchase.tenant_id, v_purchase.student_id, NEW.content_type, NEW.content_id, v_purchase.approved_by, now(), 'package', v_pkg_item.package_id
        ) ON CONFLICT (student_id, content_type, content_id, source_type, source_id) DO NOTHING;
      END LOOP;
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR v_pkg_item IN 
      SELECT package_id FROM public.package_items WHERE item_type = 'playlist' AND item_id = OLD.playlist_id
    LOOP
      DELETE FROM public.student_content_access 
      WHERE source_type = 'package' AND source_id = v_pkg_item.package_id AND content_type = OLD.content_type AND content_id = OLD.content_id;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trig_sync_access_on_playlist_item_change
AFTER INSERT OR DELETE ON public.playlist_items
FOR EACH ROW EXECUTE FUNCTION public.sync_access_on_playlist_item_change();

-- Multi-Tenant RLS Policies for New Tables

-- Playlists
CREATE POLICY "Playlists isolation select" ON public.playlists FOR SELECT 
  USING (tenant_id = public.current_tenant_id() AND (public.is_current_user_admin() OR is_active = true));
CREATE POLICY "Playlists isolation write" ON public.playlists FOR ALL 
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

-- Playlist Items
CREATE POLICY "Playlist items isolation select" ON public.playlist_items FOR SELECT 
  USING (tenant_id = public.current_tenant_id() AND (public.is_current_user_admin() OR public.has_content_access(auth.uid(), content_type, content_id)));
CREATE POLICY "Playlist items isolation write" ON public.playlist_items FOR ALL 
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

-- Packages
CREATE POLICY "Packages isolation select" ON public.packages FOR SELECT 
  USING (tenant_id = public.current_tenant_id() AND (public.is_current_user_admin() OR is_active = true));
CREATE POLICY "Packages isolation write" ON public.packages FOR ALL 
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

-- Package Items
CREATE POLICY "Package items isolation select" ON public.package_items FOR SELECT 
  USING (tenant_id = public.current_tenant_id() AND (public.is_current_user_admin() OR EXISTS (SELECT 1 FROM public.packages WHERE id = package_id AND is_active = true)));
CREATE POLICY "Package items isolation write" ON public.package_items FOR ALL 
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

-- Student Content Access
CREATE POLICY "Student content access isolation select" ON public.student_content_access FOR SELECT 
  USING (tenant_id = public.current_tenant_id() AND (public.is_current_user_admin() OR student_id = auth.uid()));
CREATE POLICY "Student content access isolation write" ON public.student_content_access FOR ALL 
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());

-- Package Purchases
CREATE POLICY "Package purchases isolation select" ON public.package_purchases FOR SELECT 
  USING (tenant_id = public.current_tenant_id() AND (public.is_current_user_admin() OR student_id = auth.uid()));
CREATE POLICY "Package purchases isolation insert" ON public.package_purchases FOR INSERT 
  WITH CHECK (tenant_id = public.current_tenant_id() AND student_id = auth.uid() AND payment_status = 'pending');
CREATE POLICY "Package purchases isolation write" ON public.package_purchases FOR ALL 
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());


-- 7. Update Select RLS Policies on Content Tables

-- Videos
DROP POLICY IF EXISTS "Tenant isolation ON videos" ON public.videos;
CREATE POLICY "Tenant write isolation ON videos" ON public.videos FOR ALL 
  USING (tenant_id = public.current_tenant_id() AND public.is_current_user_admin());
CREATE POLICY "Tenant select isolation ON videos" ON public.videos FOR SELECT
  USING (
    tenant_id = public.current_tenant_id() AND (
      public.is_current_user_admin() OR
      public.has_content_access(auth.uid(), 'video', id)
    )
  );

-- Exams
DROP POLICY IF EXISTS "Tenant select isolation ON exams" ON public.exams;
CREATE POLICY "Tenant select isolation ON exams" ON public.exams FOR SELECT
  USING (
    tenant_id = public.current_tenant_id() AND (
      public.is_current_user_admin() OR
      public.has_content_access(auth.uid(), 'exam', id)
    )
  );

-- Homeworks
DROP POLICY IF EXISTS hw_select_grade_or_admin ON public.homeworks;
CREATE POLICY hw_select_grade_or_admin ON public.homeworks FOR SELECT
  USING (
    tenant_id = public.current_tenant_id() AND (
      public.is_current_user_admin() OR
      public.has_content_access(auth.uid(), 'homework', id)
    )
  );
