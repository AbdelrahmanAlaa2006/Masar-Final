import { supabase } from './supabase'

/* ---------------------------------------------------------------------------
   Company-level financial system (SUPER ADMIN ONLY).

   Thin service layer over the biz_* tables — RLS enforces super-admin access
   server-side, so nothing here is a security boundary. Every money movement
   is a row in biz_transactions (the single ledger); reports are aggregates
   over stored rows via the biz_dashboard RPC. See BUSINESS_ARCHITECTURE.md.
   --------------------------------------------------------------------------- */

// ── Dashboard & reports ─────────────────────────────────────────────────────

// Everything the dashboard needs in ONE round trip:
// totals, account balances, category/tenant breakdowns, monthly P&L series.
export async function getBizDashboard(from, to) {
  const { data, error } = await supabase.rpc('biz_dashboard', { p_from: from, p_to: to })
  if (error) throw error
  return data
}

// Materialize due recurring templates into ledger rows (idempotent) and get
// back reminders for due-but-manual ones. Call once when the dashboard opens.
export async function postDueRecurring() {
  const { data, error } = await supabase.rpc('biz_post_due_recurring')
  if (error) throw error
  return data // { posted, due_manual: [...] }
}

// Phase 3 — billing center: per-teacher expected/collected/remaining/overdue.
export async function getBizBilling() {
  const { data, error } = await supabase.rpc('biz_billing_overview')
  if (error) throw error
  return data // { rows, summary }
}

// Phase 4 — executive KPIs: MRR/ARR/growth/churn/ARPT + 12-month series.
export async function getBizKpis() {
  const { data, error } = await supabase.rpc('biz_kpis')
  if (error) throw error
  return data
}

// Phase 5 — operations: tenants/users counts, WhatsApp queue health, DB size.
export async function getBizOperations() {
  const { data, error } = await supabase.rpc('biz_operations')
  if (error) throw error
  return data
}

// ── Ledger (biz_transactions) ───────────────────────────────────────────────

const TX_SELECT = `
  id, occurred_on, direction, amount, original_amount, original_currency,
  source, status, description, counterparty, notes, metadata, created_at,
  attachment_url, attachment_key,
  category:category_id ( id, name, kind ),
  account:account_id ( id, name ),
  tenant:tenant_id ( id, name, slug ),
  contract_id, recurring_id
`

export async function listBizTransactions({ from, to, direction, status, categoryId, accountId, tenantId, contractId, includeVoid = false, page = 1, limit = 50 } = {}) {
  let q = supabase
    .from('biz_transactions')
    .select(TX_SELECT, { count: 'exact' })
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)
  if (from) q = q.gte('occurred_on', from)
  if (to) q = q.lte('occurred_on', to)
  if (direction) q = q.eq('direction', direction)
  if (status) q = q.eq('status', status)
  else if (!includeVoid) q = q.neq('status', 'void')
  if (categoryId) q = q.eq('category_id', categoryId)
  if (accountId) q = q.eq('account_id', accountId)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (contractId) q = q.eq('contract_id', contractId)
  const { data, error, count } = await q
  if (error) throw error
  return { rows: data || [], total: count || 0 }
}

export async function addBizTransaction({ occurredOn, direction, amount, originalAmount = null, originalCurrency = null, categoryId = null, accountId = null, tenantId = null, contractId = null, status = 'confirmed', description = '', counterparty = null, notes = null, metadata = {}, attachmentUrl = null, attachmentKey = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('biz_transactions')
    .insert({
      occurred_on: occurredOn || new Date().toISOString().split('T')[0],
      direction,
      amount,
      original_amount: originalAmount,
      original_currency: originalCurrency,
      category_id: categoryId,
      account_id: accountId,
      tenant_id: tenantId,
      contract_id: contractId,
      source: contractId ? 'contract' : 'manual',
      status,
      description,
      counterparty,
      notes,
      metadata,
      attachment_url: attachmentUrl,
      attachment_key: attachmentKey,
      created_by: user?.id || null,
    })
    .select(TX_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function updateBizTransaction(id, patch) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('biz_transactions')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id || null })
    .eq('id', id)
    .select(TX_SELECT)
    .single()
  if (error) throw error
  return data
}

// Preferred over deletion: a voided row stays in the ledger for audit but is
// excluded from every report (dashboard aggregates count 'confirmed' only).
export async function voidBizTransaction(id) {
  return updateBizTransaction(id, { status: 'void' })
}

