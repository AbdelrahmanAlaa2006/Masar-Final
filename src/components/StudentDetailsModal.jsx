import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { recordSubscriptionPayment } from '@backend/financeApi'
import { printThermalPaymentReceipt } from '../utils/paymentReceiptPrint'
import { notify } from '../utils/notify'
import { invalidate as invalidateCache } from '../utils/cache'

const ORDERED_ACAD_MONTHS = ['أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو']

const getAcadMonthIdx = (d = new Date()) => {
  const date = new Date(d)
  const m = isNaN(date.getTime()) ? new Date().getMonth() : date.getMonth()
  return m >= 7 ? m - 7 : m + 5
}

const MONTH_PACKAGES = [
  'اشتراك شهر أغسطس',
  'اشتراك شهر سبتمبر',
  'اشتراك شهر أكتوبر',
  'اشتراك شهر نوفمبر',
  'اشتراك شهر ديسمبر',
  'اشتراك شهر يناير',
  'اشتراك شهر فبراير',
  'اشتراك شهر مارس',
  'اشتراك شهر أبريل',
  'اشتراك شهر مايو',
  'اشتراك شهر يونيو',
  'اشتراك شهر يوليو',
  'اشتراك الترم الأول',
  'اشتراك الترم الثاني',
  'اشتراك السنة كاملة'
]

const getCurrentMonthPackage = () => {
  const currentMonth = ORDERED_ACAD_MONTHS[getAcadMonthIdx()] || 'سبتمبر'
  return `اشتراك شهر ${currentMonth}`
}

