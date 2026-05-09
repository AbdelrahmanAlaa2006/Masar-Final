import { supabase } from './supabase'
import * as tus from 'tus-js-client'

/* Calls the bunny-signed-url Edge Function which:
   1) verifies the user's JWT,
   2) checks the user is allowed to watch this part (grade + overrides),
   3) returns a signed iframe URL that expires in ~4 hours.

   The signing key never leaves the server. */
export async function getBunnySignedUrl({ partId }) {
  const { data, error } = await supabase.functions.invoke('bunny-signed-url', {
    body: { partId },
  })
  if (error) throw error
  if (!data?.url) throw new Error('no signed url returned')
  return data // { url, expires }
}

/* Admin: server-side handshake that
   1) verifies admin role,
   2) creates a video record in Bunny Stream,
   3) returns a TUS HMAC signature so the browser can upload directly.

   The Bunny library API key NEVER ships to the browser. */
export async function createBunnyUpload({ title } = {}) {
  const { data, error } = await supabase.functions.invoke('bunny-create-upload', {
    body: { title: title || 'Untitled' },
  })
  if (error) {
    let detail = error.message || 'تعذر إنشاء فيديو على Bunny'
    try {
      const resp = error.context?.response
      if (resp && typeof resp.text === 'function') {
        const raw = await resp.text()
        try { const j = JSON.parse(raw); if (j?.error) detail = j.error } catch { detail = raw }
      }
    } catch {}
    throw new Error(detail)
  }
  if (!data?.guid) throw new Error('استجابة غير صالحة من خادم Bunny')
  return data // { guid, libraryId, expire, signature, endpoint }
}

/* Admin: upload a File / Blob to Bunny via the TUS-resumable protocol.
   Uses the handshake from createBunnyUpload() above. Resumable means a
   dropped connection mid-upload picks back up where it left off. */
export async function uploadBunnyVideo(file, params, { onProgress } = {}) {
  if (!file) throw new Error('لم يتم اختيار ملف')
  if (!params?.signature) throw new Error('بيانات الرفع غير صالحة')

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: params.endpoint || 'https://video.bunnycdn.com/tusupload',
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: params.signature,
        AuthorizationExpire:    String(params.expire),
        VideoId:                params.guid,
        LibraryId:              String(params.libraryId),
      },
      metadata: {
        filetype: file.type || 'video/mp4',
        title:    file.name || 'video',
      },
      onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (typeof onProgress === 'function' && bytesTotal > 0) {
          onProgress(Math.round((bytesUploaded / bytesTotal) * 100))
        }
      },
      onSuccess: () => resolve({ guid: params.guid, libraryId: params.libraryId }),
    })

    // Resume from the last interrupted attempt for the same file (Bunny
    // honors TUS server-side resume by VideoId, but tus-js-client also
    // checks localStorage for a cached upload-URL for this exact file).
    upload.findPreviousUploads()
      .then((prev) => {
        if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0])
        upload.start()
      })
      .catch(() => upload.start())
  })
}
