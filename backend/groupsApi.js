import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'

export async function listGroups() {
  return cached('groups-list', LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('groups')
      .select(`
        id,
        name,
        grade,
        branch_id,
        academic_year_id,
        branches ( name ),
        academic_years ( name )
      `)
      .order('name', { ascending: true })
    if (error) throw error
    return data || []
  })
}

export async function createGroup({ name, grade, branchId, academicYearId }) {
  const { data, error } = await supabase
    .from('groups')
    .insert({
      name,
      grade,
      branch_id: branchId || null,
      academic_year_id: academicYearId || null
    })
    .select()
    .single()
  if (error) throw error
  invalidateCache('groups-list')
  return data
}

export async function updateGroup(id, { name, grade, branchId, academicYearId }) {
  const { data, error } = await supabase
    .from('groups')
    .update({
      name,
      grade,
      branch_id: branchId || null,
      academic_year_id: academicYearId || null
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidateCache('groups-list')
  return data
}

export async function deleteGroup(id) {
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', id)
  if (error) throw error
  invalidateCache('groups-list')
  return true
}

export async function assignStudentToGroup(studentId, groupId, isPrimary = true) {
  // If isPrimary, set other groups for this student to false
  if (isPrimary) {
    const { error: resetError } = await supabase
      .from('student_groups')
      .update({ is_primary: false })
      .eq('student_id', studentId)
    if (resetError) throw resetError
  }

  const { data, error } = await supabase
    .from('student_groups')
    .upsert({
      student_id: studentId,
      group_id: groupId,
      is_primary: isPrimary
    }, { onConflict: 'student_id,group_id' })
    .select()
    .single()
  if (error) throw error

  // Also update legacy group column on profiles
  const { data: groupData } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .maybeSingle()
  if (groupData) {
    await supabase
      .from('profiles')
      .update({ "group": groupData.name })
      .eq('id', studentId)
  }

  invalidateCache('students')
  return data
}

export async function listStudentGroups(studentId) {
  const { data, error } = await supabase
    .from('student_groups')
    .select(`
      id,
      student_id,
      group_id,
      is_primary,
      groups (
        id,
        name,
        grade,
        branches ( name ),
        academic_years ( name )
      )
    `)
    .eq('student_id', studentId)
  if (error) throw error
  return data || []
}

export async function bulkTransferStudents(studentIds, targetGroupId, tenantId) {
  const { error } = await supabase.rpc('bulk_group_transfer', {
    p_student_ids: studentIds,
    p_target_group_id: targetGroupId,
    p_tenant_id: tenantId
  })
  if (error) throw error
  invalidateCache('students')
  return true
}

export async function transferStudentGroup(studentId, sourceGroupId, targetGroupId) {
  if (sourceGroupId) {
    const { error: delError } = await supabase
      .from('student_groups')
      .delete()
      .eq('student_id', studentId)
      .eq('group_id', sourceGroupId)
    if (delError) throw delError
  }
  return assignStudentToGroup(studentId, targetGroupId)
}

export async function listStudentsByGroup(groupId) {
  const { data, error } = await supabase
    .from('student_groups')
    .select(`
      student_id,
      profiles:student_id (
        id,
        name,
        phone,
        grade,
        "group",
        barcode_token,
        student_groups(group_id)
      )
    `)
    .eq('group_id', groupId)
  if (error) throw error
  return data.map(d => d.profiles).filter(Boolean)
}
