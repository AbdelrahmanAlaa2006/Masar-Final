-- ============================================================
-- 2026_05_30_add_approved_column.sql
-- Run once in the Supabase SQL editor.
--
-- Adds account approval system:
--   1. Adds `is_approved` boolean column to public.profiles (not null, default false).
--   2. Backfills existing profiles to `is_approved = true`.
--   3. Updates trigger function `handle_new_user()` to:
--        - set `is_approved` to false by default for self-registered students
--        - set `is_approved` to true if the role is 'admin' or if specified in metadata.
-- ============================================================

-- 1. Add is_approved column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill existing profiles as approved (prevent locking out existing active/inactive students)
UPDATE public.profiles SET is_approved = true;

-- 3. Redefine the trigger function on user creation to include is_approved column
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_is_approved BOOLEAN;
BEGIN
  v_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  
  -- Admins are auto-approved. Students are pending (false) unless explicitly approved in metadata
  IF v_role = 'admin' THEN
    v_is_approved := true;
  ELSE
    v_is_approved := coalesce((new.raw_user_meta_data->>'is_approved')::boolean, false);
  END IF;

  INSERT INTO public.profiles (id, name, phone, role, tenant_id, grade, is_active, is_approved)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_role,
    coalesce((new.raw_user_meta_data->>'tenant_id')::uuid, 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid),
    new.raw_user_meta_data->>'grade',
    false, -- New students are inactive (hasn't paid)
    v_is_approved -- Awaiting admin approval (false) or approved (true)
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    tenant_id = EXCLUDED.tenant_id,
    grade = EXCLUDED.grade;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
