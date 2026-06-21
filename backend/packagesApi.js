import { supabase } from './supabase'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'

// List all packages and their bundled items
export async function listPackages() {
  const key = 'packages:list'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('packages')
      .select(`
        id, title, description, price, is_active, thumbnail, created_at,
        package_items (
          id, package_id, item_type, item_id, created_at
        )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

// Create a new package and its items
export async function createPackage({ title, description, price, is_active, thumbnail, items }) {
  const { data: pkg, error: pkgErr } = await supabase
    .from('packages')
    .insert({
      title,
      description: description || null,
      price: parseFloat(price) || 0,
      is_active: is_active !== false,
      thumbnail: thumbnail || null
    })
    .select()
    .single()
  if (pkgErr) throw pkgErr

  if (Array.isArray(items) && items.length > 0) {
    const rows = items.map(item => ({
      package_id: pkg.id,
      item_type: item.item_type,
      item_id: item.item_id
    }))
    const { error: itemsErr } = await supabase.from('package_items').insert(rows)
    if (itemsErr) {
      // rollback package creation to prevent orphaned row
      await supabase.from('packages').delete().eq('id', pkg.id)
      throw itemsErr
    }
  }

  invalidatePrefix('packages:')
  return pkg
}

// Update an existing package and rewrite its bundled items
export async function updatePackage(id, { title, description, price, is_active, thumbnail, items }) {
  const patch = {}
  if (title       !== undefined) patch.title = title
  if (description !== undefined) patch.description = description || null
  if (price       !== undefined) patch.price = parseFloat(price) || 0
  if (is_active   !== undefined) patch.is_active = is_active
  if (thumbnail   !== undefined) patch.thumbnail = thumbnail || null

  const { data: pkg, error: pkgErr } = await supabase
    .from('packages')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (pkgErr) throw pkgErr

  if (Array.isArray(items)) {
    // Delete existing items and insert the new set (simplifies sync)
    const { error: delErr } = await supabase.from('package_items').delete().eq('package_id', id)
    if (delErr) throw delErr

    if (items.length > 0) {
      const rows = items.map(item => ({
        package_id: id,
        item_type: item.item_type,
        item_id: item.item_id
      }))
      const { error: insErr } = await supabase.from('package_items').insert(rows)
      if (insErr) throw insErr
    }
  }

  invalidatePrefix('packages:')
  invalidatePrefix('student-content:')
  invalidatePrefix('videos')
  invalidatePrefix('exams')
  invalidatePrefix('homeworks')
  return pkg
}

// Delete a package
export async function deletePackage(id) {
  const { error } = await supabase.from('packages').delete().eq('id', id)
  if (error) throw error
  invalidatePrefix('packages:')
  invalidatePrefix('student-content:')
  invalidatePrefix('videos')
  invalidatePrefix('exams')
  invalidatePrefix('homeworks')
}

// Submit a student package purchase order
export async function purchasePackage({ studentId, packageId, paymentMethod, screenshotUrl }) {
  const { data, error } = await supabase
    .from('package_purchases')
    .insert({
      student_id: studentId,
      package_id: packageId,
      payment_method: paymentMethod,
      screenshot_url: screenshotUrl || null,
      payment_status: 'pending'
    })
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('purchases:')
  return data
}

// Fetch all purchases (pending/resolved) for admin control dashboard
export async function listPurchases() {
  const key = 'purchases:list'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('package_purchases')
      .select(`
        id, tenant_id, student_id, package_id, payment_method, payment_status, screenshot_url, approved_by, approved_at, created_at,
        profiles:student_id ( name, phone, grade ),
        packages:package_id ( title, price )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

// Fetch student's own purchase history
export async function listMyPurchases(studentId) {
  if (!studentId) return []
  const key = `purchases:student:${studentId}`
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('package_purchases')
      .select(`
        id, package_id, payment_method, payment_status, screenshot_url, approved_at, created_at,
        packages:package_id ( title, price, thumbnail )
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

// Approve or reject a student purchase request
export async function resolvePurchase(purchaseId, status, adminId) {
  const { data, error } = await supabase
    .from('package_purchases')
    .update({
      payment_status: status,
      approved_by: adminId,
      approved_at: new Date().toISOString()
    })
    .eq('id', purchaseId)
    .select()
    .single()
  if (error) throw error

  invalidatePrefix('purchases:')
  invalidatePrefix('student-content:')
  invalidatePrefix('videos')
  invalidatePrefix('exams')
  invalidatePrefix('homeworks')
  return data
}

// List content items that a student currently has active access to
export async function listStudentContentAccess(studentId) {
  if (!studentId) return []
  const key = `student-content:access:${studentId}`
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('student_content_access')
      .select('*')
      .eq('student_id', studentId)
    if (error) throw error
    return data || []
  })
}

// Grant manual override / custom admin access to a student for a specific item
export async function grantManualAccess({ studentId, contentType, contentId, expiresAt, adminId }) {
  const { data, error } = await supabase
    .from('student_content_access')
    .insert({
      student_id: studentId,
      content_type: contentType,
      content_id: contentId,
      expires_at: expiresAt || null,
      source_type: 'admin',
      granted_by: adminId
    })
    .select()
    .single()
  if (error) throw error

  invalidatePrefix(`student-content:access:${studentId}`)
  invalidatePrefix('videos')
  invalidatePrefix('exams')
  invalidatePrefix('homeworks')
  return data
}

// Revoke manual content access
export async function revokeManualAccess(accessId, studentId) {
  const { error } = await supabase
    .from('student_content_access')
    .delete()
    .eq('id', accessId)
  if (error) throw error

  invalidatePrefix(`student-content:access:${studentId}`)
  invalidatePrefix('videos')
  invalidatePrefix('exams')
  invalidatePrefix('homeworks')
}