export default function StudentDetailsModal({ student, onClose, onMarkAttendance, selectedGroupId, groups, currentGrade }) {
  if (!student) return null

  const { user } = useAuth()
  const { tenant } = useTenant()

  const isDark = document.body.classList.contains('dark')

  // Mismatch detection
  const selectedGroup = groups?.find(g => g.id === selectedGroupId)
  const isStudentInGroup = selectedGroupId ? (
    student?.group_id === selectedGroupId ||
    student?.student_groups?.some(sg => sg.group_id === selectedGroupId) ||
    student?.group_name === selectedGroup?.name
  ) : true
  const isDifferentGroup = Boolean(selectedGroupId && selectedGroup && student && !isStudentInGroup)
  const isDifferentGrade = currentGrade && student && (student.grade !== currentGrade)
  // ONLINE students are not part of the center system — no barcode attendance for them
  const isOnlineStudent = student?.enrollment_type === 'ONLINE'
  const isLate = student?.session_status === 'late'
  const hasPriorLates = typeof student?.late_count === 'number' && student.late_count > 0
  const hasWarning = isDifferentGroup || isDifferentGrade || isOnlineStudent || isLate
  const isBlocked = isDifferentGrade || isOnlineStudent

  // Attendance figures — newer RPC returns counts; older one only a percentage
  const hasAttendanceCounts = typeof student.total_sessions === 'number'
  const hasAttendanceData = hasAttendanceCounts
    ? student.total_sessions > 0
    : student.attendance_percentage !== null && student.attendance_percentage !== undefined
  const attendancePct = hasAttendanceData ? Number(student.attendance_percentage) : null

  // Save guard: prevents duplicate submissions + ignores Enter while saving.
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const confirmBtnRef = useRef(null)
  const modalBoxRef = useRef(null)

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Multi-month unpaid tracking
  const unpaidMonthsList = Array.isArray(student.unpaid_months) ? student.unpaid_months : []
  const initialAmountDue = typeof student.amount_due === 'number'
    ? student.amount_due
    : (unpaidMonthsList.reduce((sum, u) => sum + (Number(u.remaining) || 0), 0) || student.outstanding_balance || 0)

  const [unpaidMonths, setUnpaidMonths] = useState(unpaidMonthsList)
  const [amountDue, setAmountDue] = useState(initialAmountDue)
  const [paidThisMonth, setPaidThisMonth] = useState(student.paid_this_month ?? (initialAmountDue === 0))

  const defaultPayPackage = unpaidMonthsList.length > 0
    ? unpaidMonthsList[0].packageName
    : getCurrentMonthPackage()

  const [payMonth, setPayMonth] = useState(defaultPayPackage)

  const calculatedMonthlyDue = Number(student.monthly_fee) > 0 
    ? Math.max(0, Number(student.monthly_fee) - Number(student.discount || 0))
    : (amountDue > 0 ? amountDue : (student.monthly_fee || 0))

  const getTodayLocalDate = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - offset * 60 * 1000)
    return localDate.toISOString().split('T')[0]
  }

  const [payAmount, setPayAmount] = useState(() => {
    if (amountDue > 0) return String(amountDue)
    if (calculatedMonthlyDue > 0) return String(calculatedMonthlyDue)
    return ''
  })
  const [payMethod, setPayMethod] = useState('Cash')
  const [payDate, setPayDate] = useState(() => getTodayLocalDate())
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true)
  const [isSavingPayment, setIsSavingPayment] = useState(false)
  const [paymentSuccessData, setPaymentSuccessData] = useState(null)

  useEffect(() => {
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

  const confirm = useCallback(async () => {
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

  // Close keys. Enter is handled by the auto-focused Save button's native activation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showPaymentModal) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          setShowPaymentModal(false)
        }
        return
      }
      if (e.key === 'Escape' || e.key === 'Esc') { onClose(); return }
      const el = document.activeElement
      const inField = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      if (!inField && (e.key === 'n' || e.key === 'N')) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, showPaymentModal])

  // Auto-focus the Save button on open so Enter/Space confirms with no mouse.
  useEffect(() => {
    if (isBlocked || !onMarkAttendance || showPaymentModal) return
    const t = setTimeout(() => {
      try { confirmBtnRef.current?.focus({ preventScroll: true }) } catch { confirmBtnRef.current?.focus() }
    }, 40)
    return () => clearTimeout(t)
  }, [isBlocked, onMarkAttendance, showPaymentModal])

  // Handle confirming payment
  const handleConfirmPayment = async () => {
    const val = parseFloat(payAmount)
    if (!val || val <= 0) {
      notify('يرجى إدخال مبلغ صحيح 💰', 'danger')
      return
    }

    const sId = student.student_id || student.id
    if (!sId) {
      notify('خطأ: لم يتم العثور على معرف الطالب', 'danger')
      return
    }

    const monthlyDueVal = calculatedMonthlyDue > 0 ? calculatedMonthlyDue : val

    setIsSavingPayment(true)
    try {
      const saved = await recordSubscriptionPayment({
        studentId: sId,
        amount: val,
        billingPeriod: payMonth,
        monthlyDue: monthlyDueVal,
        paymentMethod: payMethod,
        transactionDate: payDate,
        adminId: user?.id || null
      })

      const remaining = Math.max(0, monthlyDueVal - val)

      // Update local state
      const nextUnpaid = unpaidMonths.filter(u => !payMonth.includes(u.month))
      setUnpaidMonths(nextUnpaid)
      const isAllPaid = nextUnpaid.length === 0 && remaining === 0
      setPaidThisMonth(isAllPaid)
      setAmountDue(remaining)
      student.paid_this_month = isAllPaid
      student.amount_due = remaining
      student.unpaid_months = nextUnpaid
      student.last_payment = {
        amount: val,
        payment_method: payMethod,
        description: payMonth,
        created_at: new Date().toISOString()
      }

      notify(
        remaining > 0
          ? `تم تسجيل دفعة جزئية (${val} ج.م) — المتبقي ${remaining} ج.م على «${payMonth}».`
          : 'تم تسجيل الدفع وتأكيد الاشتراك بنجاح! 🎉',
        'success'
      )

      invalidateCache('admin-payments')
      invalidateCache(`student-payments-${sId}`)
      invalidateCache('students')

      const receiptPayload = {
        ...(saved || {}),
        package_name: payMonth,
        billing_period: payMonth,
        remaining: remaining,
        amount: val,
        payment_method: payMethod,
        transaction_date: payDate,
        created_at: new Date().toISOString(),
        profiles: student
      }

      setPaymentSuccessData(receiptPayload)

      if (autoPrintReceipt) {
        printThermalPaymentReceipt({
          payment: receiptPayload,
          student: student,
          tenant: tenant,
          adminName: user?.user_metadata?.full_name || user?.name || 'الإدارة',
          remaining: remaining
        })
      }
    } catch (err) {
      console.error('Payment error:', err)
      notify('تعذر تسجيل الدفع: ' + (err.message || ''), 'danger')
    } finally {
      setIsSavingPayment(false)
    }
  }

  // Print Receipt again on demand
  const handlePrintReceiptManual = () => {
    if (!paymentSuccessData) return
    printThermalPaymentReceipt({
      payment: paymentSuccessData,
      student: student,
      tenant: tenant,
      adminName: user?.user_metadata?.full_name || user?.name || 'الإدارة',
      remaining: paymentSuccessData.remaining
    })
  }

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
    CENTER: 'سنتر',
    ONLINE: 'أونلاين',
    HYBRID: 'سنتر وأونلاين'
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

  const hasDebt = (amountDue > 0) || (student.outstanding_balance > 0)

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

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
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

        {/* ── Header ── */}
        <div style={{ flexShrink: 0, textAlign: 'center', padding: '24px 30px 16px', borderBottom: `1px solid ${dividerColor}` }}>
          {showPaymentModal ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="cp-btn cp-btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="fas fa-arrow-right" />
                <span>بيانات الطالب</span>
              </button>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                💳 تسجيل دفع الاشتراك
              </h3>
              <div style={{ width: '80px' }}></div>
            </div>
          ) : (
            <>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: isLate
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : hasWarning
                    ? 'linear-gradient(135deg, #fbbf24, #d97706)'
                    : 'linear-gradient(135deg, var(--secondary, #38bdf8), var(--primary, #8b5cf6))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                fontWeight: 'bold',
                margin: '0 auto 10px',
                boxShadow: isLate ? '0 0 20px rgba(245, 158, 11, 0.4)' : 'none'
              }}>
                {isLate ? <i className="fas fa-clock" style={{ fontSize: '1.5rem' }} /> : student.name.charAt(0)}
              </div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 4px', wordBreak: 'break-word' }}>{student.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                <span style={{ fontSize: '0.88rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                  {getGradeLabel(student.grade)} | {student.group_name || 'بدون مجموعة'}
                </span>
                {isLate && (
                  <span style={{ background: 'rgba(245, 158, 11, 0.18)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#f59e0b', padding: '2px 10px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: 800 }}>
                    ⏳ تسجيل متأخر
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Content View ── */}
        {showPaymentModal ? (
          /* Payment Collection Screen */
          <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, padding: '20px 30px' }}>
            {/* Student Quick Pill */}
            <div style={{ background: 'rgba(127, 127, 127, 0.08)', border: `1px solid ${dividerColor}`, borderRadius: '14px', padding: '12px 16px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <strong style={{ fontSize: '1.05rem' }}>{student.name}</strong>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                  {student.phone ? `هاتف: ${student.phone}` : ''} {student.parent_phone ? ` | ولي الأمر: ${student.parent_phone}` : ''}
                </div>
              </div>
              <span className="cp-id-pill">{student.group_name || 'بدون مجموعة'}</span>
            </div>

            {paymentSuccessData ? (
              /* Success confirmation state */
              <div style={{ textAlign: 'center', padding: '20px 0', animation: 'cpFadeUp 0.3s ease' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 16px' }}>
                  <i className="fas fa-check-circle" />
                </div>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px', color: '#10b981' }}>تم تسجيل الدفع بنجاح! 🎉</h4>
                <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 20px' }}>
                  تم حفظ عملية الدفع وتحديث حالة اشتراك الطالب للشهر المحدد.
                </p>

                <div style={{ background: 'rgba(127, 127, 127, 0.06)', border: `1px solid ${dividerColor}`, borderRadius: '16px', padding: '16px', marginBottom: '24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.92rem' }}>
                    <span style={{ color: '#64748b' }}>الشهر المسجل:</span>
                    <strong>{paymentSuccessData.package_name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.92rem' }}>
                    <span style={{ color: '#64748b' }}>المبلغ المدفوع:</span>
                    <strong style={{ color: '#10b981' }}>{paymentSuccessData.amount} ج.م</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.92rem' }}>
                    <span style={{ color: '#64748b' }}>وسيلة الدفع:</span>
                    <span>{paymentSuccessData.payment_method === 'Cash' ? 'نقدي (كاش)' : paymentSuccessData.payment_method}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.92rem' }}>
                    <span style={{ color: '#64748b' }}>المتبقي:</span>
                    <strong style={{ color: paymentSuccessData.remaining > 0 ? '#ef4444' : '#10b981' }}>
                      {paymentSuccessData.remaining} ج.م
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handlePrintReceiptManual}
                    className="cp-btn cp-btn-info"
                    style={{ flex: 1, padding: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '12px' }}
                  >
                    <i className="fas fa-print" />
                    <span>طباعة إيصال الدفع</span>
                  </button>

                  <button
                    type="button"
                    onClick={confirm}
                    disabled={isBlocked || submitting}
                    className="cp-btn cp-btn-success"
                    style={{ flex: 1, padding: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '12px' }}
                  >
                    <i className="fas fa-calendar-check" />
                    <span>تسجيل الحضور والإنهاء</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Payment input form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Month Dropdown */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: isDark ? '#94a3b8' : '#475569' }}>
                    شهر / باقة الاشتراك المطلوب دفعها:
                  </label>
                  <select
                    value={payMonth}
                    onChange={(e) => setPayMonth(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 'bold' }}
                  >
                    {MONTH_PACKAGES.map((pkg) => (
                      <option key={pkg} value={pkg}>{pkg}</option>
                    ))}
                  </select>
                </div>

                {/* Amount & Due Breakdown */}
                <div style={{ background: 'rgba(127, 127, 127, 0.05)', border: `1px solid ${dividerColor}`, borderRadius: '14px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '0.88rem' }}>
                    <span style={{ color: '#64748b' }}>سعر اشتراك المرحلة:</span>
                    <strong>{student.monthly_fee ? `${student.monthly_fee} ج.م` : 'غير محدد'}</strong>
                  </div>
                  {Number(student.discount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '0.88rem', color: '#10b981' }}>
                      <span>خصم استثنائي للطالب:</span>
                      <strong>- {student.discount} ج.م</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px dashed ${dividerColor}`, paddingTop: '8px', fontSize: '0.95rem' }}>
                    <span style={{ fontWeight: 'bold' }}>المستحق سداده:</span>
                    <strong style={{ color: amountDue > 0 ? '#ef4444' : '#10b981', fontSize: '1.15rem' }}>
                      {calculatedMonthlyDue} ج.م
                    </strong>
                  </div>
                </div>

                {/* Amount Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: isDark ? '#94a3b8' : '#475569' }}>
                    المبلغ المدفوع الآن (ج.م):
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="أدخل المبلغ..."
                      className="cp-input"
                      style={{ width: '100%', padding: '12px 14px', fontSize: '1.2rem', fontWeight: 800, borderRadius: '10px' }}
                    />
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 'bold' }}>
                      ج.م
                    </span>
                  </div>
                </div>

                {/* Payment Method & Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: isDark ? '#94a3b8' : '#475569' }}>
                      وسيلة الدفع:
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="cp-input"
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '0.9rem' }}
                    >
                      <option value="Cash">نقدي (كاش)</option>
                      <option value="InstaPay">InstaPay</option>
                      <option value="Vodafone Cash">فودافون كاش</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: isDark ? '#94a3b8' : '#475569' }}>
                      تاريخ الدفع:
                    </label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="cp-input"
                      style={{ width: '100%', padding: '9px 10px', borderRadius: '10px', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                {/* Auto Print Checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold', userSelect: 'none', margin: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={autoPrintReceipt}
                    onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary, #8b5cf6)' }}
                  />
                  <span>طباعة إيصال الدفع الحراري فوراً بعد التأكيد 🖨️</span>
                </label>

                {/* Confirm Payment Action Button */}
                <button
                  type="button"
                  disabled={isSavingPayment}
                  onClick={handleConfirmPayment}
                  className="cp-btn cp-btn-primary"
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
                    marginTop: '8px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    border: 'none',
                    cursor: isSavingPayment ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSavingPayment ? (
                    <>
                      <i className="fas fa-spinner fa-spin" />
                      <span>جاري تسجيل الدفع...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle" />
                      <span>تأكيد تسجيل الدفع وحفظ الإيصال</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Standard Student Details Scrollable Body */
          <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, padding: '18px 30px' }}>

            {/* Late status for current session (Topmost Priority) */}
            {isLate && (
              <div style={{
                background: isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(254, 243, 199, 0.95)',
                border: '1.5px solid #f59e0b',
                color: isDark ? '#fbbf24' : '#b45309',
                padding: '14px 16px',
                borderRadius: '16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.15)'
              }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                  <i className="fas fa-clock-rotate-left"></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 2 }}>
                    ⏳ حالة التحضير: تم تسجيل الطالب (متأخر) عن الحصة
                  </div>
                  <div style={{ fontSize: '0.84rem', opacity: 0.95, lineHeight: 1.4 }}>
                    {hasPriorLates
                      ? `تنبيه: سجل الطالب يتضمن (${student.late_count}) مرات تأخير سابقة خلال الفصل الدراسي.`
                      : 'تم إثبات الحضور مع تسجيل حالة التأخير في كشف الحصة وإشعار ولي الأمر.'}
                  </div>
                </div>
              </div>
            )}

            {/* Historical Late Warning Banner if not currently marking late but has repeated past lates */}
            {!isLate && typeof student.late_count === 'number' && student.late_count >= 2 && (
              <div style={{
                background: isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(254, 243, 199, 0.85)',
                border: '1.5px solid #f59e0b',
                color: isDark ? '#fbbf24' : '#b45309',
                padding: '12px 16px',
                borderRadius: '14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.1)'
              }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                  <i className="fas fa-triangle-exclamation"></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 2 }}>
                    ⚠️ تنبيه تكرار التأخير: تكرر تأخير الطالب ({student.late_count} مرات سابقة)!
                  </div>
                  <div style={{ fontSize: '0.82rem', opacity: 0.95, lineHeight: 1.4 }}>
                    هذا الطالب يتأخر بشكل متكرر عن موعد بدء الحصة. يُرجى التنبيه والتشديد عليه.
                  </div>
                </div>
              </div>
            )}

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
                  <strong>تنبيه مجموعة مختلفة:</strong> الطالب مسجل في مجموعة <strong>({student.group_name || 'بدون مجموعة'})</strong> وليس في مجموعة الحصة الحالية <strong>({selectedGroup?.name})</strong>.
                </div>
              </div>
            ) : null}

            {/* Monthly subscription status */}
            <div style={{
              marginBottom: '18px', padding: '14px 16px', borderRadius: '14px', textAlign: 'center',
              background: (unpaidMonths.length === 0 && amountDue === 0) ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${(unpaidMonths.length === 0 && amountDue === 0) ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: (unpaidMonths.length === 0 && amountDue === 0) ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: '1.05rem'
            }}>
              <i className={`fas ${(unpaidMonths.length === 0 && amountDue === 0) ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} style={{ marginInlineEnd: '8px' }} />
              {(unpaidMonths.length === 0 && amountDue === 0)
                ? 'سدّد اشتراك جميع الشهور المستحقة ✅'
                : (unpaidMonths.length === 1)
                  ? `مطلوب سداد اشتراك شهر ${unpaidMonths[0].month} — ${unpaidMonths[0].remaining || amountDue} ج.م ⚠️`
                  : `مطلوب سداد متأخرات (${unpaidMonths.map(u => u.month).join(' + ')}) — الإجمالي: ${amountDue} ج.م ⚠️`}
            </div>

            {/* Missing Required Exams / Quizzes Alert */}
            {student.missing_exams && student.missing_exams.length > 0 && (
              <div style={{
                background: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.12)',
                border: '1.5px solid #ef4444',
                color: isDark ? '#fca5a5' : '#b91c1c',
                padding: '12px 16px',
                borderRadius: '14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)'
              }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                  <i className="fas fa-file-circle-xmark"></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 2 }}>
                    ⚠️ تنبيه: لم يؤدِ الامتحان / الكويز المطلوب!
                  </div>
                  <div style={{ fontSize: '0.84rem', opacity: 0.95, lineHeight: 1.4 }}>
                    الامتحانات المتأخرة: <strong>{student.missing_exams.map(e => e.title).join('، ')}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings & Flags alerts */}
            {(student.warnings?.length > 0 || student.flags?.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
                {student.warnings?.map(warn => (
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
                <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{student.branch_name || '—'}</div>
              </div>
              <div style={{ background: 'rgba(127, 127, 127, 0.06)', border: `1px solid ${dividerColor}`, padding: '12px', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>العام الأكاديمي</span>
                <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{student.academic_year_name || '—'}</div>
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
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                      <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <i className="fas fa-check" /> حضور: {student.present_count}
                      </span>
                      <span style={{ background: student.late_count > 0 ? 'rgba(245, 158, 11, 0.18)' : 'rgba(127, 127, 127, 0.08)', color: '#f59e0b', border: student.late_count >= 2 ? '1px solid rgba(245, 158, 11, 0.4)' : 'none', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <i className="fas fa-clock" /> تأخير: {student.late_count} {student.late_count >= 2 ? '⚠️' : ''}
                      </span>
                      <span style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <i className="fas fa-xmark" /> غياب: {student.absent_count}
                      </span>
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
        )}

        {/* ── Pinned Action Buttons (Always Visible) ── */}
        {!showPaymentModal && onMarkAttendance && (() => {
          const blockedLabel = isOnlineStudent
            ? 'غير مسموح بالتحضير (طالب أونلاين)'
            : 'غير مسموح بالتحضير (صف دراسي مختلف)'
          
          const buttonBg = isBlocked
            ? undefined
            : isLate
              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
              : undefined

          const buttonText = submitting
            ? 'جاري الحفظ...'
            : isBlocked
              ? blockedLabel
              : isLate
                ? 'تأكيد تسجيل تأخير الطالب (Enter)'
                : 'تسجيل حضور الطالب الآن (Enter)'

          return (
            <div style={{
              flexShrink: 0,
              padding: '12px 16px 16px',
              borderTop: `1px solid ${dividerColor}`,
              display: 'flex',
              gap: '12px',
              alignItems: 'center'
            }}>
              {/* Main Attendance Button (Auto-focused for Enter key) */}
              <button
                ref={confirmBtnRef}
                onClick={confirm}
                disabled={isBlocked || submitting}
                className={`cp-btn ${isBlocked ? 'cp-btn-secondary' : isLate ? 'cp-btn-warning' : 'cp-btn-success'}`}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  borderRadius: '12px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: (isBlocked || submitting) ? 'not-allowed' : 'pointer',
                  border: 'none',
                  opacity: (isBlocked || submitting) ? 0.55 : 1,
                  background: buttonBg,
                  color: '#fff'
                }}
              >
                <i className={submitting ? 'fas fa-spinner fa-spin' : (isBlocked ? 'fas fa-ban' : isLate ? 'fas fa-clock-rotate-left' : 'fas fa-calendar-check')} />
                <span>{buttonText}</span>
              </button>

              {/* Pay Month Button */}
              {!isBlocked && (
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="cp-btn"
                  style={{
                    padding: '14px 20px',
                    borderRadius: '12px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    border: 'none',
                    background: amountDue > 0
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : 'linear-gradient(135deg, #06b6d4, #0284c7)',
                    color: '#fff',
                    boxShadow: amountDue > 0 ? '0 4px 14px rgba(239, 68, 68, 0.35)' : 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <i className="fas fa-credit-card" />
                  <span>دفع الشهر</span>
                </button>
              )}
            </div>
          )
        })()}

      </div>
    </div>,
    document.body
  )
}
