import { supabase } from './supabase'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'

// List all playlists and their items
export async function listPlaylists() {
  const key = 'playlists:list'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('playlists')
      .select(`
        id, title, description, sort_order, is_active, created_at,
        playlist_items (
          id, playlist_id, content_type, content_id, sort_order, created_at
        )
      `)
      .order('sort_order', { ascending: true })
    if (error) throw error

    const rows = data || []
    for (const p of rows) {
      p.playlist_items = (p.playlist_items || []).sort((a, b) => a.sort_order - b.sort_order)
    }
    return rows
  })
}

// Create a new playlist
export async function createPlaylist({ title, description, sort_order, is_active }) {
  const { data, error } = await supabase
    .from('playlists')
    .insert({
      title,
      description: description || null,
      sort_order: parseInt(sort_order, 10) || 0,
      is_active: is_active !== false
    })
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('playlists:')
  return data
}

// Update a playlist's basic information
export async function updatePlaylist(id, { title, description, sort_order, is_active }) {
  const patch = {}
  if (title       !== undefined) patch.title = title
  if (description !== undefined) patch.description = description || null
  if (sort_order  !== undefined) patch.sort_order = parseInt(sort_order, 10) || 0
  if (is_active   !== undefined) patch.is_active = is_active

  const { data, error } = await supabase
    .from('playlists')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('playlists:')
  return data
}

// Delete a playlist
export async function deletePlaylist(id) {
  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', id)
  if (error) throw error
  invalidatePrefix('playlists:')
}

// Add an item to a playlist
export async function addPlaylistItem({ playlistId, contentType, contentId, sortOrder }) {
  const { data, error } = await supabase
    .from('playlist_items')
    .insert({
      playlist_id: playlistId,
      content_type: contentType,
      content_id: contentId,
      sort_order: parseInt(sortOrder, 10) || 0
    })
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('playlists:')
  return data
}

// Remove an item from a playlist by id
export async function removePlaylistItem(itemId) {
  const { error } = await supabase
    .from('playlist_items')
    .delete()
    .eq('id', itemId)
  if (error) throw error
  invalidatePrefix('playlists:')
}

// Bulk update playlist items sort orders
export async function reorderPlaylistItems(items) {
  const promises = items.map(item =>
    supabase
      .from('playlist_items')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
  )
  const results = await Promise.all(promises)
  for (const r of results) {
    if (r.error) throw r.error
  }
  invalidatePrefix('playlists:')
}
