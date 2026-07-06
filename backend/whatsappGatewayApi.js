import { supabase } from './supabase'

/* Client for the self-hosted multi-tenant WhatsApp gateway.
   The gateway URL is set once (by the developer) via VITE_WHATSAPP_GATEWAY_URL.
   Every call carries the logged-in admin's Supabase JWT; the gateway derives
   the tenant from that token, so each teacher only ever controls their own
   WhatsApp session. Nothing tenant-specific is trusted from the client. */

const GATEWAY_URL = (import.meta.env.VITE_WHATSAPP_GATEWAY_URL || '').replace(/\/$/, '')

export function isGatewayConfigured() {
  return !!GATEWAY_URL
}

async function authedFetch(path, options = {}) {
  if (!GATEWAY_URL) throw new Error('لم يتم ضبط عنوان بوابة الواتساب (VITE_WHATSAPP_GATEWAY_URL)')
  // The app persists the Supabase session in sessionStorage; getSession reads it.
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || sessionStorage.getItem('masar-token')
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Gateway error ${res.status}`)
  }
  return res.json()
}

// { status: 'disconnected'|'connecting'|'qr'|'connected', qr, sent_today, daily_limit }
export const getWhatsAppStatus = () => authedFetch('/api/status')
export const connectWhatsApp = () => authedFetch('/api/connect', { method: 'POST' })
export const disconnectWhatsApp = () => authedFetch('/api/disconnect', { method: 'POST' })
// Link by phone number (pairing code) instead of QR — more reliable on weak links.
export const pairWhatsApp = (phone) => authedFetch('/api/pair-code', { method: 'POST', body: JSON.stringify({ phone }) })
