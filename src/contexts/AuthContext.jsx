import React, { createContext, useContext, useState, useEffect } from 'react'
import { invalidateAll } from '../utils/cache'
import { useTenant } from './TenantContext'
import { supabase } from '@backend/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const { tenantId } = useTenant()

  // Enforce session boundary for cross-tenant isolation (especially on localhost testing)
  useEffect(() => {
    if (user && tenantId && user.tenant_id !== tenantId) {
      logout()
    }
  }, [user, tenantId])

  const syncAuth = () => {
    try {
      const token = sessionStorage.getItem('masar-token')
      const userData = sessionStorage.getItem('masar-user')
      if (token && userData) {
        setUser(JSON.parse(userData))
        setIsLoggedIn(true)
      } else {
        setUser(null)
        setIsLoggedIn(false)
      }
    } catch {
      setUser(null)
      setIsLoggedIn(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    syncAuth()

    // Sync state on custom event and standard storage updates
    window.addEventListener('masar-user-updated', syncAuth)
    window.addEventListener('storage', syncAuth)

    return () => {
      window.removeEventListener('masar-user-updated', syncAuth)
      window.removeEventListener('storage', syncAuth)
    }
  }, [])

  const refreshProfile = async () => {
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, phone, grade, "group", role, avatar_url, tenant_id, is_active, is_approved')
        .eq('id', user.id)
        .single()
      if (error) throw error
      if (data) {
        sessionStorage.setItem('masar-user', JSON.stringify(data))
        setUser(data)
        window.dispatchEvent(new Event('masar-user-updated'))
        return data
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err)
      throw err
    }
  }

  const login = (token, userData) => {
    sessionStorage.setItem('masar-token', token)
    sessionStorage.setItem('masar-user', JSON.stringify(userData))
    setUser(userData)
    setIsLoggedIn(true)
    window.dispatchEvent(new Event('masar-user-updated'))
  }

  const logout = () => {
    sessionStorage.removeItem('masar-token')
    sessionStorage.removeItem('masar-user')
    setUser(null)
    setIsLoggedIn(false)
    invalidateAll()
    window.dispatchEvent(new Event('masar-user-updated'))
  }

  const value = {
    user,
    isLoggedIn,
    loading,
    role: user?.role || null,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    syncAuth,
    refreshProfile,
  }

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
