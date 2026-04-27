// Supabase Edge Function: r2-delete
// ----------------------------------------------------------------------------
// Deletes an object from the Cloudflare R2 bucket. Called when:
//   • a student replaces / removes their avatar
//   • an admin replaces / removes a quiz-question image
//   • an admin uploads a lecture PDF and then cancels (cleanup orphan)
//
// Body: { key?: string, url?: string }
//   • key — full object key inside the bucket (e.g. "avatars/<uid>/<file>.png")
//   • url — alternatively, the public URL we'll strip the public base from
//
// Permission rules (mirror r2-upload-url):
//   • avatars/<userId>/...   → only that user (or admin)
//   • quiz-images/...        → admin only
//   • lectures/...           → admin only
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { S3Client, DeleteObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.600.0'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  // Auth
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing auth' }, { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await asUser.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'invalid session' }, { status: 401 })
  const userId = userRes.user.id

  let body: { key?: string; url?: string } = {}
  try { body = await req.json() } catch {}

  // Resolve a key. If url was given, strip the public base prefix.
  const publicBase = (Deno.env.get('R2_PUBLIC_BASE') || '').replace(/\/+$/, '')
  let key = (body.key || '').replace(/^\/+/, '')
  if (!key && body.url && publicBase) {
    if (body.url.startsWith(publicBase + '/')) {
      key = body.url.slice(publicBase.length + 1)
    }
  }
  // Strip any query string we added for cache-busting
  key = key.split('?')[0]
  if (!key) return json({ error: 'no key/url provided' }, { status: 400 })

  // Permission check by prefix
  const isAvatar     = key.startsWith('avatars/')
  const isQuizImage  = key.startsWith('quiz-images/')
  const isLecture    = key.startsWith('lectures/')
  if (!isAvatar && !isQuizImage && !isLecture) {
    return json({ error: 'unsupported prefix' }, { status: 400 })
  }

  // Look up the user's role for admin-only prefixes / cross-user avatar ops.
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', userId).single()
  const isAdmin = profile?.role === 'admin'

  if (isAvatar) {
    // avatars/<owner-id>/<file> — owner OR admin can delete.
    const owner = key.split('/')[1]
    if (!isAdmin && owner !== userId) {
      return json({ error: 'not your avatar' }, { status: 403 })
    }
  } else if (isQuizImage || isLecture) {
    if (!isAdmin) return json({ error: 'admin only' }, { status: 403 })
  }

  // Perform the delete
  const accountId  = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKey  = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secret     = Deno.env.get('R2_SECRET_ACCESS_KEY')!
  const bucket     = Deno.env.get('R2_BUCKET')!
  if (!accountId || !accessKey || !secret || !bucket) {
    return json({ error: 'server is not configured for R2' }, { status: 500 })
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secret },
  })

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } catch (e) {
    // R2's S3 API returns 204 even for non-existent keys, so a real error
    // here is genuinely unexpected. Surface the message but don't 500 the
    // client UX — orphan cleanup is best-effort.
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  return json({ ok: true, key })
})
