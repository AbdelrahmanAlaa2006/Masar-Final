import { supabase } from './supabase'

// Convert phone number to a fake email for Supabase auth, scoped per tenant
const phoneToEmail = (phone, tenantId) => {
  // The login handle is usually a phone, but tenants with the `login_code`
  // feature let special-case students sign up with a short alphanumeric code.
  // Lowercasing normalizes codes so signup and login always resolve to the same
  // email; for digit-only phones it's a no-op (fully backward compatible).
  const cleanPhone = phone.replace(/\s+/g, '').toLowerCase()
  const defaultTenantId = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'
  if (!tenantId || tenantId === defaultTenantId) {
    return `${cleanPhone}@masaar.app`
  }
  return `${cleanPhone}-${tenantId}@masaar.app`
}

export const authAPI = {

  // Login with phone + password
  login: async (phone, password, clientTenantId) => {
    let authData = null
    let authError = null

    // 1. Try tenant-scoped login first
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(phone, clientTenantId),
        password,
      })
      if (error) throw error
      authData = data
    } catch (err) {
      authError = err

      // 2. Fallback: Try default tenant (Global Super Admin) login
      const defaultTenantId = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'
      if (clientTenantId && clientTenantId !== defaultTenantId) {
        try {
          const { data, error: fallbackError } = await supabase.auth.signInWithPassword({
            email: phoneToEmail(phone, defaultTenantId),
            password,
          })
          if (!fallbackError && data?.user) {
            authData = data
            authError = null
          }
        } catch (fErr) {
          // ignore fallback error
        }
      }
    }

    if (authError || !authData) {
      throw new Error('رقم الهاتف أو كلمة المرور غلط')
    }

    // Fetch profile (name, role, level, tenant_id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, phone, grade, "group", role, avatar_url, tenant_id, is_active, is_approved, created_at, status')
      .eq('id', authData.user.id)
      .single()

    if (profileError) throw new Error('فشل تحميل بيانات المستخدم')

    // Cross-tenant login validation (Super Admins are allowed to bypass tenant checks)
    if (clientTenantId && profile.tenant_id !== clientTenantId && profile.role !== 'super_admin') {
      await supabase.auth.signOut()
      throw new Error('المستخدم غير مسجل في هذه المنصة')
    }

    return { token: authData.session.access_token, user: profile }
  },

  // Logout
  logout: async () => {
    await supabase.auth.signOut()
    tokenAPI.removeToken()
  },

  // Register with name + phone + password (always student role)
  register: async (name, phone, password, clientTenantId, grade, parentPhone, enrollmentType, branchId, groupId, groupName) => {
    if (!clientTenantId) throw new Error('معرف المنصة مطلوب لإتمام التسجيل')
    if (!grade) throw new Error('المرحلة الدراسية مطلوبة لإتمام التسجيل')

    // Fetch active academic year
    let activeYearId = null
    try {
      const { data: activeYear } = await supabase
        .from('academic_years')
        .select('id')
        .eq('tenant_id', clientTenantId)
        .eq('is_active', true)
        .maybeSingle()
      if (activeYear) {
        activeYearId = activeYear.id
      }
    } catch (err) {
      console.error('Failed to fetch active academic year on signup:', err)
    }

    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone, clientTenantId),
      password,
      options: {
        data: { 
          name, 
          phone: phone.trim(), 
          role: 'student', 
          grade,
          tenant_id: clientTenantId,
          parent_phone: parentPhone ? parentPhone.trim() : '',
          enrollment_type: enrollmentType || 'CENTER',
          branch_id: branchId || null,
          group_id: groupId || null,
          group: groupName || null,
          academic_year_id: activeYearId
        },
      },
    })

    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('فشل إنشاء الحساب')

    // Upsert profile manually (trigger may or may not have run)
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        name: name.trim(),
        phone: phone.trim(),
        role: 'student',
        tenant_id: clientTenantId,
        grade: grade,
        parent_phone: parentPhone ? parentPhone.trim() : '',
        enrollment_type: enrollmentType || 'CENTER',
        branch_id: branchId || null,
        group: groupName || null,
        academic_year_id: activeYearId
      }, { onConflict: 'id' })

    if (upsertError) throw new Error('فشل إنشاء الملف الشخصي: ' + upsertError.message)

    // Assign to group in student_groups join table if groupId is provided
    if (groupId) {
      try {
        await supabase
          .from('student_groups')
          .upsert({
            student_id: data.user.id,
            group_id: groupId,
            is_primary: true
          }, { onConflict: 'student_id,group_id' })
      } catch (err) {
        console.error('Failed to link student to group on register:', err)
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, phone, grade, "group", role, avatar_url, tenant_id, is_active, is_approved, created_at')
      .eq('id', data.user.id)
      .single()

    if (profileError) throw new Error('فشل تحميل بيانات المستخدم')

    return { token: data.session?.access_token, user: profile }
  },
}

/* Session-only storage so closing the browser/tab requires a fresh
   login next visit. We also clean up any old localStorage keys from
   previous builds where tokens were persisted across sessions. */
if (typeof window !== 'undefined') {
  localStorage.removeItem('masar-token')
  localStorage.removeItem('masar-user')
}

export const tokenAPI = {
  setToken: (token) => sessionStorage.setItem('masar-token', token),
  getToken: () => sessionStorage.getItem('masar-token'),
  removeToken: () => {
    sessionStorage.removeItem('masar-token')
    sessionStorage.removeItem('masar-user')
  },
  isLoggedIn: () => !!sessionStorage.getItem('masar-token'),
}
