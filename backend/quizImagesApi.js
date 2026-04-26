import { uploadQuizImage } from './r2'

/* Upload an image for a single quiz/exam question.
   Returns the public URL (Cloudflare R2 → public bucket base).

   The `userId` arg is currently unused (the Edge Function derives the
   uploader from the JWT) but kept in the signature so call sites don't
   have to change. */
export async function uploadQuestionImage(file, /* { userId } = {} */) {
  if (!file) throw new Error('لم يتم اختيار صورة')
  if (!file.type?.startsWith('image/')) throw new Error('الملف ليس صورة صالحة')
  if (file.size > 4 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 4 ميجابايت')

  const { publicUrl } = await uploadQuizImage(file)
  return publicUrl
}
