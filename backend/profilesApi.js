import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'

/* Admin-only: list every student profile. RLS policy profiles_admin_all
   lets an admin read all rows; a student would only see themselves. */
export async function listStudents() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, grade, "group", avatar_url, created_at')
    .eq('role', 'student')
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

/* Fetch one profile (used to look up the target student's grade when an
   admin views "<student>/report"). RLS returns the row for the viewer
   themselves, or any row when the viewer is an admin. */
// Cached so flipping between students in admin reports doesn't fetch
// the same profile repeatedly. Invalidated by `invalidateProfile(id)`
// which other modules call after editing a row (e.g. avatar upload).
export async function getProfile(id) {
  if (!id) return null
  return cached(`profile:${id}`, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, phone, grade, "group", role, avatar_url')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  })
}

export function invalidateProfile(id) {
  if (id) invalidateCache(`profile:${id}`)
}
