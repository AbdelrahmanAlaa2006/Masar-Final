import { supabase } from './supabase'

/* Upload an image for a single quiz/exam question. Returns a public URL.
   The bucket `quiz-images` must exist (run quiz_images_bucket.sql once).

   Path scheme:  {userId}/{rand}.{ext}   — flat, easy to clean up later.
*/
export async function uploadQuestionImage(file, { userId } = {}) {
  if (!file) throw new Error('لم يتم اختيار صورة')
  if (!file.type?.startsWith('image/')) throw new Error('الملف ليس صورة صالحة')
  if (file.size > 4 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 4 ميجابايت')

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const rand = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const path = `${userId || 'anon'}/${rand}.${ext}`

  const { error: upErr } = await supabase.storage
    .from('quiz-images')
    .upload(path, file, { upsert: false, contentType: file.type })
  if (upErr) throw upErr

  const { data: { publicUrl } } = supabase.storage
    .from('quiz-images')
    .getPublicUrl(path)
  return publicUrl
}
