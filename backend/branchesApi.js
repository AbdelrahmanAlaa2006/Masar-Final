import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'

export async function listBranches() {
  return cached('branches-list', LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, created_at')
      .order('name', { ascending: true })
    if (error) throw error
    return data || []
  })
}

export async function createBranch(name) {
  const { data, error } = await supabase
    .from('branches')
    .insert({ name })
    .select()
    .single()
  if (error) throw error
  invalidateCache('branches-list')
  return data
}

export async function updateBranch(id, name) {
  const { data, error } = await supabase
    .from('branches')
    .update({ name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidateCache('branches-list')
  return data
}

export async function deleteBranch(id) {
  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', id)
  if (error) throw error
  invalidateCache('branches-list')
  return true
}
