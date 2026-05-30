import { supabase } from './supabase'

// Convert phone number to a fake email for Supabase auth, scoped per tenant
const phoneToEmail = (phone, tenantId) => {
  const cleanPhone = phone.replace(/\s+/g, '')
  const defaultTenantId = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'
  if (!tenantId || tenantId === defaultTenantId) {
    return `${cleanPhone}@masaar.app`
  }
  return `${cleanPhone}-${tenantId}@masaar.app`
}

export const authAPI = {

  // Login with phone + password
  login: async (phone, password, clientTenantId) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone, clientTenantId),
      password,
    })

    if (error) throw new Error('رقم الهاتف أو كلمة المرور غلط')

    // Fetch profile (name, role, level, tenant_id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, phone, grade, "group", role, avatar_url, tenant_id, is_active, is_approved')
      .eq('id', data.user.id)
      .single()

    if (profileError) throw new Error('فشل تحميل بيانات المستخدم')

    // Cross-tenant login validation
    if (clientTenantId && profile.tenant_id !== clientTenantId) {
      await supabase.auth.signOut()
      throw new Error('المستخدم غير مسجل في هذه المنصة')
    }

    return { token: data.session.access_token, user: profile }
  },

  // Logout
  logout: async () => {
    await supabase.auth.signOut()
    tokenAPI.removeToken()
  },

  // Register with name + phone + password (always student role)
  register: async (name, phone, password, clientTenantId, grade) => {
    if (!clientTenantId) throw new Error('معرف المنصة مطلوب لإتمام التسجيل')
    if (!grade) throw new Error('المرحلة الدراسية مطلوبة لإتمام التسجيل')

    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone, clientTenantId),
      password,
      options: {
        data: { 
          name, 
          phone: phone.trim(), 
          role: 'student', 
          grade,
          tenant_id: clientTenantId
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
      }, { onConflict: 'id' })

    if (upsertError) throw new Error('فشل إنشاء الملف الشخصي: ' + upsertError.message)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, phone, grade, "group", role, avatar_url, tenant_id, is_active, is_approved')
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
