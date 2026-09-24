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
//   R2_PRIVATE_BUCKET   (course-lecture files uploaded as kind 'lecture-file'
//                        live here, under lecture-files/; older files are still
//                        in R2_BUCKET under lectures/)
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

  // Student Device Limit: a student session not authorized on this device
  // gets nothing (true for staff and for tenants without the limit).
  const { data: deviceOk, error: deviceErr } = await supabaseAsUser.rpc('student_session_authorized')
  if (deviceErr || deviceOk !== true) {
    return json({ error: 'forbidden: device not authorized' }, { status: 403 })
  }

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
    .select('id, tenant_id, role, grade, "group"')
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
    .select('id, tenant_id, package_id, grade, is_active, created_at, available_hours, available_until')
    .eq('id', contextLectureId)
    .single()

  if (lecErr || !lecture) {
    return json({ error: 'lecture_not_found' }, { status: 404 })
  }

  if (lecture.tenant_id !== profile.tenant_id) {
    return json({ error: 'forbidden: cross-tenant access rejected' }, { status: 403 })
  }

  // 5b. Grade: a student only gets files of lectures for their own grade (or
  //     lectures with no grade) — the same rule as the course_lectures RLS
  //     policy / can_view_course_lecture().
  if (profile.role === 'student' && lecture.grade && lecture.grade !== profile.grade) {
    return json({ error: 'forbidden: lecture is for a different grade' }, { status: 403 })
  }

  // 5c. Archived lectures and lectures outside their availability window are
  //     closed to students, including per-student/group/grade overrides
  //     (most specific wins, the same precedence as reduceEffective()).
  if (profile.role === 'student') {
    if (lecture.is_active === false) {
      return json({ error: 'forbidden: lecture is archived' }, { status: 403 })
    }
    const scopes = [`and(scope.eq.student,target_id.eq.${userId})`, `and(scope.eq.prep,target_id.eq.${profile.grade})`]
    // Group names are free text, so quote the value for the filter syntax.
    if (profile.group) scopes.push(`and(scope.eq.group,target_id.eq."${`${profile.grade}:${profile.group}`.replace(/"/g, '\\"')}")`)
    const { data: ovRows } = await supabaseAdmin
      .from('access_overrides')
      .select('scope, allowed, available_hours, available_until')
      .eq('item_type', 'lecture')
      .eq('item_id', lecture.id)
      .or(scopes.join(','))
    const rank: Record<string, number> = { prep: 1, group: 2, student: 3 }
    const ov = (ovRows || []).sort((a, b) => (rank[b.scope] || 0) - (rank[a.scope] || 0))[0]
    if (ov && ov.allowed === false) {
      return json({ error: 'forbidden: lecture is closed for this student' }, { status: 403 })
    }
    const until = ov?.available_until || lecture.available_until
    const hours = ov?.available_hours || lecture.available_hours
    const endsAt = until
      ? new Date(until).getTime()
      : hours && lecture.created_at
        ? new Date(lecture.created_at).getTime() + hours * 3600 * 1000
        : null
    if (endsAt !== null && endsAt <= Date.now()) {
      return json({ error: 'forbidden: lecture availability has ended' }, { status: 403 })
    }
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
        .limit(1)

      if (!sub?.length) {
        return json({ error: 'forbidden: no active subscription for this course package' }, { status: 403 })
      }
    }
  }

  // 7. Evaluate Containing Lecture Unlock State (Files inherit parent lecture unlock)
  //    Called AS THE STUDENT: check_content_unlocked resolves the tenant from
  //    auth.uid(), so with the service-role client it found no rules and
  //    always answered "unlocked". Staff are never locked out.
  if (profile.role === 'student') {
    const { data: unlockRes, error: unlockErr } = await supabaseAsUser.rpc('check_content_unlocked', {
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
  }

  // 8. Generate Short-Lived Pre-Signed GET URL (300 Seconds / 5 Minutes TTL)
  const accountId = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKey = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secret = Deno.env.get('R2_SECRET_ACCESS_KEY')!
  const bucket = file.file_key.startsWith('lecture-files/')
    ? Deno.env.get('R2_PRIVATE_BUCKET')!
    : Deno.env.get('R2_BUCKET')!

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
