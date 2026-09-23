import { supabase } from './supabase'
import { getDeviceToken, saveDeviceToken } from './deviceIdentity'

/* Student Device Limit — see backend/migrations/2026_09_23_student_device_limit.sql.
   The server is authoritative: it derives student, tenant, allowance and the
   feature flag from the session. The client only carries the device token. */

export const DEVICE_LIMIT_MESSAGE =
  'تم الوصول إلى الحد المسموح للأجهزة لهذا الحساب. ' +
  'هذا الحساب مسجل بالفعل على جهاز آخر. ' +
  'إذا كنت تحتاج إلى استخدام جهاز إضافي، يرجى التواصل مع المدرس أو إدارة السنتر.'

// Set by AuthContext when an open session is refused at app start, read once
// by the login page to explain why the student was signed out.
export const DEVICE_DENIED_FLAG = 'masar-device-denied'

// A login that was just authorized is followed by a full page load; this
// one-shot marker lets that first app start skip a second, identical check.
const CHECKED_KEY = 'masar-device-checked'
export function markDeviceChecked(studentId) {
  try { sessionStorage.setItem(CHECKED_KEY, studentId) } catch { }
}
export function consumeDeviceChecked(studentId) {
  try {
    const hit = sessionStorage.getItem(CHECKED_KEY) === studentId
    sessionStorage.removeItem(CHECKED_KEY)
    return hit
  } catch { return false }
}

export class DeviceLimitError extends Error {
  constructor() {
    super(DEVICE_LIMIT_MESSAGE)
    this.code = 'DEVICE_LIMIT'
  }
}

/**
 * Authorize the current session on this device.
 * Resolves to 'not_required' | 'allowed' | 'registered' | 'denied'.
 * On 'denied' the server has already ended the session.
 */
export async function authorizeDevice(studentId) {
  const token = await getDeviceToken(studentId)
  const { data, error } = await supabase.rpc('authorize_student_device', { p_device_token: token })
  if (error) throw error
  if (data?.status === 'registered' && data.device_token) saveDeviceToken(studentId, data.device_token)
  return data?.status || 'not_required'
}

/* ── Admin (admin / assistant with 'students' permission / super admin) ── */

export async function getStudentDevices(studentId) {
  const { data, error } = await supabase.rpc('admin_get_student_devices', { p_student_id: studentId })
  if (error) throw error
  return data
}

export async function setStudentMaxDevices(studentId, maxDevices) {
  const { error } = await supabase.rpc('admin_set_student_max_devices', {
    p_student_id: studentId,
    p_max_devices: maxDevices,
  })
  if (error) throw error
}

export async function revokeStudentDevice(deviceId) {
  const { error } = await supabase.rpc('admin_revoke_student_device', { p_device_id: deviceId })
  if (error) throw error
}
