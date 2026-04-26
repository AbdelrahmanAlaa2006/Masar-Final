// Supabase Edge Function: r2-upload-url
// ----------------------------------------------------------------------------
// Returns a short-lived presigned PUT URL for Cloudflare R2 so the browser
// can upload directly to R2 without exposing R2 credentials.
//
// Now serves THREE kinds of uploads (request body: { kind, filename, contentType }):
//
//   kind='lecture'    → PDFs only.       Admin-only.        prefix: lectures/
//   kind='avatar'     → image/* only.    Any authed user.   prefix: avatars/{userId}/
//   kind='quiz-image' → image/* only.    Admin-only.        prefix: quiz-images/{userId}/
//
// Defaults to 'lecture' when `kind` is omitted (backwards compat).
//
// Required Supabase function secrets (set with `supabase secrets set ...`):
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET                 (single bucket — kinds are folders inside it)
//   R2_PUBLIC_BASE            (e.g. https://pub-xxxx.r2.dev)
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

function sanitizeExt(name: string, fallback: string): string {
  const base = (name || '').split(/[\\/]/).pop() || ''
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : fallback
  return ext.replace(/[^a-z0-9.]/g, '') || fallback
}

type Kind = 'lecture' | 'avatar' | 'quiz-image'

interface KindRule {
  adminOnly: boolean
  prefix: (userId: string) => string
  defaultExt: string
  allowed: (ct: string) => boolean
  invalidMsg: string
}

const RULES: Record<Kind, KindRule> = {
  lecture: {
    adminOnly: true,
    prefix: () => 'lectures',
    defaultExt: '.pdf',
    allowed: (ct) => ct === 'application/pdf',
    invalidMsg: 'only application/pdf is allowed',
  },
  avatar: {
    adminOnly: false,           // any logged-in user can upload their own avatar
    prefix: (uid) => `avatars/${uid}`,
    defaultExt: '.png',
    allowed: (ct) => ct.startsWith('image/'),
    invalidMsg: 'only image/* content types are allowed',
  },
  'quiz-image': {
    adminOnly: true,
    prefix: (uid) => `quiz-images/${uid}`,
    defaultExt: '.png',
    allowed: (ct) => ct.startsWith('image/'),
    invalidMsg: 'only image/* content types are allowed',
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  // --- auth check ------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'missing auth' }, { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabaseAsUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser()
  if (userErr || !userRes?.user) {
    return json({ error: 'invalid session' }, { status: 401 })
  }
  const userId = userRes.user.id

  // --- input ----------------------------------------------------------------
  let body: { filename?: string; contentType?: string; kind?: Kind } = {}
  try { body = await req.json() } catch { /* tolerate empty */ }

  const kind: Kind = (body.kind && RULES[body.kind]) ? body.kind : 'lecture'
  const rule = RULES[kind]
  const contentType = body.contentType || (kind === 'lecture' ? 'application/pdf' : 'image/png')

  // Per-kind permission check.
  if (rule.adminOnly) {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles').select('role').eq('id', userId).single()
    if (profErr || profile?.role !== 'admin') {
      return json({ error: 'admin only' }, { status: 403 })
    }
  }

  if (!rule.allowed(contentType)) {
    return json({ error: rule.invalidMsg }, { status: 400 })
  }

  const ext = sanitizeExt(body.filename || '', rule.defaultExt)
  // UUID-keyed object so URLs are unguessable and collisions are impossible.
  const key = `${rule.prefix(userId)}/${crypto.randomUUID()}${ext.startsWith('.') ? ext : '.' + ext}`

  // --- R2 presign -----------------------------------------------------------
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
    { expiresIn: 60 * 10 },
  )

  return json({
    uploadUrl,
    key,
    publicUrl: `${publicBase}/${key}`,
    contentType,
    kind,
    expiresIn: 600,
  })
})
