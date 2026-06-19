import { supabase } from './supabase'

export async function listAttachments(entityType, entityId) {
  const { data, error } = await supabase
    .from('attachments')
    .select('id, file_url, file_key, file_name, file_size, mime_type, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createAttachment(attachment) {
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      entity_type: attachment.entityType,
      entity_id: attachment.entityId,
      file_url: attachment.fileUrl,
      file_key: attachment.fileKey,
      file_name: attachment.fileName,
      file_size: attachment.fileSize || null,
      mime_type: attachment.mimeType || null,
      created_by: attachment.createdBy || null
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAttachment(id) {
  // Fetch attachment first to get file key
  const { data: row, error: fetchError } = await supabase
    .from('attachments')
    .select('file_key, file_url')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw fetchError

  // Delete from DB
  const { error: dbError } = await supabase
    .from('attachments')
    .delete()
    .eq('id', id)
  if (dbError) throw dbError

  // Delete from R2
  if (row?.file_key || row?.file_url) {
    try {
      const { deleteR2Object } = await import('./r2')
      await deleteR2Object({ key: row.file_key, url: row.file_url }).catch(() => {})
    } catch (err) {
      console.error('Failed to delete attachment file from R2:', err)
    }
  }

  return true
}
