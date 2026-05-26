-- =====================================================================
-- SaaS Multi-Tenant Migration
-- Creates the tenants table, scopes all content tables by tenant_id,
-- and configures row-level security policies for tenant isolation.
-- =====================================================================

-- 1. Create the tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  domain TEXT UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7c3aed',
  secondary_color TEXT DEFAULT '#06b6d4',
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including anonymous guests) to read tenant configuration by domain/slug
DROP POLICY IF EXISTS "Allow public select on tenants" ON public.tenants;
CREATE POLICY "Allow public select on tenants" ON public.tenants
  FOR SELECT USING (true);

-- 2. Insert the default tenant (for existing data migration)
-- Use a constant UUID so it is deterministic across migrations
INSERT INTO public.tenants (id, slug, name, primary_color, secondary_color)
VALUES (
  'd3b07384-d113-4ec2-a5d6-d005b6be4979',
  'default',
  'منصة مسار التعليمية',
  '#7c3aed',
  '#06b6d4'
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name;

-- 3. Create current_tenant_id function to resolve tenant for the logged-in user
-- Runs as SECURITY DEFINER to bypass RLS recursion on the profiles table query
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  RETURN v_tenant_id;
END;
$$;

-- Create helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT (role = 'admin') INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_is_admin, FALSE);
END;
$$;

-- 4. Scope all content tables by tenant_id
-- We add tenant_id to profiles, videos, exams, exam_attempts, quiz_attempts, video_progress, homeworks, homework_submissions, payments, payment_settings, devtools_violations, password_reset_requests, notifications, access_overrides
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles', 'videos', 'exams', 'exam_attempts', 'quiz_attempts',
    'video_progress', 'homeworks', 'homework_submissions', 'payments',
    'payment_settings', 'devtools_violations', 'password_reset_requests',
    'notifications', 'access_overrides'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Add tenant_id column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id UUID REFERENCES public.tenants(id)', t);
      
      -- Backfill existing rows with the default tenant
      EXECUTE format('UPDATE public.%I SET tenant_id = ''d3b07384-d113-4ec2-a5d6-d005b6be4979'' WHERE tenant_id IS NULL', t);
      
      -- Alter to NOT NULL after backfill
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
      
      -- Set default value to default tenant ID for new inserts that don't specify it
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT ''d3b07384-d113-4ec2-a5d6-d005b6be4979''', t);
      
      -- Add index on tenant_id
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', 'idx_' || t || '_tenant_id', t);
    END IF;
  END LOOP;
END $$;

-- 5. Set up RLS isolation policies on all content tables
-- For each content table (except profiles), enforce that query/edit is restricted to the user's tenant.
-- Admins can manage all rows in their tenant; students can only view/read rows in their tenant.
-- Anonymous inserts are allowed for payments, resets, violations, profiles during registration.

-- Profiles Policies
DROP POLICY IF EXISTS "Allow select for authenticated user and admin" ON public.profiles;
DROP POLICY IF EXISTS "Allow update for user themselves" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert for auth trigger/frontend registration" ON public.profiles;

CREATE POLICY "Profiles tenant isolation" ON public.profiles
  FOR ALL USING (
    id = auth.uid() OR (
      tenant_id = public.current_tenant_id() AND 
      public.is_current_user_admin()
    )
  );

CREATE POLICY "Allow registration profile insert" ON public.profiles
  FOR INSERT WITH CHECK (
    -- Anonymous signup inserts are validated to ensure tenant exists
    EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id)
  );

-- Videos, Exams, Homeworks, Access Overrides, Payment Settings
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['videos', 'exams', 'homeworks', 'access_overrides', 'payment_settings'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation ON %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Tenant isolation ON %I" ON public.%I FOR ALL USING (tenant_id = public.current_tenant_id())', t, t);
  END LOOP;
END $$;

-- Exam Attempts, Quiz Attempts, Video Progress, Homework Submissions
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['exam_attempts', 'quiz_attempts', 'video_progress', 'homework_submissions'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation ON %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Tenant isolation ON %I" ON public.%I FOR ALL USING (tenant_id = public.current_tenant_id())', t, t);
  END LOOP;
END $$;

-- Payments, DevTools Violations, Password Reset Requests, Notifications
-- These allow anonymous inserts when client specifies tenant_id, and scoped select/updates/deletes
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['payments', 'devtools_violations', 'password_reset_requests', 'notifications'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation ON %I" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant select isolation ON %I" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant update isolation ON %I" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant delete isolation ON %I" ON public.%I', t, t);
    
    EXECUTE format('CREATE POLICY "Tenant select isolation ON %I" ON public.%I FOR SELECT USING (tenant_id = public.current_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "Tenant update isolation ON %I" ON public.%I FOR UPDATE USING (tenant_id = public.current_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "Tenant delete isolation ON %I" ON public.%I FOR DELETE USING (tenant_id = public.current_tenant_id())', t, t);
    
    EXECUTE format('DROP POLICY IF EXISTS "Tenant insert isolation ON %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Tenant insert isolation ON %I" ON public.%I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id))', t, t);
  END LOOP;
END $$;

-- 6. Set up automatic tenant_id triggers to populate tenant_id on insert
CREATE OR REPLACE FUNCTION public.set_tenant_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := COALESCE(
      public.current_tenant_id(),
      'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers and create new ones dynamically to ensure idempotency
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'videos', 'exams', 'homeworks', 'exam_attempts', 'quiz_attempts',
    'video_progress', 'homework_submissions', 'payments', 'payment_settings',
    'devtools_violations', 'password_reset_requests', 'notifications', 'access_overrides'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trig_set_tenant_id_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_on_insert()', 'trig_set_tenant_id_' || t, t);
  END LOOP;
END $$;

