// Supabase Edge Function: bunny-create-upload
// ----------------------------------------------------------------------------
// Admin uploads a video file from their device → this function:
//   1) verifies the caller is an admin
//   2) creates a video record in Bunny Stream (Library API)
//   3) returns a short-lived TUS HMAC signature so the browser can upload
//      directly to https://video.bunnycdn.com/tusupload (no API key in browser)
//
// Required Supabase function secrets:
//   BUNNY_LIBRARY_ID   — integer ID of the Stream library
//   BUNNY_API_KEY      — the LIBRARY API key (NOT the storage zone or token-auth key)
//
// Request body: { title?: string }
// Response:     { guid, libraryId, expire, signature }
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  // ── auth: verify caller + check admin role ───────────────────────────────
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'missing auth' }, { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await asUser.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'invalid session' }, { status: 401 })
  const userId = userRes.user.id

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', userId).single()
  if (profile?.role !== 'admin') return json({ error: 'admin only' }, { status: 403 })

  // ── input ────────────────────────────────────────────────────────────────
  let body: { title?: string } = {}
  try { body = await req.json() } catch {}
  const title = (body.title || 'Untitled').slice(0, 200)

  // ── env ──────────────────────────────────────────────────────────────────
  const libraryId = Deno.env.get('BUNNY_LIBRARY_ID') || ''
  const apiKey    = Deno.env.get('BUNNY_API_KEY')    || ''
  if (!libraryId || !apiKey) {
    return json({ error: 'server not configured for bunny upload' }, { status: 500 })
  }

  // ── 1) Create the video record in Bunny ──────────────────────────────────
  const createRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      'AccessKey':   apiKey,
      'Content-Type':'application/json',
      'Accept':      'application/json',
    },
    body: JSON.stringify({ title }),
  })
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '')
    return json({ error: `bunny create failed: ${createRes.status} ${text}` }, { status: 502 })
  }
  const created = await createRes.json() as { guid?: string }
  const guid = created?.guid
  if (!guid) return json({ error: 'bunny did not return a guid' }, { status: 502 })

  // ── 2) Sign for TUS upload ───────────────────────────────────────────────
  // Bunny TUS signature format: sha256(libraryId + apiKey + expire + videoId)
  // Expire is a Unix epoch (seconds). Browser must finish before then.
  const expire = Math.floor(Date.now() / 1000) + 24 * 3600   // 24h window
  const signature = await sha256Hex(`${libraryId}${apiKey}${expire}${guid}`)

  return json({
    guid,
    libraryId: Number(libraryId),
    expire,
    signature,
    endpoint: 'https://video.bunnycdn.com/tusupload',
  })
})
