import React from 'react'

export default function StudentDetailsModal({ student, onClose, onMarkAttendance, selectedGroupId, groups, currentGrade }) {
  if (!student) return null

  const isDark = document.body.classList.contains('dark')

  // Mismatch detection
  const selectedGroup = groups?.find(g => g.id === selectedGroupId)
  const isDifferentGroup = selectedGroupId && selectedGroup && student && (student.group_name !== selectedGroup.name)
  const isDifferentGrade = currentGrade && student && (student.grade !== currentGrade)
  // ONLINE students are not part of the center system — no barcode attendance for them
  const isOnlineStudent = student?.enrollment_type === 'ONLINE'
  const hasWarning = isDifferentGroup || isDifferentGrade || isOnlineStudent
  const isBlocked = isDifferentGrade || isOnlineStudent

  // Attendance figures — newer RPC returns counts; older one only a percentage
  const hasAttendanceCounts = typeof student.total_sessions === 'number'
  const hasAttendanceData = hasAttendanceCounts
    ? student.total_sessions > 0
    : student.attendance_percentage !== null && student.attendance_percentage !== undefined
  const attendancePct = hasAttendanceData ? Number(student.attendance_percentage) : null

  // Save guard: prevents duplicate submissions + ignores Enter while saving.
  const [submitting, setSubmitting] = React.useState(false)
  const submittingRef = React.useRef(false)
  const confirmBtnRef = React.useRef(null)
  const modalBoxRef = React.useRef(null)

  React.useEffect(() => {
    if (modalBoxRef.current) {
      const rect = modalBoxRef.current.getBoundingClientRect()
      const isFullyVisible = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      )
      if (!isFullyVisible) {
        try {
          modalBoxRef.current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [])

  const confirm = React.useCallback(async () => {
    if (isBlocked || !onMarkAttendance) return
    if (submittingRef.current) return          // already saving -> ignore
    submittingRef.current = true
    setSubmitting(true)
    try {
      await onMarkAttendance(student)
      onClose()                                 // success -> close (unmounts)
    } catch {
      submittingRef.current = false             // failure -> allow retry
      setSubmitting(false)
    }
  }, [isBlocked, onMarkAttendance, student, onClose])

  // Close keys. Enter is handled by the auto-focused Save button's native
  // activation (below), so it isn't intercepted here (avoids double-firing).
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') { onClose(); return }
      const el = document.activeElement
      const inField = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      if (!inField && (e.key === 'n' || e.key === 'N')) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Auto-focus the Save button on open so Enter/Space confirms with no mouse.
  React.useEffect(() => {
    if (isBlocked || !onMarkAttendance) return
    const t = setTimeout(() => {
      try { confirmBtnRef.current?.focus({ preventScroll: true }) } catch { confirmBtnRef.current?.focus() }
    }, 40)
    return () => clearTimeout(t)
  }, [isBlocked, onMarkAttendance])

  // Grade translation mappers
  const GRADE_LABEL = {
    'first-prep': 'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep': 'الصف الثالث الإعدادي',
    'first-sec': 'الصف الأول الثانوي',
    'second-sec': 'الصف الثاني الثانوي',
    'third-sec': 'الصف الثالث الثانوي',
  }
  const getGradeLabel = (g) => GRADE_LABEL[g] || g

  // Status mapping
  const STATUS_LABEL = {
    active: 'نشط',
    inactive: 'غير نشط',
    suspended: 'موقوف',
    graduated: 'خريج',
    archived: 'مؤرشف'
  }

  const ENROLLMENT_LABEL = {
    CENTER: 'سنتر (حضور فعلي)',
    ONLINE: 'أونلاين',
    HYBRID: 'مدمج (سنتر + أونلاين)'
  }

  const WARNING_LABELS = {
    debt: 'عليه مديونية مالية',
    excessive_absences: 'نسبة غياب مرتفعة (تجاوز الحد)',
    blocked: 'الحساب محظور',
    scholarship: 'طالب منحة / خصم خاص',
    VIP: 'طالب VIP'
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return iso
    }
  }

  const hasDebt = student.outstanding_balance > 0

  // Monthly subscription status ("should he pay this month, or is he safe?").
  const paidThisMonth = typeof student.paid_this_month === 'boolean'
    ? student.paid_this_month
    : (() => {
        const iso = student.last_payment?.created_at
        if (!iso) return false
        const p = new Date(iso), now = new Date()
        return p.getFullYear() === now.getFullYear() && p.getMonth() === now.getMonth()
      })()
  const amountDue = typeof student.amount_due === 'number'
    ? student.amount_due
    : (student.outstanding_balance || 0)

  const modalBackground = hasWarning
    ? (isDark ? 'rgba(45, 34, 12, 0.85)' : 'rgba(254, 243, 199, 0.95)')
    : (isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.95)')

  const modalBorder = hasWarning
    ? (isDark ? '2px solid rgba(245, 158, 11, 0.5)' : '2px solid rgba(217, 119, 6, 0.5)')
    : '1px solid rgba(255, 255, 255, 0.1)'

  const modalShadow = hasWarning
    ? (isDark ? '0 25px 50px -12px rgba(245, 158, 11, 0.3)' : '0 25px 50px -12px rgba(217, 119, 6, 0.25)')
    : '0 25px 50px -12px rgba(0, 0, 0, 0.4)'

  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(16px)',
      webkitBackdropFilter: 'blur(16px)',
      zIndex: 9999999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Tajawal, sans-serif',
      direction: 'rtl'
    }} onClick={onClose}>
      <div ref={modalBoxRef} style={{
        maxWidth: '540px',
        width: '100%',
        background: modalBackground,
        border: modalBorder,
        borderRadius: '24px',
        boxShadow: modalShadow,
        maxHeight: '92vh',
        // Three regions: pinned header + scrollable details + pinned footer,
        // so the NAME (top) and the SAVE button (bottom) are ALWAYS visible —
        // the secretary never scrolls to see who it is or to confirm.
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        color: isDark ? '#f8fafc' : '#0f172a'
      }} onClick={(e) => e.stopPropagation()}>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 3,
            background: 'rgba(127, 127, 127, 0.18)',
            border: 'none',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'inherit'
          }}
        >
          <i className="fas fa-times" />
        </button>

        {/* ── Pinned header (always visible) ── */}
        <div style={{ flexShrink: 0, textAlign: 'center', padding: '24px 30px 16px', borderBottom: `1px solid ${dividerColor}` }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: hasWarning
              ? 'linear-gradient(135deg, #fbbf24, #d97706)'
              : 'linear-gradient(135deg, var(--secondary, #38bdf8), var(--primary, #8b5cf6))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.8rem',
            fontWeight: 'bold',
            margin: '0 auto 10px'
          }}>
            {student.name.charAt(0)}
          </div>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 4px', wordBreak: 'break-word' }}>{student.name}</h3>
          <p style={{ fontSize: '0.9rem', color: isDark ? '#94a3b8' : '#64748b', margin: 0 }}>
            {getGradeLabel(student.grade)} | {student.group_name || 'بدون مجموعة'}
          </p>
        </div>

        {/* ── Scrollable details (only this region scrolls) ── */}
        <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, padding: '18px 30px' }}>

          {/* Warnings Alerts */}
          {isOnlineStudent && (
            <div style={{
              background: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: isDark ? '#fca5a5' : '#b91c1c',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="fas fa-wifi" style={{ fontSize: '1.2rem' }} />
              <div>
                <strong>طالب أونلاين:</strong> هذا الطالب مشترك أونلاين فقط ولا يتم تسجيل حضور السنتر له عبر الباركود.
              </div>
            </div>
          )}
          {isDifferentGrade ? (
            <div style={{
              background: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: isDark ? '#fca5a5' : '#b91c1c',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)'
            }}>
              <i className="fas fa-circle-xmark" style={{ fontSize: '1.25rem' }} />
              <div>
                <strong>خطأ صف دراسي مختلف:</strong> لا يمكن تسجيل الحضور! الطالب مسجل في <strong>{getGradeLabel(student.grade)}</strong> بينما كشف الحضور الحالي مخصص لـ <strong>{getGradeLabel(currentGrade)}</strong>.
              </div>
            </div>
          ) : isDifferentGroup ? (
            <div style={{
              background: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: isDark ? '#fbbf24' : '#d97706',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.05)'
            }}>
              <i className="fas fa-triangle-exclamation" style={{ fontSize: '1.2rem' }} />
              <div>
                <strong>تنبيه مجموعة مختلفة:</strong> الطالب مسجل في مجموعة <strong>({student.group_name || 'بدون مجموعة'})</strong> وليس في مجموعة الحصة الحالية <strong>({selectedGroup.name})</strong>.
              </div>
            </div>
          ) : null}

          {/* Monthly subscription status — the "should pay / safe" indicator,
              kept high so the pay decision is seen with little/no scrolling. */}
          <div style={{
            marginBottom: '18px', padding: '14px 16px', borderRadius: '14px', textAlign: 'center',
            background: paidThisMonth ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${paidThisMonth ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: paidThisMonth ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: '1.05rem'
          }}>
            <i className={`fas ${paidThisMonth ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} style={{ marginInlineEnd: '8px' }} />
            {paidThisMonth
              ? 'سدّد اشتراك هذا الشهر ✅'
              : `مطلوب الدفع${amountDue > 0 ? ` — ${amountDue} ج.م` : ''} ⚠️`}
          </div>

          {/* Warnings & Flags alerts */}
          {(student.warnings.length > 0 || student.flags?.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              {student.warnings.map(warn => (
                <div key={warn} style={{
                  background: warn === 'debt' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  border: `1px solid ${warn === 'debt' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                  color: warn === 'debt' ? '#ef4444' : '#f59e0b',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-triangle-exclamation" />
                  <span>{WARNING_LABELS[warn] || warn}</span>
                </div>
              ))}
              {student.flags?.map(flag => (
                <div key={flag} style={{
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  color: '#6366f1',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-tag" />
                  <span>علامة: {WARNING_LABELS[flag] || flag}</span>
                </div>
              ))}
            </div>
          )}

          {/* Info Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '18px'
          }}>
            {/* Branch & Year */}
            <div style={{ background: 'rgba(127, 127, 127, 0.06)', border: `1px solid ${dividerColor}`, padding: '12px', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>الفرع</span>
              <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{student.branch_name}</div>
            </div>
            <div style={{ background: 'rgba(127, 127, 127, 0.06)', border: `1px solid ${dividerColor}`, padding: '12px', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>العام الأكاديمي</span>
              <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{student.academic_year_name}</div>
            </div>

            {/* Group Name (Prominent Card) */}
            <div style={{
              background: isDifferentGroup
                ? (isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(254, 243, 199, 0.5)')
                : 'rgba(127, 127, 127, 0.06)',
              border: isDifferentGroup
                ? (isDark ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(217, 119, 6, 0.3)')
                : `1px solid ${dividerColor}`,
              padding: '12px',
              borderRadius: '12px',
              gridColumn: 'span 2'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>المجموعة الدراسية</span>
              <div style={{
                fontWeight: 'bold',
                marginTop: '4px',
                color: isDifferentGroup ? (isDark ? '#fbbf24' : '#d97706') : (isDark ? '#38bdf8' : '#0284c7'),
                fontSize: '1.05rem'
              }}>
                {student.group_name || 'بدون مجموعة'}
              </div>
            </div>

            {/* Status & Enrollment */}
            <div style={{ background: 'rgba(127, 127, 127, 0.06)', border: `1px solid ${dividerColor}`, padding: '12px', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>حالة الحساب</span>
              <div style={{ fontWeight: 'bold', marginTop: '4px', color: student.status === 'active' ? '#10b981' : '#64748b' }}>
                {STATUS_LABEL[student.status] || student.status}
              </div>
            </div>
            <div style={{ background: 'rgba(127, 127, 127, 0.06)', border: `1px solid ${dividerColor}`, padding: '12px', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>نوع الاشتراك</span>
              <div style={{ fontWeight: 'bold', marginTop: '4px' }}>
                {ENROLLMENT_LABEL[student.enrollment_type] || student.enrollment_type}
              </div>
            </div>

            {/* Attendance Stats (center/hybrid students only) */}
            {!isOnlineStudent && (
              <div style={{ background: 'rgba(127, 127, 127, 0.06)', border: `1px solid ${dividerColor}`, padding: '12px', borderRadius: '12px', gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>حضور السنتر</span>
                  {hasAttendanceData ? (
                    <span style={{ fontWeight: 'bold', color: attendancePct >= 75 ? '#10b981' : '#ef4444' }}>
                      {hasAttendanceCounts
                        ? `حضر ${student.attended_sessions} من ${student.total_sessions} حصة (${attendancePct}%)`
                        : `${attendancePct}%`}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 'bold', color: '#64748b' }}>لم يتم تسجيل أي حصص بعد</span>
                  )}
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(127,127,127,0.15)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${hasAttendanceData ? attendancePct : 0}%`,
                    height: '100%',
                    background: attendancePct >= 75 ? '#10b981' : '#ef4444',
                    borderRadius: '3px'
                  }} />
                </div>
                {hasAttendanceCounts && student.total_sessions > 0 && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#10b981' }}>حضور: {student.present_count}</span>
                    <span style={{ color: '#f59e0b' }}>تأخير: {student.late_count}</span>
                    <span style={{ color: '#ef4444' }}>غياب: {student.absent_count}</span>
                  </div>
                )}
              </div>
            )}

            {/* Financial Ledger Balance */}
            <div style={{
              background: hasDebt ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
              border: `1px solid ${hasDebt ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}`,
              padding: '16px',
              borderRadius: '16px',
              gridColumn: 'span 2',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>المستحق هذا الشهر (الاشتراك)</span>
              <div style={{
                fontSize: '2rem',
                fontWeight: 900,
                marginTop: '6px',
                color: amountDue > 0 ? '#ef4444' : '#10b981'
              }}>
                {amountDue} جنيه
              </div>
              {typeof student.discount === 'number' && student.discount > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                  (بعد خصم استثنائي {student.discount} ج.م)
                </div>
              )}
              {amountDue > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '4px', fontWeight: 'bold' }}>
                  <i className="fas fa-circle-exclamation" style={{ marginInlineEnd: '4px' }} />
                  لم يسدّد اشتراك هذا الشهر
                </div>
              )}
            </div>
          </div>

          {/* Last Payment */}
          {student.last_payment && student.last_payment.amount && (
            <div style={{ marginBottom: '18px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 10px', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '6px' }}>آخر دفعة مالية مسجلة</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <div>
                  <strong>{student.last_payment.amount} جنيه</strong> ({student.last_payment.payment_method})
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{student.last_payment.description}</div>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{formatDate(student.last_payment.created_at)}</div>
              </div>
            </div>
          )}

          {/* Student Notes */}
          {student.notes && student.notes.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 10px', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '6px' }}>ملاحظات وتنبيهات الإدارة</h4>
              <ul style={{ paddingRight: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.6', color: isDark ? '#94a3b8' : '#475569' }}>
                {student.notes.map((note, idx) => (
                  <li key={idx} style={{ marginBottom: '6px' }}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Pinned action button (always visible, never scrolls away) ── */}
        {onMarkAttendance && (() => {
          const blockedLabel = isOnlineStudent
            ? 'غير مسموح بالتحضير (طالب أونلاين)'
            : 'غير مسموح بالتحضير (صف دراسي مختلف)'
          return (
            <div style={{ flexShrink: 0, padding: '14px 30px 20px', borderTop: `1px solid ${dividerColor}` }}>
              <button
                ref={confirmBtnRef}
                onClick={confirm}
                disabled={isBlocked || submitting}
                className={`cp-btn ${isBlocked ? 'cp-btn-secondary' : 'cp-btn-success'}`}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  fontSize: '1.05rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: (isBlocked || submitting) ? 'not-allowed' : 'pointer',
                  border: 'none',
                  opacity: (isBlocked || submitting) ? 0.55 : 1
                }}
              >
                <i className={submitting ? 'fas fa-spinner fa-spin' : (isBlocked ? 'fas fa-ban' : 'fas fa-calendar-check')} />
                <span>{submitting ? 'جاري الحفظ...' : (isBlocked ? blockedLabel : 'تسجيل حضور الطالب الآن (Enter)')}</span>
              </button>
            </div>
          )
        })()}

      </div>
    </div>
  )
}
