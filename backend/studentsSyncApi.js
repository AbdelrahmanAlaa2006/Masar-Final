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
    const msg = error.message || 'تعذر تشغيل المزامنة'
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data // { ok, skipped, failed, orphans, deleted, logs, apply }
}
