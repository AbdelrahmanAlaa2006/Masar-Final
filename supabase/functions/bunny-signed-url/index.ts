// Supabase Edge Function: bunny-signed-url
// ----------------------------------------------------------------------------
// Returns a short-lived signed Bunny Stream embed URL for a video part.
//
// Required Supabase function secrets:
//   BUNNY_TOKEN_KEY     — Bunny library "Token Authentication Key" (NOT API key)
//   BUNNY_LIBRARY_ID    — default Bunny library id (used when row has none)
//
// Request body: { partId: uuid }
// Response:     { url: string, expires: number (epoch seconds) }
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

  // ── auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing auth' }, { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await asUser.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'invalid session' }, { status: 401 })
  const userId = userRes.user.id

  // ── input ───────────────────────────────────────────────────────────────
  let body: { partId?: string } = {}
  try { body = await req.json() } catch {}
  const partId = (body.partId || '').trim()
  if (!partId) return json({ error: 'partId required' }, { status: 400 })

  // ── load part + video grade  (service role bypasses RLS for the lookup,
  //    we then enforce access manually below) ─────────────────────────────
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: part, error: partErr } = await admin
    .from('video_parts')
    .select('bunny_video_id, bunny_library_id, video_id, videos!inner(grade)')
    .eq('id', partId)
    .single()
  if (partErr || !part) return json({ error: 'part not found' }, { status: 404 })
  if (!part.bunny_video_id) return json({ error: 'no bunny video on this part' }, { status: 400 })

  // ── authorize: admin OR (student grade matches video grade) ────────────
  const { data: profile } = await admin
    .from('profiles')
    .select('role, grade')
    .eq('id', userId)
    .single()

  const partGrade = (part as any).videos?.grade
  const allowed =
    profile?.role === 'admin' ||
    (profile?.grade && profile.grade === partGrade)

  if (!allowed) return json({ error: 'forbidden' }, { status: 403 })

  // NOTE: we do NOT re-check access_overrides here — RLS on video_parts
  // (which the frontend hits when listing) is the access surface. The
  // signed URL is just a delivery mechanism. If you need to block specific
  // overridden students from playback even after their grade matches,
  // extend this check by joining the override-resolver view.

  // ── sign ────────────────────────────────────────────────────────────────
  const tokenKey = Deno.env.get('BUNNY_TOKEN_KEY')!
  const defaultLib = Deno.env.get('BUNNY_LIBRARY_ID') || ''
  if (!tokenKey) return json({ error: 'server is not configured for bunny' }, { status: 500 })

  const libraryId = String(part.bunny_library_id || defaultLib).trim()
  if (!libraryId) return json({ error: 'no bunny library configured' }, { status: 500 })

  const expires = Math.floor(Date.now() / 1000) + 4 * 3600 // 4h
  const path = `/embed/${libraryId}/${part.bunny_video_id}`
  const token = await sha256Hex(tokenKey + path + expires)

  // Bunny accepts ?token=<hash>&expires=<epoch> on the embed URL
  const url = `https://iframe.mediadelivery.net${path}?token=${token}&expires=${expires}&autoplay=false`

  return json({ url, expires })
})
