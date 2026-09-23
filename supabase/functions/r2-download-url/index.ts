// Supabase Edge Function: r2-download-url
// ----------------------------------------------------------------------------
// Returns a short-lived presigned GET download URL for Cloudflare R2 files.
//
// AUTHORIZATION BEFORE SIGNING:
// The client passes { fileId, contextLectureId }. It CANNOT pass an arbitrary
// fileKey. The server authoritatively verifies:
//   1. Authenticated user (auth.uid())
//   2. Tenant matching (profile.tenant_id == file.tenant_id == lecture.tenant_id)
//   3. File existence and lecture containment (file.lecture_id == contextLectureId)
//   4. Course package subscription access via has_content_access
//   5. Containing lecture unlock state via check_content_unlocked
//
// Only after all checks pass is a 300-second (5 min) presigned GET URL generated.
//
// Required Supabase function secrets (reuses existing r2-upload-url configuration):
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { S3Client, GetObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.600.0'
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  // 1. Authenticate Request
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'missing auth' }, { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabaseAsUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser()
  if (userErr || !userRes?.user) {
    return json({ error: 'invalid session' }, { status: 401 })
  }
  const userId = userRes.user.id

  // 2. Parse Input (fileId and contextLectureId are strictly required)
  let body: { fileId?: string; contextLectureId?: string } = {}
  try { body = await req.json() } catch { /* tolerate empty */ }

  const { fileId, contextLectureId } = body
  if (!fileId || !contextLectureId) {
    return json({ error: 'missing_parameters: fileId and contextLectureId are required' }, { status: 400 })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)

  // 3. Resolve User Profile & Tenant
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, tenant_id, role')
    .eq('id', userId)
    .single()

  if (profErr || !profile) {
    return json({ error: 'forbidden: profile not found' }, { status: 403 })
  }

  // 4. Authoritatively Resolve File (NEVER trust client-supplied fileKey)
  const { data: file, error: fileErr } = await supabaseAdmin
    .from('lecture_files')
    .select('id, tenant_id, lecture_id, title, file_key, file_size')
    .eq('id', fileId)
    .single()

  if (fileErr || !file) {
    return json({ error: 'file_not_found: file does not exist' }, { status: 404 })
  }

  if (file.tenant_id !== profile.tenant_id) {
    return json({ error: 'forbidden: cross-tenant access rejected' }, { status: 403 })
  }

  if (file.lecture_id !== contextLectureId) {
    return json({ error: 'invalid_context: file does not belong to specified context lecture' }, { status: 400 })
  }

  // 5. Authoritatively Resolve Containing Lecture & Package
  const { data: lecture, error: lecErr } = await supabaseAdmin
    .from('course_lectures')
    .select('id, tenant_id, package_id')
    .eq('id', contextLectureId)
    .single()

  if (lecErr || !lecture) {
    return json({ error: 'lecture_not_found' }, { status: 404 })
  }

  if (lecture.tenant_id !== profile.tenant_id) {
    return json({ error: 'forbidden: cross-tenant access rejected' }, { status: 403 })
  }

  // 6. Check Package Subscription Access (Students Only, ONLY IF lecture is inside a package)
  if (profile.role === 'student' && lecture.package_id) {
    const { data: hasPkgAccess } = await supabaseAdmin.rpc('has_content_access', {
      p_user_id: userId,
      p_content_type: 'video', // proxy for package access in existing system
      p_content_id: lecture.package_id,
    })

    if (!hasPkgAccess) {
      const { data: sub } = await supabaseAdmin
        .from('package_purchases')
        .select('id')
        .eq('student_id', userId)
        .eq('package_id', lecture.package_id)
        .eq('payment_status', 'approved')
        .maybeSingle()

      if (!sub) {
        return json({ error: 'forbidden: no active subscription for this course package' }, { status: 403 })
      }
    }
  }

  // 7. Evaluate Containing Lecture Unlock State (Files inherit parent lecture unlock)
  const { data: unlockRes, error: unlockErr } = await supabaseAdmin.rpc('check_content_unlocked', {
    p_student_id: userId,
    p_target_type: 'lecture',
    p_target_id: contextLectureId,
    p_context_lecture_id: null,
  })

  if (unlockErr || !unlockRes || unlockRes.unlocked !== true) {
    return json({
      error: 'locked: parent lecture is locked by prerequisite exam',
      unlockStatus: unlockRes || null,
    }, { status: 423 })
  }

  // 8. Generate Short-Lived Pre-Signed GET URL (300 Seconds / 5 Minutes TTL)
  const accountId = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKey = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secret = Deno.env.get('R2_SECRET_ACCESS_KEY')!
  const bucket = Deno.env.get('R2_BUCKET')!

  if (!accountId || !accessKey || !secret || !bucket) {
    return json({ error: 'server is not configured for R2' }, { status: 500 })
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secret },
  })

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: file.file_key,
    }),
    { expiresIn: 300 } // 5 minutes
  )

  return json({
    authorized: true,
    fileId: file.id,
    title: file.title,
    fileKey: file.file_key,
    fileSize: file.file_size,
    downloadUrl,
    expiresIn: 300,
  })
})
