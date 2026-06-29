import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@backend/supabase'
import { applyTenantTheme } from '../utils/theme'
import { cached, setCacheTenant } from '../utils/cache'
import { applyBrandOverride, remapAvailableTenants, getTenantFolder } from '../tenants/brandOverrides'

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [themeConfig, setThemeConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [availableTenants, setAvailableTenants] = useState([])

  useEffect(() => {
    async function resolveTenant() {
      try {
        const hostname = window.location.hostname
        const urlParams = new URLSearchParams(window.location.search)

        // 1. Resolve slug/domain candidate first
        let candidate = 'default'

        // For development on localhost: check query param first, then sessionStorage
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          try {
            localStorage.removeItem('masar-cache:tenant-config:power-platform')
            localStorage.removeItem('masar-cache:tenant-config:cyber')
            localStorage.removeItem('masar-cache:tenant-config:sherif-programming')
          } catch {}
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

        // 2. Fetch all tenants for local development selectors (cached for 30 minutes)
        const allTenants = await cached('available-tenants', 30 * 60 * 1000, async () => {
          const { data } = await supabase
            .from('tenants')
            .select('slug, name')
            .order('name')
          return data || []
        })
        if (allTenants) {
          setAvailableTenants(remapAvailableTenants(allTenants))
        }

        // 3. Fetch tenant config from database (cached for 10 minutes)
        let querySlug = candidate
        if (candidate === 'waled-english') {
          querySlug = 'sherif-english'
        }
        if (candidate === 'power-platform') {
          querySlug = 'sherif-programming'
        }

        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
        const cacheTtl = isLocalhost ? 0 : 10 * 60 * 1000

        const tenantData = await cached(`tenant-config:${candidate}`, cacheTtl, async () => {
          let resolvedData = null
          if (querySlug && querySlug !== 'default') {
            const { data, error } = await supabase
              .from('tenants')
              .select('id, slug, name, domain, logo_url, primary_color, secondary_color, config')
              .or(`slug.eq.${querySlug},domain.eq.${querySlug},slug.eq.${candidate},domain.eq.${candidate}`)
              .maybeSingle()
            if (!error && data) {
              resolvedData = data
            }
          }

          if (!resolvedData) {
            const { data, error } = await supabase
              .from('tenants')
              .select('id, slug, name, domain, logo_url, primary_color, secondary_color, config')
              .eq('slug', 'default')
              .maybeSingle()

            if (!error && data) {
              resolvedData = data
            } else {
              // Hardcoded fallback in case database query fails entirely
              resolvedData = {
                id: 'd3b07384-d113-4ec2-a5d6-d005b6be4979',
                slug: 'default',
                name: 'منصة مسار التعليمية',
                primary_color: '#7c3aed',
                secondary_color: '#06b6d4',
                logo_url: null,
                config: {},
                tenant_settings: [],
                tenant_features: []
              }
            }
          }

          // Apply centralized brand overrides (english / power / …).
          // Same behavior as before — logic now lives in tenants/brandOverrides.js.
          applyBrandOverride(resolvedData)

          return resolvedData
        })

        setTenant(tenantData)

        // Namespace all subsequent caches (students, videos, exams, …) by this
        // tenant so one tenant's cached lists never surface under another on a
        // shared device or after a super-admin tenant switch.
        setCacheTenant(tenantData?.id)

        // Dynamically resolve theme config and load tenant styling chunk
        const folder = getTenantFolder(tenantData)
        let themeConfigObj = null
        try {
          const [configModule] = await Promise.all([
            import(`../tenants/${folder}/config.js`),
            import(`../tenants/${folder}/styles.css`)
          ])
          themeConfigObj = configModule.default || configModule.themeConfig
        } catch (loadErr) {
          console.error(`Failed to load dynamic assets for tenant folder "${folder}", falling back to default:`, loadErr)
          try {
            const [defaultModule] = await Promise.all([
              import('../tenants/default/config.js'),
              import('../tenants/default/styles.css')
            ])
            themeConfigObj = defaultModule.default || defaultModule.themeConfig
          } catch (fallbackErr) {
            console.error('Failed to load fallback default theme assets:', fallbackErr)
          }
        }

        if (themeConfigObj) {
          setThemeConfig(themeConfigObj)
          applyTenantTheme(tenantData, themeConfigObj)
        } else {
          const fallbackConfig = {
            themeClass: 'aa-default-theme',
            primaryColor: '#7c3aed',
            secondaryColor: '#06b6d4'
          }
          setThemeConfig(fallbackConfig)
          applyTenantTheme(tenantData, fallbackConfig)
        }
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

  const isFeatureEnabled = useCallback((featureKey) => {
    // 1. Check in the new tenant_features array
    if (tenant?.tenant_features) {
      const list = Array.isArray(tenant.tenant_features) ? tenant.tenant_features : []
      const found = list.find(f => f.feature_name === featureKey)
      if (found !== undefined) {
        return found.is_enabled
      }
    }
    // 2. Fallback to existing config.features JSONB column
    if (tenant?.config?.features && tenant.config.features[featureKey] !== undefined) {
      return tenant.config.features[featureKey] !== false
    }
    return true
  }, [tenant])

  const isGradeEnabled = useCallback((gradeKey) => {
    // 1. Check if the new stages array exists
    if (tenant?.config?.stages) {
      const stages = Array.isArray(tenant.config.stages) ? tenant.config.stages : []
      for (const stage of stages) {
        if (stage.enabled === false) {
          const hasGrade = stage.grades?.some(g => g.id === gradeKey)
          if (hasGrade) return false
        }
        const gradeObj = stage.grades?.find(g => g.id === gradeKey)
        if (gradeObj) {
          return gradeObj.enabled !== false
        }
      }
    }

    // 2. Legacy fallback
    if (!tenant?.config?.grades) return true
    // Support both standard enums (first-prep) and alternative conventions (grade_1_prep / grade_3_sec)
    const legacyMap = {
      'first-prep': 'grade_1_prep',
      'second-prep': 'grade_2_prep',
      'third-prep': 'grade_3_prep',
      'first-sec': 'grade_1_sec',
      'second-sec': 'grade_2_sec',
      'third-sec': 'grade_3_sec',
    }
    const altKey = legacyMap[gradeKey]
    if (tenant.config.grades[gradeKey] === false) return false
    if (altKey && tenant.config.grades[altKey] === false) return false
    return true
  }, [tenant])

  const gradesList = useMemo(() => {
    if (tenant?.config?.stages) {
      const stages = Array.isArray(tenant.config.stages) ? tenant.config.stages : []
      const list = []
      for (const stage of stages) {
        if (stage.enabled === false) continue
        const grades = Array.isArray(stage.grades) ? stage.grades : []
        for (const g of grades) {
          if (g.enabled !== false) {
            list.push({ id: g.id, name: g.name, stageId: stage.id, stageName: stage.name })
          }
        }
      }
      return list
    }
    
    // Legacy fallback list
    const legacyGrades = [
      { id: 'first-prep', name: 'الصف الأول الإعدادي', stageId: 'preparatory', stageName: 'المرحلة الإعدادية' },
      { id: 'second-prep', name: 'الصف الثاني الإعدادي', stageId: 'preparatory', stageName: 'المرحلة الإعدادية' },
      { id: 'third-prep', name: 'الصف الثالث الإعدادي', stageId: 'preparatory', stageName: 'المرحلة الإعدادية' },
      { id: 'first-sec', name: 'الصف الأول الثانوي', stageId: 'secondary', stageName: 'المرحلة الثانوية' },
      { id: 'second-sec', name: 'الصف الثاني الثانوي', stageId: 'secondary', stageName: 'المرحلة الثانوية' },
      { id: 'third-sec', name: 'الصف الثالث الثانوي', stageId: 'secondary', stageName: 'المرحلة الثانوية' },
    ]
    return legacyGrades.filter(g => isGradeEnabled(g.id))
  }, [tenant, isGradeEnabled])

  const value = useMemo(() => ({
    tenant,
    tenantId: tenant?.id || null,
    tenantSlug: tenant?.slug || 'default',
    tenantName: tenant?.name || '',
    themeConfig,
    isFeatureEnabled,
    isGradeEnabled,
    gradesList,
    loading
  }), [tenant, themeConfig, isFeatureEnabled, isGradeEnabled, gradesList, loading])

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  return (
    <TenantContext.Provider value={value}>
      {!loading && (
        <>
          {children}

          {/* Localhost Dev Tenant Selector Overlay (Redesigned Floating Glass Pill Switcher) */}
          {isLocalhost && availableTenants.length > 1 && (
            <div className="dev-tenant-switcher" style={{
              position: 'fixed',
              bottom: '16px',
              left: '16px',
              zIndex: 99999,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(12px)',
              webkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              padding: '6px 14px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontFamily: 'Tajawal, sans-serif',
              fontSize: '13px',
              color: '#f1f5f9',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease',
            }}>
              {/* Avatar circle */}
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--secondary, #5BC2E7), var(--primary, #8b5cf6))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 'bold'
              }}>
                {(tenant?.name || 'M').charAt(0)}
              </div>

              {/* Tenant Name */}
              <span style={{ fontWeight: '600' }}>{tenant?.name || 'Default'}</span>

              {/* Chevron */}
              <i className="fas fa-chevron-up" style={{ fontSize: '10px', color: '#94a3b8' }}></i>

              {/* Invisible native select overlay */}
              <select
                value={tenant?.slug || 'default'}
                onChange={(e) => changeTenantDev(e.target.value)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 2
                }}
              >
                {availableTenants.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
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
