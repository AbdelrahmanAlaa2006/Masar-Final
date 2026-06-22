import { supabase } from './supabase'

export async function listScheduledEvents(filters = {}) {
  let query = supabase
    .from('scheduled_events')
    .select('*')
    .order('starts_at', { ascending: true })

  if (filters.grade && filters.grade !== 'all') {
    query = query.eq('grade', filters.grade)
  }
  if (filters.packageId && filters.packageId !== 'all') {
    query = query.eq('package_id', filters.packageId)
  }
  if (filters.groupId && filters.groupId !== 'all') {
    query = query.eq('group_id', filters.groupId)
  }
  if (filters.startDate) {
    query = query.gte('starts_at', filters.startDate)
  }
  if (filters.endDate) {
    query = query.lte('starts_at', filters.endDate)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createScheduledEvent(event) {
  const { data, error } = await supabase
    .from('scheduled_events')
    .insert(event)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateScheduledEvent(id, patch) {
  const { data, error } = await supabase
    .from('scheduled_events')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteScheduledEvent(id) {
  const { error } = await supabase
    .from('scheduled_events')
    .delete()
    .eq('id', id)

  if (error) throw error
}
