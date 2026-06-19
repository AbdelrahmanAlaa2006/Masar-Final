import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'

/* Admin-only: list every student profile. RLS policy profiles_admin_all
   lets an admin read all rows; a student would only see themselves. */
export async function listStudents() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, grade, "group", password, avatar_url, created_at, is_active, is_approved, qr_token, parent_phone, branch_id, academic_year_id, status, enrollment_type, flags, father_name, father_phone, mother_name, mother_phone, guardian_name, guardian_phone, guardian_relation')
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
      .select('id, name, phone, grade, "group", role, avatar_url, is_active, is_approved, qr_token, parent_phone, branch_id, academic_year_id, status, enrollment_type, flags, father_name, father_phone, mother_name, mother_phone, guardian_name, guardian_phone, guardian_relation')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  })
}

export async function updateStudentStatus(studentId, { is_approved, is_active }) {
  const patch = {}
  if (is_approved !== undefined) patch.is_approved = is_approved
  if (is_active !== undefined) patch.is_active = is_active

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', studentId)
    .select()
    .single()

  if (error) throw error

  invalidateProfile(studentId)
  invalidateCache('students')
  return data
}

export async function updateStudentProfile(studentId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      branch_id: updates.branch_id || null,
      academic_year_id: updates.academic_year_id || null,
      status: updates.status,
      enrollment_type: updates.enrollment_type,
      flags: updates.flags || [],
      father_name: updates.father_name || null,
      father_phone: updates.father_phone || null,
      mother_name: updates.mother_name || null,
      mother_phone: updates.mother_phone || null,
      guardian_name: updates.guardian_name || null,
      guardian_phone: updates.guardian_phone || null,
      guardian_relation: updates.guardian_relation || null,
      is_approved: updates.status === 'active' || updates.is_approved || false,
      is_active: updates.status === 'active' || updates.is_active || false
    })
    .eq('id', studentId)
    .select()
    .single()

  if (error) throw error

  invalidateProfile(studentId)
  invalidateCache('students')
  return data
}

export function invalidateProfile(id) {
  if (id) invalidateCache(`profile:${id}`)
}

export async function getStudentIdentityByQr(qrToken, tenantId) {
  const { data, error } = await supabase.rpc('get_student_identity_by_qr', {
    p_qr_token: qrToken,
    p_tenant_id: tenantId
  })
  if (error) throw error
  return data
}
