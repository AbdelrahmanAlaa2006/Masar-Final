export function notify(message, { title = '', type = 'info', duration = 2200 } = {}) {
  const iconByType = {
    info: 'fa-circle-info',
    warning: 'fa-triangle-exclamation',
    error: 'fa-circle-xmark',
    success: 'fa-circle-check',
  }
  const titleByType = {
    info: 'تنبيه',
    warning: 'تنبيه',
    error: 'خطأ',
    success: 'تم',
  }

  const overlay = document.createElement('div')
  overlay.className = `auth-overlay notify-overlay notify--${type}`
  overlay.setAttribute('dir', 'rtl')
  overlay.innerHTML = `
    <div class="auth-toast" role="status" aria-live="polite">
      <div class="auth-toast-check notify-icon">
        <i class="fas ${iconByType[type] || iconByType.info}"></i>
      </div>
      <div class="auth-toast-text">${title || titleByType[type]}</div>
      <div class="auth-toast-sub">${message}</div>
      <div class="auth-toast-bar"><span></span></div>
    </div>
  `
  document.body.appendChild(overlay)
  requestAnimationFrame(() => overlay.classList.add('open'))

  setTimeout(() => {
    overlay.classList.remove('open')
    overlay.classList.add('closing')
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    }, 320)
  }, duration)
}
