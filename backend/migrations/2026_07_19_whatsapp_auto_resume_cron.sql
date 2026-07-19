-- ============================================================================
-- WhatsApp auto-resume heartbeat (pg_cron + pg_net)
--
-- Every 10 minutes, invoke the existing wapilot-send batch mode for each
-- tenant that has pending WhatsApp notifications and a WAPilot gateway.
-- The edge function itself remains the single brain: its working-hours gate,
-- daily safety cap, warm-up and pacing decide whether anything is actually
-- sent. When the queue is empty the subquery yields no rows → ZERO HTTP
-- calls, so idle cost is one trivial indexed SELECT per 10 minutes.
--
-- Scheduled calls carry x-cron-secret (matches the WAPILOT_CRON_SECRET
-- edge-function secret) because no user JWT exists on a cron invocation.
--
-- RELEASE ORDER (important):
--   1. supabase secrets set WAPILOT_CRON_SECRET=<value>   (done via CLI)
--   2. supabase functions deploy wapilot-send --use-api
--   3. supabase db query --linked --file <this file>
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent re-schedule
do $$
begin
  perform cron.unschedule('whatsapp-auto-resume');
exception when others then null;
end $$;

select cron.schedule(
  'whatsapp-auto-resume',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://zphnjirmcrolqjrhjjqt.supabase.co/functions/v1/wapilot-send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG5qaXJtY3JvbHFqcmhqanF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTU1MDksImV4cCI6MjA5MjM3MTUwOX0.yMTLy-vVpE1kf2Iv7EO-eZdtTpiHvH1iHMVHRlmbpIQ',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG5qaXJtY3JvbHFqcmhqanF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTU1MDksImV4cCI6MjA5MjM3MTUwOX0.yMTLy-vVpE1kf2Iv7EO-eZdtTpiHvH1iHMVHRlmbpIQ',
        'x-cron-secret', '0775e5fe0d80078bc5d84bb971c8dcc1c0ff90dde918f8bb'
      ),
      body := jsonb_build_object('batch', true, 'tenant_id', t.tenant_id::text),
      timeout_milliseconds := 150000
    )
    from (
      select distinct n.tenant_id
      from public.unified_notifications n
      join public.tenants tt on tt.id = n.tenant_id
      where n.channels @> array['whatsapp']
        and n.status->>'whatsapp' = 'pending'
        and tt.config->'gateway'->>'type' = 'wapilot'
    ) t
  $cron$
);
