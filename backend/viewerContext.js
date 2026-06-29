import { supabase } from './supabase'
import { cached, invalidate } from '../src/utils/cache'

/* Resolves the current viewer's identity, role and permissions ONCE and caches
   it briefly. Previously every content list (listVideos / listExams /
   listHomeworks) ran its own auth.getUser() + profiles role lookup, so the
   student dashboard — which loads all three concurrently — issued 3× the same
   auth/role round-trips. They now share a single resolution via this cache
   (in-flight dedup collapses the concurrent calls; a short TTL covers quick
   re-navigations). RLS still enforces access server-side regardless. */
const VIEWER_TTL = 60 * 1000

export async function getViewerContext() {
  return cached('viewer-context', VIEWER_TTL, async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { userId: null, role: null, isStaffAdmin: false, isStudent: false, permissions: [] }
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const role = profile?.role || null
    let permissions = []
    if (role === 'assistant') {
      const { data: adminData } = await supabase
        .from('tenant_admins')
        .select('permissions')
        .eq('user_id', user.id)
        .maybeSingle()
      if (adminData && Array.isArray(adminData.permissions)) permissions = adminData.permissions
    }
    return {
      userId: user.id,
      role,
      isStaffAdmin: role === 'admin' || role === 'super_admin',
      isStudent: role === 'student',
      permissions,
    }
  })
}

// Force a fresh resolution (call on login / role change). Logout's
// invalidateAll() already clears it.
export function invalidateViewerContext() {
  invalidate('viewer-context')
}
