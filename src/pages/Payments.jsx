import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { uploadHomeworkSubmission } from '@backend/r2'
import { submitPayment, listMyPayments, listPayments, resolvePayment, getPaymentSettings, updatePaymentSetting, deletePayment, listSubscriptionFees, upsertSubscriptionFee, setStudentDiscount, getStudentDiscount } from '@backend/paymentsApi'
import { searchStudents } from '@backend/profilesApi'
import { recordSubscriptionPayment } from '@backend/financeApi'
import { listBranches } from '@backend/branchesApi'
import DatePicker from '../components/DatePicker'
import { PAYMENT_CONFIG } from '../utils/paymentConfig'
import { notify } from '../utils/notify'
import { invalidate as invalidateCache } from '../utils/cache'
import { useTenant } from '../contexts/TenantContext'
import { GRADE_LABEL } from './ControlPanel/shared'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import BookletsPanel from './ControlPanel/BookletsPanel'
import { printThermalPaymentReceipt } from '../utils/paymentReceiptPrint'
import './Payments.css'

const ACAD_MONTHS = ['سبتمبر','أكتوبر','نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس']

const getAcadMonthIdx = (d) => {
  if (!d || isNaN(new Date(d).getTime())) {
    const now = new Date()
    const m = now.getMonth()
    return m >= 8 ? m - 8 : m + 4
  }
  const date = new Date(d)
  const m = date.getMonth()
  return m >= 8 ? m - 8 : m + 4
}

const getPackageNameForIdx = (idx) => {
  const mName = ACAD_MONTHS[(idx % 12 + 12) % 12]
  return `اشتراك شهر ${mName}`
}

const isPackagePaidForStudent = (studentId, pkgName, payments, monthDue) => {
  if (!studentId || !pkgName) return false
  const monthName = pkgName.replace('اشتراك شهر ', '').trim()
  const paidSoFar = (payments || [])
    .filter(p =>
      p.student_id === studentId &&
      p.status === 'approved' &&
      ((p.package_name || '').trim() === pkgName.trim() ||
       (p.package_name || '').includes(monthName) ||
       (p.billing_period || '').includes(monthName))
    )
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  return monthDue > 0 ? paidSoFar >= monthDue : paidSoFar > 0
}

const determineSmartDefaultMonth = (studentObj, payments, monthDue) => {
  const now = new Date()
  const currentAcadIdx = getAcadMonthIdx(now)

  if (!studentObj) return getPackageNameForIdx(currentAcadIdx)

  // Find all approved monthly subscription payments for this student
  const studentApprovedPayments = (payments || []).filter(
    p => p.student_id === studentObj.id && p.status === 'approved'
  )

  const monthlyPayRecords = studentApprovedPayments.filter(p =>
    ACAD_MONTHS.some(m => (p.package_name || '').includes(m) || (p.billing_period || '').includes(m))
  )

  // 1. If student has NO previous monthly subscription payments (first-time payment):
  //    ALWAYS default to current calendar month (e.g. August).
  if (monthlyPayRecords.length === 0) {
    const currentPkg = getPackageNameForIdx(currentAcadIdx)
    if (!isPackagePaidForStudent(studentObj.id, currentPkg, payments, monthDue)) {
      return currentPkg
    }
  }

  // 2. If student HAS previous monthly payment records, check from their earliest paid month up to current month
  let earliestPaidAcadIdx = currentAcadIdx
  monthlyPayRecords.forEach(p => {
    ACAD_MONTHS.forEach((m, idx) => {
      if ((p.package_name || '').includes(m) || (p.billing_period || '').includes(m)) {
        if (idx < earliestPaidAcadIdx) earliestPaidAcadIdx = idx
      }
    })
  })

  const startAcadIdx = Math.min(earliestPaidAcadIdx, currentAcadIdx)
  const numMonths = (currentAcadIdx - startAcadIdx + 12) % 12 + 1

  for (let i = 0; i < numMonths; i++) {
    const idx = (startAcadIdx + i) % 12
    const pkg = getPackageNameForIdx(idx)
    if (!isPackagePaidForStudent(studentObj.id, pkg, payments, monthDue)) {
      return pkg
    }
  }

  for (let i = numMonths; i < 12; i++) {
    const idx = (startAcadIdx + i) % 12
    const pkg = getPackageNameForIdx(idx)
    if (!isPackagePaidForStudent(studentObj.id, pkg, payments, monthDue)) {
      return pkg
    }
  }

  return getPackageNameForIdx(currentAcadIdx)
}

