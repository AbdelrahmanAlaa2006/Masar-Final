import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { invalidateAll } from '../utils/cache'
import { invalidateViewerContext } from '@backend/viewerContext'
import { authStore, setPersistent, clearAuth } from '@backend/authStorage'
import { useTenant } from './TenantContext'
import { supabase } from '@backend/supabase'
import { authorizeDevice, consumeDeviceChecked, DEVICE_DENIED_FLAG } from '@backend/deviceApi'

const AuthContext = createContext(null)

const ALL_PERMISSIONS = ['attendance', 'grades', 'exams', 'homework', 'videos', 'students', 'payments', 'reports', 'whatsapp']

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const { tenantId, isFeatureEnabled } = useTenant()
  // Student Device Limit: id of the student whose session was authorized on
  // this device during this app load (see the effect below).
  const [deviceCheckedFor, setDeviceCheckedFor] = useState(null)

  const syncAuth = useCallback(() => {
    try {
      const token = authStore.getItem('masar-token')
      const userData = authStore.getItem('masar-user')
      const permsData = authStore.getItem('masar-permissions')
      if (token && userData) {
        const parsedUser = JSON.parse(userData)
        setUser(parsedUser)
        setIsLoggedIn(true)
        if (permsData) {
          setPermissions(JSON.parse(permsData))
        } else {
          setPermissions((parsedUser.role === 'admin' || parsedUser.role === 'super_admin') ? ALL_PERMISSIONS : [])
        }
      } else {
        setUser(null)
        setIsLoggedIn(false)
        setPermissions([])
      }
    } catch {
      setUser(null)
      setIsLoggedIn(false)
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    let activeUser = user
    if (!activeUser) {
      try {
        const stored = authStore.getItem('masar-user')
        if (stored) activeUser = JSON.parse(stored)
      } catch {}
    }
    if (!activeUser) return null
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, phone, grade, "group", role, avatar_url, tenant_id, is_active, is_approved, created_at, parent_phone, qr_token, barcode_token, status, enrollment_type')
        .eq('id', activeUser.id)
        .single()
      if (error) throw error
      if (data) {
        let userPerms = []
        if (data.role === 'admin' || data.role === 'super_admin') {
          userPerms = ALL_PERMISSIONS
        } else if (data.role === 'assistant') {
          const { data: adminData } = await supabase
            .from('tenant_admins')
            .select('permissions')
            .eq('user_id', data.id)
            .maybeSingle()
          if (adminData) {
            userPerms = adminData.permissions || []
          }
        }

        authStore.setItem('masar-user', JSON.stringify(data))
        authStore.setItem('masar-permissions', JSON.stringify(userPerms))
        setUser(data)
        setPermissions(userPerms)
        window.dispatchEvent(new Event('masar-user-updated'))
        return data
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err)
      throw err
    }
  }, [])

  const login = useCallback((token, userData, options = {}) => {
    // Students keep their login on this device by default; staff only when
    // they ticked «تذكرني». Decided here, after sign-in, because the role is
    // not known before it — setPersistent carries over the Supabase session
    // that sign-in already wrote.
    setPersistent(options.persist ?? (userData?.role === 'student'))
    authStore.setItem('masar-token', token)
    authStore.setItem('masar-user', JSON.stringify(userData))
    // Drop any stale (logged-out) viewer context so content gating resolves
    // for the new user immediately.
    invalidateViewerContext()
    // Also drop cached lists: anything read before sign-in (the login page
    // loads the package list) came back empty under RLS and would otherwise
    // be served to the signed-in user for up to 30 minutes.
    invalidateAll()
    setUser(userData)
    setIsLoggedIn(true)
    // Run refresh in background to populate permissions, parent_phone, qr_token
    refreshProfile().catch(err => console.error('Background profile refresh failed on login:', err))
  }, [refreshProfile])

  const logout = useCallback(() => {
    // Wipe the login from BOTH stores synchronously first: several callers
    // reload the page right after logout(), and a persisted session left in
    // localStorage would sign the student straight back in on a shared phone.
    clearAuth()
    // Then drop the Supabase client's in-memory session as well. 'local' ends
    // this device only — 'global' would sign the account out everywhere.
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    setUser(null)
    setIsLoggedIn(false)
    setPermissions([])
    invalidateAll()
    window.dispatchEvent(new Event('masar-user-updated'))
  }, [])

  const hasPermission = useCallback((permission, branchId = null) => {
    if (user?.role === 'admin' || user?.role === 'super_admin') return true
    if (!permission) return false
    if (permissions.includes(permission)) return true
    if (branchId && permissions.includes(`${permission}:${branchId}`)) return true
    // The Assistants panel stores granular keys (e.g. 'videos:edit',
    // 'attendance:take'), but tabs/gates are checked with the coarse key
    // ('videos', 'attendance'). Treat a plain coarse check as satisfied by ANY
    // granular grant in that category so panel permissions actually take effect.
    if (!branchId && !String(permission).includes(':') &&
        permissions.some(p => p.startsWith(`${permission}:`))) return true
    return false
  }, [user, permissions])

  // Enforce session boundary for cross-tenant isolation (especially on localhost testing)
  useEffect(() => {
    if (user && tenantId && user.tenant_id !== tenantId && user.role !== 'super_admin') {
      logout()
    }
  }, [user, tenantId, logout])

  // Student Device Limit — once per app start, at the session boundary (not
  // per page or render): the server recognises this device, lazily registers
  // it (sessions that predate the feature being turned on), or refuses it
  // (revoked, or the allowance is full). Staff and tenants without the
  // feature never make this call. The app waits for the answer so a freshly
  // registered session does not render its first pages empty.
  const needsDeviceCheck = isLoggedIn && user?.role === 'student' && !!user?.id &&
    deviceCheckedFor !== user.id && isFeatureEnabled('student_device_limit')

  useEffect(() => {
    if (!needsDeviceCheck) return
    const studentId = user.id
    if (consumeDeviceChecked(studentId)) { setDeviceCheckedFor(studentId); return }
    let cancelled = false
    authorizeDevice(studentId)
      .then(status => {
        if (cancelled) return
        if (status === 'denied') {
          try { sessionStorage.setItem(DEVICE_DENIED_FLAG, '1') } catch { }
          logout()
          window.location.href = '/login'
          return
        }
        setDeviceCheckedFor(studentId)
      })
      .catch(err => {
        // Offline / transient: let the app load. The database still refuses
        // data to a session that was never authorized.
        console.error('Device authorization failed:', err)
        if (!cancelled) setDeviceCheckedFor(studentId)
      })
    return () => { cancelled = true }
  }, [needsDeviceCheck, user?.id, logout])

  useEffect(() => {
    // 1. Initial sync from the stored login (see authStorage)
    syncAuth()

    // 2. Subscribe to Supabase auth state change events
    // This resolves the asynchronous session restoration on app boot
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        syncAuth()
      } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && authStore.getItem('masar-token'))) {
        // No live Supabase session behind the app's stored login: it was ended
        // elsewhere (a password reset, expiry) or could not be restored. Clear
        // it, or a stale login keeps "logging in" a student whose every query
        // then fails.
        clearAuth()
        setUser(null)
        setIsLoggedIn(false)
        setPermissions([])
        setLoading(false)
      } else {
        // For other events (like initial session check resolving to null), stop loading
        setLoading(false)
      }
    })

    // 3. Sync state on custom event and standard storage updates
    window.addEventListener('masar-user-updated', syncAuth)
    window.addEventListener('storage', syncAuth)

    // 4. Proactively refresh profile/permissions in the background on mount
    const token = authStore.getItem('masar-token')
    const userData = authStore.getItem('masar-user')
    if (token && userData) {
      refreshProfile().catch(err => console.error('Initial background profile refresh failed:', err))
    }

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('masar-user-updated', syncAuth)
      window.removeEventListener('storage', syncAuth)
    }
  }, [syncAuth, refreshProfile])

  const value = useMemo(() => ({
    user,
    isLoggedIn,
    loading: loading || needsDeviceCheck,
    role: user?.role || null,
    isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
    isSuperAdmin: user?.role === 'super_admin',
    isAssistant: user?.role === 'assistant',
    permissions,
    hasPermission,
    login,
    logout,
    syncAuth,
    refreshProfile,
  }), [user, isLoggedIn, loading, needsDeviceCheck, permissions, hasPermission, login, logout, syncAuth, refreshProfile])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
