// Supabase Edge Function: r2-upload-url
// ----------------------------------------------------------------------------
// Returns a short-lived presigned PUT URL for Cloudflare R2 so the admin can
// upload a PDF *directly from the browser* without ever seeing the Cloudflare
// dashboard. The admin form does:
//
//   1. POST { filename, contentType } to this function.
//   2. fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': ... } })
//   3. INSERT into lectures with { pdf_key, pdf_url } returned from step 1.
//
// Only authenticated admins may call it (checked server-side against profiles).
//
// Required Supabase function secrets (set with `supabase secrets set ...`):
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET
//   R2_PUBLIC_BASE            (e.g. https://pub-xxxx.r2.dev)
//   SUPABASE_URL              (auto-injected by Supabase)
//   SUPABASE_ANON_KEY         (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.600.0'
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.600.0'

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

function sanitizeFilename(name: string): string {
  // Keep original extension (fallback to .pdf) but drop user-supplied path pieces.
  const base = (name || '').split(/[\\/]/).pop() || 'file.pdf'
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : '.pdf'
  return ext.replace(/[^a-z0-9.]/g, '') || '.pdf'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  // --- auth check: must be an admin ----------------------------------------
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'missing auth' }, { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Verify the caller's JWT and look up their profile role with service key.
  const supabaseAsUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser()
  if (userErr || !userRes?.user) {
    return json({ error: 'invalid session' }, { status: 401 })
  }
  const userId = userRes.user.id

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles').select('role').eq('id', userId).single()
  if (profErr || profile?.role !== 'admin') {
    return json({ error: 'admin only' }, { status: 403 })
  }

  // --- input ---------------------------------------------------------------
  let body: { filename?: string; contentType?: string } = {}
  try { body = await req.json() } catch { /* tolerate empty body */ }

  const ext = sanitizeFilename(body.filename || '')
  const contentType = body.contentType || 'application/pdf'

  // Only allow PDF for MVP.
  if (contentType !== 'application/pdf') {
    return json({ error: 'only application/pdf is allowed' }, { status: 400 })
  }

  // UUID-keyed object so URLs are unguessable and collisions are impossible.
  const key = `lectures/${crypto.randomUUID()}${ext.endsWith('.pdf') ? ext : '.pdf'}`

  // --- R2 presign ----------------------------------------------------------
  const accountId   = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKey   = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secret      = Deno.env.get('R2_SECRET_ACCESS_KEY')!
  const bucket      = Deno.env.get('R2_BUCKET')!
  const publicBase  = (Deno.env.get('R2_PUBLIC_BASE') || '').replace(/\/+$/, '')

  if (!accountId || !accessKey || !secret || !bucket || !publicBase) {
    return json({ error: 'server is not configured for R2' }, { status: 500 })
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secret },
  })

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 60 * 10 }, // 10 minutes
  )

  return json({
    uploadUrl,
    key,
    publicUrl: `${publicBase}/${key}`,
    contentType,
    expiresIn: 600,
  })
})
