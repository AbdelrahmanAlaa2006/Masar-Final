import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@backend/supabase'
import { applyTenantTheme } from '../utils/theme'

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [availableTenants, setAvailableTenants] = useState([])

  useEffect(() => {
    async function resolveTenant() {
      try {
        const hostname = window.location.hostname
        const urlParams = new URLSearchParams(window.location.search)
        
        // 1. Fetch all tenants for local development selectors
        const { data: allTenants } = await supabase
          .from('tenants')
          .select('slug, name')
          .order('name')
        if (allTenants) {
          setAvailableTenants(allTenants)
        }

        // 2. Resolve slug/domain candidate
        let candidate = 'default'
        
        // For development on localhost: check query param first, then sessionStorage
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          const queryTenant = urlParams.get('tenant')
          if (queryTenant) {
            candidate = queryTenant
            sessionStorage.setItem('masar-tenant-slug', queryTenant)
          } else {
            const storedTenant = sessionStorage.getItem('masar-tenant-slug')
            if (storedTenant) {
              candidate = storedTenant
            }
          }
        } else {
          // In production: check if it's a subdomain (e.g. ahmed.masaar.app)
          const parts = hostname.split('.')
          if (parts.length > 2 && parts[0] !== 'www') {
            candidate = parts[0]
          } else {
            // Otherwise, it's a custom domain (e.g. ahmedmath.com)
            candidate = hostname
          }
        }

        // 3. Fetch tenant config from database
        let tenantData = null
        if (candidate && candidate !== 'default') {
          const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .or(`slug.eq.${candidate},domain.eq.${candidate}`)
            .maybeSingle()
          if (!error && data) {
            tenantData = data
          }
        }

        // 4. Fallback to default tenant if not found or candidate is default
        if (!tenantData) {
          const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .eq('slug', 'default')
            .maybeSingle()
          
          if (!error && data) {
            tenantData = data
          } else {
            // Hardcoded fallback in case database query fails entirely
            tenantData = {
              id: 'd3b07384-d113-4ec2-a5d6-d005b6be4979',
              slug: 'default',
              name: 'منصة مسار التعليمية',
              primary_color: '#7c3aed',
              secondary_color: '#06b6d4',
              logo_url: null,
              config: {}
            }
          }
        }

        setTenant(tenantData)
        applyTenantTheme(tenantData)
      } catch (err) {
        console.error('Failed to resolve tenant:', err)
      } finally {
        setLoading(false)
      }
    }

    resolveTenant()
  }, [])

  // Quick helper to change tenant locally (adds ?tenant=slug)
  const changeTenantDev = (slug) => {
    sessionStorage.setItem('masar-tenant-slug', slug)
    const url = new URL(window.location.href)
    url.searchParams.set('tenant', slug)
    window.location.href = url.toString()
  }

  const value = {
    tenant,
    tenantId: tenant?.id || null,
    tenantSlug: tenant?.slug || 'default',
    tenantName: tenant?.name || '',
    loading
  }

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  return (
    <TenantContext.Provider value={value}>
      {!loading && (
        <>
          {children}
          
          {/* Localhost Dev Tenant Selector Overlay */}
          {isLocalhost && availableTenants.length > 1 && (
            <div style={{
              position: 'fixed',
              bottom: '12px',
              left: '12px',
              zIndex: 99999,
              background: '#1e293b',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '11px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'sans-serif',
              border: '1px solid #334155'
            }}>
              <span>Tenant (Dev):</span>
              <select
                value={tenant?.slug || 'default'}
                onChange={(e) => changeTenantDev(e.target.value)}
                style={{
                  background: '#0f172a',
                  color: '#fff',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                {availableTenants.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
