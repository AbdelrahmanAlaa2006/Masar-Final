import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { uploadHomeworkSubmission } from '@backend/r2'
import { submitPayment, listMyPayments, listPayments, resolvePayment, getPaymentSettings, updatePaymentSetting } from '@backend/paymentsApi'
import { PAYMENT_CONFIG } from '../utils/paymentConfig'
import { notify } from '../utils/notify'
import './Payments.css'

const GRADE_SHORT = {
  'first-prep':  'أولى إعدادي',
  'second-prep': 'تانية إعدادي',
  'third-prep':  'تالتة إعدادي',
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
          }
        })
      }
    } catch (err) {
      console.warn('Failed to load dynamic payment settings, using local config:', err)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const loadHistory = async () => {
    if (window.location.pathname !== '/payments') return
    if (!userId) return
    try {
      setLoadingHistory(true)
      if (user?.role === 'admin') {
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
      {user?.role === 'admin' ? (
        <AdminPaymentsReport 
          payments={payments} 
          loading={loadingHistory} 
          onRefresh={loadHistory} 
          config={activeConfig}
          onConfigChange={loadConfig}
          setPreviewUrl={setPreviewUrl}
          setRotateDeg={setRotateDeg}
        />
      ) : (
        <div className="paypg" dir="rtl">
        <div className="paypg-container">
        
        {/* Page Head */}
        <header className="paypg-head">
          <h1 className="paypg-title">بوابة تأكيد الدفع</h1>
          <p className="paypg-subtitle">اختر وسيلة الدفع المفضلة لديك، قم بالتحويل، ثم ارفع لقطة الشاشة لتأكيد اشتراكك.</p>
        </header>

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
            <div className="paypg-widget-card">
              <h2 className="paypg-widget-title"><i className="fas fa-file-invoice-dollar"></i> تأكيد إيصال الدفع</h2>
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
            <div className="paypg-widget-card">
              <h2 className="paypg-widget-title"><i className="fas fa-receipt"></i> سجل وتقرير مدفوعاتك</h2>
              
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
                          ) : (
                            <><i className="fas fa-mobile-screen"></i> فودافون كاش</>
                          )}
                        </span>
                        <span className="pay-item-amount">{p.amount} ج.م</span>
                      </div>

                      <div className="pay-item-details">
                        <span className="pay-item-date"><i className="fas fa-calendar-alt"></i> تاريخ الطلب: {fmtDate(p.created_at)}</span>
                        <button 
                          type="button"
                          onClick={() => { setRotateDeg(0); setPreviewUrl(p.screenshot_url); }}
                          className="pay-item-link"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, outline: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          عرض صورة الإيصال <i className="fas fa-search-plus"></i>
                        </button>
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
    </div>
  )}
      
      {/* ─────────── Receipt Full Screen Zoom Lightbox Modal (Shared by Student and Admin) ─────────── */}
      {previewUrl && (
        <div 
          onClick={() => setPreviewUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
            zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24,
            animation: 'fadeInDown 0.25s ease-out'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff', borderRadius: 24, width: '100%', maxWidth: 550,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
            }}
          >
            
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Cairo', color: '#1e1b4b' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>مراجعة إيصال التحويل</h4>
              <div style={{ display: 'flex', gap: 10 }}>
                <button 
                  type="button"
                  onClick={() => setRotateDeg(d => (d + 90) % 360)} 
                  className="paypg-admin-btn-outline"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  <i className="fas fa-rotate-right"></i> تدوير الصورة
                </button>
                <button 
                  type="button"
                  onClick={() => setPreviewUrl(null)}
                  className="paypg-admin-btn-outline"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  <i className="fas fa-xmark"></i> إغلاق
                </button>
              </div>
            </div>

            {/* Modal Image Body with Rotation transition */}
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#fafafa', minHeight: 320, overflow: 'hidden' }}>
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

  const [activeTab, setActiveTab] = useState('pending') // 'pending' is default for immediate attention, can switch to 'all', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')

  // Configuration editing states
  const [showConfigEditor, setShowConfigEditor] = useState(false)
  const [instaAddress, setInstaAddress] = useState(config?.instaPay?.address || '')
  const [instaLink, setInstaLink] = useState(config?.instaPay?.link || '')
  const [vodaNumber, setVodaNumber] = useState(config?.vodafoneCash?.number || '')
  const [savingConfig, setSavingConfig] = useState(false)

  // Sync state if config prop updates
  useEffect(() => {
    if (config) {
      setInstaAddress(config.instaPay?.address || '')
      setInstaLink(config.instaPay?.link || '')
      setVodaNumber(config.vodafoneCash?.number || '')
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

  // Financial statistics calculations
  const stats = useMemo(() => {
    let approvedSum = 0
    let pendingCount = 0
    let approvedCount = 0
    let rejectedCount = 0

    payments.forEach(p => {
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
      totalCount: payments.length
    }
  }, [payments])

  const filteredPayments = useMemo(() => {
    let list = payments

    // 1. Filter by tab status
    if (activeTab !== 'all') {
      list = payments.filter(p => p.status === activeTab)
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
  }, [payments, activeTab, gradeFilter, searchQuery])



  return (
    <div className="paypg paypg-admin" dir="rtl">
      <div className="paypg-container" style={{ maxWidth: 1280 }}>
        
        {/* Dashboard Header */}
        <header className="paypg-head" style={{ marginBottom: 32, textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="paypg-title" style={{ fontSize: '2.4rem', fontWeight: 800 }}>تقرير كشف المدفوعات</h1>
            <p className="paypg-subtitle" style={{ margin: '8px 0 0 0', fontSize: '1rem', maxWidth: 'none' }}>
              استعرض وتابع حالة اشتراكات الطلاب والتحويلات المالية الواردة للمنصة وفعّل الحسابات فورًا.
            </p>
          </div>
          
          <button 
            type="button"
            onClick={() => setShowConfigEditor(!showConfigEditor)}
            className="paypg-admin-btn-outline"
            style={{ padding: '10px 20px', borderRadius: 14, fontWeight: 700, gap: 8, height: 44, cursor: 'pointer' }}
          >
            <i className="fas fa-cog"></i> 
            {showConfigEditor ? 'إخفاء الإعدادات' : 'تعديل بيانات الدفع ⚙️'}
          </button>
        </header>

        {/* Collapsible Config Editor Card */}
        {showConfigEditor && (
          <div className="paypg-widget-card" style={{ marginBottom: 32, padding: 28, border: '2px solid #7c3aed', background: 'rgba(124, 58, 237, 0.01)', animation: 'fadeInDown 0.3s ease-out' }}>
            <h3 className="paypg-widget-title" style={{ color: '#7c3aed', marginBottom: 12, fontSize: '1.25rem' }}>
              <i className="fas fa-gears" style={{ color: '#7c3aed' }}></i> إعدادات الحسابات البنكية ومحافظ التحويل
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: 24 }}>
              قم بتعديل بيانات InstaPay ورقم Vodafone Cash مباشرة من هنا. سيتم تحديث هذه القيم فورًا لجميع الطلاب على المنصة دون الحاجة لتعديل الكود.
            </p>

            <form onSubmit={handleSaveConfig} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, alignItems: 'end' }}>
              
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

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button 
                  type="submit" 
                  disabled={savingConfig}
                  className="paypg-admin-btn"
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
                  className="paypg-admin-btn-outline"
                  style={{ height: 44, padding: '0 16px', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        )}

        {/* ─────────── Premium KPI Statistics Widgets ─────────── */}
        <section className="paypg-admin-stats">
          
          {/* Total Approved Amount */}
          <div className="paypg-admin-stat" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="paypg-admin-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
              <i className="fas fa-sack-dollar"></i>
            </div>
            <div className="paypg-admin-stat-info">
              <div className="paypg-admin-stat-value">{stats.approvedSum.toLocaleString()} ج.م</div>
              <div className="paypg-admin-stat-label">إجمالي المدفوعات الواردة</div>
            </div>
          </div>

          {/* Pending payments count */}
          <div className="paypg-admin-stat" style={{ borderLeft: '4px solid #f59e0b' }}>
            <div className="paypg-admin-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b' }}>
              <i className="fas fa-hourglass-half"></i>
            </div>
            <div className="paypg-admin-stat-info">
              <div className="paypg-admin-stat-value">{stats.pendingCount}</div>
              <div className="paypg-admin-stat-label">طلبات معلقة قيد المراجعة</div>
            </div>
          </div>

          {/* Approved payments count */}
          <div className="paypg-admin-stat" style={{ borderLeft: '4px solid #7c3aed' }}>
            <div className="paypg-admin-stat-icon" style={{ background: 'rgba(124, 58, 237, 0.08)', color: '#7c3aed' }}>
              <i className="fas fa-circle-check"></i>
            </div>
            <div className="paypg-admin-stat-info">
              <div className="paypg-admin-stat-value">{stats.approvedCount}</div>
              <div className="paypg-admin-stat-label">طلبات مقبولة ومفعّلة</div>
            </div>
          </div>

          {/* Rejected payments count */}
          <div className="paypg-admin-stat" style={{ borderLeft: '4px solid #ef4444' }}>
            <div className="paypg-admin-stat-icon" style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444' }}>
              <i className="fas fa-circle-xmark"></i>
            </div>
            <div className="paypg-admin-stat-info">
              <div className="paypg-admin-stat-value">{stats.rejectedCount}</div>
              <div className="paypg-admin-stat-label">طلبات مرفوضة</div>
            </div>
          </div>

        </section>

        {/* ─────────── Filters and toolbar section ─────────── */}
        <div className="paypg-widget-card" style={{ padding: 28 }}>
          
          <div className="paypg-admin-filter-bar">
            
            {/* Status tabs */}
            <div style={{ display: 'flex', gap: 8, background: 'rgba(124, 58, 237, 0.04)', padding: 5, borderRadius: 14, flexWrap: 'wrap' }}>
              {['pending', 'approved', 'rejected', 'all'].map((tab) => {
                const isActive = activeTab === tab
                const label = tab === 'all' ? 'الكل' : tab === 'pending' ? 'المعلقة' : tab === 'approved' ? 'المقبولة' : 'المرفوضة'
                const themeColor = tab === 'all' ? '#64748b' : tab === 'pending' ? '#f59e0b' : tab === 'approved' ? '#10b981' : '#ef4444'
                const count = tab === 'all' ? stats.totalCount : tab === 'pending' ? stats.pendingCount : tab === 'approved' ? stats.approvedCount : stats.rejectedCount

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      border: 'none', padding: '8px 18px', borderRadius: 10,
                      background: isActive ? '#ffffff' : 'transparent',
                      color: isActive ? themeColor : '#64748b',
                      fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo', fontSize: '0.85rem',
                      boxShadow: isActive ? '0 4px 10px rgba(0,0,0,0.04)' : 'none',
                      display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                    }}
                  >
                    {label}
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, background: `${themeColor}15`, color: themeColor, fontSize: '0.75rem', fontWeight: 700
                    }}>
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
                <option value="first-prep">الصف الأول الإعدادي</option>
                <option value="second-prep">الصف الثاني الإعدادي</option>
                <option value="third-prep">الصف الثالث الإعدادي</option>
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
                className="paypg-admin-btn"
                style={{ height: 42 }}
              >
                <i className={`fas fa-rotate ${loading ? 'fa-spin' : ''}`}></i> تحديث البيانات
              </button>

            </div>

          </div>

          {/* ─────────── Main Data Table ─────────── */}
          {loading ? (
            <div className="paypg-loader" style={{ padding: '60px 0' }}>
              <i className="fas fa-circle-notch fa-spin"></i>
              <span>جاري تحميل تقرير المدفوعات...</span>
            </div>
          ) : filteredPayments.length > 0 ? (
            <div className="paypg-admin-table-container">
              <table className="paypg-admin-table">
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
                        <div className="paypg-student-meta">
                          <span><i className="fas fa-phone" style={{ fontSize: '0.75rem', opacity: 0.7 }}></i> {p.profiles?.phone || '—'}</span>
                          <span style={{ height: 4, width: 4, borderRadius: '50%', background: '#cbd5e1' }}></span>
                          <span className="paypg-student-grade">
                            {GRADE_SHORT[p.profiles?.grade] || p.profiles?.grade || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Payment Amount */}
                      <td>
                        <strong style={{ color: '#10b981', fontSize: '1.05rem' }}>{p.amount} ج.م</strong>
                      </td>

                      {/* Payment Method */}
                      <td>
                        <span className={`paypg-method-badge ${p.payment_method === 'InstaPay' ? 'paypg-method-instapay' : 'paypg-method-vodafone'}`}>
                          {p.payment_method === 'InstaPay' ? (
                            <><i className="fas fa-bolt"></i> InstaPay</>
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
                        <div 
                          onClick={() => { setRotateDeg(0); setPreviewUrl(p.screenshot_url); }}
                          className="paypg-thumb-container"
                          style={{
                            width: 48, height: 48, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)',
                            cursor: 'zoom-in', background: '#fafafa', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'
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
                                className="paypg-admin-btn"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1, background: '#10b981' }}
                              >
                                {resolvingId === p.id ? <i className="fas fa-spinner fa-spin"></i> : 'قبول وتفعيل'}
                              </button>
                              <button
                                onClick={() => handleResolve(p.id, 'rejected', p.student_id)}
                                disabled={resolvingId !== null}
                                className="paypg-admin-btn"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1, background: '#ef4444' }}
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
              <span>لا توجد طلبات مدفوعات مطابقة للتصفية الحالية</span>
            </div>
          )}

        </div>

      </div>
    </div>
  )
}

