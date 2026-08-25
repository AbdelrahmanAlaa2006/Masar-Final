import React from 'react'

/* Top-level error boundary.
   Suspense only handles loading; it does NOT catch runtime render errors.
   Without this, a single thrown error in any lazy page unmounts the whole
   React tree and the user sees a blank white screen with no recovery.
   This catches such errors, shows a friendly Arabic fallback, and offers
   a reload. It is purely additive and changes no existing behavior on the
   happy path. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error caught by ErrorBoundary:', error, info)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        dir="rtl"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--section-bg-1, #0f172a)',
          color: '#fff',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'Tajawal, sans-serif'
        }}
      >
        <div style={{ maxWidth: '440px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px' }}>حدث خطأ غير متوقع</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px', lineHeight: 1.7 }}>
            نعتذر عن هذا الخلل. يمكنك إعادة تحميل الصفحة للمتابعة، وإذا استمرت المشكلة تواصل مع الدعم.
          </p>
          {this.state.error && (
            <div style={{ margin: '0 0 16px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.8rem', textAlign: 'left', direction: 'ltr', maxHeight: '100px', overflowY: 'auto' }}>
              <code>{String(this.state.error.message || this.state.error)}</code>
            </div>
          )}
          <button
            onClick={this.handleReload}
            style={{
              background: 'var(--primary-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%))',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 28px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      </div>
    )
  }
}
