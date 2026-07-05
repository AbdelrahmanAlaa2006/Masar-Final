import React, { useState, useEffect } from 'react'
import {
  listNotificationQueue,
  getNotificationQueueSummary,
  retryNotification,
  retryAllFailed,
  updateGatewayConfig,
  processNotificationQueue,
  sendGatewayMessage,
  buildWaMeLink,
  markNotificationManuallySent
} from '@backend/parentNotificationsApi'
import { isGatewayConfigured, getWhatsAppStatus, connectWhatsApp, disconnectWhatsApp } from '@backend/whatsappGatewayApi'
import { useTenant } from '../../contexts/TenantContext'

export default function WhatsAppQueuePanel({ onBack, flash }) {
  const { tenant, tenantId } = useTenant()

  const [notifications, setNotifications] = useState([])
  const [totalNotifications, setTotalNotifications] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 10

  const [summary, setSummary] = useState({ pending: 0, sent: 0, failed: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState('')

  // Settings states — only two modes now:
  //   whatsapp_manual: free wa.me click-to-send (zero setup, zero ban risk)
  //   whatsapp_cloud:  official Meta WhatsApp Business Cloud API
  const [gatewayType, setGatewayType] = useState('whatsapp_manual')
  const [countryCode, setCountryCode] = useState('20')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [cloudToken, setCloudToken] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateLang, setTemplateLang] = useState('ar')

  // Test message states
  const [testPhone, setTestPhone] = useState('')
  const [testingMsg, setTestingMsg] = useState(false)

  // In-app WhatsApp linking (self-hosted gateway) — the non-technical path.
  const gatewayAvailable = isGatewayConfigured()
  const [waStatus, setWaStatus] = useState('disconnected') // disconnected|connecting|qr|connected
  const [waQr, setWaQr] = useState(null)
  const [waSentToday, setWaSentToday] = useState(0)
  const [waBusy, setWaBusy] = useState(false)

  // Poll the gateway for this tenant's WhatsApp link status while the panel is open.
  useEffect(() => {
    if (!gatewayAvailable) return
    let cancelled = false
    const tick = async () => {
      try {
        const s = await getWhatsAppStatus()
        if (cancelled) return
        setWaStatus(s.status)
        setWaQr(s.qr || null)
        setWaSentToday(s.sent_today || 0)
      } catch { /* gateway offline — the card shows a hint */ }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [gatewayAvailable])

  const handleConnectWa = async () => {
    setWaBusy(true)
    try {
      const s = await connectWhatsApp()
      setWaStatus(s.status)
      setWaQr(s.qr || null)
    } catch (err) {
      flash('تعذّر بدء الربط: ' + err.message, 'error')
    } finally {
      setWaBusy(false)
    }
  }

  const handleDisconnectWa = async () => {
    setWaBusy(true)
    try {
      await disconnectWhatsApp()
      setWaStatus('disconnected')
      setWaQr(null)
      flash('تم فصل الواتساب. يمكنك ربط رقم آخر في أي وقت.', 'info')
    } catch (err) {
      flash('تعذّر فصل الواتساب: ' + err.message, 'error')
    } finally {
      setWaBusy(false)
    }
  }

  // Initialize configuration from tenant config on mount.
  // Legacy gateway types (evolution/telegram/ultramsg/webhook) fall back to
  // the manual mode — those integrations were removed.
  useEffect(() => {
    if (tenant?.config?.gateway) {
      const g = tenant.config.gateway
      const t = g.type === 'whatsapp_cloud' ? 'whatsapp_cloud' : 'whatsapp_manual'
      setGatewayType(t)
      setCountryCode(g.country_code || '20')
      setPhoneNumberId(g.phone_number_id || '')
      setCloudToken(g.token || '')
      setTemplateName(g.template_name || '')
      setTemplateLang(g.template_lang || 'ar')
    }
  }, [tenant])

  // Load summary and list data
  const loadData = async () => {
    setLoading(true)
    try {
      const [sum, list] = await Promise.all([
        getNotificationQueueSummary(),
        listNotificationQueue(page, limit)
      ])
      setSummary(sum)
      setNotifications(list.items)
      setTotalNotifications(list.total)
    } catch (err) {
      console.error(err)
      flash('فشل تحميل تفاصيل طابور الرسائل', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [page])

  // Save gateway configurations
  const handleSaveSettings = async (e) => {
    e.preventDefault()
    try {
      await updateGatewayConfig(tenantId, {
        type: gatewayType,
        country_code: countryCode.trim() || '20',
        phone_number_id: phoneNumberId.trim(),
        token: cloudToken.trim(),
        template_name: templateName.trim(),
        template_lang: templateLang.trim() || 'ar'
      })
      flash('تم حفظ إعدادات بوابة الإرسال بنجاح وتحديث النظام.', 'success')
    } catch (err) {
      console.error(err)
      flash('فشل حفظ الإعدادات: ' + err.message, 'error')
    }
  }

  // Trigger test message
  const handleSendTestMessage = async () => {
    if (!testPhone.trim()) {
      flash('يرجى كتابة رقم الهاتف التجريبي أولاً', 'warning')
      return
    }
    const testMessage = 'رسالة تجريبية من المنصة لتأكيد إعدادات الاتصال بنجاح. ✅'

    // Manual/agent modes: just open WhatsApp with the message prefilled.
    if (gatewayType !== 'whatsapp_cloud') {
      window.open(buildWaMeLink(testPhone.trim(), testMessage, countryCode), '_blank')
      return
    }

    setTestingMsg(true)
    try {
      const config = {
        type: gatewayType,
        country_code: countryCode,
        phone_number_id: phoneNumberId,
        token: cloudToken,
        template_name: templateName,
        template_lang: templateLang
      }
      await sendGatewayMessage(config, { phone: testPhone.trim(), message: testMessage, type: 'attendance_absent' })
      flash('تم إرسال الرسالة التجريبية بنجاح! يرجى التحقق من الهاتف.', 'success')
      setTestPhone('')
    } catch (err) {
      console.error(err)
      flash('فشل إرسال الرسالة التجريبية: ' + err.message, 'error')
    } finally {
      setTestingMsg(false)
    }
  }

  // Manual wa.me send for a single queue row: opens WhatsApp with the
  // parent's number + message prefilled, then marks the row as sent.
  const handleManualSendRow = async (item) => {
    if (!item.phone || item.phone === '—') {
      flash('رقم هاتف ولي الأمر غير متوفر لهذه الرسالة', 'warning')
      return
    }
    window.open(buildWaMeLink(item.phone, item.message, countryCode), '_blank')
    try {
      await markNotificationManuallySent(item.id)
      setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, status: 'sent' } : n))
      setSummary(prev => ({ ...prev, pending: Math.max(0, prev.pending - 1), sent: prev.sent + 1 }))
    } catch (err) {
      console.error(err)
      flash('فُتح الواتساب لكن تعذر تحديث حالة الرسالة', 'warning')
    }
  }

  // Manual sequential send: opens the next pending message in the current page.
  const handleManualSendNext = () => {
    const next = notifications.find(n => n.status === 'pending' && n.phone && n.phone !== '—')
    if (!next) {
      flash('لا توجد رسائل معلقة في هذه الصفحة — انتقل للصفحة التالية إن وجدت', 'info')
      return
    }
    handleManualSendRow(next)
  }

  // Trigger processing queue in real-time
  const handleProcessQueue = async () => {
    if (processing) return
    setProcessing(true)
    setProcessingProgress('جاري بدء معالجة الرسائل المعلقة...')

    try {
      // Loop run
      let processed = 0
      let totalToProcess = summary.pending

      if (totalToProcess === 0) {
        flash('لا توجد أي رسائل معلقة في الطابور حالياً لإرسالها.', 'info')
        setProcessing(false)
        return
      }

      const progressCallback = (id, status, errorMsg) => {
        processed++
        setProcessingProgress(`جاري إرسال الرسالة ${processed} من ${totalToProcess}...`)

        // Dynamic update table row
        setNotifications(prev => prev.map(item => {
          if (item.id === id) {
            return {
              ...item,
              status,
              retry_count: status === 'failed' ? item.retry_count + 1 : item.retry_count,
              last_error: errorMsg
            }
          }
          return item
        }))
      }

      const count = await processNotificationQueue(tenant, progressCallback)
      flash(`اكتملت المعالجة: تم إرسال ${count} رسالة بنجاح.`, 'success')

      // Reload totals
      const sum = await getNotificationQueueSummary()
      setSummary(sum)
    } catch (err) {
      console.error(err)
      flash('فشل معالجة طابور الرسائل: ' + err.message, 'error')
    } finally {
      setProcessing(false)
      setProcessingProgress('')
    }
  }

  // Individual row retry
  const handleRetryRow = async (id) => {
    try {
      await retryNotification(id)
      flash('تم إعادة جدولة الرسالة في وضع التعليق.', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل إعادة جدولة الرسالة', 'error')
    }
  }

  // Bulk retry failed
  const handleRetryAllFailed = async () => {
    try {
      await retryAllFailed(tenantId)
      flash('تم إعادة جدولة جميع الرسائل الفاشلة في وضع التعليق.', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل إعادة الجدولة الجماعية', 'error')
    }
  }

  const totalPages = Math.ceil(totalNotifications / limit) || 1

  return (
    <div className="cp-panel-container">

      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>متابعة إشعارات أولياء الأمور</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>متابعة حالة الإرسال التلقائي لولي الأمر وضبط إعدادات البوابة</p>
        </div>
        <button onClick={onBack} className="cp-btn cp-btn-secondary">
          رجوع للوحة التحكم
        </button>
      </div>

      {/* Summary totals row */}
      <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--cp-card-shadow)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            <i className="fas fa-clock" />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: '600' }}>رسائل قيد الانتظار</span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '4px 0 0' }}>{summary.pending}</h3>
          </div>
        </div>

        <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--cp-card-shadow)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            <i className="fas fa-paper-plane" />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: '600' }}>رسائل تم إرسالها</span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '4px 0 0' }}>{summary.sent}</h3>
          </div>
        </div>

        <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--cp-card-shadow)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            <i className="fas fa-circle-xmark" />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: '600' }}>رسائل فشل إرسالها</span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '4px 0 0' }}>{summary.failed}</h3>
          </div>
        </div>
      </div>

      {/* Grid: queue list + config settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>

        {/* Left Side: Queue list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>سجل رسائل أولياء الأمور</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {summary.pending > 0 && gatewayType === 'whatsapp_manual' && (
                <button
                  onClick={handleManualSendNext}
                  className="cp-btn cp-btn-success"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
                >
                  <i className="fab fa-whatsapp" />
                  <span>إرسال التالي يدوياً ({summary.pending})</span>
                </button>
              )}
              {summary.pending > 0 && gatewayAvailable && waStatus === 'connected' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(37, 211, 102, 0.1)', color: '#25d366', borderRadius: 8, padding: '6px 12px', fontSize: '0.82rem', fontWeight: 'bold' }}>
                  <i className="fab fa-whatsapp" /> سيتم إرسالها تلقائياً الآن
                </span>
              )}
              {summary.pending > 0 && gatewayType === 'whatsapp_cloud' && (
                <button
                  onClick={handleProcessQueue}
                  disabled={processing}
                  className="cp-btn cp-btn-success"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
                >
                  {processing ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-circle-play" />}
                  <span>{processing ? 'جاري الإرسال...' : 'إرسال المعلق تلقائياً'}</span>
                </button>
              )}
              {summary.failed > 0 && (
                <button
                  onClick={handleRetryAllFailed}
                  className="cp-btn cp-btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                >
                  <i className="fas fa-rotate" />
                  إعادة المحاولة للفاشل
                </button>
              )}
            </div>
          </div>

          {/* Progress loader */}
          {processingProgress && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              color: '#10b981',
              padding: '12px 16px',
              borderRadius: '12px',
              fontWeight: 'bold',
              fontSize: '0.9rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="fas fa-circle-notch fa-spin" />
              <span>{processingProgress} (يرجى عدم إغلاق هذه الصفحة أثناء المعالجة)</span>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تحميل كشوف طابور الرسائل...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-paper-plane"></i>
              <p>طابور الرسائل فارغ تماماً حالياً</p>
            </div>
          ) : (
            <>
              <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)', marginBottom: '16px' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                        <th style={{ padding: '14px 16px', fontWeight: 'bold' }}>اسم الطالب</th>
                        <th style={{ padding: '14px 16px', fontWeight: 'bold' }}>هاتف ولي الأمر</th>
                        <th style={{ padding: '14px 16px', fontWeight: 'bold' }}>محتوى الرسالة</th>
                        <th style={{ padding: '14px 16px', fontWeight: 'bold', width: '100px', textAlign: 'center' }}>الحالة</th>
                        <th style={{ padding: '14px 16px', fontWeight: 'bold', width: '90px', textAlign: 'center' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notifications.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{item.student_name}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{item.phone}</td>
                          <td style={{ padding: '12px 16px', fontSize: '0.84rem', color: 'var(--cp-text-main)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.message}>{item.message}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              borderRadius: '99px',
                              fontSize: '0.74rem',
                              fontWeight: 'bold',
                              background: item.status === 'sent' ? 'rgba(16, 185, 129, 0.1)' : item.status === 'failed' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              color: item.status === 'sent' ? '#10b981' : item.status === 'failed' ? '#ef4444' : '#f59e0b'
                            }}>
                              {item.status === 'sent' ? 'تم الإرسال' : item.status === 'failed' ? 'فشل' : 'معلق'}
                            </span>
                            {item.status === 'failed' && item.last_error && (
                              <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.last_error}>
                                {item.last_error}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            {(item.status === 'pending' || item.status === 'failed') && (
                              <button
                                onClick={() => handleManualSendRow(item)}
                                style={{ background: 'rgba(37, 211, 102, 0.12)', border: 'none', color: '#25d366', cursor: 'pointer', fontSize: '1rem', borderRadius: 8, padding: '6px 10px' }}
                                title="فتح واتساب وإرسال الرسالة يدوياً"
                              >
                                <i className="fab fa-whatsapp" />
                              </button>
                            )}
                            {item.status === 'failed' && gatewayType === 'whatsapp_cloud' && (
                              <button
                                onClick={() => handleRetryRow(item.id)}
                                style={{ background: 'transparent', border: 'none', color: '#8c72db', cursor: 'pointer', fontSize: '1rem' }}
                                title="إعادة جدولة الإرسال التلقائي"
                              >
                                <i className="fas fa-arrow-rotate-left" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="cp-btn cp-btn-secondary" style={{ padding: '4px 12px' }}><i className="fas fa-chevron-right" /></button>
                  <span style={{ fontSize: '0.88rem', fontWeight: 'bold' }}>صفحة {page} من {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="cp-btn cp-btn-secondary" style={{ padding: '4px 12px' }}><i className="fas fa-chevron-left" /></button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Side: Config settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* In-app WhatsApp linking — the recommended non-technical automatic mode.
              Only shown when the developer has configured a gateway URL. */}
          {gatewayAvailable && (
            <div style={{ background: 'var(--cp-card-bg)', border: '2px solid rgba(37, 211, 102, 0.35)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--cp-card-shadow)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fab fa-whatsapp" style={{ color: '#25d366' }} /> الإرسال التلقائي المجاني
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: '0 0 16px', lineHeight: 1.6 }}>
                اربط رقم واتساب المدرّس مرة واحدة، وسيتم إرسال كل رسائل أولياء الأمور تلقائياً — بدون أي برامج أو إعدادات.
              </p>

              {waStatus === 'connected' ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: 12, padding: '12px 14px', fontWeight: 'bold', marginBottom: 12 }}>
                    <i className="fas fa-circle-check" /> الواتساب متصل ويعمل تلقائياً
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', marginBottom: 14 }}>تم الإرسال اليوم: {waSentToday} رسالة</div>
                  <button onClick={handleDisconnectWa} disabled={waBusy} className="cp-btn cp-btn-secondary" style={{ width: '100%', justifyContent: 'center', padding: 10 }}>
                    {waBusy ? <i className="fas fa-spinner fa-spin" /> : 'فصل الواتساب'}
                  </button>
                </div>
              ) : waStatus === 'qr' && waQr ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-main)', margin: '0 0 12px', lineHeight: 1.7 }}>
                    من هاتف المدرّس: واتساب ← الإعدادات ← <b>الأجهزة المرتبطة</b> ← ربط جهاز، ثم صوّر الرمز:
                  </p>
                  <div style={{ background: '#fff', display: 'inline-block', padding: 12, borderRadius: 16 }}>
                    <img src={waQr} alt="WhatsApp QR" style={{ width: 200, height: 200, display: 'block' }} />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--cp-text-muted)', margin: '12px 0 0' }}>ينتظر المسح... (يتحدّث تلقائياً)</p>
                </div>
              ) : (
                <button onClick={handleConnectWa} disabled={waBusy} className="cp-btn cp-btn-success" style={{ width: '100%', justifyContent: 'center', padding: 12, fontWeight: 'bold' }}>
                  {waBusy || waStatus === 'connecting'
                    ? <><i className="fas fa-spinner fa-spin" /> جارٍ التحضير...</>
                    : <><i className="fab fa-whatsapp" /> ربط الواتساب الآن</>}
                </button>
              )}
            </div>
          )}

          {/* Settings Panel */}
          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--cp-card-shadow)', animationDelay: '100ms' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 16px', borderBottom: '1px solid var(--cp-divider)', paddingBottom: '12px' }}>بوابة إرسال الرسائل</h3>
            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>وضع الإرسال</label>
                <select value={gatewayType} onChange={(e) => setGatewayType(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                  <option value="whatsapp_manual">واتساب يدوي — إرسال بضغطة زر</option>
                  <option value="whatsapp_cloud">واتساب الرسمي (Cloud API)</option>
                </select>
                {gatewayAvailable && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--cp-text-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>
                    💡 للإرسال التلقائي المجاني، استخدم كارت <b>«الإرسال التلقائي المجاني»</b> بالأعلى (اربط الواتساب بمسح QR مرة واحدة).
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>كود الدولة (مصر = 20)</label>
                <input type="text" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="20" className="cp-input" style={{ width: '100%' }} />
              </div>

              {gatewayType === 'whatsapp_manual' ? (
                <div style={{ background: 'rgba(37, 211, 102, 0.08)', border: '1px solid rgba(37, 211, 102, 0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: '20px', fontSize: '0.8rem', lineHeight: 1.7, color: 'var(--cp-text-main)' }}>
                  <i className="fab fa-whatsapp" style={{ color: '#25d366' }} /> <b>بدون إعداد إطلاقاً.</b> اضغط زر الواتساب الأخضر بجوار أي رسالة: يفتح واتساب برقم ولي الأمر والرسالة جاهزة — اضغط إرسال فقط. الإرسال يتم من واتساب المعلم نفسه بشكل يدوي، لذلك <b>لا يوجد أي خطر حظر</b> ومجاني تماماً.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>Phone Number ID</label>
                    <input type="text" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="من صفحة WhatsApp في Meta for Developers" className="cp-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>Access Token (دائم)</label>
                    <input type="password" value={cloudToken} onChange={(e) => setCloudToken(e.target.value)} placeholder="System User Token" className="cp-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>اسم القالب المعتمد (Template)</label>
                      <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="مثال: parent_notification" className="cp-input" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>اللغة</label>
                      <input type="text" value={templateLang} onChange={(e) => setTemplateLang(e.target.value)} placeholder="ar" className="cp-input" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div style={{ background: 'rgba(59, 130, 246, 0.07)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 12, padding: '12px 14px', marginBottom: '20px', fontSize: '0.78rem', lineHeight: 1.7, color: 'var(--cp-text-main)' }}>
                    أنشئ تطبيقاً مجانياً من <b>developers.facebook.com</b> ← أضف منتج WhatsApp ← انسخ Phone Number ID والـ Token. لإرسال رسائل لأولياء أمور لم يراسلوك خلال 24 ساعة يجب اعتماد <b>قالب رسالة</b> بمتغيّر واحد {'{{1}}'} ثم كتابة اسمه هنا.
                  </div>
                </>
              )}

              <button type="submit" className="cp-btn cp-btn-success" style={{ width: '100%', padding: '10px', justifyContent: 'center' }}>حفظ إعدادات البوابة</button>
            </form>
          </div>

          {/* Test message panel */}
          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--cp-card-shadow)', animationDelay: '180ms' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: '0 0 12px' }}>تجربة بوابة الإرسال</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: '0 0 16px', lineHeight: '1.4' }}>
              {gatewayType === 'whatsapp_cloud'
                ? 'أرسل إشعاراً تجريبياً سريعاً للتأكد من ربط واتساب الرسمي بشكل صحيح.'
                : 'اكتب رقمك وسيُفتح واتساب برسالة تجريبية جاهزة للإرسال.'}
            </p>

            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="رقم الهاتف (الواتساب أو معرّف)"
                className="cp-input"
                style={{ width: '100%' }}
              />
            </div>
            <button
              onClick={handleSendTestMessage}
              disabled={testingMsg}
              className="cp-btn cp-btn-info"
              style={{ width: '100%', padding: '8px', justifyContent: 'center' }}
            >
              {testingMsg ? <i className="fas fa-spinner fa-spin" /> : 'إرسال رسالة تجربة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