const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export default function Payments() {
  // Record this visit for the home "Continue" widget.
  useEffect(() => { import('../utils/trackVisit').then(m => m.trackVisit('payments')) }, [])

  const { user } = useAuth()
  const userId = user?.id || null

  const [payments, setPayments] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Form states
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('InstaPay')
  const [packageName, setPackageName] = useState('')
  const [showStudentPkgDropdown, setShowStudentPkgDropdown] = useState(false)
  const [file, setFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [copiedText, setCopiedText] = useState(null)

  // Dynamic payment config loaded from Supabase DB (falls back to PAYMENT_CONFIG)
  const [activeConfig, setActiveConfig] = useState(PAYMENT_CONFIG)

  // The student's REQUIRED amount = his grade's monthly fee minus his personal
  // discount. When a fee is configured we auto-fill and LOCK the amount field so
  // he pays exactly what's due (already discounted) — no free typing, no
  // mismatch with what the admin later sees.
  const [requiredAmount, setRequiredAmount] = useState(null)
  const [requiredDiscount, setRequiredDiscount] = useState(0)
  useEffect(() => {
    if (!userId || user?.role !== 'student' || !user?.grade) return
    let cancelled = false
    ;(async () => {
      try {
        const [fees, disc] = await Promise.all([listSubscriptionFees(), getStudentDiscount(userId)])
        if (cancelled) return
        const fee = Number((fees || []).find(f => f.grade === user.grade)?.amount) || 0
        if (fee > 0) {
          const d = Number(disc) || 0
          setRequiredDiscount(d)
          const due = Math.max(0, fee - d)
          setRequiredAmount(due)
          setAmount(String(due))
        }
      } catch { /* no fee configured -> keep the free input as fallback */ }
    })()
    return () => { cancelled = true }
  }, [userId, user?.role, user?.grade])

  // Hoisted receipt preview modal states (shared by students and admins)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [rotateDeg, setRotateDeg] = useState(0)

  // QR toggling
  const [showInstaQr, setShowInstaQr] = useState(false)
  const [showVodaQr, setShowVodaQr] = useState(false)

  const loadConfig = async () => {
    if (window.location.pathname !== '/payments') return
    try {
      const dbConfig = await getPaymentSettings()
      if (dbConfig && Object.keys(dbConfig).length > 0) {
        setActiveConfig({
          vodafoneCash: {
            number: dbConfig.vodafoneCash?.number || PAYMENT_CONFIG.vodafoneCash.number,
            label: dbConfig.vodafoneCash?.label || PAYMENT_CONFIG.vodafoneCash.label,
            qrOverride: dbConfig.vodafoneCash?.qrOverride || PAYMENT_CONFIG.vodafoneCash.qrOverride || '',
          },
          instaPay: {
            address: dbConfig.instaPay?.address || PAYMENT_CONFIG.instaPay.address,
            label: dbConfig.instaPay?.label || PAYMENT_CONFIG.instaPay.label,
            link: dbConfig.instaPay?.link || PAYMENT_CONFIG.instaPay.link,
            qrOverride: dbConfig.instaPay?.qrOverride || PAYMENT_CONFIG.instaPay.qrOverride || '',
          },
          packages: dbConfig.packages || null
        })
      }
    } catch (err) {
      console.warn('Failed to load dynamic payment settings, using local config:', err)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  // Sync default package name when config loads
  useEffect(() => {
    setPackageName('اشتراك شهر أكتوبر')
  }, [])

  const studentPackages = useMemo(() => {
    return [
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
      'اشتراك شهر أغسطس',
      'اشتراك الترم الأول',
      'اشتراك الترم الثاني',
      'اشتراك السنة كاملة'
    ]
  }, [])



  const loadHistory = async (forceRefresh = false) => {
    if (window.location.pathname !== '/payments') return
    if (!userId) return
    try {
      setLoadingHistory(true)
      if (forceRefresh) {
        invalidateCache('admin-payments')
        invalidateCache(`student-payments-${userId}`)
      }
      if (user?.role === 'admin' || user?.role === 'assistant') {
        const data = await listPayments()
        setPayments(data)
      } else {
        const data = await listMyPayments(userId)
        setPayments(data)
      }
    } catch (err) {
      console.error('Failed to load payment history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [userId])

  // Lock background body scroll when receipt preview modal is open
  useEffect(() => {
    if (previewUrl) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [previewUrl])

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text)
    setCopiedText(type)
    notify('تم النسخ إلى الحافظة نجاح 📋', 'success')
    setTimeout(() => setCopiedText(null), 2000)
  }

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      if (!selected.type.startsWith('image/')) {
        notify('الملف يجب أن يكون صورة إيصال الدفع فقط 📸', 'danger')
        return
      }
      setFile(selected)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!userId) return
    if (!amount || parseFloat(amount) <= 0) {
      notify('الرجاء إدخال مبلغ دفع صالح 💰', 'danger')
      return
    }
    if (!file) {
      notify('الرجاء إرفاق صورة إيصال التحويل 📸', 'danger')
      return
    }

    setSubmitting(true)
    setUploadProgress(1)
    try {
      // 1. Upload receipt to Cloudflare R2
      const { key, publicUrl } = await uploadHomeworkSubmission(file, {
        onProgress: (pct) => setUploadProgress(Math.max(1, pct)),
      })

      // 2. Submit payment confirmation to DB
      await submitPayment({
        studentId: userId,
        amount: amount,
        paymentMethod: method,
        screenshotUrl: publicUrl,
        screenshotKey: key,
        packageName: packageName,
      })

      notify('تم إرسال إيصال الدفع بنجاح! جاري مراجعته من قِبَل الإدارة. 🌟', 'success')
      
      // Reset form
      setAmount('')
      setFile(null)
      setUploadProgress(0)
      
      // Reload history
      loadHistory()
    } catch (err) {
      console.error('Submit payment error:', err)
      notify(err.message || 'فشل إرسال إيصال الدفع', 'danger')
      setUploadProgress(0)
    } finally {
      setSubmitting(false)
    }
  }

  // Fast transfer USSD code dial generator for Vodafone cash
  const vodaDialerLink = useMemo(() => {
    return `tel:*9*7*${activeConfig.vodafoneCash.number}#`
  }, [activeConfig.vodafoneCash.number])

  const instaQrUrl = useMemo(() => {
    return activeConfig.instaPay.qrOverride || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(activeConfig.instaPay.link)}`
  }, [activeConfig.instaPay.link, activeConfig.instaPay.qrOverride])

  const vodaQrUrl = useMemo(() => {
    return activeConfig.vodafoneCash.qrOverride || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`tel:${activeConfig.vodafoneCash.number}`)}`
  }, [activeConfig.vodafoneCash.number, activeConfig.vodafoneCash.qrOverride])

  return (
    <>
      {user?.role === 'admin' || user?.role === 'assistant' ? (
        <AdminPaymentsReport 
          payments={payments} 
          loading={loadingHistory} 
          onRefresh={() => loadHistory(true)} 
          config={activeConfig}
          onConfigChange={loadConfig}
          setPreviewUrl={setPreviewUrl}
          setRotateDeg={setRotateDeg}
        />
      ) : (
        <main className="cp-page" dir="rtl">
        <div className="cp-container">
        
        {/* Page Head */}
        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>بوابة تأكيد الدفع</h1>
            <p>اختر وسيلة الدفع المفضلة لديك، قم بالتحويل، ثم ارفع لقطة الشاشة لتأكيد اشتراكك</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-wallet"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {/* Inactive Student Warning Banner */}
        {user?.role === 'student' && user?.is_active === false && (
          <div 
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 16,
              padding: '16px 24px',
              marginBottom: 32,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              color: '#ef4444',
              fontFamily: 'Tajawal',
              animation: 'fadeInDown 0.3s ease-out'
            }}
          >
            <i className="fas fa-triangle-exclamation" style={{ fontSize: '1.8rem', flexShrink: 0 }}></i>
            <div>
              <strong style={{ display: 'block', fontSize: '1.05rem', fontWeight: 800, marginBottom: 4, textAlign: 'right' }}>تنبيه: حسابك غير نشط حالياً</strong>
              <span style={{ fontSize: '0.9rem', opacity: 0.9, textAlign: 'right', display: 'block' }}>
                يرجى تحويل قيمة الاشتراك وإرسال بيانات الإيصال أدناه لتفعيل حسابك تلقائياً والتمكن من تصفح الفيديوهات، الواجبات، والامتحانات.
              </span>
            </div>
          </div>
        )}

        {/* ─────────── Instructions Cards ─────────── */}
        <section className="paypg-instructions">
          
          {/* InstaPay */}
          <div className="pay-card pay-card-instapay">
            <div className="pay-card-badge">تطبيق InstaPay</div>
            <div className="pay-card-icon"><i className="fas fa-bolt"></i></div>
            <h3 className="pay-card-title">التحويل عبر إنستا باي</h3>
            <p className="pay-card-text">قم بتحويل قيمة الاشتراك إلى العنوان التالي مباشرة:</p>
            <div className="pay-card-value-box">
              <span className="pay-card-value">{activeConfig.instaPay.address}</span>
              <button 
                className="pay-card-copy-btn" 
                onClick={() => handleCopy(activeConfig.instaPay.address, 'insta')}
              >
                {copiedText === 'insta' ? <i className="fas fa-check"></i> : <i className="fas fa-copy"></i>}
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a 
                href={activeConfig.instaPay.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="pay-card-action-btn"
              >
                افتح تطبيق إنستا باي <i className="fas fa-external-link-alt"></i>
              </a>

              <button 
                className="pay-card-action-btn"
                onClick={() => setShowInstaQr(!showInstaQr)}
                style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
              >
                <i className="fas fa-qrcode"></i> {showInstaQr ? 'إخفاء الرمز' : 'عرض رمز QR'}
              </button>
            </div>

            {showInstaQr && (
              <div style={{ background: '#fff', padding: 12, borderRadius: 16, marginTop: 18, display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', transform: 'scale(1)', transition: 'all 0.2s' }}>
                <img key={activeConfig.instaPay.link} src={instaQrUrl} alt="InstaPay QR Code" style={{ width: 140, height: 140 }} />
              </div>
            )}
          </div>

          {/* Vodafone Cash */}
          <div className="pay-card pay-card-voda">
            <div className="pay-card-badge">E-wallet</div>
            <div className="pay-card-icon"><i className="fas fa-mobile-screen"></i></div>
            <h3 className="pay-card-title">محفظة إلكترونية</h3>
            <p className="pay-card-text">قم بتحويل قيمة الاشتراك إلى رقم محفظة إلكترونية التالي:</p>
            <div className="pay-card-value-box">
              <span className="pay-card-value">{activeConfig.vodafoneCash.number}</span>
              <button 
                className="pay-card-copy-btn" 
                onClick={() => handleCopy(activeConfig.vodafoneCash.number, 'voda')}
              >
                {copiedText === 'voda' ? <i className="fas fa-check"></i> : <i className="fas fa-copy"></i>}
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a 
                href={vodaDialerLink}
                className="pay-card-action-btn"
              >
                اتصال وتحويل سريع <i className="fas fa-phone"></i>
              </a>

              <button 
                className="pay-card-action-btn"
                onClick={() => setShowVodaQr(!showVodaQr)}
                style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
              >
                <i className="fas fa-qrcode"></i> {showVodaQr ? 'إخفاء الرمز' : 'عرض رمز QR'}
              </button>
            </div>

            {showVodaQr && (
              <div style={{ background: '#fff', padding: 12, borderRadius: 16, marginTop: 18, display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', transform: 'scale(1)', transition: 'all 0.2s' }}>
                <img key={activeConfig.vodafoneCash.number} src={vodaQrUrl} alt="Vodafone Cash QR Code" style={{ width: 140, height: 140 }} />
              </div>
            )}
          </div>

        </section>

        <div className="paypg-grid">
          
          {/* ─────────── Submission Form ─────────── */}
          <section className="paypg-form-section">
            <div className="cp-panel">
              <div className="cp-panel-header">
                <h2><i className="fas fa-file-invoice-dollar" style={{ marginLeft: 8, color: '#5bc2e7' }}></i> تأكيد إيصال الدفع</h2>
              </div>
              <form onSubmit={handleSubmit} className="paypg-form">
                
                <div className="form-group">
                  <label htmlFor="amount-input">قيمة المبلغ المرسل (ج.م) *</label>
                  <input
                    id="amount-input"
                    type="number"
                    min="1"
                    placeholder="مثال: 150"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    disabled={submitting}
                    readOnly={requiredAmount != null}
                    style={requiredAmount != null ? { background: 'rgba(16,185,129,0.06)', fontWeight: 800 } : undefined}
                  />
                  {requiredAmount != null && (
                    <small style={{ display: 'block', marginTop: 4, color: '#10b981', fontWeight: 700 }}>
                      القيمة محددة تلقائياً حسب اشتراك مرحلتك{requiredDiscount > 0 ? ` بعد خصم ${requiredDiscount} ج.م` : ''}.
                    </small>
                  )}
                </div>

                <div className="form-group" style={{ position: 'relative' }}>
                  <label htmlFor="package-input">الباقة المطلوبة *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      id="package-input"
                      type="text"
                      placeholder="مثال: اشتراك شهر أكتوبر"
                      value={packageName}
                      onChange={(e) => {
                        setPackageName(e.target.value)
                        setShowStudentPkgDropdown(true)
                      }}
                      onFocus={() => setShowStudentPkgDropdown(true)}
                      disabled={submitting}
                      style={{ height: 42, fontWeight: 600, width: '100%', paddingLeft: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentPkgDropdown(!showStudentPkgDropdown)}
                      style={{
                        position: 'absolute', left: 10, background: 'transparent', border: 'none',
                        color: 'var(--text-muted, #64748b)', cursor: 'pointer', outline: 'none', padding: '8px 4px'
                      }}
                    >
                      <i className={`fas fa-chevron-down ${showStudentPkgDropdown ? 'fa-rotate-180' : ''}`} style={{ transition: 'transform 0.2s' }}></i>
                    </button>
                  </div>
                  
                  {showStudentPkgDropdown && (
                    <>
                      {/* Backdrop to close dropdown on clicking outside */}
                      <div 
                        onClick={() => setShowStudentPkgDropdown(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                      />
                      <div className="paypg-package-dropdown">
                        {studentPackages.map(p => (
                          <div
                            key={p}
                            onClick={() => {
                              setPackageName(p)
                              setShowStudentPkgDropdown(false)
                            }}
                            className="paypg-package-dropdown-item"
                          >
                            {p}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="method-input">وسيلة الدفع المستخدمة *</label>
                  <select
                    id="method-input"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="InstaPay">تطبيق InstaPay</option>
                    <option value="Vodafone Cash">محفظة إلكترونية (Vodafone Cash)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>لقطة الشاشة للتحويل (صورة الإيصال) *</label>
                  <div className="paypg-upload-area">
                    <input
                      type="file"
                      id="screenshot-file"
                      accept="image/*"
                      onChange={handleFileChange}
                      required
                      disabled={submitting}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="screenshot-file" className="paypg-upload-label">
                      {file ? (
                        <div className="paypg-file-preview">
                          <i className="fas fa-file-image"></i>
                          <span>{file.name}</span>
                          <small>({(file.size / (1024 * 1024)).toFixed(2)} ميجابايت)</small>
                        </div>
                      ) : (
                        <div className="paypg-upload-placeholder">
                          <i className="fas fa-cloud-upload-alt"></i>
                          <span>اسحب وأفلت صورة الإيصال هنا أو اضغط للاختيار</span>
                          <small>صيغ الصور المدعومة (PNG, JPG) حتى 10 ميجابايت</small>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {uploadProgress > 0 && (
                  <div className="paypg-progress">
                    <div className="paypg-progress-bar">
                      <div className="paypg-progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                    <span className="paypg-progress-text">جاري رفع الإيصال: {uploadProgress}%</span>
                  </div>
                )}

                <button type="submit" className="paypg-submit-btn" disabled={submitting}>
                  {submitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> جاري تأكيد الدفع...
                    </>
                  ) : (
                    <>
                      إرسال لتأكيد الدفع <i className="fas fa-paper-plane"></i>
                    </>
                  )}
                </button>

              </form>
            </div>
          </section>

          {/* ─────────── Payment History (Report) ─────────── */}
          <section className="paypg-history-section">
            <div className="cp-panel">
              <div className="cp-panel-header">
                <h2><i className="fas fa-receipt" style={{ marginLeft: 8, color: '#5bc2e7' }}></i> سجل وتقرير مدفوعاتك</h2>
              </div>
              
              {loadingHistory ? (
                <div className="paypg-loader">
                  <i className="fas fa-circle-notch fa-spin"></i> جاري تحميل تقرير المدفوعات...
                </div>
              ) : payments.length > 0 ? (
                <div className="paypg-list">
                  {payments.map((p) => (
                    <div className={`pay-item status-${p.status}`} key={p.id}>
                      
                      <div className="pay-item-head">
                        <span className="pay-item-method">
                          {p.payment_method === 'InstaPay' ? (
                            <><i className="fas fa-bolt"></i> إنستا باي</>
                          ) : p.payment_method === 'Cash' ? (
                            <><i className="fas fa-money-bill-wave"></i> دفع نقدي</>
                          ) : (
                            <><i className="fas fa-mobile-screen"></i> محفظة إلكترونية</>
                          )}
                        </span>
                        <span className="pay-item-amount">{p.amount} ج.م</span>
                      </div>

                      <div className="pay-item-details">
                        <span className="pay-item-date"><i className="fas fa-calendar-alt"></i> تاريخ الطلب: {fmtDate(p.created_at)}</span>
                        {p.package_name && (
                          <span className="pay-item-package" style={{ display: 'block', margin: '4px 0', fontSize: '0.85rem', opacity: 0.8 }}>
                            <i className="fas fa-box"></i> الباقة: {p.package_name}
                          </span>
                        )}
                        {p.screenshot_url ? (
                          <button 
                            type="button"
                            onClick={() => { setRotateDeg(0); setPreviewUrl(p.screenshot_url); }}
                            className="pay-item-link"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, outline: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            عرض صورة الإيصال <i className="fas fa-search-plus"></i>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.85rem', opacity: 0.7 }}><i className="fas fa-check-circle"></i> تم التسجيل بواسطة الإدارة (نقدي)</span>
                        )}
                      </div>

                      <div className="pay-item-footer">
                        <span className={`pay-status-pill status-${p.status}`}>
                          {p.status === 'pending' && <><i className="fas fa-hourglass-half"></i> قيد المراجعة</>}
                          {p.status === 'approved' && <><i className="fas fa-circle-check"></i> مقبول</>}
                          {p.status === 'rejected' && <><i className="fas fa-circle-xmark"></i> مرفوض</>}
                        </span>

                        {p.admin_notes && (
                          <div className="pay-item-notes">
                            <strong>ملاحظة الإدارة:</strong> {p.admin_notes}
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              ) : (
                <div className="paypg-empty">
                  <i className="fas fa-wallet"></i>
                  <span>لا توجد طلبات تأكيد دفع سابقة</span>
                  <small>قم بالتحويل وارفع أول إيصال لتفعيل حسابك ومتابعة دروسك.</small>
                </div>
              )}

            </div>
          </section>

        </div>
        </div>
        </main>
      )}
      
      {/* ─────────── Receipt Full Screen Zoom Lightbox Modal (Shared by Student and Admin) ─────────── */}
      {previewUrl && (
        <div className="rp-modal-overlay" onClick={() => setPreviewUrl(null)} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 550 }}>
            
            {/* Modal Header */}
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
                <i className="fas fa-file-image"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>مراجعة إيصال التحويل</h3>
              </div>
              <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto' }}>
                <button 
                  type="button"
                  onClick={() => setRotateDeg(d => (d + 90) % 360)} 
                  className="cp-btn cp-btn-ghost"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: 8 }}
                >
                  <i className="fas fa-rotate-right"></i> تدوير
                </button>
              </div>
              <button className="rp-modal-close" onClick={() => setPreviewUrl(null)} style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Modal Image Body with Rotation transition */}
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--cp-hover-bg)', minHeight: 320, overflow: 'hidden' }}>
              <img 
                src={previewUrl} 
                alt="Receipt screenshot" 
                style={{ 
                  maxHeight: '65vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 12,
                  transform: `rotate(${rotateDeg}deg)`, transition: 'transform 0.2s ease-out' 
                }} 
              />
            </div>

          </div>
        </div>
      )}
    </>
  )
}

function AdminPaymentsReport({ payments, loading, onRefresh, config, onConfigChange, setPreviewUrl, setRotateDeg }) {
  const { user } = useAuth()
  const adminId = user?.id || null
  const { gradesList, tenant } = useTenant()

  // Monthly subscription fee per grade (admins + assistants with 'payments').
  const [feeInputs, setFeeInputs] = useState({})
  const [savingFees, setSavingFees] = useState(false)
  const [showFees, setShowFees] = useState(false)
  useEffect(() => {
    listSubscriptionFees()
      .then(rows => setFeeInputs(Object.fromEntries((rows || []).map(r => [r.grade, String(r.amount ?? '')]))))
      .catch(() => {})
  }, [])
  const handleSaveFees = async () => {
    setSavingFees(true)
    try {
      for (const g of (gradesList || [])) {
        await upsertSubscriptionFee(g.id, parseFloat(feeInputs[g.id]) || 0)
      }
      notify('تم حفظ أسعار الاشتراك الشهري.', 'success')
    } catch (err) {
      notify('تعذر حفظ الأسعار: ' + (err.message || ''), 'danger')
    } finally {
      setSavingFees(false)
    }
  }

  const [activeTab, setActiveTab] = useState('pending') // 'pending' is default for immediate attention, can switch to 'all', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('')      // specific day (by payment date)
  const [monthFilter, setMonthFilter] = useState('all') // specific subscription month (by package)

  // Newly saved payment receipt modal state (for instant thermal receipt printing)
  const [lastCompletedPayment, setLastCompletedPayment] = useState(null)

  // Branches for the branch filter.
  const [branchList, setBranchList] = useState([])
  useEffect(() => { listBranches().then(setBranchList).catch(() => {}) }, [])

  // Subscription months (matches the "اشتراك شهر X" package naming) — a payment
  // for August counts toward August's total even if paid in July.
  const SUB_MONTHS = ['سبتمبر','أكتوبر','نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس']
  // Groups present in the loaded payments (derived — no extra fetch).
  const groupOptions = useMemo(() => {
    const set = new Set((payments || []).map(p => p.profiles?.group).filter(Boolean))
    return Array.from(set)
  }, [payments])

  // Date range filters
  const getTodayLocalDate = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - offset * 60 * 1000)
    return localDate.toISOString().split('T')[0]
  }
  const [startDate, setStartDate] = useState(getTodayLocalDate())
  const [endDate, setEndDate] = useState(getTodayLocalDate())

  // Booklet payment modal — reuses the existing BookletsPanel payment workflow
  // (same APIs, services, validation, and business logic; only its location
  // moves here, beside the manual cash payment action).
  const [showBookletModal, setShowBookletModal] = useState(false)
  // Adapter: BookletsPanel calls flash(msg, kind) with kind in
  // 'success' | 'error' | 'warning'; map it onto this page's notify().
  const bookletFlash = (msg, kind = 'success') => notify(msg, { type: kind })

  // Cash payment modal states
  const [showCashModal, setShowCashModal] = useState(false)
  const [cashStudentId, setCashStudentId] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [cashDiscount, setCashDiscount] = useState('')
  const [savingDiscount, setSavingDiscount] = useState(false)
  const [cashPackageName, setCashPackageName] = useState('')
  const [showAdminPkgDropdown, setShowAdminPkgDropdown] = useState(false)
  const [studentSearchQuery, setStudentSearchQuery] = useState('')
  const [studentsList, setStudentsList] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [savingCash, setSavingCash] = useState(false)
  // Actual payment date — the secretary can record yesterday's payment today
  // (backdating); reports use this transaction date, not the entry timestamp.
  const [cashDate, setCashDate] = useState(() => new Date().toISOString().split('T')[0])

  const handleSaveDiscount = async () => {
    if (!cashStudentId) return
    const d = parseFloat(cashDiscount) || 0
    setSavingDiscount(true)
    try {
      await setStudentDiscount(cashStudentId, d)
      // Reflect the new discount in the due amount immediately.
      const stud = studentsList.find(s => s.id === cashStudentId)
      const fee = stud ? (parseFloat(feeInputs[stud.grade]) || 0) : 0
      if (fee > 0) setCashAmount(String(Math.max(0, fee - d)))
      notify('تم حفظ الخصم الاستثنائي للطالب (' + d + ' ج.م).', 'success')
    } catch (err) {
      notify('تعذر حفظ الخصم: ' + (err.message || ''), 'danger')
    } finally {
      setSavingDiscount(false)
    }
  }

  // When a student is picked in the cash modal, auto-fill the amount to his due
  // (grade fee - his discount), load his current discount, and intelligently set
  // the default payment month to his earliest unpaid/due month.
  useEffect(() => {
    if (!cashStudentId) return
    const stud = studentsList.find(s => s.id === cashStudentId)
    if (!stud) return
    let cancelled = false
    ;(async () => {
      let disc = 0
      try { disc = Number(await getStudentDiscount(cashStudentId)) || 0 } catch { disc = 0 }
      if (cancelled) return
      setCashDiscount(String(disc))
      const fee = parseFloat(feeInputs[stud.grade]) || 0
      const due = Math.max(0, fee - disc)
      if (fee > 0) setCashAmount(String(due))

      const smartPkg = determineSmartDefaultMonth(stud, payments, due)
      setCashPackageName(smartPkg)
    })()
    return () => { cancelled = true }
  }, [cashStudentId, studentsList, feeInputs, payments])

  const cashStudentObj = studentsList.find(s => s.id === cashStudentId)
  const cashFee = cashStudentObj ? (parseFloat(feeInputs[cashStudentObj.grade]) || 0) : 0
  // Monthly due (fee − discount). The amount stays EDITABLE so partial
  // payments are possible — a student can pay 100 of a 150 due; the remainder
  // is tracked in the ledger automatically.
  const cashDue = Math.max(0, cashFee - (parseFloat(cashDiscount) || 0))
  // Paid so far toward the selected subscription month (from loaded payments).
  const cashPaidSoFar = useMemo(() => {
    const month = (cashPackageName || '').trim()
    if (!cashStudentId || !month) return 0
    return (payments || [])
      .filter(p => p.student_id === cashStudentId && p.status === 'approved' && (p.package_name || '').trim() === month)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  }, [payments, cashStudentId, cashPackageName])

  // Configuration editing states
  const [showConfigEditor, setShowConfigEditor] = useState(false)
  const [instaAddress, setInstaAddress] = useState(config?.instaPay?.address || '')
  const [instaLink, setInstaLink] = useState(config?.instaPay?.link || '')
  const [vodaNumber, setVodaNumber] = useState(config?.vodafoneCash?.number || '')
  const [packagesStr, setPackagesStr] = useState(config?.packages || '')
  const [savingConfig, setSavingConfig] = useState(false)

  // Sync state if config prop updates
  useEffect(() => {
    if (config) {
      setInstaAddress(config.instaPay?.address || '')
      setInstaLink(config.instaPay?.link || '')
      setVodaNumber(config.vodafoneCash?.number || '')
      setPackagesStr(config.packages || '')
    }
  }, [config])

  const handleSaveConfig = async (e) => {
    e.preventDefault()
    if (!instaAddress || !instaLink || !vodaNumber) {
      notify('الرجاء تعبئة جميع حقول بيانات الدفع ⚠️', 'danger')
      return
    }

    setSavingConfig(true)
    try {
      // 1. Update InstaPay config
      await updatePaymentSetting('instaPay', {
        address: instaAddress,
        label: instaAddress,
        link: instaLink,
        qrOverride: config?.instaPay?.qrOverride || ''
      })

      // 2. Update Vodafone Cash config
      await updatePaymentSetting('vodafoneCash', {
        number: vodaNumber,
        label: vodaNumber,
        qrOverride: config?.vodafoneCash?.qrOverride || ''
      })

      notify('تم تحديث بيانات الدفع بنجاح وسيتم تطبيقها فورًا لجميع الطلاب! ⚙️💳', 'success')
      setShowConfigEditor(false)
      
      if (onConfigChange) {
        await onConfigChange()
      }
    } catch (err) {
      console.error('Failed to save payment config settings:', err)
      notify('تعذر حفظ التعديلات: ' + (err.message || ''), 'danger')
    } finally {
      setSavingConfig(false)
    }
  }

  // Notes and resolve actions mapping
  const [notesMap, setNotesMap] = useState({})
  const [resolvingId, setResolvingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [paymentToDelete, setPaymentToDelete] = useState(null)

  // Permanently delete a payment (test data / mistake). RLS keeps it tenant-safe.
  // We re-pull from the DB so every derived total (stats, tab counts) and the
  // student's monthly "paid?" status update immediately — real, not fake.
  const handleDeletePayment = async (p) => {
    if (!p) return
    setPaymentToDelete(null)
    setDeletingId(p.id)
    try {
      await deletePayment(p.id)
      invalidateCache('students')
      onRefresh()
      notify('تم حذف العملية بنجاح.', 'success')
    } catch (err) {
      console.error('Delete payment error:', err)
      notify('تعذر حذف العملية: ' + (err.message || ''), 'danger')
    } finally {
      setDeletingId(null)
    }
  }

  const handleResolve = async (paymentId, status, studentId) => {
    if (!adminId) return
    if (status === 'approved') {
      const thisPay = payments.find(p => p.id === paymentId)
      const month = (thisPay?.package_name || '').trim()
      if (month && payments.some(p => p.id !== paymentId && p.student_id === studentId && p.status === 'approved' && (p.package_name || '').trim() === month)) {
        notify(`هذا الطالب سدّد بالفعل «${month}». لا يمكن قبول دفعة مكررة لنفس الشهر — ارفضها أو احذف السابقة.`, 'danger')
        return
      }
    }
    const notes = notesMap[paymentId] || ''

    setResolvingId(paymentId)
    try {
      await resolvePayment(paymentId, {
        status,
        adminNotes: notes,
        adminId,
        studentId,
      })
      
      notify(status === 'approved' ? 'تم قبول الدفع وتفعيل حساب الطالب بنجاح! 🎉' : 'تم رفض طلب الدفع بنجاح.', 'success')
      
      setNotesMap(prev => {
        const next = { ...prev }
        delete next[paymentId]
        return next
      })

      onRefresh()
    } catch (err) {
      console.error('Resolve payment error:', err)
      notify(err.message || 'فشل معالجة طلب الدفع', 'danger')
    } finally {
      setResolvingId(null)
    }
  }

  // Derive available packages list
  const availablePackages = useMemo(() => {
    return [
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
  }, [])

  // Debounced server-side student search for the cash-payment picker — only
  // matches are fetched (never the whole roster), and only while the modal is
  // open. Empty query shows a small default list.
  useEffect(() => {
    if (!showCashModal) return
    let cancelled = false
    setLoadingStudents(true)
    const t = setTimeout(async () => {
      try {
        const rows = await searchStudents(studentSearchQuery, 20)
        if (!cancelled) setStudentsList(rows)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to search students:', err)
          notify('تعذر تحميل قائمة الطلاب', 'danger')
        }
      } finally {
        if (!cancelled) setLoadingStudents(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [showCashModal, studentSearchQuery])

  const handleOpenCashModal = () => {
    setCashStudentId('')
    setCashAmount('')
    setStudentSearchQuery('')
    setCashDate(new Date().toISOString().split('T')[0])
    const currentPkg = getPackageNameForIdx(getAcadMonthIdx(new Date()))
    setCashPackageName(currentPkg)
    setShowCashModal(true)
  }

  // Lock background body scroll when admin manual cash payment modal is open
  useEffect(() => {
    if (showCashModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showCashModal])



  const handleSaveCash = async (e) => {
    e.preventDefault()
    if (!cashStudentId) {
      notify('الرجاء اختيار الطالب أولاً ⚠️', 'danger')
      return
    }
    if (!cashAmount || parseFloat(cashAmount) <= 0) {
      notify('الرجاء إدخال مبلغ صالح 💰', 'danger')
      return
    }
    // Partial payments are allowed: block only when the month is already FULLY
    // paid (paid so far >= the month's due) — the old hard "paid once" guard
    // made a 100/150 partial payment impossible to complete later.
    const month = (cashPackageName || '').trim()
    if (month && cashDue > 0 && cashPaidSoFar >= cashDue) {
      notify(`هذا الطالب سدّد «${month}» بالكامل (${cashPaidSoFar} ج.م). احذف العملية القديمة أولاً إن أردت تعديلها.`, 'danger')
      return
    }

    setSavingCash(true)
    try {
      // Ledger-aware recording: auto-creates the month's charge (fee − discount)
      // once, then records this (possibly partial) payment against it, with the
      // real transaction date (backdating supported).
      const savedPaymentRecord = await recordSubscriptionPayment({
        studentId: cashStudentId,
        amount: cashAmount,
        billingPeriod: month || null,
        monthlyDue: cashDue,
        paymentMethod: 'Cash',
        transactionDate: cashDate,
        adminId: adminId
      })
      const paid = parseFloat(cashAmount) || 0
      const remaining = Math.max(0, cashDue - cashPaidSoFar - paid)
      notify(
        remaining > 0
          ? `تم تسجيل دفعة جزئية (${paid} ج.م) — المتبقي ${remaining} ج.م على «${month}».`
          : 'تم تسجيل الدفع النقدي وتفعيل حساب الطالب بنجاح! 🎉',
        'success'
      )
      setShowCashModal(false)
      
      // Provide immediate receipt data from the saved transaction
      if (savedPaymentRecord) {
        setLastCompletedPayment({
          ...savedPaymentRecord,
          package_name: month,
          billing_period: month,
          profiles: cashStudentObj || { id: cashStudentId }
        })
      }

      onRefresh()
    } catch (err) {
      console.error('Failed to record cash payment:', err)
      notify('تعذر تسجيل الدفع النقدي: ' + (err.message || ''), 'danger')
    } finally {
      setSavingCash(false)
    }
  }

  // Results are already server-filtered by the search effect above.
  const filteredStudents = studentsList

  // Base filter — applies day/date, subscription month, grade, branch, group.
  // Both the totals (stats) and the table read from this, so the "total for a
  // specific day / month / stage / branch / group" is always in sync.
  const baseFiltered = useMemo(() => {
    return payments.filter(p => {
      // Day/range filters use the ACTUAL payment date (transaction_date —
      // backdated entries included); rows without one fall back to created_at.
      const effectiveDate = p.transaction_date || p.created_at
      // Specific DAY (by actual payment date). Overrides the range when set.
      if (dayFilter) {
        if (!effectiveDate) return false
        const pd = new Date(effectiveDate), d = new Date(dayFilter)
        if (pd.getFullYear() !== d.getFullYear() || pd.getMonth() !== d.getMonth() || pd.getDate() !== d.getDate()) return false
      } else if (effectiveDate) {
        const pDate = new Date(effectiveDate)
        if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); if (pDate < s) return false }
        if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); if (pDate > e) return false }
      }
      // Specific SUBSCRIPTION month (by package name, e.g. "اشتراك شهر أغسطس").
      if (monthFilter !== 'all' && !((p.package_name || '').includes(monthFilter))) return false
      // Stage / branch / group.
      if (gradeFilter !== 'all' && p.profiles?.grade !== gradeFilter) return false
      if (branchFilter !== 'all' && p.profiles?.branch_id !== branchFilter) return false
      if (groupFilter !== 'all' && (p.profiles?.group || '') !== groupFilter) return false
      return true
    })
  }, [payments, dayFilter, startDate, endDate, monthFilter, gradeFilter, branchFilter, groupFilter])

  // Financial statistics on the fully-filtered set (respects every filter).
  const stats = useMemo(() => {
    let approvedSum = 0, pendingCount = 0, approvedCount = 0, rejectedCount = 0
    baseFiltered.forEach(p => {
      if (p.status === 'pending') pendingCount++
      else if (p.status === 'approved') { approvedCount++; approvedSum += (p.amount || 0) }
      else if (p.status === 'rejected') rejectedCount++
    })
    return { approvedSum, pendingCount, approvedCount, rejectedCount, totalCount: baseFiltered.length }
  }, [baseFiltered])

  const filteredPayments = useMemo(() => {
    let list = baseFiltered
    if (activeTab !== 'all') list = list.filter(p => p.status === activeTab)
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter((p) => {
      const name = p.profiles?.name?.toLowerCase() || ''
      const phone = p.profiles?.phone || ''
      return name.includes(q) || phone.includes(q)
    })
  }, [baseFiltered, activeTab, searchQuery])

  // Excel/CSV export function
  const handleExportCSV = () => {
    const headers = ['اسم الطالب', 'المرحلة الدراسية', 'المبلغ (ج.م)', 'طريقة الدفع', 'الباقة المطلوبة', 'تاريخ الطلب', 'الحالة', 'ملاحظات الإدارة']
    const rows = filteredPayments.map(p => {
      const studentName = p.profiles?.name || '—'
      const grade = GRADE_LABEL[p.profiles?.grade] || p.profiles?.grade || '—'
      const amount = p.amount || 0
      const method = p.payment_method === 'InstaPay' ? 'InstaPay' : p.payment_method === 'Cash' ? 'دفع نقدي' : 'E-wallet'
      const packageName = p.package_name || '—'
      const date = fmtDate(p.created_at)
      const status = p.status === 'pending' ? 'قيد المراجعة' : p.status === 'approved' ? 'مقبول' : 'مرفوض'
      const notes = p.admin_notes || ''
      
      const clean = (val) => {
        const str = String(val).replace(/"/g, '""')
        return `"${str}"`
      }
      
      return [
        clean(studentName),
        clean(grade),
        clean(amount),
        clean(method),
        clean(packageName),
        clean(date),
        clean(status),
        clean(notes)
      ].join(',')
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `report_payments_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notify('تم تصدير ملف البيانات بنجاح 📊', 'success')
  }

  return (
    <main className="cp-page paypg-admin" dir="rtl">
      <div className="cp-container" style={{ maxWidth: 1360 }}>
        
        {/* ─────────── 1. Modern Top Header & Action Bar ─────────── */}
        <div className="pay-top-header">
          <div className="pay-title-group">
            <h1>
              <i className="fas fa-wallet" style={{ color: '#10b981', fontSize: '1.5rem' }}></i>
              كشف وإدارة المدفوعات والاشتراكات
            </h1>
            <p>متابعة وتأكيد اشتراكات الطلاب، التحويلات الإلكترونية، والتحصيل النقدي المباشر</p>
          </div>

          <div className="pay-top-actions">
            <button 
              type="button"
              onClick={handleOpenCashModal}
              className="cp-btn pay-btn-primary-glow"
              style={{ height: 42, padding: '0 18px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              <i className="fas fa-plus"></i>
              <span>تسجيل دفع نقدي 💵</span>
            </button>

            <button 
              type="button"
              onClick={() => setShowBookletModal(true)}
              className="cp-btn cp-btn-secondary"
              style={{ height: 42, padding: '0 16px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}
            >
              <i className="fas fa-book"></i>
              <span>دفع الملازم 📚</span>
            </button>

            <button 
              type="button"
              onClick={() => setShowFees(v => !v)}
              className={`cp-btn ${showFees ? 'cp-btn-info-active' : 'cp-btn-ghost'}`}
              style={{ height: 42, padding: '0 14px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              title="تحديد قيمة الاشتراك الشهري لكل مرحلة"
            >
              <i className="fas fa-sliders"></i>
              <span>أسعار المراحل ⚙️</span>
            </button>

            <button 
              type="button"
              onClick={() => setShowConfigEditor(!showConfigEditor)}
              className={`cp-btn ${showConfigEditor ? 'cp-btn-info-active' : 'cp-btn-ghost'}`}
              style={{ height: 42, padding: '0 14px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              title="تعديل حسابات InstaPay ومحافظ فودافون كاش"
            >
              <i className="fas fa-credit-card"></i>
              <span>بيانات التحويل</span>
            </button>

            <button 
              type="button"
              onClick={handleExportCSV}
              className="cp-btn cp-btn-ghost"
              style={{ height: 42, padding: '0 14px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              title="تصدير كشف المدفوعات كملف Excel"
            >
              <i className="fas fa-file-excel" style={{ color: '#10b981' }}></i>
              <span>تصدير 📊</span>
            </button>
          </div>
        </div>

        {/* Collapsible Subscription Fees Editor */}
        {showFees && (
          <div className="cp-panel" style={{ marginBottom: 24, border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.03)', borderRadius: 18, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-money-check-dollar" style={{ color: '#10b981' }}></i>
                قيمة الاشتراك الشهري لكل مرحلة دراسية
              </div>
              <button type="button" onClick={() => setShowFees(false)} className="cp-btn cp-btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>إغلاق</button>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--cp-text-muted)', margin: '0 0 16px 0' }}>
              هذه القيمة تظهر كمبلغ مستحق للطالب عند تسجيل الحضور والباركود وفي تقرير ولي الأمر والخصومات.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
              {(gradesList || []).map(g => (
                <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)' }}>{g.name}</span>
                  <input
                    type="number" min="0"
                    value={feeInputs[g.id] ?? ''}
                    onChange={(e) => setFeeInputs(prev => ({ ...prev, [g.id]: e.target.value }))}
                    placeholder="0 ج.م"
                    className="paypg-admin-input"
                    style={{ height: 40 }}
                  />
                </div>
              ))}
            </div>
            <button onClick={handleSaveFees} disabled={savingFees} className="cp-btn cp-btn-success" style={{ marginTop: 16, padding: '8px 24px', fontWeight: 800, borderRadius: 10 }}>
              {savingFees ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : 'حفظ وتحديث الأسعار'}
            </button>
          </div>
        )}

        {/* Collapsible Config Editor Card */}
        {showConfigEditor && (
          <div className="cp-panel" style={{ marginBottom: 24, border: '1px solid rgba(124, 58, 237, 0.3)', background: 'rgba(124, 58, 237, 0.02)', borderRadius: 18, padding: 20 }}>
            <div className="cp-panel-header" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.15rem', color: '#8c72db', margin: 0 }}>
                <i className="fas fa-gears" style={{ marginLeft: 8, color: '#8c72db' }}></i> إعدادات حسابات الدفع الإلكتروني (InstaPay ومحافظ فودافون كاش)
              </h2>
              <button type="button" onClick={() => setShowConfigEditor(false)} className="cp-btn cp-btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>إغلاق</button>
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--cp-text-muted)', marginBottom: 20 }}>
              قم بتعديل بيانات التحويل المتاحة للطلاب للاشتراك. سيتم تطبيق هذه القيم فورًا في شاشة دفع الطالب.
            </p>

            <form onSubmit={handleSaveConfig} className="paypg-config-form">
              <div className="form-group">
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>عنوان إنستا باي (InstaPay Address) *</label>
                <input 
                  type="text" 
                  value={instaAddress} 
                  onChange={(e) => {
                    const val = e.target.value
                    setInstaAddress(val)
                    if (val) {
                      const parts = val.split('@')
                      const username = parts[0].trim()
                      if (username) {
                        setInstaLink(`https://ipn.eg/S/${username}`)
                      }
                    }
                  }}
                  placeholder="مثال: name@instapay"
                  className="paypg-admin-input"
                  style={{ height: 42, width: '100%' }}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>رابط تطبيق إنستا باي (InstaPay Link) *</label>
                <input 
                  type="url" 
                  value={instaLink} 
                  onChange={(e) => setInstaLink(e.target.value)}
                  placeholder="مثال: https://ipn.eg/S/name"
                  className="paypg-admin-input"
                  style={{ height: 42, width: '100%' }}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>رقم محفظة إلكترونية (Vodafone Cash Number) *</label>
                <input 
                  type="text" 
                  value={vodaNumber} 
                  onChange={(e) => setVodaNumber(e.target.value)}
                  placeholder="مثال: 0100xxxxxxx"
                  className="paypg-admin-input"
                  style={{ height: 42, width: '100%' }}
                  required
                />
              </div>

              <div className="paypg-span-2" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: '100%', marginTop: 12 }}>
                <button 
                  type="submit" 
                  disabled={savingConfig}
                  className="cp-btn cp-btn-success"
                  style={{ height: 42, padding: '0 24px', fontWeight: 800, borderRadius: 10 }}
                >
                  {savingConfig ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : <><i className="fas fa-save"></i> حفظ الإعدادات</>}
                </button>
                <button 
                  type="button"
                  onClick={() => setShowConfigEditor(false)}
                  className="cp-btn cp-btn-ghost"
                  style={{ height: 42, padding: '0 20px', borderRadius: 10 }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─────────── 2. Modern KPI Statistics Cards ─────────── */}
        <section className="pay-kpi-grid">
          
          {/* Card 1: Total Revenue */}
          <div className="pay-kpi-card" style={{ borderRight: '4px solid #10b981' }}>
            <div className="pay-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
              <i className="fas fa-sack-dollar"></i>
            </div>
            <div>
              <div className="pay-kpi-val" style={{ color: '#10b981' }}>{stats.approvedSum.toLocaleString()} ج.م</div>
              <div className="pay-kpi-lbl">إجمالي المحصل الوارد</div>
            </div>
          </div>

          {/* Card 2: Pending Review */}
          <div className="pay-kpi-card" style={{ borderRight: '4px solid #f59e0b' }}>
            <div className="pay-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
              <i className="fas fa-hourglass-half"></i>
            </div>
            <div>
              <div className="pay-kpi-val" style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{stats.pendingCount}</span>
                {stats.pendingCount > 0 && (
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontWeight: 800 }}>
                    بحاجة لمراجعة
                  </span>
                )}
              </div>
              <div className="pay-kpi-lbl">طلبات معلقة قيد المراجعة</div>
            </div>
          </div>

          {/* Card 3: Approved */}
          <div className="pay-kpi-card" style={{ borderRight: '4px solid #3b82f6' }}>
            <div className="pay-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
              <i className="fas fa-circle-check"></i>
            </div>
            <div>
              <div className="pay-kpi-val" style={{ color: '#3b82f6' }}>{stats.approvedCount}</div>
              <div className="pay-kpi-lbl">طلبات مقبولة ومفعّلة</div>
            </div>
          </div>

          {/* Card 4: Rejected */}
          <div className="pay-kpi-card" style={{ borderRight: '4px solid #ef4444' }}>
            <div className="pay-kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
              <i className="fas fa-circle-xmark"></i>
            </div>
            <div>
              <div className="pay-kpi-val" style={{ color: '#ef4444' }}>{stats.rejectedCount}</div>
              <div className="pay-kpi-lbl">طلبات مرفوضة</div>
            </div>
          </div>

        </section>

        {/* ─────────── 3. Unified 2-Tier Toolbar & Filter Card ─────────── */}
        <div className="pay-toolbar-box">
          
          {/* Tier 1: Segmented Status Tabs & Search Bar */}
          <div className="pay-toolbar-tier1">
            
            {/* Status Segmented Tabs */}
            <div className="pay-segmented-tabs">
              {[
                { id: 'pending', label: 'قيد المراجعة', count: stats.pendingCount, icon: 'fa-hourglass-half', color: '#f59e0b' },
                { id: 'approved', label: 'المقبولة', count: stats.approvedCount, icon: 'fa-circle-check', color: '#10b981' },
                { id: 'rejected', label: 'المرفوضة', count: stats.rejectedCount, icon: 'fa-circle-xmark', color: '#ef4444' },
                { id: 'all', label: 'جميع العمليات', count: stats.totalCount, icon: 'fa-layer-group', color: '#8b5cf6' },
              ].map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pay-seg-tab ${isActive ? 'active' : ''}`}
                    type="button"
                  >
                    <i className={`fas ${tab.icon}`} style={{ color: isActive ? tab.color : 'inherit', fontSize: '0.85rem' }}></i>
                    <span>{tab.label}</span>
                    <span className="pay-seg-count">
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Quick Search & Refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 420, minWidth: 260 }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <i className="fas fa-search" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', fontSize: '0.9rem' }}></i>
                <input 
                  type="text" 
                  placeholder="ابحث باسم الطالب أو الهاتف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="paypg-admin-input"
                  style={{
                    width: '100%', padding: '9px 38px 9px 34px', height: 42, borderRadius: 12
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>

              <button 
                onClick={onRefresh}
                className="cp-btn cp-btn-secondary"
                style={{ height: 42, width: 42, borderRadius: 12, padding: 0, justifyContent: 'center', flexShrink: 0 }}
                title="تحديث البيانات"
              >
                <i className={`fas fa-rotate ${loading ? 'fa-spin' : ''}`}></i>
              </button>
            </div>

          </div>

          {/* Tier 2: Filter Selectors Grid */}
          <div className="pay-toolbar-tier2">
            
            {/* Grade Filter */}
            <div className="pay-filter-control">
              <label>المرحلة الدراسية</label>
              <select
                className="paypg-admin-input"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                style={{ cursor: 'pointer', fontWeight: 600 }}
              >
                <option value="all">جميع المراحل الدراسية</option>
                {gradesList.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Branch Filter */}
            <div className="pay-filter-control">
              <label>الفرع / السنتر</label>
              <select className="paypg-admin-input" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={{ cursor: 'pointer', fontWeight: 600 }}>
                <option value="all">جميع الفروع</option>
                {branchList.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>

            {/* Group Filter */}
            <div className="pay-filter-control">
              <label>المجموعة</label>
              <select className="paypg-admin-input" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={{ cursor: 'pointer', fontWeight: 600 }}>
                <option value="all">جميع المجموعات</option>
                {groupOptions.map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>

            {/* Subscription Month Filter */}
            <div className="pay-filter-control">
              <label>شهر الاشتراك</label>
              <select className="paypg-admin-input" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ cursor: 'pointer', fontWeight: 600 }}>
                <option value="all">كل الشهور</option>
                {SUB_MONTHS.map((m) => (<option key={m} value={m}>اشتراك شهر {m}</option>))}
              </select>
            </div>

            {/* Date Picker (Specific Day or Range) */}
            <div className="pay-filter-control">
              <label>تاريخ محدد</label>
              <DatePicker value={dayFilter} onChange={setDayFilter} placeholder="اختر يوماً" />
            </div>

            {/* Date Range & Reset Filters */}
            {(gradeFilter !== 'all' || branchFilter !== 'all' || groupFilter !== 'all' || monthFilter !== 'all' || dayFilter || startDate || endDate || searchQuery) && (
              <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', paddingTop: 20 }}>
                <button
                  type="button"
                  onClick={() => {
                    setGradeFilter('all')
                    setBranchFilter('all')
                    setGroupFilter('all')
                    setMonthFilter('all')
                    setDayFilter('')
                    setStartDate('')
                    setEndDate('')
                    setSearchQuery('')
                  }}
                  className="cp-btn cp-btn-ghost"
                  style={{ height: 40, width: '100%', fontSize: '0.82rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.06)', borderRadius: 10, justifyContent: 'center' }}
                >
                  <i className="fas fa-arrow-rotate-left"></i>
                  <span>إعادة تعيين الفلاتر</span>
                </button>
              </div>
            )}

          </div>

        </div>

        {/* ─────────── 4. Main Data Table / Report Card ─────────── */}
        <div className="pay-table-wrap">
          <div className="pay-table-header-bar">
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-list-check" style={{ color: '#10b981' }}></i>
              كشف تفاصيل عمليات الدفع والاشتراكات
              <span className="cp-id-pill cp-id-pill-sm" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 800 }}>
                {filteredPayments.length} عملية
              </span>
            </div>
          </div>

          {loading ? (
            <div className="paypg-loader" style={{ padding: '60px 0' }}>
              <i className="fas fa-circle-notch fa-spin"></i>
              <span>جاري تحميل تقرير المدفوعات...</span>
            </div>
          ) : filteredPayments.length > 0 ? (
            <div className="cp-table-container">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>الطالب والمرحلة</th>
                    <th>قيمة المبلغ</th>
                    <th>طريقة التحويل</th>
                    <th>تاريخ الطلب</th>
                    <th>إيصال الدفع</th>
                    <th>الحالة</th>
                    <th>الإجراءات والملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <tr key={p.id}>
                      
                      {/* Student Info */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className="pay-student-avatar">
                            {(p.profiles?.name || 'ط').trim().charAt(0)}
                          </div>
                          <div>
                            <div className="paypg-student-name" style={{ fontSize: '0.95rem' }}>{p.profiles?.name || '—'}</div>
                            <div className="paypg-student-meta" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                              {p.profiles?.phone && (
                                <span><i className="fas fa-phone" style={{ fontSize: '0.72rem', opacity: 0.7 }}></i> {p.profiles.phone}</span>
                              )}
                              {p.profiles?.grade && (
                                <span className="cp-id-pill cp-id-pill-sm" style={{ fontSize: '0.72rem', padding: '1px 6px' }}>
                                  {GRADE_LABEL[p.profiles.grade] || p.profiles.grade}
                                </span>
                              )}
                              {p.profiles?.group && (
                                <span className="cp-id-pill cp-id-pill-sm" style={{ fontSize: '0.72rem', padding: '1px 6px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                                  {p.profiles.group}
                                </span>
                              )}
                              {p.package_name && (
                                <span style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '0.75rem' }} title="الباقة المطلوبة">
                                  <i className="fas fa-box" style={{ fontSize: '0.7rem', marginInlineEnd: 3 }}></i> {p.package_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Payment Amount */}
                      <td>
                        <strong style={{ color: '#10b981', fontSize: '1.05rem' }}>{p.amount} ج.م</strong>
                      </td>

                      {/* Payment Method */}
                      <td>
                        <span className={`paypg-method-badge ${p.payment_method === 'InstaPay' ? 'paypg-method-instapay' : p.payment_method === 'Cash' ? 'paypg-method-instapay' : 'paypg-method-vodafone'}`} style={p.payment_method === 'Cash' ? { background: 'rgba(16,185,129,0.1)', color: '#10b981' } : {}}>
                          {p.payment_method === 'InstaPay' ? (
                            <><i className="fas fa-bolt"></i> InstaPay</>
                          ) : p.payment_method === 'Cash' ? (
                            <><i className="fas fa-money-bill-wave"></i> دفع نقدي</>
                          ) : (
                            <><i className="fas fa-mobile-screen"></i> محفظة إلكترونية</>
                          )}
                        </span>
                      </td>

                      {/* Order Date */}
                      <td>
                        <span className="paypg-date-text">{fmtDate(p.created_at)}</span>
                      </td>

                      {/* Receipt Photo preview click */}
                      <td>
                        {p.screenshot_url ? (
                          <div 
                            onClick={() => { setRotateDeg(0); setPreviewUrl(p.screenshot_url); }}
                            className="paypg-thumb-container"
                            style={{
                              width: 48, height: 48, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--cp-card-border)',
                              cursor: 'zoom-in', background: 'var(--cp-hover-bg)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            title="اضغط للتكبير والمراجعة"
                          >
                            <img src={p.screenshot_url} alt="Receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div 
                              className="paypg-thumb-overlay"
                              style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', opacity: 0,
                                display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff',
                                transition: 'opacity 0.2s', pointerEvents: 'none'
                              }}
                            >
                              <i className="fas fa-search-plus" style={{ fontSize: '0.85rem' }}></i>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <i className="fas fa-money-bill-wave" style={{ color: '#10b981' }}></i> نقدي يدوي
                          </span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td>
                        <span style={{
                          display: 'inline-flex', padding: '4px 12px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700,
                          background: `${p.status === 'pending' ? '#f59e0b' : p.status === 'approved' ? '#10b981' : '#ef4444'}15`,
                          color: p.status === 'pending' ? '#d97706' : p.status === 'approved' ? '#059669' : '#dc2626'
                        }}>
                          {p.status === 'pending' && 'قيد المراجعة'}
                          {p.status === 'approved' && 'مقبول'}
                          {p.status === 'rejected' && 'مرفوض'}
                        </span>
                      </td>

                      {/* Resolution notes and actions */}
                      <td>
                        {p.status === 'pending' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300 }}>
                            <input
                              type="text"
                              placeholder="ملاحظات اختيارية (سبب الرفض مثلاً)"
                              value={notesMap[p.id] || ''}
                              onChange={(e) => setNotesMap(prev => ({ ...prev, [p.id]: e.target.value }))}
                              disabled={resolvingId === p.id}
                              className="paypg-admin-input"
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleResolve(p.id, 'approved', p.student_id)}
                                disabled={resolvingId !== null}
                                className="cp-btn cp-btn-success"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1, justifyContent: 'center' }}
                              >
                                {resolvingId === p.id ? <i className="fas fa-spinner fa-spin"></i> : 'قبول وتفعيل'}
                              </button>
                              <button
                                onClick={() => handleResolve(p.id, 'rejected', p.student_id)}
                                disabled={resolvingId !== null}
                                className="cp-btn cp-btn-danger"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1, justifyContent: 'center' }}
                              >
                                رفض
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="paypg-admin-notes-text">
                            {p.admin_notes ? (
                              <span><strong>السبب/الملاحظة:</strong> {p.admin_notes}</span>
                            ) : (
                              <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>لا توجد ملاحظات</span>
                            )}
                          </div>
                        )}
                        {/* Print Receipt Button for Approved Payments */}
                        {p.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => {
                              printThermalPaymentReceipt({
                                payment: p,
                                tenant,
                                adminName: user?.name
                              })
                            }}
                            className="cp-btn cp-btn-ghost"
                            title="طباعة إيصال دفع حراري لهذه العملية"
                            style={{
                              marginTop: 8,
                              marginInlineEnd: 6,
                              padding: '5px 10px',
                              fontSize: '0.75rem',
                              color: '#10b981',
                              borderColor: 'rgba(16, 185, 129, 0.3)',
                              background: 'rgba(16, 185, 129, 0.06)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <i className="fas fa-receipt"></i>
                            <span>طباعة إيصال</span>
                          </button>
                        )}
                        {/* Delete any payment (test data / mistake) — tenant-safe via RLS. */}
                        <button
                          onClick={() => setPaymentToDelete(p)}
                          disabled={deletingId === p.id}
                          className="cp-btn cp-btn-ghost"
                          title="حذف هذه العملية نهائياً"
                          style={{ marginTop: 8, padding: '5px 10px', fontSize: '0.75rem', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {deletingId === p.id ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-trash"></i> حذف العملية</>}
                        </button>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="paypg-empty" style={{ padding: '60px 0' }}>
              <i className="fas fa-wallet" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
              <span>
                لا توجد طلبات {activeTab === 'pending' ? 'معلقة' : activeTab === 'approved' ? 'مقبولة' : activeTab === 'rejected' ? 'مرفوضة' : ''} مطابقة للتصفية الحالية
              </span>
              {stats.totalCount > 0 && (
                <small style={{ display: 'block', marginTop: 12, color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>
                  ملاحظة: يوجد {stats.totalCount} طلبات إجمالاً في هذه الفترة ({stats.pendingCount} معلقة، {stats.approvedCount} مقبولة، {stats.rejectedCount} مرفوضة). يمكنك الانتقال للتبويبات الأخرى لاستعراضها.
                </small>
              )}
            </div>
          )}

        </div>

      </div>

      {/* ─────────── Immediate Thermal Receipt Modal ─────────── */}
      {lastCompletedPayment && (
        <div className="rp-modal-overlay" onClick={() => setLastCompletedPayment(null)} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 440, textAlign: 'center', padding: '24px 20px', borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', margin: '0 auto 16px' }}>
              <i className="fas fa-check-circle"></i>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--cp-text-main)' }}>تم تسجيل الدفع وتفعيل الطالب!</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '0 0 18px', lineHeight: 1.6 }}>
              تم تسجيل دفعة الطالب <strong>{lastCompletedPayment.profiles?.name || 'الطالب'}</strong> بنجاح بقيمة <strong>{lastCompletedPayment.amount} ج.م</strong> لـ ({lastCompletedPayment.package_name || lastCompletedPayment.billing_period}).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  printThermalPaymentReceipt({
                    payment: lastCompletedPayment,
                    tenant,
                    adminName: user?.name
                  })
                }}
                className="cp-btn cp-btn-primary"
                style={{ height: 46, fontSize: '0.95rem', fontWeight: 800, justifyContent: 'center', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <i className="fas fa-receipt" style={{ fontSize: '1.1rem' }}></i>
                <span>طباعة إيصال الدفع الحراري 🧾</span>
              </button>

              <button
                type="button"
                onClick={() => setLastCompletedPayment(null)}
                className="cp-btn cp-btn-ghost"
                style={{ height: 40, justifyContent: 'center', borderRadius: 10, cursor: 'pointer' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Record Cash Payment Modal ─────────── */}
      {paymentToDelete && (
        <ConfirmDeleteDialog
          title="تأكيد حذف العملية المالية"
          itemLabel={`${paymentToDelete.profiles?.name || 'طالب'} — ${paymentToDelete.amount} ج.م`}
          message="سيتم حذف هذه العملية نهائياً وتُخصم من الإجماليات وحالة اشتراك الطالب. لا يمكن التراجع."
          confirmText="نعم، احذف العملية"
          cancelText="إلغاء"
          onConfirm={() => handleDeletePayment(paymentToDelete)}
          onCancel={() => setPaymentToDelete(null)}
        />
      )}

      {/* ─────────── Booklet Payment Modal ─────────── */}
      {/* Reuses the existing BookletsPanel payment workflow verbatim — no
          logic is duplicated; the feature simply lives here now. */}
      {showBookletModal && (
        <div className="rp-modal-overlay" onClick={() => setShowBookletModal(false)} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 1100 }}>

            {/* Modal Header */}
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <i className="fas fa-book"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>تسجيل دفع الملازم</h3>
                <p style={{ color: 'var(--cp-text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>ابحث عن الطالب واعرض ملازمه المعيّنة وسجّل المدفوعة منها</p>
              </div>
              <button className="rp-modal-close" onClick={() => setShowBookletModal(false)} style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Modal Body — scrollable workflow */}
            <div style={{ padding: 20, overflowY: 'auto' }}>
              <BookletsPanel mode="payment" flash={bookletFlash} />
            </div>
          </div>
        </div>
      )}

      {showCashModal && (
        <div className="rp-modal-overlay" onClick={() => setShowCashModal(false)} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <i className="fas fa-money-bill-wave"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>تسجيل دفع نقدي يدوي</h3>
                <p style={{ color: 'var(--cp-text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>تسجيل وتفعيل اشتراك الطالب فوراً</p>
              </div>
              <button className="rp-modal-close" onClick={() => setShowCashModal(false)} style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveCash} style={{ padding: 20, overflowY: 'auto', maxHeight: 'calc(90vh - 75px)' }}>
              
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="paypg-modal-label">البحث عن الطالب واختياره *</label>
                {cashStudentId ? (
                  <>
                  <div className="paypg-modal-selected-student">
                    <div>
                      <strong style={{ color: 'var(--cp-text-main)' }}>{studentsList.find(s => s.id === cashStudentId)?.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', marginRight: 10 }}>
                        ({GRADE_LABEL[studentsList.find(s => s.id === cashStudentId)?.grade] || studentsList.find(s => s.id === cashStudentId)?.grade || ''})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCashStudentId('')}
                      style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontFamily: 'Tajawal' }}
                    >
                      تغيير الطالب
                    </button>
                  </div>
                  {/* Per-student exception discount (special cases) — independent of recording a payment. */}
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', flex: 1, minWidth: 160 }}>
                      <span style={{ color: 'var(--cp-text-muted)' }}>خصم استثنائي دائم لهذا الطالب (ج.م)</span>
                      <input type="number" min="0" value={cashDiscount} onChange={(e) => setCashDiscount(e.target.value)} onWheel={(e) => e.target.blur()} placeholder="0" className="cp-input" style={{ padding: '8px 10px' }} />
                    </label>
                    <button type="button" onClick={handleSaveDiscount} disabled={savingDiscount} className="cp-btn cp-btn-info" style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                      {savingDiscount ? <i className="fas fa-spinner fa-spin"></i> : 'حفظ الخصم'}
                    </button>
                  </div>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="ابحث باسم الطالب أو الهاتف..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="paypg-admin-input"
                      style={{ width: '100%', marginBottom: 12, height: 42 }}
                    />
                    <div className="paypg-modal-student-list">
                      {loadingStudents ? (
                        <div style={{ padding: 12, textAlign: 'center', color: '#64748b' }}><i className="fas fa-spinner fa-spin"></i> جاري تحميل الطلاب...</div>
                      ) : filteredStudents.length > 0 ? (
                        filteredStudents.slice(0, 10).map(s => (
                          <div 
                            key={s.id}
                            onClick={() => setCashStudentId(s.id)}
                            className="paypg-modal-student-item"
                          >
                            <div>
                              <span style={{ fontWeight: 600 }}>{s.name}</span>
                              <small style={{ opacity: 0.7, marginRight: 8 }}>({s.phone || 'بدون هاتف'})</small>
                            </div>
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
                              {GRADE_LABEL[s.grade] || s.grade}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}>لم يتم العثور على طلاب مطابخين</div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label htmlFor="cash-amount" className="paypg-modal-label">المبلغ المدفوع (ج.م) *</label>
                <input
                  id="cash-amount"
                  type="number"
                  min="1"
                  placeholder="مثال: 150"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  className="paypg-admin-input"
                  style={{ width: '100%', height: 42, ...(cashDue > 0 ? { background: 'rgba(16,185,129,0.06)', fontWeight: 800 } : {}) }}
                  required
                />
                {cashDue > 0 && (
                  <small style={{ display: 'block', marginTop: 4, color: '#10b981', fontWeight: 700 }}>
                    المستحق الشهري: {cashDue} ج.م
                    {parseFloat(cashDiscount) > 0 ? ` (بعد خصم ${parseFloat(cashDiscount)} ج.م)` : ''}
                    {cashPaidSoFar > 0 ? ` — مدفوع سابقاً ${cashPaidSoFar} ج.م، المتبقي ${Math.max(0, cashDue - cashPaidSoFar)} ج.م` : ''}
                    {' '}— يمكن تسجيل دفعة جزئية والمتبقي يُتابَع تلقائياً.
                  </small>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="paypg-modal-label">تاريخ الدفع الفعلي</label>
                <DatePicker value={cashDate} onChange={setCashDate} style={{ width: '100%' }} placeholder="تاريخ الدفع" />
                <small style={{ display: 'block', marginTop: 4, color: 'var(--cp-text-muted, #64748b)' }}>
                  يمكن اختيار تاريخ سابق إذا سُجّلت الدفعة متأخراً — التقارير تعتمد هذا التاريخ.
                </small>
              </div>

              <div className="form-group" style={{ marginBottom: 24, position: 'relative' }}>
                <label htmlFor="cash-package" className="paypg-modal-label">الباقة المطلوبة *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="cash-package"
                    type="text"
                    placeholder="مثال: اشتراك شهر أكتوبر"
                    value={cashPackageName}
                    onChange={(e) => {
                      setCashPackageName(e.target.value)
                      setShowAdminPkgDropdown(true)
                    }}
                    onFocus={() => setShowAdminPkgDropdown(true)}
                    className="paypg-admin-input"
                    style={{ width: '100%', height: 42, fontWeight: 600, paddingLeft: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPkgDropdown(!showAdminPkgDropdown)}
                    style={{
                      position: 'absolute', left: 10, background: 'transparent', border: 'none',
                      color: 'var(--text-muted, #64748b)', cursor: 'pointer', outline: 'none', padding: '8px 4px'
                    }}
                  >
                    <i className={`fas fa-chevron-down ${showAdminPkgDropdown ? 'fa-rotate-180' : ''}`} style={{ transition: 'transform 0.2s' }}></i>
                  </button>
                </div>
                
                {showAdminPkgDropdown && (
                  <>
                    <div 
                      onClick={() => setShowAdminPkgDropdown(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                    />
                    <div 
                      className="paypg-modal-student-list"
                      style={{
                        position: 'absolute', bottom: '100%', left: 0, right: 0,
                        maxHeight: 250, overflowY: 'auto', zIndex: 999, marginBottom: 6, padding: 6,
                        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.35)',
                        animation: 'fadeInDown 0.15s ease-out', marginTop: 0,
                        overscrollBehavior: 'contain'
                      }}
                    >
                      {availablePackages.map(p => {
                        const isPaid = isPackagePaidForStudent(cashStudentId, p, payments, cashDue)
                        return (
                          <div
                            key={p}
                            onClick={() => {
                              if (isPaid) return
                              setCashPackageName(p)
                              setShowAdminPkgDropdown(false)
                            }}
                            className="paypg-modal-student-item"
                            style={{
                              borderBottom: 'none',
                              opacity: isPaid ? 0.6 : 1,
                              cursor: isPaid ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <span style={{ fontWeight: 600, color: isPaid ? 'var(--cp-text-muted, #94a3b8)' : 'inherit' }}>{p}</span>
                            {isPaid && (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', padding: '2px 8px', borderRadius: 999, background: 'rgba(239, 68, 68, 0.1)' }}>
                                تم السداد
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCashModal(false)} 
                  className="cp-btn cp-btn-ghost"
                  style={{ padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  disabled={savingCash}
                  className="cp-btn cp-btn-success"
                  style={{ padding: '8px 24px', fontSize: '0.9rem', justifyContent: 'center' }}
                >
                  {savingCash ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : <><i className="fas fa-check"></i> تسجيل وتفعيل</>}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </main>
  )
}

