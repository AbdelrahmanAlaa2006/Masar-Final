-- ============================================================================
-- Disable the automatic WhatsApp queue processing cron job.
--
-- The whatsapp-auto-resume cron job was automatically processing pending
-- notifications every 10 minutes, marking them as "sent" even when the admin
-- hadn't explicitly pressed "Send Queue". This script disables that behavior.
--
-- Run this in the Supabase SQL Editor (one-time).
-- ============================================================================

-- Unschedule the automatic WhatsApp resume heartbeat
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-auto-resume');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'whatsapp-auto-resume job was not found (already removed or never created).';
END $$;
