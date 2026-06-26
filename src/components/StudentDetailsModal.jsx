import React from 'react'

export default function StudentDetailsModal({ student, onClose, onMarkAttendance, selectedGroupId, groups }) {
  if (!student) return null

  const isDark = document.body.classList.contains('dark')

  // Mismatch detection
  const selectedGroup = groups?.find(g => g.id === selectedGroupId)
  const isDifferentGroup = selectedGroupId && selectedGroup && student && (student.group_name !== selectedGroup.name)

  // Listen to 'n' / 'N' key to close the modal
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't close if they are typing in an input or textarea
      if (document.activeElement && (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA'
      )) {
        return
      }
      if (e.key === 'n' || e.key === 'N' || e.key === 'Esc' || e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

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

  const modalBackground = isDifferentGroup
    ? (isDark ? 'rgba(45, 34, 12, 0.85)' : 'rgba(254, 243, 199, 0.95)')
    : (isDark ? 'rgba(30, 41, 59, 0.75)' : 'rgba(255, 255, 255, 0.9)')

  const modalBorder = isDifferentGroup
    ? (isDark ? '2px solid rgba(245, 158, 11, 0.5)' : '2px solid rgba(217, 119, 6, 0.5)')
    : '1px solid rgba(255, 255, 255, 0.1)'

  const modalShadow = isDifferentGroup
    ? (isDark ? '0 25px 50px -12px rgba(245, 158, 11, 0.3)' : '0 25px 50px -12px rgba(217, 119, 6, 0.25)')
    : '0 25px 50px -12px rgba(0, 0, 0, 0.4)'

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
      <div style={{
        maxWidth: '540px',
        width: '100%',
        background: modalBackground,
        border: modalBorder,
        borderRadius: '24px',
        padding: '30px',
        boxShadow: modalShadow,
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        color: isDark ? '#f8fafc' : '#0f172a'
      }} onClick={(e) => e.stopPropagation()}>
        
        {/* Close button */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(255, 255, 255, 0.1)',
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

        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: isDifferentGroup
              ? 'linear-gradient(135deg, #fbbf24, #d97706)'
              : 'linear-gradient(135deg, var(--secondary, #38bdf8), var(--primary, #8b5cf6))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            fontWeight: 'bold',
            margin: '0 auto 12px'
          }}>
            {student.name.charAt(0)}
          </div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 6px' }}>{student.name}</h3>
          <p style={{ fontSize: '0.9rem', color: isDark ? '#94a3b8' : '#64748b', margin: 0 }}>
            {student.grade} | {student.group_name || 'بدون مجموعة'}
          </p>
        </div>

        {/* Different Group Warning Alert */}
        {isDifferentGroup && (
          <div style={{
            background: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: isDark ? '#fbbf24' : '#d97706',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            marginBottom: '20px',
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
        )}

        {/* Warnings & Flags alerts */}
        {(student.warnings.length > 0 || student.flags?.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
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
          gap: '16px',
          marginBottom: '24px'
        }}>
          {/* Branch & Year */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>الفرع</span>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{student.branch_name}</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>العام الأكاديمي</span>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{student.academic_year_name}</div>
          </div>

          {/* Group Name (Prominent Card) */}
          <div style={{ 
            background: isDifferentGroup 
              ? (isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(254, 243, 199, 0.5)')
              : 'rgba(255, 255, 255, 0.03)', 
            border: isDifferentGroup
              ? (isDark ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(217, 119, 6, 0.3)')
              : '1px solid rgba(255, 255, 255, 0.05)', 
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
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>حالة الحساب</span>
            <div style={{ fontWeight: 'bold', marginTop: '4px', color: student.status === 'active' ? '#10b981' : '#64748b' }}>
              {STATUS_LABEL[student.status] || student.status}
            </div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>نوع الاشتراك</span>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>
              {ENROLLMENT_LABEL[student.enrollment_type] || student.enrollment_type}
            </div>
          </div>

          {/* Attendance Stats */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '12px', gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>نسبة حضور السنتر</span>
              <span style={{ fontWeight: 'bold', color: student.attendance_percentage >= 75 ? '#10b981' : '#ef4444' }}>
                {student.attendance_percentage}%
              </span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
              <div style={{
                width: `${student.attendance_percentage}%`,
                height: '100%',
                background: student.attendance_percentage >= 75 ? '#10b981' : '#ef4444',
                borderRadius: '3px'
              }} />
            </div>
          </div>

          {/* Financial Ledger Balance */}
          <div style={{
            background: hasDebt ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
            border: `1px solid ${hasDebt ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}`,
            padding: '16px',
            borderRadius: '16px',
            gridColumn: 'span 2',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>الحساب المالي (الرصيد المستحق)</span>
            <div style={{
              fontSize: '2rem',
              fontWeight: 900,
              marginTop: '6px',
              color: hasDebt ? '#ef4444' : '#10b981'
            }}>
              {student.outstanding_balance} جنيه
            </div>
            {hasDebt && (
              <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '4px', fontWeight: 'bold' }}>
                <i className="fas fa-circle-exclamation" style={{ marginInlineEnd: '4px' }} />
                يوجد مستحقات مالية متأخرة على الطالب
              </div>
            )}
          </div>
        </div>

        {/* Last Payment */}
        {student.last_payment && student.last_payment.amount && (
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '6px' }}>آخر دفعة مالية مسجلة</h4>
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
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '6px' }}>ملاحظات وتنبيهات الإدارة</h4>
            <ul style={{ paddingRight: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.6', color: '#94a3b8' }}>
              {student.notes.map((note, idx) => (
                <li key={idx} style={{ marginBottom: '6px' }}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Button: Register attendance */}
        {onMarkAttendance && (
          <button
            onClick={() => {
              onMarkAttendance(student)
              onClose()
            }}
            className="cp-btn cp-btn-success"
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
              cursor: 'pointer',
              border: 'none',
              marginTop: '10px'
            }}
          >
            <i className="fas fa-calendar-check" />
            <span>تسجيل حضور الطالب الآن</span>
          </button>
        )}

      </div>
    </div>
  )
}
