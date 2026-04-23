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
    .select('id, title, description, subject, teacher, week, grade, cover_url, pdf_url, created_at')
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
  const { error } = await supabase.from('lectures').delete().eq('id', id)
  if (error) throw error
}
