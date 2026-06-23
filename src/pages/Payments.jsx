import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { uploadHomeworkSubmission } from '@backend/r2'
import { submitPayment, listMyPayments, listPayments, resolvePayment, getPaymentSettings, updatePaymentSetting, recordCashPayment } from '@backend/paymentsApi'
import { listStudents } from '@backend/profilesApi'
import { PAYMENT_CONFIG } from '../utils/paymentConfig'
import { notify } from '../utils/notify'
import { invalidate as invalidateCache } from '../utils/cache'
import { useTenant } from '../contexts/TenantContext'
import { GRADE_LABEL } from './ControlPanel/shared'
import './Payments.css'


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
            <div className="pay-card-badge">Vodafone Cash</div>
            <div className="pay-card-icon"><i className="fas fa-mobile-screen"></i></div>
            <h3 className="pay-card-title">فودافون كاش</h3>
            <p className="pay-card-text">قم بتحويل قيمة الاشتراك إلى رقم فودافون كاش التالي:</p>
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
                  />
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
                    <option value="Vodafone Cash">فودافون كاش (Vodafone Cash)</option>
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
                            <><i className="fas fa-mobile-screen"></i> فودافون كاش</>
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
  const { gradesList } = useTenant()


  const [activeTab, setActiveTab] = useState('pending') // 'pending' is default for immediate attention, can switch to 'all', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')

  // Date range filters
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Cash payment modal states
  const [showCashModal, setShowCashModal] = useState(false)
  const [cashStudentId, setCashStudentId] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [cashPackageName, setCashPackageName] = useState('')
  const [showAdminPkgDropdown, setShowAdminPkgDropdown] = useState(false)
  const [studentSearchQuery, setStudentSearchQuery] = useState('')
  const [studentsList, setStudentsList] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [savingCash, setSavingCash] = useState(false)

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

  const handleResolve = async (paymentId, status, studentId) => {
    if (!adminId) return
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
      
      // Clear notes input
      setNotesMap(prev => {
        const next = { ...prev }
        delete next[paymentId]
        return next
      })

      // Refresh data
      onRefresh()
    } catch (err) {
      console.error('Resolve payment error:', err)
      notify(err.message || 'فشل معالجة طلب الدفع', 'danger')
    } finally {
      setResolvingId(null)
    }
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

  // Derive available packages list
  const availablePackages = useMemo(() => {
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

  // Fetch students for manual logging
  const fetchStudents = async () => {
    setLoadingStudents(true)
    try {
      const data = await listStudents()
      setStudentsList(data)
    } catch (err) {
      console.error('Failed to fetch students:', err)
      notify('تعذر تحميل قائمة الطلاب', 'danger')
    } finally {
      setLoadingStudents(false)
    }
  }

  const handleOpenCashModal = () => {
    setCashStudentId('')
    setCashAmount('')
    setStudentSearchQuery('')
    if (availablePackages.length > 0) {
      setCashPackageName(availablePackages[0])
    } else {
      setCashPackageName('اشتراك شهر أكتوبر')
    }
    setShowCashModal(true)
    fetchStudents()
  }

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

    setSavingCash(true)
    try {
      await recordCashPayment({
        studentId: cashStudentId,
        amount: cashAmount,
        packageName: cashPackageName,
        adminId: adminId
      })
      notify('تم تسجيل الدفع النقدي وتفعيل حساب الطالب بنجاح! 🎉', 'success')
      setShowCashModal(false)
      onRefresh()
    } catch (err) {
      console.error('Failed to record cash payment:', err)
      notify('تعذر تسجيل الدفع النقدي: ' + (err.message || ''), 'danger')
    } finally {
      setSavingCash(false)
    }
  }

  const filteredStudents = useMemo(() => {
    if (!studentSearchQuery.trim()) return studentsList
    const q = studentSearchQuery.toLowerCase().trim()
    return studentsList.filter(s => {
      const name = s.name?.toLowerCase() || ''
      const phone = s.phone || ''
      return name.includes(q) || phone.includes(q)
    })
  }, [studentsList, studentSearchQuery])

  // Filter payments by date range first
  const paymentsFilteredByDate = useMemo(() => {
    return payments.filter(p => {
      if (!p.created_at) return true
      const pDate = new Date(p.created_at)
      if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        if (pDate < start) return false
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (pDate > end) return false
      }
      return true
    })
  }, [payments, startDate, endDate])

  // Financial statistics calculations on the date-filtered set
  const stats = useMemo(() => {
    let approvedSum = 0
    let pendingCount = 0
    let approvedCount = 0
    let rejectedCount = 0

    paymentsFilteredByDate.forEach(p => {
      if (p.status === 'pending') pendingCount++
      else if (p.status === 'approved') {
        approvedCount++
        approvedSum += (p.amount || 0)
      } else if (p.status === 'rejected') rejectedCount++
    })

    return {
      approvedSum,
      pendingCount,
      approvedCount,
      rejectedCount,
      totalCount: paymentsFilteredByDate.length
    }
  }, [paymentsFilteredByDate])

  const filteredPayments = useMemo(() => {
    let list = paymentsFilteredByDate

    // 1. Filter by tab status
    if (activeTab !== 'all') {
      list = list.filter(p => p.status === activeTab)
    }

    // 2. Filter by prep grade
    if (gradeFilter !== 'all') {
      list = list.filter(p => p.profiles?.grade === gradeFilter)
    }

    // 3. Filter by search query (student name or phone)
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter((p) => {
      const name = p.profiles?.name?.toLowerCase() || ''
      const phone = p.profiles?.phone || ''
      return name.includes(q) || phone.includes(q)
    })
  }, [paymentsFilteredByDate, activeTab, gradeFilter, searchQuery])

  // Excel/CSV export function
  const handleExportCSV = () => {
    const headers = ['اسم الطالب', 'المرحلة الدراسية', 'المبلغ (ج.م)', 'طريقة الدفع', 'الباقة المطلوبة', 'تاريخ الطلب', 'الحالة', 'ملاحظات الإدارة']
    const rows = filteredPayments.map(p => {
      const studentName = p.profiles?.name || '—'
      const grade = GRADE_LABEL[p.profiles?.grade] || p.profiles?.grade || '—'
      const amount = p.amount || 0
      const method = p.payment_method === 'InstaPay' ? 'InstaPay' : p.payment_method === 'Cash' ? 'دفع نقدي' : 'Vodafone Cash'
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
      <div className="cp-container" style={{ maxWidth: 1280 }}>
        
        {/* Dashboard Header */}
        <div className="cp-page-header" style={{ marginBottom: '1.5rem' }}>
          <div className="cp-page-header-text">
            <h1>تقرير كشف المدفوعات</h1>
            <p>استعرض وتابع حالة اشتراكات الطلاب والتحويلات المالية الواردة للمنصة وفعّل الحسابات فورًا</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button 
              type="button"
              onClick={() => setShowConfigEditor(!showConfigEditor)}
              className="cp-btn cp-btn-ghost"
              style={{ borderRadius: 10 }}
            >
              <i className="fas fa-cog"></i> 
              <span>{showConfigEditor ? 'إخفاء الإعدادات' : 'تعديل بيانات الدفع ⚙️'}</span>
            </button>
            <div className="cp-page-icon" style={{ marginInlineStart: 12 }}>
              <i className="fas fa-sack-dollar"></i>
            </div>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {/* Collapsible Config Editor Card */}
        {showConfigEditor && (
          <div className="cp-panel" style={{ marginBottom: 32, border: '1px solid rgba(124, 58, 237, 0.3)', background: 'rgba(124, 58, 237, 0.02)', animation: 'fadeInDown 0.3s ease-out' }}>
            <div className="cp-panel-header" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: '1.25rem', color: '#8c72db', margin: 0 }}>
                <i className="fas fa-gears" style={{ marginLeft: 8, color: '#8c72db' }}></i> إعدادات الحسابات البنكية ومحافظ التحويل والباقات
              </h2>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: 24 }}>
              قم بتعديل بيانات InstaPay ورقم Vodafone Cash والباقات المتاحة للاشتراك مباشرة من هنا. سيتم تطبيق هذه القيم فورًا لجميع الطلاب.
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
                  style={{ height: 44, width: '100%' }}
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
                  style={{ height: 44, width: '100%' }}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>رقم فودافون كاش (Vodafone Cash Number) *</label>
                <input 
                  type="text" 
                  value={vodaNumber} 
                  onChange={(e) => setVodaNumber(e.target.value)}
                  placeholder="مثال: 0100xxxxxxx"
                  className="paypg-admin-input"
                  style={{ height: 44, width: '100%' }}
                  required
                />
              </div>


              <div className="paypg-span-2" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: '100%', marginTop: 16 }}>
                <button 
                  type="submit" 
                  disabled={savingConfig}
                  className="cp-btn cp-btn-success"
                  style={{ height: 44, flex: 1, justifyContent: 'center' }}
                >
                  {savingConfig ? (
                    <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</>
                  ) : (
                    <><i className="fas fa-save"></i> حفظ الإعدادات</>
                  )}
                </button>
                <button 
                  type="button"
                  onClick={() => setShowConfigEditor(false)}
                  className="cp-btn cp-btn-ghost"
                  style={{ height: 44, padding: '0 24px', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        )}

        {/* ─────────── Premium KPI Statistics Widgets ─────────── */}
        <section className="cp-stats-row">
          
          {/* Total Approved Amount */}
          <div className="cp-stat cp-stat-good">
            <i className="fas fa-sack-dollar"></i>
            <div>
              <div className="cp-stat-val">{stats.approvedSum.toLocaleString()} ج.م</div>
              <div className="cp-stat-lbl">إجمالي المدفوعات الواردة</div>
            </div>
          </div>

          {/* Pending payments count */}
          <div className="cp-stat cp-stat-warning">
            <i className="fas fa-hourglass-half"></i>
            <div>
              <div className="cp-stat-val">{stats.pendingCount}</div>
              <div className="cp-stat-lbl">طلبات معلقة قيد المراجعة</div>
            </div>
          </div>

          {/* Approved payments count */}
          <div className="cp-stat cp-stat-info">
            <i className="fas fa-circle-check"></i>
            <div>
              <div className="cp-stat-val">{stats.approvedCount}</div>
              <div className="cp-stat-lbl">طلبات مقبولة ومفعّلة</div>
            </div>
          </div>

          {/* Rejected payments count */}
          <div className="cp-stat cp-stat-bad">
            <i className="fas fa-circle-xmark"></i>
            <div>
              <div className="cp-stat-val">{stats.rejectedCount}</div>
              <div className="cp-stat-lbl">طلبات مرفوضة</div>
            </div>
          </div>

        </section>

        {/* ─────────── Filters and toolbar section ─────────── */}
        <div className="cp-panel" style={{ padding: 28 }}>
          
          <div className="paypg-admin-filter-bar">
            
            {/* Status tabs */}
            <div className="cp-filter-group" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['pending', 'approved', 'rejected', 'all'].map((tab) => {
                const isActive = activeTab === tab
                const label = tab === 'all' ? 'الكل' : tab === 'pending' ? 'المعلقة' : tab === 'approved' ? 'المقبولة' : 'المرفوضة'
                const count = tab === 'all' ? stats.totalCount : tab === 'pending' ? stats.pendingCount : tab === 'approved' ? stats.approvedCount : stats.rejectedCount
                const btnClass = isActive ? 'cp-btn-info-active' : 'cp-btn-ghost'

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`cp-btn ${btnClass}`}
                    style={{ borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {label}
                    <span className="cp-id-pill cp-id-pill-sm" style={isActive ? { background: 'rgba(255, 255, 255, 0.25)', color: '#fff' } : {}}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Right filter groups */}
            <div className="paypg-admin-search-group">
              
              {/* Grade Dropdown Select */}
              <select
                className="paypg-admin-input"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                style={{ height: 42, cursor: 'pointer', fontWeight: 600 }}
              >
                <option value="all">كل المراحل الدراسية</option>
                {gradesList.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>

              {/* Text Search Field */}
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <i className="fas fa-search" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}></i>
                <input 
                  type="text" 
                  placeholder="ابحث باسم الطالب أو الهاتف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="paypg-admin-input"
                  style={{
                    width: '100%', padding: '10px 38px 10px 14px', height: 42
                  }}
                />
              </div>

              {/* Refresh Button */}
              <button 
                onClick={onRefresh}
                className="cp-btn cp-btn-info"
                style={{ height: 42 }}
              >
                <i className={`fas fa-rotate ${loading ? 'fa-spin' : ''}`}></i> تحديث البيانات
              </button>

            </div>

          </div>

          {/* Secondary Toolbar Row */}
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              flexWrap: 'wrap', 
              gap: 16, 
              marginTop: 20, 
              paddingTop: 20, 
              borderTop: '1px solid rgba(0, 0, 0, 0.06)' 
            }}
          >
            {/* Date Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>من تاريخ:</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="paypg-admin-input" 
                  style={{ height: 38, padding: '4px 10px', fontSize: '0.85rem', minWidth: 140 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>إلى تاريخ:</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                  className="paypg-admin-input" 
                  style={{ height: 38, padding: '4px 10px', fontSize: '0.85rem', minWidth: 140 }}
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="cp-btn cp-btn-ghost"
                  style={{ height: 38, padding: '0 12px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', cursor: 'pointer' }}
                >
                  <i className="fas fa-times"></i> مسح التواريخ
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleOpenCashModal}
                className="cp-btn cp-btn-success"
                style={{ height: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}
              >
                <i className="fas fa-plus"></i> تسجيل دفع نقدي يدوي 💵
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="cp-btn cp-btn-ghost"
                style={{ height: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                <i className="fas fa-file-excel"></i> تصدير البيانات 📊
              </button>
            </div>
          </div>
        </div>

        {/* ─────────── Main Data Table / Report Card ─────────── */}
        <div className="cp-table-card" style={{ marginTop: 24 }}>
          <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              <i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i> كشف تفاصيل عمليات الدفع والاشتراكات
            </h2>
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
                        <div className="paypg-student-name">{p.profiles?.name || '—'}</div>
                        <div className="paypg-student-meta" style={{ flexWrap: 'wrap', gap: 6 }}>
                          <span><i className="fas fa-phone" style={{ fontSize: '0.75rem', opacity: 0.7 }}></i> {p.profiles?.phone || '—'}</span>
                          <span style={{ height: 4, width: 4, borderRadius: '50%', background: '#cbd5e1' }}></span>
                          <span className="paypg-student-grade">
                            {GRADE_LABEL[p.profiles?.grade] || p.profiles?.grade || '—'}
                          </span>
                          {p.package_name && (
                            <>
                              <span style={{ height: 4, width: 4, borderRadius: '50%', background: '#cbd5e1' }}></span>
                              <span style={{ color: '#7c3aed', fontWeight: 700 }} title="الباقة المطلوبة">
                                <i className="fas fa-box" style={{ fontSize: '0.75rem' }}></i> {p.package_name}
                              </span>
                            </>
                          )}
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
                            <><i className="fas fa-mobile-screen"></i> فودافون كاش</>
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

      {/* ─────────── Record Cash Payment Modal ─────────── */}
      {showCashModal && (
        <div className="rp-modal-overlay" onClick={() => setShowCashModal(false)} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 500 }}>
            
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
            <form onSubmit={handleSaveCash} style={{ padding: 20 }}>
              
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="paypg-modal-label">البحث عن الطالب واختياره *</label>
                {cashStudentId ? (
                  <div className="paypg-modal-selected-student">
                    <div>
                      <strong style={{ color: 'var(--cp-text-main)' }}>{studentsList.find(s => s.id === cashStudentId)?.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', marginRight: 10 }}>
                        ({GRADE_SHORT[studentsList.find(s => s.id === cashStudentId)?.grade] || studentsList.find(s => s.id === cashStudentId)?.grade || ''})
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
                              {GRADE_SHORT[s.grade] || s.grade}
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
                  className="paypg-admin-input"
                  style={{ width: '100%', height: 42 }}
                  required
                />
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
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        maxHeight: 180, overflowY: 'auto', zIndex: 999, marginTop: 4, padding: 6,
                        animation: 'fadeInDown 0.15s ease-out', marginBottom: 0,
                        overscrollBehavior: 'contain'
                      }}
                    >
                      {availablePackages.map(p => (
                        <div
                          key={p}
                          onClick={() => {
                            setCashPackageName(p)
                            setShowAdminPkgDropdown(false)
                          }}
                          className="paypg-modal-student-item"
                          style={{ borderBottom: 'none' }}
                        >
                          <span style={{ fontWeight: 600 }}>{p}</span>
                        </div>
                      ))}
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

