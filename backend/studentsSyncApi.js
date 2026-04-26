import { supabase } from './supabase'

/* Calls the `sync-students` Edge Function. Pass the raw CSV text and a
   flag to actually apply the changes (otherwise it dry-runs and returns
   the would-be diff). The function verifies the caller is an admin —
   no service role key ever ships to the browser. */
export async function syncStudentsCsv(csvText, { apply = false } = {}) {
  if (!csvText || !csvText.trim()) throw new Error('الملف فارغ')
  const { data, error } = await supabase.functions.invoke('sync-students', {
    body: { csv: csvText, apply },
  })
  if (error) {
    // supabase-js wraps Edge Function failures with a generic
    // "Edge Function returned a non-2xx status code" message and
    // hides the real body. Pull it out so the admin sees what went
    // wrong (auth expired, parse error, missing env vars, ...).
    let detail = error.message || 'تعذر تشغيل المزامنة'
    try {
      const resp = error.context?.response || error.context
      if (resp && typeof resp.text === 'function') {
        const raw = await resp.text()
        if (raw) {
          // The function returns JSON like {"error":"..."} when it can.
          try {
            const j = JSON.parse(raw)
            if (j?.error) detail = j.error
            else detail = raw
          } catch {
            detail = raw
          }
        }
      }
    } catch { /* fall through with generic message */ }

    // Map a few common cases to friendlier Arabic.
    if (/jwt|auth|401/i.test(detail)) {
      detail = 'انتهت جلسة الدخول — سجّل خروج ثم دخول من جديد ثم أعد المحاولة.'
    } else if (/admin/i.test(detail) && /role|forbidden|403/i.test(detail)) {
      detail = 'هذا الحساب لا يملك صلاحيات المشرف لتنفيذ المزامنة.'
    } else if (/csv/i.test(detail)) {
      detail = 'تعذّر تحليل ملف CSV — تأكد من أن الأعمدة (name, phone, password, grade) صحيحة.'
    }
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data // { ok, skipped, failed, orphans, deleted, logs, apply }
}
