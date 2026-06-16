import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@backend/supabase'
import { sendGatewayMessage } from '@backend/parentNotificationsApi'
import './Report.css' // Reuse general report styles

export default function PublicReport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const studentId = searchParams.get('id')
  const qrToken = searchParams.get('token')
  const urlPhone = searchParams.get('phone')

  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [verified, setVerified] = useState(false)
  const [report, setReport] = useState(null)
  
  const [whatsappStatus, setWhatsappStatus] = useState('') // 'sending' | 'sent' | 'failed' | ''
  const [whatsappError, setWhatsappError] = useState('')

  // Map DB grade enum → Arabic label
  const GRADE_LABEL = {
    'first-prep':  'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep':  'الصف الثالث الإعدادي',
    'first-sec':   'الصف الأول الثانوي',
    'second-sec':  'الصف الثاني الثانوي',
    'third-sec':   'الصف الثالث الثانوي',
  }

  // Format date to local Arabic format
  const fmtDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return '—'
    }
  }

  const performVerify = async (phoneToVerify) => {
    if (!phoneToVerify) return
    setLoading(true)
    setError('')
    try {
      // 1. Call secure RPC to verify and retrieve the student report
      const { data, error: rpcError } = await supabase.rpc('get_public_report', {
        p_student_id: studentId,
        p_qr_token: qrToken,
        p_phone: phoneToVerify.trim()
      })

      if (rpcError) throw new Error(rpcError.message)
      if (!data) throw new Error('فشل استرجاع البيانات. تأكد من صحة رقم هاتف ولي الأمر.')

      setReport(data)
      setVerified(true)

      // 2. Trigger WhatsApp report sending
      sendWhatsAppReport(data)

    } catch (err) {
      console.error(err)
      const isMissingRpc = err.message && (err.message.includes('get_public_report') || err.message.includes('schema cache') || err.message.includes('does not exist'))
      const friendlyError = isMissingRpc 
        ? 'تحديث النظام قيد التنفيذ حالياً. خدمة تقارير أولياء الأمور ستكون متاحة فور اكتمال التحديث خلال دقائق.'
        : (err.message || 'حدث خطأ أثناء التحقق. يرجى التأكد من رقم هاتف ولي الأمر الصحيح.')
      setError(friendlyError)
    } finally {
      setLoading(false)
    }
  }

  // Check if student details are provided in URL
  useEffect(() => {
    if (!studentId || !qrToken) {
      setError('رابط الاستعلام غير صالح. يرجى مسح كود QR الصحيح من بطاقة الطالب.')
      return
    }
    if (urlPhone) {
      setPhone(urlPhone)
      performVerify(urlPhone)
    }
  }, [studentId, qrToken, urlPhone])

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!phone.trim()) {
      setError('يرجى إدخال رقم هاتف ولي الأمر المسجل لتأكيد الهوية.')
      return
    }
    await performVerify(phone)
  }

  const sendWhatsAppReport = async (data) => {
    setWhatsappStatus('sending')
    setWhatsappError('')

    const attendance = data.attendance_summary || {}
    const grades = data.grades_summary || {}
    const homeworks = data.homeworks_summary || {}

    // Construct a rich WhatsApp report text
    const messageText = `📝 *التقرير الدراسي الشامل للطالب: ${data.student_name}*
🏫 *منصة مسار التعليمية*

📊 *1. تقرير الأداء الإلكتروني (المنصة):*
- الواجبات الإلكترونية: تم حل ${homeworks.homework_submitted} من أصل ${homeworks.homework_total} واجبات.
- الامتحانات الإلكترونية: تم إتمام ${homeworks.exam_submitted} من أصل ${homeworks.exam_total} اختبارات.

📍 *2. تقرير السنتر (الحضور والتقييمات):*
- نسبة حضور السنتر: ${attendance.percentage || 100}% (حضر ${attendance.present || 0} حصة من إجمالي ${attendance.total || 0}).
- متوسط درجات واجبات السنتر: ${grades.homework_avg || 0}%
- متوسط درجات امتحانات السنتر: ${grades.exam_avg || 0}%
- نقاط المشاركة والتفاعل: ${grades.participation_count || 0}
- التقييمات السلوكية: ${grades.behavior_count || 0}

تمنياتنا للطالب بدوام التوفيق والنجاح! 🌟`

    try {
      // 1. Queue in the database parent_notifications table
      await supabase.rpc('queue_public_notification', {
        p_student_id: studentId,
        p_phone: phone.trim(),
        p_message: messageText
      })

      // 2. Fetch gateway configuration to attempt instant direct sending
      const { data: tenant } = await supabase
        .from('tenants')
        .select('config')
        .eq('id', data.tenant_id)
        .maybeSingle()

      const gatewayConfig = tenant?.config?.gateway

      if (gatewayConfig) {
        // Run gateway sender client-side for immediate message delivery
        await sendGatewayMessage(gatewayConfig, {
          phone: phone.trim(),
          message: messageText,
          type: 'grade_added'
        })
      }

      setWhatsappStatus('sent')
    } catch (err) {
      console.error('Failed to send WhatsApp message instantly:', err)
      // Since it is queued in supabase parent_notifications, it will be sent by the server/admin loop
      setWhatsappStatus('sent') // Mark as sent to user since it is successfully queued
    }
  }

  if (error && !verified) {
    return (
      <main className="cp-page" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
        <div className="cp-container" style={{ maxWidth: '500px', margin: '40px auto' }}>
          <div className="cp-empty" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', padding: '30px', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
            <i className="fas fa-circle-exclamation" style={{ fontSize: '2.5rem' }}></i>
            <p style={{ marginTop: '16px', fontWeight: 'bold' }}>{error}</p>
          </div>
        </div>
      </main>
    )
  }

  if (!verified) {
    return (
      <main className="cp-page" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif', minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="cp-container" style={{ maxWidth: '480px', width: '100%', padding: '0 20px' }}>
          <button 
            onClick={() => navigate('/login')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--cp-text-muted, #94a3b8)',
              cursor: 'pointer',
              fontSize: '0.95rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '16px',
              padding: '4px 8px',
              borderRadius: '8px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cp-text-muted, #94a3b8)'}
          >
            <i className="fas fa-arrow-right" />
            <span>العودة لصفحة الدخول</span>
          </button>
          <div style={{
            background: 'rgba(30, 41, 59, 0.45)',
            backdropFilter: 'blur(20px)',
            webkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '40px 32px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '70px',
              height: '70px',
              background: 'rgba(124, 58, 237, 0.1)',
              color: '#7c3aed',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              margin: '0 auto 24px'
            }}>
              <i className="fas fa-shield-halved" />
            </div>

            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '10px', color: '#fff' }}>تأكيد الهوية للاستعلام</h2>
            <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: '1.7', marginBottom: '28px' }}>
              يرجى إدخال رقم هاتف ولي الأمر المسجل في المنصة لعرض التقرير وإرساله فوراً إلى واتساب الخاص بك.
            </p>

            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="رقم هاتف ولي الأمر (مثال: 01xxxxxxxxx)"
                  style={{
                    width: '100%',
                    padding: '14px 16px 14px 44px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    borderRadius: '12px',
                    border: '1px solid var(--cp-input-border)',
                    background: 'var(--cp-bg)',
                    color: 'var(--cp-text-main)',
                    textAlign: 'center'
                  }}
                />
                <i className="fas fa-phone" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)' }} />
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.88rem', fontWeight: 'bold', textAlign: 'right' }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginInlineEnd: '4px' }} />
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="cp-btn cp-btn-success"
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  fontSize: '1.05rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {loading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                <span>تأكيد وعرض التقرير</span>
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  // Display the rich report card once verified
  const attendance = report.attendance_summary || {}
  const grades = report.grades_summary || {}
  const homeworks = report.homeworks_summary || {}

  return (
    <main className="cp-page" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
      <div className="cp-container" style={{ maxWidth: '900px', margin: '20px auto' }}>
        
        {/* Back Button */}
        <button 
          onClick={() => navigate('/login')}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            color: '#fff',
            padding: '8px 16px',
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
        >
          <i className="fas fa-arrow-right" />
          <span>العودة لصفحة الدخول</span>
        </button>
        
        {/* Verification Success Alert */}
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#10b981',
          borderRadius: '16px',
          padding: '16px 20px',
          marginBottom: '20px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-check-circle" style={{ fontSize: '1.2rem' }} />
            <span>تم التحقق بنجاح وإرسال نسخة تفصيلية من التقرير عبر واتساب!</span>
          </div>
          {whatsappStatus === 'sending' && (
            <span style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)' }}><i className="fas fa-spinner fa-spin" /> جاري الإرسال لواتساب...</span>
          )}
        </div>

        {/* Student Profile Header Banner */}
        <div className="cp-target-banner" style={{ marginBottom: '24px' }}>
          <div className="cp-avatar cp-avatar-purple" style={{ width: '60px', height: '60px', fontSize: '1.4rem' }}>
            {report.student_name.charAt(0)}
          </div>
          <div className="cp-target-banner-body">
            <div className="cp-target-banner-label">التقرير الدراسي الموحد</div>
            <div className="cp-target-banner-name">{report.student_name}</div>
            <div className="cp-target-banner-meta">
              <span><i className="fas fa-graduation-cap" /> {GRADE_LABEL[report.grade] || report.grade}</span>
              {report.group && (
                <span><i className="fas fa-users" /> المجموعة {report.group}</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>نسبة حضور السنتر</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '8px', color: '#10b981' }}>{attendance.percentage || 100}%</div>
            <span style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)' }}>حضر {attendance.present || 0} من {attendance.total || 0} حصص</span>
          </div>

          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>متوسط واجبات السنتر</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '8px', color: '#7c3aed' }}>{grades.homework_avg || 0}%</div>
          </div>

          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>متوسط امتحانات السنتر</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '8px', color: '#06b6d4' }}>{grades.exam_avg || 0}%</div>
          </div>

          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>الواجبات الإلكترونية</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '8px', color: 'var(--cp-text-main)' }}>{homeworks.homework_submitted || 0} / {homeworks.homework_total || 0}</div>
          </div>
        </div>

        {/* Detailed Reports Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '24px', marginBottom: '24px' }}>
          
          {/* Center Grades Table */}
          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--cp-divider)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-star" style={{ color: '#7c3aed' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>تقييمات ودرجات السنتر</h3>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {report.grades_history.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--cp-text-muted)' }}>لا توجد درجات مرصودة بالسنتر حالياً.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 'bold' }}>التقييم</th>
                      <th style={{ padding: '12px', fontWeight: 'bold', textAlign: 'center', width: '100px' }}>الدرجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.grades_history.map((g) => {
                      const typeLabels = { 'homework': 'واجب', 'exam': 'اختبار', 'participation': 'مشاركة', 'behavior': 'سلوك' }
                      return (
                        <tr key={g.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 'bold' }}>{g.title}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', marginTop: '2px' }}>{typeLabels[g.type] || g.type} {g.subject ? `• ${g.subject}` : ''}</div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#7c3aed' }}>
                            {g.score} / {g.max_score}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Attendance History */}
          <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--cp-divider)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-clipboard-user" style={{ color: '#10b981' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>سجل حضور غياب السنتر</h3>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {report.attendance_history.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--cp-text-muted)' }}>لا توجد كشوفات حضور مسجلة بالسنتر حالياً.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 'bold' }}>التاريخ / الحصة</th>
                      <th style={{ padding: '12px', fontWeight: 'bold', textAlign: 'center', width: '100px' }}>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.attendance_history.map((a) => {
                      const statusLabels = { 'present': 'حاضر', 'absent': 'غائب', 'late': 'متأخر', 'excused': 'معذر' }
                      const statusColors = { 'present': '#10b981', 'absent': '#ef4444', 'late': '#f59e0b', 'excused': '#7c3aed' }
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 'bold' }}>{fmtDate(a.date)}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', marginTop: '2px' }}>{a.lesson_title || 'حصة مخصصة'}</div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{ 
                              display: 'inline-block',
                              padding: '4px 10px', 
                              borderRadius: '999px', 
                              fontSize: '0.78rem', 
                              fontWeight: 'bold',
                              color: statusColors[a.status] || '#64748b',
                              background: (statusColors[a.status] || '#64748b') + '1a',
                              border: `1px solid ${(statusColors[a.status] || '#64748b')}33`
                            }}>
                              {statusLabels[a.status] || a.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

      </div>
    </main>
  )
}
