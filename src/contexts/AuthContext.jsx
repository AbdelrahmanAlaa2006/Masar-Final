import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { invalidateAll } from '../utils/cache'
import { useTenant } from './TenantContext'
import { supabase } from '@backend/supabase'

const AuthContext = createContext(null)

const ALL_PERMISSIONS = ['attendance', 'grades', 'exams', 'homework', 'videos', 'students', 'payments', 'reports', 'whatsapp']

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const { tenantId } = useTenant()

  const syncAuth = useCallback(() => {
    try {
      const token = sessionStorage.getItem('masar-token')
      const userData = sessionStorage.getItem('masar-user')
      const permsData = sessionStorage.getItem('masar-permissions')
      if (token && userData) {
        const parsedUser = JSON.parse(userData)
        setUser(parsedUser)
        setIsLoggedIn(true)
        if (permsData) {
          setPermissions(JSON.parse(permsData))
        } else {
          setPermissions(parsedUser.role === 'admin' ? ALL_PERMISSIONS : [])
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
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, phone, grade, "group", role, avatar_url, tenant_id, is_active, is_approved, created_at, parent_phone, qr_token')
        .eq('id', user.id)
        .single()
      if (error) throw error
      if (data) {
        let userPerms = []
        if (data.role === 'admin') {
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

        sessionStorage.setItem('masar-user', JSON.stringify(data))
        sessionStorage.setItem('masar-permissions', JSON.stringify(userPerms))
        setUser(data)
        setPermissions(userPerms)
        window.dispatchEvent(new Event('masar-user-updated'))
        return data
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err)
      throw err
    }
  }, [user])

  const login = useCallback((token, userData) => {
    sessionStorage.setItem('masar-token', token)
    sessionStorage.setItem('masar-user', JSON.stringify(userData))
    setUser(userData)
    setIsLoggedIn(true)
    // Run refresh in background to populate permissions, parent_phone, qr_token
    refreshProfile().catch(err => console.error('Background profile refresh failed on login:', err))
  }, [refreshProfile])

  const logout = useCallback(() => {
    sessionStorage.removeItem('masar-token')
    sessionStorage.removeItem('masar-user')
    sessionStorage.removeItem('masar-permissions')
    setUser(null)
    setIsLoggedIn(false)
    setPermissions([])
    invalidateAll()
    window.dispatchEvent(new Event('masar-user-updated'))
  }, [])

  const hasPermission = useCallback((permission) => {
    if (user?.role === 'admin') return true
    return permissions.includes(permission)
  }, [user, permissions])

  // Enforce session boundary for cross-tenant isolation (especially on localhost testing)
  useEffect(() => {
    if (user && tenantId && user.tenant_id !== tenantId) {
      logout()
    }
  }, [user, tenantId, logout])

  useEffect(() => {
    // 1. Initial sync from sessionStorage
    syncAuth()

    // 2. Subscribe to Supabase auth state change events
    // This resolves the asynchronous session restoration on app boot
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        syncAuth()
      } else if (event === 'SIGNED_OUT') {
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

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('masar-user-updated', syncAuth)
      window.removeEventListener('storage', syncAuth)
    }
  }, [syncAuth])

  const value = useMemo(() => ({
    user,
    isLoggedIn,
    loading,
    role: user?.role || null,
    isAdmin: user?.role === 'admin',
    isAssistant: user?.role === 'assistant',
    permissions,
    hasPermission,
    login,
    logout,
    syncAuth,
    refreshProfile,
  }), [user, isLoggedIn, loading, permissions, hasPermission, login, logout, syncAuth, refreshProfile])

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
