-- ============================================================
-- 2026_05_28_fix_registration.sql
-- Run once in the Supabase SQL editor.
--
-- Fixes multi-tenant registration by:
--   1. Dropping the single-tenant unique constraint on profiles(phone) if it exists.
--   2. Adding a tenant-scoped unique constraint on profiles(tenant_id, phone) so a phone number can be used across different platforms.
--   3. Re-defining the auth.users signup trigger function handle_new_user() to extract:
--        - tenant_id
--        - grade
--      and write them properly into public.profiles on insert.
-- ============================================================

-- 1. Find and drop the unique constraint or unique index on profiles(phone)
DO $$
DECLARE
    r RECORD;
    v_attnum int2;
BEGIN
    -- Get the attribute number for the 'phone' column
    SELECT attnum INTO v_attnum
    FROM pg_attribute 
    WHERE attrelid = 'public.profiles'::regclass AND attname = 'phone';

    IF v_attnum IS NOT NULL THEN
        -- Drop constraints on phone column of profiles
        FOR r IN (
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'public.profiles'::regclass 
              AND contype = 'u' 
              AND conkey = ARRAY[v_attnum]
        ) LOOP
            EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;

        -- Drop indexes on phone column of profiles
        FOR r IN (
            SELECT indexrelid::regclass::text as idxname
            FROM pg_index
            WHERE indrelid = 'public.profiles'::regclass
              AND indisunique
              AND indkey::smallint[] = ARRAY[v_attnum]
        ) LOOP
            EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.idxname);
        END LOOP;
    END IF;
END $$;

-- 2. Add tenant-scoped unique constraint on profiles (tenant_id, phone)
-- Ensure we do not add a duplicate constraint if it exists
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tenant_phone_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_phone_key UNIQUE (tenant_id, phone);

-- 3. Redefine the trigger function on user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, role, tenant_id, grade, is_active)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce((new.raw_user_meta_data->>'tenant_id')::uuid, 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid),
    new.raw_user_meta_data->>'grade',
    false -- New students are inactive until admin approves/verifies payment
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
