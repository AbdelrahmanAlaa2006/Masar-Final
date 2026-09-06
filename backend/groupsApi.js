import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, invalidatePrefix, LIST_TTL } from '../src/utils/cache'

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

  // If grade or name changed, cascade update to assigned students in profiles
  try {
    const { data: sgRows } = await supabase
      .from('student_groups')
      .select('student_id')
      .eq('group_id', id)

    const studentIds = (sgRows || []).map(r => r.student_id).filter(Boolean)
    const profileUpdates = {}
    if (grade) profileUpdates.grade = grade
    if (name) profileUpdates.group = name

    if (studentIds.length > 0 && Object.keys(profileUpdates).length > 0) {
      await supabase
        .from('profiles')
        .update(profileUpdates)
        .in('id', studentIds)
    }

    // Also fallback update any profile whose legacy "group" string matches the group name
    if (grade && name) {
      await supabase
        .from('profiles')
        .update({ grade })
        .eq('group', name)
    }
  } catch (syncErr) {
    console.warn('Group update student cascade warning:', syncErr)
  }

  invalidateCache('groups-list')
  invalidatePrefix('students')
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

  invalidatePrefix('students')
  return data
}

export async function setStudentGroups(studentId, { primaryGroupId, secondaryGroupId }) {
  const { error: delError } = await supabase
    .from('student_groups')
    .delete()
    .eq('student_id', studentId)
  if (delError) throw delError

  const records = []
  if (primaryGroupId) {
    records.push({ student_id: studentId, group_id: primaryGroupId, is_primary: true })
  }
  if (secondaryGroupId && secondaryGroupId !== primaryGroupId) {
    records.push({ student_id: studentId, group_id: secondaryGroupId, is_primary: false })
  }

  if (records.length > 0) {
    const { error: insError } = await supabase
      .from('student_groups')
      .insert(records)
    if (insError) throw insError
  }

  let primaryName = null
  if (primaryGroupId) {
    const { data: groupData } = await supabase
      .from('groups')
      .select('name')
      .eq('id', primaryGroupId)
      .maybeSingle()
    if (groupData) primaryName = groupData.name
  }

  await supabase
    .from('profiles')
    .update({ "group": primaryName })
    .eq('id', studentId)

  invalidatePrefix('students')
  return true
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
  invalidatePrefix('students')
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
  if (!groupId) return []
  const CHUNK_SIZE = 1000
  let allData = []
  let from = 0
  while (true) {
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
      .range(from, from + CHUNK_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < CHUNK_SIZE) break
    from += CHUNK_SIZE
  }
  return allData.map(d => d.profiles).filter(Boolean)
}
