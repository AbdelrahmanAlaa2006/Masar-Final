import React, { useState, useEffect } from 'react'
import { 
  listNotificationQueue, 
  getNotificationQueueSummary, 
  retryNotification, 
  retryAllFailed, 
  updateGatewayConfig,
  processNotificationQueue,
  sendGatewayMessage
} from '@backend/parentNotificationsApi'
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

  // Settings states
  const [gatewayType, setGatewayType] = useState('whatsapp_evolution')
  const [gatewayUrl, setGatewayUrl] = useState('')
  const [gatewayToken, setGatewayToken] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  
  // Test message states
  const [testPhone, setTestPhone] = useState('')
  const [testingMsg, setTestingMsg] = useState(false)

  // Initialize configuration from tenant config on mount
  useEffect(() => {
    if (tenant?.config?.gateway) {
      const g = tenant.config.gateway
      setGatewayType(g.type || 'whatsapp_evolution')
      setGatewayUrl(g.url || '')
      setGatewayToken(g.token || '')
      setTelegramBotToken(g.telegram_bot_token || '')
      setTelegramChatId(g.telegram_chat_id || '')
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
        url: gatewayUrl,
        token: gatewayToken,
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId
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

    setTestingMsg(true)
    try {
      const config = {
        type: gatewayType,
        url: gatewayUrl,
        token: gatewayToken,
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId
      }
      
      const testNotif = {
        phone: testPhone.trim(),
        message: 'رسالة تجريبية من منصة مسار التعليمية لتأكيد إعدادات الاتصال بنجاح. ✅',
        type: 'attendance_absent'
      }

      await sendGatewayMessage(config, testNotif)
      flash('تم إرسال الرسالة التجريبية بنجاح! يرجى التحقق من الهاتف.', 'success')
      setTestPhone('')
    } catch (err) {
      console.error(err)
      flash('فشل إرسال الرسالة التجريبية: ' + err.message, 'error')
    } finally {
      setTestingMsg(false)
    }
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
            <div style={{ display: 'flex', gap: '8px' }}>
              {summary.pending > 0 && (
                <button 
                  onClick={handleProcessQueue} 
                  disabled={processing}
                  className="cp-btn cp-btn-success"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
                >
                  {processing ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-circle-play" />}
                  <span>{processing ? 'جاري الإرسال...' : 'تشغيل طابور الإرسال معلق'}</span>
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
                            {item.status === 'failed' && (
                              <button 
                                onClick={() => handleRetryRow(item.id)}
                                style={{ background: 'transparent', border: 'none', color: '#8c72db', cursor: 'pointer', fontSize: '1rem' }}
                                title="إعادة الإرسال"
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
          
          {/* Settings Panel */}
          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--cp-card-shadow)', animationDelay: '100ms' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 16px', borderBottom: '1px solid var(--cp-divider)', paddingBottom: '12px' }}>بوابة إرسال الرسائل</h3>
            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>نوع البوابة</label>
                <select value={gatewayType} onChange={(e) => setGatewayType(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                  <option value="whatsapp_evolution">WhatsApp (Evolution API)</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="generic_webhook">Generic Webhook (SMS/Custom)</option>
                </select>
              </div>

              {gatewayType !== 'telegram' ? (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>رابط خادم البوابة (URL)</label>
                    <input type="text" value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} placeholder="مثال: http://localhost:8080/message/sendText" className="cp-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>مفتاح التحقق (API Token)</label>
                    <input type="password" value={gatewayToken} onChange={(e) => setGatewayToken(e.target.value)} placeholder="مفتاح المبرمجين Bearer/apikey" className="cp-input" style={{ width: '100%' }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>مفتاح البوت (Bot Token)</label>
                    <input type="password" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} placeholder="مثال: 123456:ABC-def..." className="cp-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>معرّف المجموعة أو المحادثة (Chat ID)</label>
                    <input type="text" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="مثال: -1001234567890" className="cp-input" style={{ width: '100%' }} />
                  </div>
                </>
              )}

              <button type="submit" className="cp-btn cp-btn-success" style={{ width: '100%', padding: '10px', justifyContent: 'center' }}>حفظ إعدادات البوابة</button>
            </form>
          </div>

          {/* Test message panel */}
          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--cp-card-shadow)', animationDelay: '180ms' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: '0 0 12px' }}>تجربة بوابة الإرسال</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: '0 0 16px', lineHeight: '1.4' }}>أرسل إشعاراً تجريبياً سريعاً للتأكد من ربط Evolution API أو التليجرام بشكل صحيح.</p>
            
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
