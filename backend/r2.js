import { supabase } from './supabase'

/* Client-side wrapper around the `r2-upload-url` Supabase Edge Function.
   The browser uploads PDFs directly to Cloudflare R2 via a short-lived
   presigned PUT URL — the admin never has to touch the Cloudflare dashboard.

   Flow:
     1. getLecturePdfUploadUrl(file)   → { uploadUrl, key, publicUrl }
     2. PUT the file bytes to uploadUrl
     3. store { publicUrl, key } on the lectures row

   The helper below does all three; callers just hand us a File.           */

export async function getLecturePdfUploadUrl(file) {
  if (!file) throw new Error('لم يتم اختيار ملف')
  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: {
      filename: file.name || 'lecture.pdf',
      contentType: file.type || 'application/pdf',
    },
  })
  if (error) {
    // supabase.functions.invoke surfaces the function's JSON body in error.context.
    const msg = error.message || 'تعذر الحصول على رابط الرفع'
    throw new Error(msg)
  }
  if (!data?.uploadUrl) throw new Error('استجابة غير صالحة من خادم الرفع')
  return data // { uploadUrl, key, publicUrl, contentType }
}

export async function uploadLecturePdf(file, { onProgress } = {}) {
  const presign = await getLecturePdfUploadUrl(file)

  // We prefer XMLHttpRequest over fetch so we can surface upload progress —
  // fetch has no progress events for the request body today.
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presign.uploadUrl, true)
    xhr.setRequestHeader('Content-Type', presign.contentType || 'application/pdf')
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
