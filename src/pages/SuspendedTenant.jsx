import React from 'react'
import { useTenant } from '../contexts/TenantContext'
import { useAuth } from '../contexts/AuthContext'

export default function SuspendedTenant() {
  const { tenant, themeConfig } = useTenant()
  const { user, isLoggedIn, logout } = useAuth()

  const brandName = tenant?.name || 'المنصة التعليمية'
  const brandLogo = tenant?.logo_url || themeConfig?.branding?.logo || null
  const primaryColor = tenant?.primary_color || '#7c3aed'
  const supportPhone = tenant?.config?.contact?.phone || tenant?.config?.location?.phone || '201000000000'
  const whatsappLink = tenant?.config?.socials?.whatsapp || `https://wa.me/${supportPhone.replace(/[^0-9]/g, '')}`

  const handleLogout = async () => {
    try {
      await logout()
      window.location.href = '/login'
    } catch (err) {
      console.error(err)
      window.location.href = '/login'
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at bottom, #111827 0%, #030712 100%)',
      color: '#f8fafc',
      padding: '24px',
      fontFamily: 'Tajawal, sans-serif',
      direction: 'rtl'
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: 'rgba(17, 24, 39, 0.75)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: '28px',
        padding: '44px 32px',
        textAlign: 'center',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(245, 158, 11, 0.12)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Ambient Top Glow */}
        <div style={{
          position: 'absolute',
          top: '-60px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '240px',
          height: '120px',
          background: 'rgba(245, 158, 11, 0.25)',
          filter: 'blur(60px)',
          borderRadius: '50%',
          pointerEvents: 'none'
        }}></div>

        {/* Platform Logo */}
        <div style={{
          width: '88px',
          height: '88px',
          margin: '0 auto 20px',
          borderRadius: '22px',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          border: '2px solid rgba(255,255,255,0.1)',
          padding: '8px'
        }}>
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: '16px',
              background: `linear-gradient(135deg, ${primaryColor}, #f59e0b)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '2rem'
            }}>
              <i className="fas fa-graduation-cap"></i>
            </div>
          )}
        </div>

        {/* Status Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          borderRadius: '999px',
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          color: '#fbbf24',
          fontSize: '0.88rem',
          fontWeight: 800,
          marginBottom: '20px'
        }}>
          <i className="fas fa-pause-circle"></i>
          <span>المنصة متوقفة مؤقتاً</span>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          color: '#ffffff',
          marginBottom: '14px',
          lineHeight: 1.3
        }}>
          {brandName}
        </h1>

        {/* Description */}
        <p style={{
          fontSize: '1.02rem',
          lineHeight: '1.85',
          color: '#cbd5e1',
          marginBottom: '32px'
        }}>
          نود إعلامكم بأن هذه المنصة تم إيقافها مؤقتاً في الوقت الحالي. 
          <br />
          جميع البيانات وسجلات الطلاب والامتحانات والدرجات محفوظة بالكامل وبأمان تام.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 20px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 800,
                fontSize: '1rem',
                boxShadow: '0 6px 20px rgba(37, 211, 102, 0.3)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <i className="fab fa-whatsapp" style={{ fontSize: '1.3rem' }}></i>
              <span>تواصل مع الإدارة عبر واتساب</span>
            </a>
          )}

          {isLoggedIn && (
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '14px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            >
              <i className="fas fa-right-from-bracket"></i>
              <span>تسجيل الخروج من الحساب</span>
            </button>
          )}
        </div>

        {/* Super Admin Login Link */}
        <div style={{
          marginTop: '32px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.85rem',
          color: '#94a3b8'
        }}>
          <span>هل أنت مدير النظام العام؟ </span>
          <a
            href="/login"
            style={{
              color: '#818cf8',
              textDecoration: 'underline',
              fontWeight: 700
            }}
          >
            تسجيل دخول السوبر أدمن
          </a>
        </div>
      </div>
    </div>
  )
}
