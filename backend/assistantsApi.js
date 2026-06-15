import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { invalidate as invalidateCache } from '../src/utils/cache'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Secondary un-persisted client used to register assistants without logging out the teacher
const getTempClient = () => {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: undefined, // disables persistence
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

const phoneToEmail = (phone, tenantId) => {
  const cleanPhone = phone.replace(/\s+/g, '')
  const defaultTenantId = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'
  if (!tenantId || tenantId === defaultTenantId) {
    return `${cleanPhone}@masaar.app`
  }
  return `${cleanPhone}-${tenantId}@masaar.app`
}

// List assistants and their permissions
export async function listAssistants() {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      name,
      phone,
      created_at,
      tenant_admins (
        role,
        permissions
      )
    `)
    .eq('role', 'assistant')
    .order('name', { ascending: true })

  if (error) throw error
  return (data || []).map(p => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    created_at: p.created_at,
    role: p.tenant_admins?.[0]?.role || 'assistant',
    permissions: p.tenant_admins?.[0]?.permissions || []
  }))
}

// Create assistant account (requires primary admin auth session)
export async function createAssistant(name, phone, password, permissions, tenantId) {
  if (!tenantId) throw new Error('Tenant ID is required')
  
  const tempClient = getTempClient()
  const email = phoneToEmail(phone, tenantId)

  // 1. Sign up the user in Supabase auth using temp client
  const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name.trim(),
        phone: phone.trim(),
        role: 'assistant',
        tenant_id: tenantId
      }
    }
  })

  if (signUpError) throw signUpError
  if (!signUpData.user) throw new Error('فشل إنشاء حساب المساعد في المصادقة')

  const assistantUserId = signUpData.user.id

  // 2. Manually upsert profile with role = 'assistant' to prevent trigger delays
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: assistantUserId,
      name: name.trim(),
      phone: phone.trim(),
      role: 'assistant',
      tenant_id: tenantId,
      is_active: true,
      is_approved: true
    }, { onConflict: 'id' })

  if (profileError) {
    console.error('Profile upsert error:', profileError)
    throw new Error('فشل تحديث ملف المساعد الشخصي')
  }

  // 3. Create permissions mapping in tenant_admins
  const { error: adminError } = await supabase
    .from('tenant_admins')
    .insert({
      tenant_id: tenantId,
      user_id: assistantUserId,
      role: 'assistant',
      permissions: permissions || []
    })

  if (adminError) {
    console.error('Tenant admin permissions insert error:', adminError)
    throw new Error('فشل إعداد صلاحيات المساعد')
  }

  // Clear caches
  invalidateCache('students')
  return { id: assistantUserId, name, phone, role: 'assistant', permissions }
}

// Update assistant profile and permissions
export async function updateAssistant(userId, name, phone, permissions, tenantId) {
  // Update profiles row
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      name: name.trim(),
      phone: phone.trim()
    })
    .eq('id', userId)

  if (profileError) throw profileError

  // Update permissions in tenant_admins
  const { error: adminError } = await supabase
    .from('tenant_admins')
    .upsert({
      tenant_id: tenantId,
      user_id: userId,
      role: 'assistant',
      permissions: permissions || []
    }, { onConflict: 'tenant_id,user_id' })

  if (adminError) throw adminError

  // Clear cache
  invalidateCache('students')
  return { id: userId, name, phone, permissions }
}

// Delete assistant account
export async function deleteAssistant(userId) {
  // Deleting the profile row will CASCADE delete their tenant_admins record
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)

  if (error) throw error

  // Clear cache
  invalidateCache('students')
  return true
}
