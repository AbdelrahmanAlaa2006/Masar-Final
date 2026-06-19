import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'

export async function listAcademicYears() {
  return cached('academic-years-list', LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('academic_years')
      .select('id, name, is_active, created_at')
      .order('name', { ascending: false })
    if (error) throw error
    return data || []
  })
}

export async function createAcademicYear(name, isActive = false) {
  // If this academic year is active, set all others to inactive first
  if (isActive) {
    await supabase.from('academic_years').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  }

  const { data, error } = await supabase
    .from('academic_years')
    .insert({ name, is_active: isActive })
    .select()
    .single()
  if (error) throw error
  invalidateCache('academic-years-list')
  return data
}

export async function updateAcademicYear(id, name, isActive) {
  if (isActive) {
    await supabase.from('academic_years').update({ is_active: false }).neq('id', id)
  }

  const { data, error } = await supabase
    .from('academic_years')
    .update({ name, is_active: isActive })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidateCache('academic-years-list')
  return data
}

export async function deleteAcademicYear(id) {
  const { error } = await supabase
    .from('academic_years')
    .delete()
    .eq('id', id)
  if (error) throw error
  invalidateCache('academic-years-list')
  return true
}
