import { supabase } from './supabase'

// Convert phone number to a fake email for Supabase auth
const phoneToEmail = (phone) => `${phone.replace(/\s+/g, '')}@masaar.app`

export const authAPI = {

  // Login with phone + password
  login: async (phone, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    })

    if (error) throw new Error('رقم الهاتف أو كلمة المرور غلط')

    // Fetch profile (name, role, level)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    if (profileError) throw new Error('فشل تحميل بيانات المستخدم')

    return { token: data.session.access_token, user: profile }
  },

  // Logout
  logout: async () => {
    await supabase.auth.signOut()
    tokenAPI.removeToken()
  },

  // Register with name + phone + password (always student role)
  register: async (name, phone, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password,
      options: {
        data: { name, phone: phone.trim(), role: 'student' },
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
      }, { onConflict: 'id' })

    if (upsertError) throw new Error('فشل إنشاء الملف الشخصي: ' + upsertError.message)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    if (profileError) throw new Error('فشل تحميل بيانات المستخدم')

    return { token: data.session?.access_token, user: profile }
  },
}

export const tokenAPI = {
  setToken: (token) => localStorage.setItem('masar-token', token),
  getToken: () => localStorage.getItem('masar-token'),
  removeToken: () => {
    localStorage.removeItem('masar-token')
    localStorage.removeItem('masar-user')
  },
  isLoggedIn: () => !!localStorage.getItem('masar-token'),
}
