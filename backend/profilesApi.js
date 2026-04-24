import { supabase } from './supabase'

/* Admin-only: list every student profile. RLS policy profiles_admin_all
   lets an admin read all rows; a student would only see themselves. */
export async function listStudents() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, grade, avatar_url, created_at')
    .eq('role', 'student')
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

/* Fetch one profile (used to look up the target student's grade when an
   admin views "<student>/report"). RLS returns the row for the viewer
   themselves, or any row when the viewer is an admin. */
export async function getProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, grade, role, avatar_url')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}
