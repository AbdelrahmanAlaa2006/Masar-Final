-- ============================================================================
-- WhatsApp per-tenant processing lease lock
--
-- WHY: the batch sender (supabase/functions/wapilot-send) can be triggered by
-- TWO independent drivers at the same time — the pg_cron heartbeat and the
-- browser worker (and by more than one device/tab). Without coordination, two
-- concurrent runs SELECT the same pending rows and send them twice, and each
-- reads `sent_today` independently so together they can blow past the daily
-- safety cap. Both problems have the same root: no mutual exclusion per tenant.
--
-- WHAT: a lightweight lease lock. A processor must `acquire_whatsapp_lock`
-- before it may send; only one holder per tenant succeeds. The lease carries an
-- expiry so a crashed processor never wedges the queue — the lock frees itself
-- after `p_lease_seconds`. Normal runs release it explicitly when the batch ends.
--
-- This adds ONLY two trivial indexed upserts per batch invocation (acquire +
-- release) — negligible DB load — and changes NONE of the sending/pacing/limit
-- logic. It is pure concurrency control around the existing engine.
--
-- RELEASE ORDER:
--   1. supabase db query --linked --file <this file>
--   2. supabase functions deploy wapilot-send --use-api   (uses the new RPCs)
-- ============================================================================

create table if not exists public.whatsapp_tenant_locks (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  locked_until timestamptz not null
);

-- Only the service role (edge function) ever touches this table. RLS with no
-- policy = clients get nothing; the service role bypasses RLS.
alter table public.whatsapp_tenant_locks enable row level security;

-- Atomically take (or refresh) the lease for a tenant.
-- Returns TRUE if THIS caller now holds the lease, FALSE if another live holder
-- has it. The INSERT ... ON CONFLICT is atomic under concurrency: two callers
-- racing here are serialized by the row lock, and the second sees the freshly
-- set future `locked_until`, so its conditional UPDATE is a no-op → FALSE.
create or replace function public.acquire_whatsapp_lock(p_tenant_id uuid, p_lease_seconds int)
returns boolean
language plpgsql
as $$
declare
  rc int;
begin
  insert into public.whatsapp_tenant_locks (tenant_id, locked_until)
  values (p_tenant_id, now() + make_interval(secs => p_lease_seconds))
  on conflict (tenant_id) do update
    set locked_until = excluded.locked_until
    where public.whatsapp_tenant_locks.locked_until < now();  -- only steal an EXPIRED lease
  get diagnostics rc = row_count;
  return rc > 0;
end;
$$;

-- Release the lease early (normal end-of-batch). Setting locked_until to now()
-- makes it immediately re-acquirable by the next processor without waiting out
-- the lease. A missing row (never happens in practice) is simply a no-op.
create or replace function public.release_whatsapp_lock(p_tenant_id uuid)
returns void
language sql
as $$
  update public.whatsapp_tenant_locks set locked_until = now() where tenant_id = p_tenant_id;
$$;

-- Lock down execution: only the service role (the edge function) may call these.
revoke all on function public.acquire_whatsapp_lock(uuid, int) from public;
revoke all on function public.release_whatsapp_lock(uuid) from public;
grant execute on function public.acquire_whatsapp_lock(uuid, int) to service_role;
grant execute on function public.release_whatsapp_lock(uuid) to service_role;

-- Make the new RPCs available to the API immediately (no wait for auto-reload).
notify pgrst, 'reload schema';
