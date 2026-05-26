-- ============================================================
-- 2026_05_27_payments_professional.sql
-- Run once in the Supabase SQL editor.
--
-- Adds:
--   1. Adds `package_name` text column (nullable) to public.payments.
--   2. Alters `screenshot_url` to drop the NOT NULL constraint to support Cash/Offline payments.
--   3. Updates check constraint on `payment_method` to allow 'Cash'.
--   4. Adds `is_active` boolean column (not null, default false) to public.profiles.
--   5. Backfills existing profiles as active (is_active = true) to prevent lockout.
-- ============================================================

-- 1. Add package_name column if it doesn't exist
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS package_name TEXT;

-- 2. Drop check constraint on payment_method if it exists, and re-create it
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check CHECK (payment_method IN ('InstaPay', 'Vodafone Cash', 'Cash'));

-- 3. Make screenshot_url nullable for manual Cash payments
ALTER TABLE public.payments ALTER COLUMN screenshot_url DROP NOT NULL;

-- 4. Add is_active column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

-- 5. Backfill existing profiles to be active (preventing lock-out of current users)
UPDATE public.profiles SET is_active = true WHERE is_active = false;
