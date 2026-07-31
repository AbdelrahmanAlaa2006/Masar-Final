import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { listPackages, purchasePackage, listMyPurchases } from '@backend/packagesApi'
import { getPaymentSettings } from '@backend/paymentsApi'
import { uploadHomeworkSubmission } from '@backend/r2'
import { listPlaylists } from '@backend/playlistsApi'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listHomeworks } from '@backend/homeworksApi'
import { PAYMENT_CONFIG } from '../utils/paymentConfig'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { notify } from '../utils/notify'
import './Shop.css'

export default function Shop() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { tenantId } = useTenant()
  const studentId = user?.id || null

  const isOnlineOrHybrid = user?.enrollment_type === 'ONLINE' || user?.enrollment_type === 'HYBRID'
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'assistant'
  const hasAccess = isAdmin || isOnlineOrHybrid

  const [packages, setPackages] = useState([])
  const [purchases, setPurchases] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [videos, setVideos] = useState([])
  const [exams, setExams] = useState([])
  const [homeworks, setHomeworks] = useState([])

  const [loading, setLoading] = useState(true)
  const [activeConfig, setActiveConfig] = useState(PAYMENT_CONFIG)
  
  // Checkout Modal State
  const [selectedPkg, setSelectedPkg] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('InstaPay')
  const [file, setFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [copiedText, setCopiedText] = useState(null)

  // Lightbox screenshot preview
  const [previewUrl, setPreviewUrl] = useState(null)
  const [rotateDeg, setRotateDeg] = useState(0)

  const loadData = async () => {
    try {
      setLoading(true)
      const [pkgs, myPurchases, plist, vlist, elist, hlist, dbConfig] = await Promise.all([
        listPackages(tenantId),
        studentId ? listMyPurchases(studentId) : Promise.resolve([]),
        listPlaylists(),
        listVideos(),
        listExams({ lean: true }),
        listHomeworks(),
        getPaymentSettings().catch(() => null)
      ])

      const isStaff = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'assistant'
      const studentGrade = user?.grade || null
      const filteredPkgs = pkgs.filter(p => {
        if (!p.is_active) return false
        if (isStaff) return true
        return p.grade === studentGrade
      })
      setPackages(filteredPkgs)
      setPurchases(myPurchases)
      setPlaylists(plist)
      setVideos(vlist)
      setExams(elist)
      setHomeworks(hlist)

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
      console.error(err)
      notify('فشل تحميل محتويات المتجر والباقات', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hasAccess) {
      loadData()
    }
  }, [studentId, hasAccess, tenantId])

  useEffect(() => {
    if (packages.length > 0) {
      const params = new URLSearchParams(window.location.search)
      const pkgId = params.get('packageId')
      if (pkgId) {
        const match = packages.find(p => p.id === pkgId)
        if (match) {
          setSelectedPkg(match)
        } else {
          notify('عذراً، هذه الباقة غير متاحة لصفك الدراسي أو غير صالحة ⚠️', 'warning')
        }
      }
    }
  }, [packages])

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
    setCopiedText(type)
    setTimeout(() => setCopiedText(null), 1800)
    notify('تم النسخ إلى الحافظة 📋', 'success')
  }

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault()
    if (!studentId) {
      notify('يجب تسجيل الدخول أولاً لإجراء الطلب', 'warning')
      return
    }
    if (!file) {
      notify('يرجى رفع صورة إيصال التحويل لتأكيد عملية الدفع', 'warning')
      return
    }

    setSubmitting(true)
    setUploadProgress(1)
    try {
      // 1. Upload receipt to Cloudflare R2
      const { key, publicUrl } = await uploadHomeworkSubmission(file, {
        onProgress: (pct) => setUploadProgress(pct)
      })

      // 2. Submit package purchase request
      await purchasePackage({
        studentId,
        packageId: selectedPkg.id,
        paymentMethod,
        screenshotUrl: publicUrl
      })

      notify('تم إرسال طلب الشراء بنجاح! جاري مراجعته من الإدارة. 🌟', 'success')
      setSelectedPkg(null)
      setFile(null)
      setUploadProgress(0)
      
      // Reload purchases history
      const updatedPurchases = await listMyPurchases(studentId)
      setPurchases(updatedPurchases)
    } catch (err) {
      console.error('Checkout error:', err)
      notify(err.message || 'فشل إرسال طلب تأكيد الدفع', 'danger')
      setUploadProgress(0)
    } finally {
      setSubmitting(false)
    }
  }

  // Resolve item details inside package items list
  const resolveItemTitle = (item) => {
    if (item.item_type === 'playlist') {
      const match = playlists.find(p => p.id === item.item_id)
      return match ? `📁 قائمة: ${match.title}` : 'قائمة تشغيل'
    } else if (item.item_type === 'video') {
      const match = videos.find(v => v.id === item.item_id)
      return match ? `🎬 فيديو: ${match.title}` : 'محاضرة فيديو'
    } else if (item.item_type === 'exam') {
      const match = exams.find(e => e.id === item.item_id)
      return match ? `📝 امتحان: ${match.title}` : 'امتحان إلكتروني'
    } else if (item.item_type === 'homework') {
      const match = homeworks.find(h => h.id === item.item_id)
      return match ? `📚 واجب: ${match.title}` : 'واجب منزلي'
    }
    return 'محتوى دراسي'
  }

  // Get status of a package subscription for this student
  const getPackageStatus = (packageId) => {
    const list = purchases.filter(p => p.package_id === packageId)
    if (list.length === 0) return { code: 'none', label: 'اشترك الآن 🚀' }
    
    // Check if there is an approved one
    const approved = list.find(p => p.payment_status === 'approved')
    if (approved) return { code: 'approved', label: 'مشترك بالفعل ✅' }

    // Check if pending
    const pending = list.find(p => p.payment_status === 'pending')
    if (pending) return { code: 'pending', label: 'قيد الانتظار ⏳' }

    return { code: 'rejected', label: 'طلب مرفوض (أعد المحاولة) ❌' }
  }

  const vodaDialerLink = useMemo(() => {
    return `tel:*9*7*${activeConfig.vodafoneCash.number}#`
  }, [activeConfig.vodafoneCash.number])

  const instaQrUrl = useMemo(() => {
    return activeConfig.instaPay.qrOverride || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(activeConfig.instaPay.link || '')}`
  }, [activeConfig.instaPay.link, activeConfig.instaPay.qrOverride])

  const vodaQrUrl = useMemo(() => {
    return activeConfig.vodafoneCash.qrOverride || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`tel:${activeConfig.vodafoneCash.number}`)}`
  }, [activeConfig.vodafoneCash.number, activeConfig.vodafoneCash.qrOverride])

  if (authLoading) {
    return (
      <main className="shop-page" dir="rtl">
        <div className="shop-container">
          <div className="shop-loader">
            <i className="fas fa-spinner fa-spin"></i>
            <p>جاري التحميل...</p>
          </div>
        </div>
      </main>
    )
  }

  if (!hasAccess) {
    return (
      <main className="shop-page" dir="rtl">
        <div className="shop-container">
          
          {/* Header */}
          <div className="shop-header">
            <div className="shop-header-text">
              <h1>متجر الباقات والمحاضرات 🛍️</h1>
              <p>نظام الاشتراكات والدفع الإلكتروني للباقات التعليمية.</p>
            </div>
            <div className="shop-header-icon">
              <i className="fas fa-box-open"></i>
            </div>
          </div>
          
          <div className="shop-divider" />

          <div className="shop-empty-state" style={{ padding: '60px 24px', maxWidth: '650px', margin: '40px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '20px' }}>
            <i className="fas fa-lock" style={{ fontSize: '3.5rem', color: '#14b8a6', marginBottom: '10px' }}></i>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-color, #0f172a)' }}>الباقات مخصصة لطلاب الأونلاين والسنتر وأونلاين 💻</h3>
            <p style={{ fontSize: '0.98rem', lineHeight: '1.7', color: 'var(--cp-text-muted, #64748b)', margin: 0 }}>
              هذا القسم متاح حصرياً لطلاب الأونلاين أو (سنتر وأونلاين) لشراء الباقات والاشتراك بالمنصة.
            </p>
            
            <div style={{ 
              background: 'rgba(20, 184, 166, 0.04)', 
              padding: '20px', 
              borderRadius: '16px', 
              border: '1px solid rgba(20, 184, 166, 0.15)', 
              width: '100%', 
              textAlign: 'right',
              marginTop: '10px'
            }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-color, #0f172a)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <i className="fas fa-info-circle" style={{ color: '#14b8a6' }}></i>
                <span>بما أن نوع تسجيلك حضور مباشر بالسنتر:</span>
              </p>
              <ul style={{ margin: 0, paddingRight: '20px', fontSize: '0.88rem', lineHeight: '1.7', color: 'var(--cp-text-muted, #64748b)', listStyleType: 'disc' }}>
                <li>يتم تفعيل حصصك ومحاضراتك تلقائياً من الإدارة عند الحضور وتسجيل الدخول بالسنتر.</li>
                <li>يتم سداد الاشتراكات والمصاريف مباشرة بمكتب السنتر.</li>
                <li>إذا كنت ترغب في تحويل نظام حسابك إلى (سنتر وأونلاين) لتتمكن من الشراء من المتجر، يرجى مراجعة مشرف السنتر أو التواصل مع الدعم الفني.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="shop-page" dir="rtl">
      <div className="shop-container">
        
        {/* Header */}
        <div className="shop-header">
          <div className="shop-header-text">
            <h1>متجر الباقات والمحاضرات 🛍️</h1>
            <p>اختر الباقة الدراسية المناسبة لك واشترك لتفعيل الفيديوهات والامتحانات والواجبات المخصصة لها فوراً.</p>
          </div>
          <div className="shop-header-icon">
            <i className="fas fa-box-open"></i>
          </div>
        </div>
        
        <div className="shop-divider" />

        {loading ? (
          <div className="shop-loader">
            <i className="fas fa-spinner fa-spin"></i>
            <p>جاري تحميل الباقات والاشتراكات المتاحة...</p>
          </div>
        ) : (
          <>
            {/* Packages Grid */}
            <div className="shop-packages-grid">
              {packages.length === 0 ? (
                <div className="shop-empty-state">
                  <i className="fas fa-folder-open"></i>
                  <h3>لا توجد باقات متاحة حالياً</h3>
                  <p>لا توجد باقات دراسية نشطة معروضة للبيع في الوقت الحالي. يرجى مراجعة المدرس أو المشرف.</p>
                </div>
              ) : (
                packages.map(pkg => {
                  const status = getPackageStatus(pkg.id)
                  const itemsCount = pkg.package_items?.length || 0

                  return (
                    <div
                      key={pkg.id}
                      className={`pkg-card pkg-status-${status.code}`}
                      onClick={() => {
                        if (status.code === 'approved') {
                          navigate(`/packages?id=${pkg.id}`)
                        }
                      }}
                      style={{ cursor: status.code === 'approved' ? 'pointer' : 'initial' }}
                    >
                      
                      {/* Package Thumbnail */}
                      <div className="pkg-thumbnail-wrapper">
                        {pkg.thumbnail ? (
                          <img src={pkg.thumbnail} alt={pkg.title} className="pkg-thumbnail" />
                        ) : (
                          <div className="pkg-thumbnail-placeholder">
                            <i className="fas fa-cubes"></i>
                          </div>
                        )}
                        <div className="pkg-price-badge">{pkg.price} ج.م</div>
                      </div>

                      {/* Package Content */}
                      <div className="pkg-body">
                        <h3 className="pkg-title">{pkg.title}</h3>
                        <p className="pkg-desc">{pkg.description || 'لا يوجد وصف متاح لهذه الباقة الدراسية.'}</p>
                        
                        {/* Bundled items checklist preview */}
                        {itemsCount > 0 && (
                          <div className="pkg-items-preview">
                            <h4>محتويات الباقة ({itemsCount} عناصر):</h4>
                            <ul>
                              {pkg.package_items.map(pi => (
                                <li key={pi.id}>
                                  <i className="fas fa-circle-check"></i>
                                  <span>{resolveItemTitle(pi)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Card Footer Action */}
                      <div className="pkg-footer" onClick={(e) => { if (status.code === 'approved') e.stopPropagation(); }}>
                        {status.code === 'approved' ? (
                          <button
                            onClick={() => navigate(`/packages?id=${pkg.id}`)}
                            className="pkg-buy-btn status-active-btn"
                            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none' }}
                          >
                            <i className="fas fa-circle-check"></i> عرض المحتوى 🚀
                          </button>
                        ) : status.code === 'pending' ? (
                          <div className="pkg-status-label status-pending">
                            <i className="fas fa-hourglass-half"></i> قيد المراجعة والتدقيق
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedPkg(pkg)
                            }}
                            className={`pkg-buy-btn ${status.code === 'rejected' ? 'btn-retry' : ''}`}
                          >
                            {status.label}
                          </button>
                        )}
                      </div>

                    </div>
                  )
                })
              )}
            </div>

            {/* Purchase History Section */}
            <div className="shop-history-section">
              <h2 className="section-title">
                <i className="fas fa-receipt"></i> سجل طلبات الشراء والتحويلات السابقة
              </h2>
              
              {purchases.length === 0 ? (
                <div className="history-empty">
                  <p>لم تقم بإرسال أي طلبات شراء بعد. تظهر الطلبات وحالتها هنا بمجرد إرسال إيصالات الدفع.</p>
                </div>
              ) : (
                <div className="history-list">
                  {purchases.map(p => (
                    <div key={p.id} className={`history-item status-${p.payment_status}`}>
                      <div className="history-item-main">
                        <div>
                          <strong className="history-pkg-title">{p.packages?.title || 'باقة دراسية'}</strong>
                          <div className="history-meta">
                            <span><i className="fas fa-wallet"></i> الوسيلة: {p.payment_method}</span>
                            <span><i className="fas fa-calendar"></i> تاريخ الطلب: {new Date(p.created_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                        </div>
                        <div className="history-price-status">
                          <span className="history-amount">{p.packages?.price || 0} ج.م</span>
                          <span className={`status-pill status-${p.payment_status}`}>
                            {p.payment_status === 'pending' && 'قيد الانتظار'}
                            {p.payment_status === 'approved' && 'مقبول ومفعّل'}
                            {p.payment_status === 'rejected' && 'مرفوض'}
                          </span>
                        </div>
                      </div>

                      {p.screenshot_url && (
                        <div className="history-item-footer">
                          <button
                            onClick={() => { setRotateDeg(0); setPreviewUrl(p.screenshot_url); }}
                            className="history-view-receipt"
                          >
                            <i className="fas fa-image"></i> عرض صورة الإيصال المرفوع
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* ─────────── Checkout Payment Confirmation Modal ─────────── */}
      {selectedPkg && (
        <div className="checkout-modal-overlay">
          <div className="checkout-modal-card">
            
            <div className="checkout-header">
              <h3>تأكيد اشتراك: {selectedPkg.title}</h3>
              <button onClick={() => setSelectedPkg(null)} className="close-checkout">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="checkout-body">
              
              {/* Payment Method selector buttons */}
              <div className="checkout-methods">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('InstaPay')}
                  className={`method-select-btn instapay ${paymentMethod === 'InstaPay' ? 'active' : ''}`}
                >
                  <i className="fas fa-bolt"></i> InstaPay
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Vodafone Cash')}
                  className={`method-select-btn vodafone ${paymentMethod === 'Vodafone Cash' ? 'active' : ''}`}
                >
                  <i className="fas fa-mobile-screen"></i> فودافون كاش
                </button>
              </div>

              {/* Dynamic Instructions */}
              <div className="checkout-instructions-panel">
                {paymentMethod === 'InstaPay' ? (
                  <div className="instruction-content">
                    <p>قم بالتحويل عبر تطبيق <strong>InstaPay</strong> إلى عنوان الدفع التالي:</p>
                    <div className="checkout-value-box">
                      <span className="checkout-value-text">{activeConfig.instaPay.address}</span>
                      <button 
                        onClick={() => copyToClipboard(activeConfig.instaPay.address, 'instapay')}
                        className="copy-value-btn"
                        type="button"
                      >
                        {copiedText === 'instapay' ? 'تم النسخ' : <i className="fas fa-copy" />}
                      </button>
                    </div>
                    {activeConfig.instaPay.link && (
                      <a 
                        href={activeConfig.instaPay.link} 
                        target="_blank" 
                        rel="noreferrer"
                        className="checkout-action-btn-link instapay-link"
                      >
                        <i className="fas fa-circle-arrow-up"></i> الانتقال السريع للتطبيق الدفع
                      </a>
                    )}
                    <div className="qr-toggle-area">
                      <button 
                        type="button" 
                        onClick={() => copyToClipboard(activeConfig.instaPay.address, 'instapay')} 
                        className="qr-toggle-btn"
                      >
                        <i className="fas fa-qrcode"></i> عرض رمز QR للدفع
                      </button>
                      <div className="qr-image-wrapper">
                        <img src={instaQrUrl} alt="InstaPay QR Code" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="instruction-content">
                    <p>قم بتحويل قيمة الاشتراك إلى رقم <strong>فودافون كاش</strong> التالي:</p>
                    <div className="checkout-value-box">
                      <span className="checkout-value-text">{activeConfig.vodafoneCash.number}</span>
                      <button 
                        onClick={() => copyToClipboard(activeConfig.vodafoneCash.number, 'vodafone')}
                        className="copy-value-btn"
                        type="button"
                      >
                        {copiedText === 'vodafone' ? 'تم النسخ' : <i className="fas fa-copy" />}
                      </button>
                    </div>
                    <a 
                      href={vodaDialerLink} 
                      className="checkout-action-btn-link voda-link"
                    >
                      <i className="fas fa-phone"></i> اتصال سريع بالتحويل (*9*7*)
                    </a>
                    <div className="qr-toggle-area">
                      <button 
                        type="button" 
                        onClick={() => copyToClipboard(activeConfig.vodafoneCash.number, 'vodafone')} 
                        className="qr-toggle-btn"
                      >
                        <i className="fas fa-qrcode"></i> عرض رمز QR للرقم
                      </button>
                      <div className="qr-image-wrapper">
                        <img src={vodaQrUrl} alt="Vodafone Cash QR Code" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Upload Screenshot */}
              <form onSubmit={handleCheckoutSubmit} className="checkout-upload-form">
                <div className="checkout-form-group">
                  <label>مبلغ الباقة المطلوب:</label>
                  <div className="price-display-field">{selectedPkg.price} ج.م</div>
                </div>

                <div className="checkout-form-group">
                  <label>ارفع لقطة شاشة لإيصال التحويل الناجح *</label>
                  
                  <div className="checkout-dropzone">
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      id="checkout-file-input"
                      style={{ display: 'none' }}
                      required
                    />
                    <label htmlFor="checkout-file-input" className="dropzone-label">
                      {file ? (
                        <div className="dropzone-preview">
                          <i className="fas fa-circle-check"></i>
                          <span>{file.name}</span>
                          <small>اضغط هنا لتغيير الصورة</small>
                        </div>
                      ) : (
                        <div className="dropzone-placeholder">
                          <i className="fas fa-cloud-arrow-up"></i>
                          <span>اضغط هنا لاختيار لقطة الشاشة</span>
                          <small>يجب رفع صورة واضحة للإيصال</small>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {uploadProgress > 0 && (
                  <div className="checkout-progress">
                    <div className="checkout-progress-bar">
                      <div className="checkout-progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                    <span>جاري رفع إيصال الدفع: {uploadProgress}%</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !file}
                  className="checkout-submit-btn"
                >
                  {submitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-circle-check"></i>}
                  <span>تأكيد التحويل وإرسال الطلب</span>
                </button>
              </form>

            </div>

          </div>
        </div>
      )}

      {/* ─────────── Image Lightbox Screenshot Modal ─────────── */}
      {previewUrl && (
        <div className="lightbox-overlay" onClick={() => setPreviewUrl(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <h4>صورة إيصال التحويل</h4>
              <div>
                <button onClick={() => setRotateDeg(r => (r + 90) % 360)} className="lightbox-btn">
                  <i className="fas fa-rotate-right"></i> تدوير
                </button>
                <button onClick={() => setPreviewUrl(null)} className="lightbox-btn close-btn">
                  <i className="fas fa-times"></i> إغلاق
                </button>
              </div>
            </div>
            <div className="lightbox-body">
              <img 
                src={previewUrl} 
                alt="Receipt Proof" 
                style={{ 
                  transform: `rotate(${rotateDeg}deg)`, 
                  transition: 'transform 0.2s',
                  maxHeight: '75vh',
                  maxWidth: '100%',
                  objectFit: 'contain'
                }} 
              />
            </div>
          </div>
        </div>
      )}

    </main>
  )
}
