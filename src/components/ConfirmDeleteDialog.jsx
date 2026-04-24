import React, { useEffect, useState } from 'react'

/* Track the global theme (body.dark class, managed by useTheme) so the
   modal can re-render when the user toggles themes while it's open. */
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

/* A focused, professional-looking destructive-confirm dialog.
   Used from Exams / Videos / (future) Lectures delete actions.

   Props:
     title       — dialog heading (e.g. "تأكيد حذف الامتحان")
     itemLabel   — the thing being deleted (quoted in the body)
     message     — optional body paragraph (defaults to a generic warning)
     confirmText — button label (default: "نعم، احذف")
     cancelText  — button label (default: "إلغاء")
     onConfirm   — async-friendly handler
     onCancel    — close handler (overlay click / Esc / cancel button)
*/
export default function ConfirmDeleteDialog({
  title = 'تأكيد الحذف',
  itemLabel = '',
  message = 'سيتم حذف هذا العنصر نهائياً. لا يمكن التراجع عن هذا الإجراء.',
  confirmText = 'نعم، احذف',
  cancelText  = 'إلغاء',
  onConfirm,
  onCancel,
}) {
  // Close on Escape so keyboard users aren't trapped.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const isDark = useIsDark()

  // Palette flips between light and dark; red destructive accent stays.
  const c = isDark
    ? {
        overlayBg:   'rgba(0, 0, 0, 0.68)',
        dialogBg:    '#1f1b2e',
        dialogShadow:'0 24px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)',
        heading:     '#f7fafc',
        message:     '#cbd5e0',
        pillBg:      '#2a2540',
        pillBorder:  '1px solid #3a3456',
        pillText:    '#e2e8f0',
        footerBg:    '#191527',
        footerBorder:'1px solid rgba(255,255,255,0.06)',
        cancelBg:    '#2a2540',
        cancelText:  '#e2e8f0',
        iconBg:      'rgba(229,62,62,0.15)',
        iconRing:    '4px solid rgba(229,62,62,0.25)',
      }
    : {
        overlayBg:   'rgba(10, 8, 28, 0.55)',
        dialogBg:    '#ffffff',
        dialogShadow:'0 24px 48px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.1)',
        heading:     '#1a202c',
        message:     '#4a5568',
        pillBg:      '#f7fafc',
        pillBorder:  '1px solid #e2e8f0',
        pillText:    '#2d3748',
        footerBg:    '#f8fafc',
        footerBorder:'1px solid #edf2f7',
        cancelBg:    '#edf2f7',
        cancelText:  '#2d3748',
        iconBg:      '#fff1f0',
        iconRing:    '4px solid #fee2e2',
      }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: c.overlayBg,
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
    animation: 'cdd-fade 0.16s ease-out',
  }
  const dialog = {
    width: '100%', maxWidth: 440,
    background: c.dialogBg,
    color: c.heading,
    borderRadius: 16,
    boxShadow: c.dialogShadow,
    overflow: 'hidden',
    fontFamily: 'inherit',
    textAlign: 'center',
    animation: 'cdd-pop 0.18s ease-out',
  }
  const iconWrap = {
    width: 72, height: 72,
    margin: '28px auto 12px',
    borderRadius: '50%',
    background: c.iconBg,
    display: 'grid', placeItems: 'center',
    color: '#e53e3e',
    fontSize: 30,
    border: c.iconRing,
  }
  const body = { padding: '0 28px 8px', direction: 'rtl' }
  const heading = {
    margin: '4px 0 10px',
    fontSize: 20, fontWeight: 700,
    color: c.heading,
  }
  const itemPill = {
    display: 'inline-block',
    margin: '8px 0 10px',
    padding: '6px 12px',
    background: c.pillBg,
    border: c.pillBorder,
    borderRadius: 8,
    fontWeight: 600,
    color: c.pillText,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
  const messageStyle = {
    margin: '6px 0 20px',
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
    background: 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)',
    color: '#fff',
    boxShadow: '0 4px 12px rgba(229,62,62,0.35)',
  }
  const cancelBtn = {
    ...btnBase,
    background: c.cancelBg,
    color: c.cancelText,
  }

  return (
    <div style={overlay} onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="cdd-title">
      {/* keyframes injected once per mount — cheap and avoids touching global css */}
      <style>{`
        @keyframes cdd-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cdd-pop  { from { transform: translateY(8px) scale(0.96); opacity: 0 }
                              to   { transform: translateY(0)    scale(1);    opacity: 1 } }
        .cdd-btn:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px) }
        .cdd-btn:active:not(:disabled) { transform: translateY(0) }
      `}</style>

      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={iconWrap}>
          <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
        </div>
        <div style={body}>
          <h3 id="cdd-title" style={heading}>{title}</h3>
          {itemLabel && <div style={itemPill}>{itemLabel}</div>}
          <p style={messageStyle}>{message}</p>
        </div>
        <div style={actions}>
          <button type="button" className="cdd-btn" style={confirmBtn} onClick={onConfirm}>
            <i className="fas fa-trash"></i> {confirmText}
          </button>
          <button type="button" className="cdd-btn" style={cancelBtn} onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
