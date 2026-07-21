import React, { useState, useEffect } from 'react'
import {
  listNotificationQueue,
  getNotificationQueueSummary,
  retryNotification,
  retryAllFailed,
  updateGatewayConfig,
  sendGatewayMessage,
  buildWaMeLink,
  markNotificationManuallySent,
  clearPendingQueue
} from '@backend/parentNotificationsApi'
import { isGatewayConfigured, getWhatsAppStatus, connectWhatsApp, disconnectWhatsApp, pairWhatsApp } from '@backend/whatsappGatewayApi'
import { useTenant } from '../../contexts/TenantContext'
import { kickWorker, subscribeWorker, isWorkerRunning } from '../../utils/whatsappWorker'

export default function WhatsAppQueuePanel({ onBack, flash }) {
  const { tenant, tenantId } = useTenant()

  const [notifications, setNotifications] = useState([])
  const [totalNotifications, setTotalNotifications] = useState(0)
  const [page, setPage] = useState(1)
  // Mobile responsiveness: below 900px the log + settings sidebar stack
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 900)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Log filter — default to what needs attention, not the whole history
  const [statusFilter, setStatusFilter] = useState('pending')
  const limit = 10

  const [summary, setSummary] = useState({ pending: 0, sent: 0, failed: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [clearingPending, setClearingPending] = useState(false)
  const [processingProgress, setProcessingProgress] = useState('')

  // Settings states — only two modes now:
  //   whatsapp_manual: free wa.me click-to-send (zero setup, zero ban risk)
  //   whatsapp_cloud:  official Meta WhatsApp Business Cloud API
  const [gatewayType, setGatewayType] = useState('whatsapp_manual')
  const [wapilotUrl, setWapilotUrl] = useState('')
  const [wapilotInstance, setWapilotInstance] = useState('')
  const [wapilotToken, setWapilotToken] = useState('')
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
  const [waStatus, setWaStatus] = useState('disconnected') // disconnected|connecting|qr|pairing|connected
  const [waQr, setWaQr] = useState(null)
  const [waSentToday, setWaSentToday] = useState(0)
  const [waBusy, setWaBusy] = useState(false)
  // Link-by-phone-number (pairing code) — more reliable on weak connections.
  const [showPair, setShowPair] = useState(false)
  const [pairPhone, setPairPhone] = useState('')
  const [pairCode, setPairCode] = useState(null)
  const [pairBusy, setPairBusy] = useState(false)

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
        if (s.pairing_code) setPairCode(s.pairing_code)
        if (s.status === 'connected') { setPairCode(null); setShowPair(false) }
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

  const handlePairCode = async () => {
    if (!pairPhone.trim()) { flash('اكتب رقم واتساب المدرّس أولاً', 'warning'); return }
    setPairBusy(true)
    setPairCode(null)
    try {
      const r = await pairWhatsApp(pairPhone.trim())
      if (r.connected) { flash('الواتساب متصل بالفعل ✅', 'success'); return }
      setPairCode(r.code)
    } catch (err) {
      flash('تعذّر توليد كود الربط: ' + err.message, 'error')
    } finally {
      setPairBusy(false)
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
      const t = g.type === 'whatsapp_cloud' ? 'whatsapp_cloud' : (g.type === 'wapilot' ? 'wapilot' : 'whatsapp_manual')
      setGatewayType(t)
      setWapilotUrl(g.wapilot_api_url || '')
      setWapilotInstance(g.wapilot_instance_id || '')
      setWapilotToken(g.wapilot_token || '')
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
        listNotificationQueue(page, limit, statusFilter)
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
  }, [page, statusFilter])

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
        template_lang: templateLang.trim() || 'ar',
        wapilot_api_url: wapilotUrl.trim(),
        wapilot_instance_id: wapilotInstance.trim(),
        wapilot_token: wapilotToken.trim()
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
    if (gatewayType !== 'whatsapp_cloud' && gatewayType !== 'wapilot') {
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
        template_lang: templateLang,
        wapilot_api_url: wapilotUrl,
        wapilot_instance_id: wapilotInstance,
        wapilot_token: wapilotToken
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

  // Subscribe to the module-level singleton worker so this page reflects its
  // live progress — but the worker OWNS the loop, so it keeps running after the
  // page unmounts. Unsubscribing on unmount never stops processing.
  useEffect(() => {
    setProcessing(isWorkerRunning())
    const unsub = subscribeWorker(async (evt) => {
      if (evt.type === 'running') {
        setProcessing(evt.running)
        if (!evt.running) setProcessingProgress('')
      } else if (evt.type === 'progress') {
        setProcessingProgress('جاري إرسال الرسائل في الخلفية...')
        setNotifications(prev => prev.map(item => item.id === evt.id
          ? { ...item, status: evt.status, retry_count: evt.status === 'failed' ? item.retry_count + 1 : item.retry_count, last_error: evt.error }
          : item))
      } else if (evt.type === 'done') {
        flash(`اكتملت المعالجة: تم إرسال ${evt.sent} رسالة.`, 'success')
        try { setSummary(await getNotificationQueueSummary()) } catch { /* non-fatal */ }
      } else if (evt.type === 'error') {
        flash('تعذّر إكمال بعض الرسائل: ' + (evt.error || ''), 'error')
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Start Sending" — hands off to the singleton worker (single loop, survives
  // navigation). Repeated clicks are a no-op while it's already running.
  const handleProcessQueue = () => {
    if (isWorkerRunning()) {
      flash('المعالجة جارية بالفعل في الخلفية.', 'info')
      return
    }
    if (summary.pending === 0) {
      flash('لا توجد أي رسائل معلقة في الطابور حالياً لإرسالها.', 'info')
      return
    }
    setProcessingProgress('جاري بدء معالجة الرسائل المعلقة...')
    kickWorker(tenant)
    flash('بدأت المعالجة في الخلفية — يمكنك التنقل بحرية.', 'success')
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

  const handleClearPendingQueue = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع الرسائل المعلقة بقائمة الانتظار؟ لن يؤثر هذا على كشوفات الحضور أو أي بيانات أخرى.')) {
      return
    }
    
    setClearingPending(true)
    try {
      await clearPendingQueue(tenantId)
      flash('تم مسح قائمة الانتظار المعلقة بنجاح.', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل مسح قائمة الانتظار المعلقة: ' + err.message, 'error')
    } finally {
      setClearingPending(false)
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? '16px' : '24px' }}>

        {/* Left Side: Queue list — minWidth 0 lets the 1fr grid track shrink
            below the table width so the inner overflow-x scroll can engage */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>سجل رسائل أولياء الأمور</h3>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { key: 'pending', label: `معلق (${summary.pending})`, color: '#f59e0b' },
                  { key: 'failed', label: `فشلت (${summary.failed})`, color: '#ef4444' },
                  { key: 'sent', label: `تم الإرسال (${summary.sent})`, color: '#10b981' },
                  { key: 'all', label: 'الكل', color: 'var(--cp-text-muted)' },
                ].map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => { setStatusFilter(f.key); setPage(1) }}
                    style={{
                      padding: '5px 14px',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      border: `1.5px solid ${statusFilter === f.key ? f.color : 'var(--cp-divider)'}`,
                      color: statusFilter === f.key ? f.color : 'var(--cp-text-muted)',
                      background: statusFilter === f.key ? `color-mix(in srgb, ${f.color} 10%, transparent)` : 'transparent',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
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
              {summary.pending > 0 && (gatewayType === 'whatsapp_cloud' || gatewayType === 'wapilot') && (
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
              <button
                onClick={handleClearPendingQueue}
                disabled={clearingPending}
                className="cp-btn cp-btn-danger"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
              >
                {clearingPending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash-can" />}
                <span>مسح قائمة الانتظار المعلقة</span>
              </button>
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
                  <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
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
                            {item.status === 'failed' && (gatewayType === 'whatsapp_cloud' || gatewayType === 'wapilot') && (
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
                  {waBusy
                    ? <><i className="fas fa-spinner fa-spin" /> جارٍ التحضير...</>
                    : waStatus === 'connecting'
                      ? <><i className="fas fa-rotate" /> إعادة المحاولة وإظهار الكود</>
                      : <><i className="fab fa-whatsapp" /> ربط الواتساب الآن</>}
                </button>
              )}

              {/* Alternative: link by phone number (pairing code) — more reliable on weak internet */}
              {waStatus !== 'connected' && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--cp-divider)', paddingTop: 14 }}>
                  {!showPair ? (
                    <button onClick={() => setShowPair(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, padding: 0 }}>
                      تعذّر مسح الكود؟ اربط برقم الهاتف بدلاً منه ↓
                    </button>
                  ) : (
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>رقم واتساب المدرّس</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} placeholder="مثال: 01012345678" className="cp-input" style={{ flex: 1, direction: 'ltr' }} />
                        <button onClick={handlePairCode} disabled={pairBusy} className="cp-btn cp-btn-info" style={{ whiteSpace: 'nowrap' }}>
                          {pairBusy ? <i className="fas fa-spinner fa-spin" /> : 'احصل على الكود'}
                        </button>
                      </div>
                      {pairCode && (
                        <div style={{ marginTop: 12, textAlign: 'center', background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 12, padding: 14 }}>
                          <div style={{ fontSize: '1.7rem', fontWeight: 900, letterSpacing: 5, fontFamily: 'monospace', color: 'var(--cp-text-main)' }}>{pairCode}</div>
                          <p style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', margin: '10px 0 0', lineHeight: 1.8 }}>
                            من هاتف المدرّس: واتساب ← الإعدادات ← <b>الأجهزة المرتبطة</b> ← ربط جهاز ← <b>الربط برقم الهاتف بدلاً من ذلك</b> ← اكتب هذا الكود.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                  <option value="wapilot">WAPilot — إرسال تلقائي (wapilot.net)</option>
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

              {gatewayType === 'wapilot' && (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>Instance ID</label>
                    <input type="text" value={wapilotInstance} onChange={(e) => setWapilotInstance(e.target.value)} dir="ltr" placeholder="من لوحة تحكم WAPilot" className="cp-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>API Token</label>
                    <input type="password" value={wapilotToken} onChange={(e) => setWapilotToken(e.target.value)} dir="ltr" placeholder="Access Token من صفحة الـ API" className="cp-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>رابط الإرسال (Send Endpoint) — من توثيق WAPilot</label>
                    <input type="text" value={wapilotUrl} onChange={(e) => setWapilotUrl(e.target.value)} dir="ltr" placeholder="اتركه فارغاً لتجربة الرابط الافتراضي" className="cp-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ background: 'rgba(245, 158, 11, 0.07)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: '20px', fontSize: '0.78rem', lineHeight: 1.7, color: 'var(--cp-text-main)' }}>
                    من لوحة WAPilot: تأكد أن حالة الـ Instance «متصل» (تم مسح QR)، ثم انسخ Instance ID والـ Token هنا واحفظ. جرّب رسالة من كارت التجربة — إن فشلت، افتح توثيق API عندهم وانسخ رابط send-message في الحقل الثالث.
                    <br /><b>لإلغاء التفعيل لاحقاً:</b> ارجع لوضع «واتساب يدوي» واحفظ.
                  </div>
                </>
              )}

              {gatewayType === 'whatsapp_manual' && (
                <div style={{ background: 'rgba(37, 211, 102, 0.08)', border: '1px solid rgba(37, 211, 102, 0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: '20px', fontSize: '0.8rem', lineHeight: 1.7, color: 'var(--cp-text-main)' }}>
                  <i className="fab fa-whatsapp" style={{ color: '#25d366' }} /> <b>بدون إعداد إطلاقاً.</b> اضغط زر الواتساب الأخضر بجوار أي رسالة: يفتح واتساب برقم ولي الأمر والرسالة جاهزة — اضغط إرسال فقط. الإرسال يتم من واتساب المعلم نفسه بشكل يدوي، لذلك <b>لا يوجد أي خطر حظر</b> ومجاني تماماً.
                </div>
              )}

              {gatewayType === 'whatsapp_cloud' && (
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
              {gatewayType === 'whatsapp_cloud' || gatewayType === 'wapilot'
                ? 'أرسل إشعاراً تجريبياً سريعاً للتأكد من ربط البوابة بشكل صحيح.'
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
