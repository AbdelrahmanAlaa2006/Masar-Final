import { supabase } from './supabase'

/* Client-side wrapper around the `r2-upload-url` Supabase Edge Function.
   The browser uploads files directly to Cloudflare R2 via a short-lived
   presigned PUT URL — no R2 credentials ever ship to the browser.

   Three "kinds" supported by the function:
     • lecture     — PDFs, admin only
     • avatar      — image/*, any authed user (their own avatar)
     • quiz-image  — image/*, admin only

   Flow (all three kinds):
     1. presignUpload({ file, kind })      → { uploadUrl, key, publicUrl }
     2. PUT the file bytes to uploadUrl
     3. store the publicUrl on the relevant row (profile / question / lecture)

   The `uploadFile` helper does all three; callers just hand us a File.       */

// ── Low-level: ask the Edge Function for a presigned URL ─────────────
export async function presignUpload({ file, kind }) {
  if (!file) throw new Error('لم يتم اختيار ملف')
  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: {
      filename: file.name || (kind === 'lecture' ? 'lecture.pdf' : 'image.png'),
      contentType: file.type || (kind === 'lecture' ? 'application/pdf' : 'image/png'),
      kind: kind || 'lecture',
    },
  })
  if (error) {
    // Pull the real body out so the user sees the actual reason.
    let detail = error.message || 'تعذر الحصول على رابط الرفع'
    try {
      const resp = error.context?.response || error.context
      if (resp && typeof resp.text === 'function') {
        const raw = await resp.text()
        if (raw) {
          try {
            const j = JSON.parse(raw)
            if (j?.error) detail = j.error
            else detail = raw
          } catch { detail = raw }
        }
      }
    } catch {/* ignore */}
    if (/invalid session|jwt/i.test(detail)) detail = 'انتهت جلسة الدخول — سجّل دخول من جديد.'
    if (/admin only/i.test(detail))          detail = 'هذا الإجراء يتطلب صلاحيات المشرف.'
    if (/not configured/i.test(detail))      detail = 'لم يتم ضبط Cloudflare R2 على الخادم بعد.'
    throw new Error(detail)
  }
  if (!data?.uploadUrl) throw new Error('استجابة غير صالحة من خادم الرفع')
  return data // { uploadUrl, key, publicUrl, contentType, kind }
}

// ── Mid-level: presign + PUT, with optional progress ─────────────────
export async function uploadFile(file, { kind, onProgress } = {}) {
  const presign = await presignUpload({ file, kind })

  // XMLHttpRequest because fetch has no upload-progress events.
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presign.uploadUrl, true)
    xhr.setRequestHeader('Content-Type', presign.contentType || file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`فشل رفع الملف (HTTP ${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء رفع الملف'))
    xhr.send(file)
  })

  return { key: presign.key, publicUrl: presign.publicUrl }
}

// ── High-level kind-specific helpers (call sites stay readable) ──────
export async function uploadLecturePdf(file, opts = {}) {
  return uploadFile(file, { ...opts, kind: 'lecture' })
}
export async function uploadAvatarImage(file, opts = {}) {
  if (file && !file.type?.startsWith('image/')) {
    throw new Error('الملف ليس صورة صالحة')
  }
  if (file && file.size > 4 * 1024 * 1024) {
    throw new Error('حجم الصورة يجب ألا يتجاوز 4 ميجابايت')
  }
  return uploadFile(file, { ...opts, kind: 'avatar' })
}
export async function uploadQuizImage(file, opts = {}) {
  if (file && !file.type?.startsWith('image/')) {
    throw new Error('الملف ليس صورة صالحة')
  }
  if (file && file.size > 4 * 1024 * 1024) {
    throw new Error('حجم الصورة يجب ألا يتجاوز 4 ميجابايت')
  }
  return uploadFile(file, { ...opts, kind: 'quiz-image' })
}

// Legacy export kept for back-compat with any existing import sites.
export async function getLecturePdfUploadUrl(file) {
  return presignUpload({ file, kind: 'lecture' })
}