// Settle an expected (pending) transaction.
export async function confirmBizTransaction(id) {
  return updateBizTransaction(id, { status: 'confirmed' })
}

// Hard delete — reserved for data-entry mistakes; prefer voidBizTransaction.
export async function deleteBizTransaction(id) {
  const { error } = await supabase.from('biz_transactions').delete().eq('id', id)
  if (error) throw error
}

// ── Accounts ────────────────────────────────────────────────────────────────

export async function listBizAccounts({ includeInactive = false } = {}) {
  let q = supabase.from('biz_accounts').select('*').order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveBizAccount({ id, name, kind = 'bank', currency = 'EGP', isActive = true, notes = null }) {
  const row = { name, kind, currency, is_active: isActive, notes }
  const q = id
    ? supabase.from('biz_accounts').update(row).eq('id', id)
    : supabase.from('biz_accounts').insert(row)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function listBizCategories({ includeInactive = false } = {}) {
  let q = supabase.from('biz_categories').select('*').order('kind').order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveBizCategory({ id, name, kind, parentId = null, isActive = true }) {
  const row = { name, kind, parent_id: parentId, is_active: isActive }
  const q = id
    ? supabase.from('biz_categories').update(row).eq('id', id)
    : supabase.from('biz_categories').insert(row)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data
}

// ── Teacher contracts ───────────────────────────────────────────────────────
// The contract row is the AGREEMENT. Actual money = ledger rows carrying
// contract_id (use addBizTransaction with { contractId }).

export async function listBizContracts({ status } = {}) {
  let q = supabase
    .from('biz_contracts')
    .select('*, tenant:tenant_id ( id, name, slug )')
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveBizContract({ id, tenantId = null, counterparty, title = '', contractType, status = 'active', startDate, endDate = null, currency = 'EGP', terms = {}, notes = null, attachmentUrl = null, attachmentKey = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  const row = {
    tenant_id: tenantId,
    counterparty,
    title,
    contract_type: contractType,
    status,
    start_date: startDate || new Date().toISOString().split('T')[0],
    end_date: endDate,
    currency,
    terms,
    notes,
    attachment_url: attachmentUrl,
    attachment_key: attachmentKey,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  }
  const q = id
    ? supabase.from('biz_contracts').update(row).eq('id', id)
    : supabase.from('biz_contracts').insert({ ...row, created_by: user?.id || null })
  const { data, error } = await q.select('*, tenant:tenant_id ( id, name, slug )').single()
  if (error) throw error
  return data
}

// Total actually collected under a contract (ledger-derived, never from terms).
export async function getContractCollected(contractId) {
  const { data, error } = await supabase
    .from('biz_transactions')
    .select('direction, amount')
    .eq('contract_id', contractId)
  if (error) throw error
  return (data || []).reduce((s, r) => s + (r.direction === 'in' ? Number(r.amount) : -Number(r.amount)), 0)
}

// ── Recurring templates ─────────────────────────────────────────────────────

export async function listBizRecurring({ includeInactive = false } = {}) {
  let q = supabase
    .from('biz_recurring')
    .select('*, category:category_id ( id, name, kind ), account:account_id ( id, name )')
    .order('next_due_on')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveBizRecurring({ id, name, direction = 'out', amount, originalAmount = null, originalCurrency = null, categoryId = null, accountId = null, counterparty = null, cadence, nextDueOn, autoPost = false, isActive = true, notes = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  const row = {
    name,
    direction,
    amount,
    original_amount: originalAmount,
    original_currency: originalCurrency,
    category_id: categoryId,
    account_id: accountId,
    counterparty,
    cadence,
    next_due_on: nextDueOn,
    auto_post: autoPost,
    is_active: isActive,
    notes,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  }
  const q = id
    ? supabase.from('biz_recurring').update(row).eq('id', id)
    : supabase.from('biz_recurring').insert({ ...row, created_by: user?.id || null })
  const { data, error } = await q.select().single()
  if (error) throw error
  return data
}

export async function deleteBizRecurring(id) {
  const { error } = await supabase.from('biz_recurring').delete().eq('id', id)
  if (error) throw error
}

// ── Business settings (key → JSONB) ─────────────────────────────────────────
// Company identity, fiscal configuration, future invoice numbering.

export async function getBizSettings(key = 'general') {
  const { data, error } = await supabase
    .from('biz_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  return data?.value || {}
}

export async function saveBizSettings(key, value) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('biz_settings')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: user?.id || null })
    .select('value')
    .single()
  if (error) throw error
  return data.value
}
