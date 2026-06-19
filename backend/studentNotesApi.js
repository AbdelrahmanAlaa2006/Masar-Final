import { supabase } from './supabase'

export async function listNotesForStudent(studentId) {
  const { data, error } = await supabase
    .from('student_notes')
    .select(`
      id,
      note,
      created_at,
      created_by,
      profiles:created_by ( name )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createStudentNote(studentId, note, createdBy) {
  const { data, error } = await supabase
    .from('student_notes')
    .insert({
      student_id: studentId,
      note,
      created_by: createdBy
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStudentNote(noteId) {
  const { error } = await supabase
    .from('student_notes')
    .delete()
    .eq('id', noteId)
  if (error) throw error
  return true
}
