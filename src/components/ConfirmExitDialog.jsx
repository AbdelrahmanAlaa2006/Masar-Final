import React, { useEffect, useState } from 'react'

function useIsDark() {
  const [dark, setDark] = useState(
    typeof document !== 'undefined' && document.body.classList.contains('dark')
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      setDark(document.body.classList.contains('dark'))
    })
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

export default function ConfirmExitDialog({
  title = 'هل تريد الخروج؟',
  message = 'لو خرجت دلوقتي ممكن تفقد تقدمك. هل أنت متأكد؟',
  confirmText = 'نعم، خروج',
  cancelText = 'إلغاء',
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const isDark = useIsDark()

  const c = isDark
    ? {
        overlayBg:   'rgba(0, 0, 0, 0.72)',
        dialogBg:    '#1f1b2e',
        dialogShadow:'0 24px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)',
        heading:     '#f7fafc',
        message:     '#cbd5e0',
        footerBg:    '#191527',
        footerBorder:'1px solid rgba(255,255,255,0.06)',
        cancelBg:    '#2a2540',
        cancelText:  '#e2e8f0',
        iconBg:      'rgba(245,158,11,0.15)',
        iconRing:    '4px solid rgba(245,158,11,0.25)',
        iconColor:   '#f59e0b',
      }
    : {
        overlayBg:   'rgba(10, 8, 28, 0.55)',
        dialogBg:    '#ffffff',
        dialogShadow:'0 24px 48px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.1)',
        heading:     '#1a202c',
        message:     '#4a5568',
        footerBg:    '#f8fafc',
        footerBorder:'1px solid #edf2f7',
        cancelBg:    '#edf2f7',
        cancelText:  '#2d3748',
        iconBg:      '#fffbeb',
        iconRing:    '4px solid #fde68a',
        iconColor:   '#d97706',
      }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: c.overlayBg,
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
    animation: 'ced-fade 0.16s ease-out',
  }
  const dialog = {
    width: '100%', maxWidth: 420,
    background: c.dialogBg,
    color: c.heading,
    borderRadius: 16,
    boxShadow: c.dialogShadow,
    overflow: 'hidden',
    fontFamily: 'inherit',
    textAlign: 'center',
    animation: 'ced-pop 0.18s ease-out',
  }
  const iconWrap = {
    width: 68, height: 68,
    margin: '28px auto 12px',
    borderRadius: '50%',
    background: c.iconBg,
    display: 'grid', placeItems: 'center',
    color: c.iconColor,
    fontSize: 28,
    border: c.iconRing,
  }
  const body = { padding: '0 28px 12px', direction: 'rtl' }
  const heading = {
    margin: '4px 0 10px',
    fontSize: 20, fontWeight: 700,
    color: c.heading,
  }
  const messageStyle = {
    margin: '6px 0 14px',
    fontSize: 14, lineHeight: 1.7,
    color: c.message,
  }
  const actions = {
    display: 'flex', gap: 10,
    padding: '14px 22px 22px',
    background: c.footerBg,
    borderTop: c.footerBorder,
    direction: 'rtl',
  }
  const btnBase = {
    flex: 1,
    padding: '11px 16px',
    borderRadius: 10,
    border: 'none',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    transition: 'transform 0.08s ease, filter 0.12s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
  const confirmBtn = {
    ...btnBase,
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    color: '#fff',
    boxShadow: '0 4px 12px rgba(245,158,11,0.25)',
  }
  const cancelBtn = {
    ...btnBase,
    background: c.cancelBg,
    color: c.cancelText,
  }

  return (
    <div style={overlay} onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="ced-title">
      <style>{`
        @keyframes ced-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ced-pop  { from { transform: translateY(8px) scale(0.96); opacity: 0 }
                              to   { transform: translateY(0)    scale(1);    opacity: 1 } }
        .ced-btn:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px) }
        .ced-btn:active:not(:disabled) { transform: translateY(0) }
      `}</style>

      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={iconWrap}>
          <i className="fas fa-circle-exclamation" aria-hidden="true"></i>
        </div>
        <div style={body}>
          <h3 id="ced-title" style={heading}>{title}</h3>
          <p style={messageStyle}>{message}</p>
        </div>
        <div style={actions}>
          <button type="button" className="ced-btn" style={confirmBtn} onClick={onConfirm}>
            <i className="fas fa-arrow-right-from-bracket"></i> {confirmText}
          </button>
          <button type="button" className="ced-btn" style={cancelBtn} onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
