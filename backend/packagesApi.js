import { supabase } from './supabase'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'
import { createNotification } from './notificationsApi'

// List all packages and their bundled items
export async function listPackages() {
  const key = 'packages:list'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('packages')
      .select(`
        id, title, description, price, is_active, thumbnail, grade, created_at,
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
export async function createPackage({ title, description, price, is_active, thumbnail, grade, items }) {
  const { data: pkg, error: pkgErr } = await supabase
    .from('packages')
    .insert({
      title,
      description: description || null,
      price: parseFloat(price) || 0,
      is_active: is_active !== false,
      thumbnail: thumbnail || null,
      grade: grade || 'first-sec'
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
export async function updatePackage(id, { title, description, price, is_active, thumbnail, grade, items }) {
  const patch = {}
  if (title       !== undefined) patch.title = title
  if (description !== undefined) patch.description = description || null
  if (price       !== undefined) patch.price = parseFloat(price) || 0
  if (is_active   !== undefined) patch.is_active = is_active
  if (thumbnail   !== undefined) patch.thumbnail = thumbnail || null
  if (grade       !== undefined) patch.grade = grade

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

  // Create corresponding pending record in student_ledger to treat as a payment request
  try {
    const { data: pkg } = await supabase
      .from('packages')
      .select('title, price')
      .eq('id', packageId)
      .single()

    const { data: studentProfile } = await supabase
      .from('profiles')
      .select('branch_id, academic_year_id, name')
      .eq('id', studentId)
      .single()

    const ledgerPayload = {
      student_id: studentId,
      branch_id: studentProfile?.branch_id || null,
      academic_year_id: studentProfile?.academic_year_id || null,
      type: 'payment',
      amount: pkg ? parseFloat(pkg.price) : 0,
      payment_method: paymentMethod,
      screenshot_url: screenshotUrl || null,
      description: pkg ? `شراء باقة: ${pkg.title}` : 'شراء باقة',
      status: 'pending',
      package_id: packageId
    }

    const { error: ledgerErr } = await supabase
      .from('student_ledger')
      .insert(ledgerPayload)

    if (ledgerErr) {
      console.error('Failed to insert package purchase to student_ledger:', ledgerErr)
    } else {
      // Notify admins
      try {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')

        if (admins && admins.length > 0) {
          const studentName = studentProfile?.name || 'طالب جديد'
          const pkgTitle = pkg?.title || 'باقة'
          const price = pkg?.price || 0

          for (const admin of admins) {
            await createNotification({
              title: 'طلب تأكيد دفع جديد 💰',
              message: `قام الطالب ${studentName} بإرسال إيصال لشراء باقة "${pkgTitle}" بقيمة ${price} ج.م.`,
              level: 'warning',
              scope: 'student',
              targetStudent: admin.id,
              meta: { kind: 'payment_pending' }
            })
          }
        }
      } catch (err) {
        console.error('Failed to notify admins of pending package payment:', err)
      }
    }
  } catch (err) {
    console.error('Failed to link package purchase to student_ledger:', err)
  }

  invalidatePrefix('purchases:')
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')
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
        packages:package_id ( id, title, price )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

// Fetch student's own purchase history
export async function listMyPurchases(studentId) {
  if (!studentId || studentId === 'undefined') return []
  const key = `purchases:student:${studentId}`
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('package_purchases')
      .select(`
        id, package_id, payment_method, payment_status, screenshot_url, approved_at, created_at,
        packages:package_id ( id, title, price, thumbnail )
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

  // Sync corresponding student_ledger record and notify student
  try {
    const { error: ledgerErr } = await supabase
      .from('student_ledger')
      .update({
        status: status,
        resolved_at: new Date().toISOString(),
        resolved_by: adminId,
        notes: status === 'approved' ? 'تم قبول طلب الشراء وتفعيل الباقة' : 'تم رفض طلب الشراء'
      })
      .eq('student_id', data.student_id)
      .eq('package_id', data.package_id)
      .eq('status', 'pending')

    if (ledgerErr) {
      console.error('Failed to resolve corresponding student_ledger record:', ledgerErr)
    }

    try {
      const { data: pkg } = await supabase
        .from('packages')
        .select('title, price')
        .eq('id', data.package_id)
        .single()

      const titleAr = status === 'approved' ? 'تم قبول دفعتك لشراء الباقة' : 'تم رفض دفعتك لشراء الباقة'
      const messageAr = status === 'approved'
        ? `تمت الموافقة على دفعتك بقيمة ${pkg?.price || 0} ج.م لشراء باقة "${pkg?.title || ''}" وتفعيل محتواها بنجاح.`
        : `تم رفض دفعتك لشراء باقة "${pkg?.title || ''}". يرجى مراجعة الإدارة.`

      await createNotification({
        title: titleAr,
        message: messageAr,
        level: status === 'approved' ? 'success' : 'danger',
        scope: 'student',
        targetStudent: data.student_id,
        createdBy: adminId
      })
    } catch (err) {
      console.error('Failed to notify student of purchase resolution:', err)
    }
  } catch (err) {
    console.error('Failed to update student_ledger resolve:', err)
  }

  invalidatePrefix('purchases:')
  invalidatePrefix('student-content:')
  invalidatePrefix('videos')
  invalidatePrefix('exams')
  invalidatePrefix('homeworks')
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')
  return data
}


// List content items that a student currently has active access to
export async function listStudentContentAccess(studentId) {
  if (!studentId || studentId === 'undefined') return []
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
