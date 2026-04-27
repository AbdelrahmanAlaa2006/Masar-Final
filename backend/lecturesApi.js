import { supabase } from './supabase'

// UI grade id  ('first'/'second'/'third')  <->  DB grade enum  ('first-prep'/...)
const UI_TO_DB = { first: 'first-prep', second: 'second-prep', third: 'third-prep' }
const DB_TO_UI = { 'first-prep': 'first', 'second-prep': 'second', 'third-prep': 'third' }
export const uiToDbGrade = (ui) => UI_TO_DB[ui] || null
export const dbToUiGrade = (db) => DB_TO_UI[db] || null

// List lectures. RLS scopes students to their own grade; admins see all.
export async function listLectures() {
  const { data, error } = await supabase
    .from('lectures')
    .select('id, title, description, subject, teacher, week, grade, cover_url, pdf_url, pdf_key, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createLecture(input) {
  const payload = {
    title: input.title,
    description: input.description || null,
    subject: input.subject || null,
    teacher: input.teacher || null,
    week: input.week || null,
    grade: input.grade,
    cover_url: input.cover_url || null,
    pdf_url: input.pdf_url || null,
    pdf_key: input.pdf_key || null,
    created_by: input.created_by || null,
  }
  const { data, error } = await supabase
    .from('lectures')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLecture(id) {
  // Read the row first so we can clean up the R2 objects (PDF + cover)
  // after the DB delete succeeds. Best-effort — failures are swallowed
  // so the user-visible delete still completes.
  const { data: row } = await supabase
    .from('lectures')
    .select('pdf_key, pdf_url, cover_url')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('lectures').delete().eq('id', id)
  if (error) throw error

  if (row?.pdf_key || row?.pdf_url || row?.cover_url) {
    try {
      const { deleteR2Object } = await import('./r2')
      const tasks = []
      if (row.pdf_key || row.pdf_url) {
        tasks.push(deleteR2Object({ key: row.pdf_key, url: row.pdf_url }).catch(() => {}))
      }
      if (row.cover_url) {
        tasks.push(deleteR2Object({ url: row.cover_url }).catch(() => {}))
      }
      await Promise.all(tasks)
    } catch { /* orphans in R2 — admin can clean up later */ }
  }
}
