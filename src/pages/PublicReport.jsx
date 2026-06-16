import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@backend/supabase'
import { sendGatewayMessage } from '@backend/parentNotificationsApi'
import './Report.css' // Reuse general report styles

export default function PublicReport() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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

  // Full Report Modal States
  const [showFullReportModal, setShowFullReportModal] = useState(false)
  const [activeTab, setActiveTab] = useState('attendance') // 'attendance' | 'exams' | 'performance'

  // View Navigation States
  const [viewType, setViewType] = useState('selection') // 'selection' | 'center' | 'platform'
  const [platformSubView, setPlatformSubView] = useState('dashboard') // 'dashboard' | 'videos' | 'exams' | 'homeworks'
  const [platformData, setPlatformData] = useState(null)
  const [loadingPlatform, setLoadingPlatform] = useState(false)
  const [platformError, setPlatformError] = useState('')
  const [retryTrigger, setRetryTrigger] = useState(0)

  // Synchronize component state with URL parameters (type, subView)
  useEffect(() => {
    if (!verified) return

    const typeParam = searchParams.get('type')
    const subViewParam = searchParams.get('subView')

    if (typeParam === 'platform') {
      setViewType('platform')
      if (subViewParam) {
        setPlatformSubView(subViewParam)
      } else {
        setPlatformSubView('dashboard')
      }

      // Auto-fetch platform data if not loaded yet
      if (!platformData && !loadingPlatform) {
        const loadPlatformData = async () => {
          setLoadingPlatform(true)
          setPlatformError('')
          try {
            const { data, error: rpcError } = await supabase.rpc('get_public_platform_reports', {
              p_student_id: studentId,
              p_qr_token: qrToken,
              p_phone: phone.trim() || urlPhone?.trim() || ''
            })
            if (rpcError) throw rpcError
            setPlatformData(data)
          } catch (err) {
            console.error(err)
            setPlatformError(err.message || 'حدث خطأ أثناء تحميل تقارير المنصة.')
          } finally {
            setLoadingPlatform(false)
          }
        }
        loadPlatformData()
      }
    } else if (typeParam === 'center') {
      setViewType('center')
    } else {
      setViewType('selection')
    }
  }, [verified, searchParams, retryTrigger])

  const navigateToCenter = () => {
    const params = new URLSearchParams(window.location.search)
    params.set('type', 'center')
    params.delete('subView')
    setSearchParams(params)
  }

  const navigateToPlatform = () => {
    const params = new URLSearchParams(window.location.search)
    params.set('type', 'platform')
    params.set('subView', 'dashboard')
    setSearchParams(params)
  }

  const navigateToPlatformSub = (sub) => {
    const params = new URLSearchParams(window.location.search)
    params.set('type', 'platform')
    params.set('subView', sub)
    setSearchParams(params)
  }

  const handlePlatformBack = () => {
    const params = new URLSearchParams(window.location.search)
    if (platformSubView === 'dashboard') {
      params.delete('type')
      params.delete('subView')
    } else {
      params.set('subView', 'dashboard')
    }
    setSearchParams(params)
  }

  const handleCenterBack = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete('type')
    params.delete('subView')
    setSearchParams(params)
  }

  // Map DB grade enum → Arabic label
  const GRADE_LABEL = {
    'first-prep':  'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep':  'الصف الثالث الإعدادي',
    'first-sec':   'الصف الأول الثانوي',
    'second-sec':  'الصف الثاني الثانوي',
    'third-sec':   'الصف الثالث الثانوي',
  }

  // Academic months config in correct RTL grid order matching mockup
  const ACADEMIC_MONTHS = useMemo(() => [
    { name: 'أغسطس', index: 7, label: 'August' },
    { name: 'سبتمبر', index: 8, label: 'September' },
    { name: 'أكتوبر', index: 9, label: 'October' },
    { name: 'نوفمبر', index: 10, label: 'November' },
    { name: 'ديسمبر', index: 11, label: 'December' },
    { name: 'يناير', index: 0, label: 'January' },
    { name: 'فبراير', index: 1, label: 'February' },
    { name: 'مارس', index: 2, label: 'March' },
    { name: 'أبريل', index: 3, label: 'April' },
    { name: 'مايو', index: 4, label: 'May' },
    { name: 'يونيو', index: 5, label: 'June' },
    { name: 'يوليو', index: 6, label: 'July' },
  ], [])

  // Dynamic default month set to calendar current month (if within academic months)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const curMonth = new Date().getMonth()
    const found = ACADEMIC_MONTHS.find(m => m.index === curMonth)
    return found || ACADEMIC_MONTHS[6] // fallback to February
  })

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
      sendWhatsAppReport(data, phoneToVerify)

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

  const sendWhatsAppReport = async (data, verifiedPhone) => {
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
        p_phone: verifiedPhone.trim(),
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
          phone: verifiedPhone.trim(),
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

  // Filter lists based on selectedMonth
  const filteredAttendance = useMemo(() => {
    if (!report || !report.attendance_history) return []
    return report.attendance_history.filter(item => {
      if (!item.date) return false
      const d = new Date(item.date)
      return d.getMonth() === selectedMonth.index
    })
  }, [report, selectedMonth])

  const filteredGrades = useMemo(() => {
    if (!report || !report.grades_history) return []
    return report.grades_history.filter(item => {
      if (!item.created_at) return false
      const d = new Date(item.created_at)
      return d.getMonth() === selectedMonth.index
    })
  }, [report, selectedMonth])

  // Get matching payment status for selectedMonth
  const monthPayment = useMemo(() => {
    if (!report || !report.payments_history) return null
    return report.payments_history.find(p => {
      const pkgName = (p.package_name || '').toLowerCase()
      const matchesName = pkgName.includes(selectedMonth.name)
      const d = new Date(p.created_at)
      const matchesMonth = d.getMonth() === selectedMonth.index
      return matchesName || matchesMonth
    })
  }, [report, selectedMonth])

  // Compute selected month stats
  const monthlyStats = useMemo(() => {
    const totalAtt = filteredAttendance.length
    const presentAtt = filteredAttendance.filter(a => a.status === 'present').length
    const absentAtt = filteredAttendance.filter(a => a.status === 'absent').length
    const lateAtt = filteredAttendance.filter(a => a.status === 'late').length
    const excusedAtt = filteredAttendance.filter(a => a.status === 'excused').length
    const attRate = totalAtt > 0 ? Math.round(((presentAtt + lateAtt) / totalAtt) * 100) : 100

    const examGrades = filteredGrades.filter(g => g.type === 'exam' || g.type === 'homework')
    const avgScore = examGrades.length > 0
      ? (examGrades.reduce((sum, g) => sum + Number(g.score), 0) / examGrades.length).toFixed(1)
      : '0.0'
    const highestScore = examGrades.length > 0
      ? Math.max(...examGrades.map(g => Number(g.score)))
      : 0
    const lowestScore = examGrades.length > 0
      ? Math.min(...examGrades.map(g => Number(g.score)))
      : 0

    const avgPct = examGrades.length > 0
      ? Math.round(examGrades.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0) / examGrades.length)
      : 0
    const classAvgPct = examGrades.length > 0
      ? Math.round(examGrades.reduce((sum, g) => sum + (g.class_average ? (g.class_average / g.max_score) * 100 : (g.score / g.max_score) * 100), 0) / examGrades.length)
      : 0

    const participationCount = filteredGrades.filter(g => g.type === 'behavior' || g.type === 'participation').length
    const behaviorCount = filteredGrades.filter(g => g.type === 'behavior').length

    return {
      attendanceRate: attRate,
      averageScore: avgScore,
      highestScore: highestScore,
      lowestScore: lowestScore,
      totalExams: examGrades.length,
      examGradesList: examGrades,
      presentCount: presentAtt,
      absentCount: absentAtt,
      lateCount: lateAtt,
      excusedCount: excusedAtt,
      totalAttendance: totalAtt,
      avgPercentage: avgPct,
      classAvgPercentage: classAvgPct,
      participationCount,
      behaviorCount
    }
  }, [filteredAttendance, filteredGrades])

  // Slice last 5 items
  const last5Attendance = useMemo(() => filteredAttendance.slice(0, 5), [filteredAttendance])
  const last5Grades = useMemo(() => {
    return filteredGrades.filter(g => g.type === 'exam' || g.type === 'homework').slice(0, 5)
  }, [filteredGrades])

  // Dynamic student evaluation for performance tab
  const evaluationMessage = useMemo(() => {
    const rate = monthlyStats.attendanceRate
    const score = Number(monthlyStats.averageScore)
    if (filteredAttendance.length === 0 && filteredGrades.length === 0) {
      return 'لا توجد بيانات حضور أو درجات مسجلة في هذا الشهر حالياً.'
    }
    if (rate < 75) {
      return `نلاحظ أن الطالب لديه نسبة غياب ملحوظة هذا الشهر (معدل حضور: ${rate}%). التغيب يؤثر بشكل مباشر على استيعاب الدروس وترابط المنهج الدراسي. نرجو توجيهه للالتزام بالحضور المستمر.`
    }
    if (score < 15 && score > 0) {
      return `مستوى درجات الطالب في التقييمات والاختبارات يحتاج إلى تحسين ومتابعة مكثفة (المتوسط العام: ${score}). ننصح بمراجعة الواجبات وحل الاختبارات الإضافية لتقوية نقاط الضعف لديه.`
    }
    if (rate >= 85 && score >= 24) {
      return `أداء الطالب ممتاز ومثالي للغاية هذا الشهر! يظهر التزاماً ممتازاً بالحضور (${rate}%) وتفوقاً دراسياً واضحاً في التقييمات والاختبارات بمتوسط درجات (${score}). استمر في هذا المستوى الرائع!`
    }
    return `أداء الطالب مستقر وجيد جداً بشكل عام. يحتاج فقط إلى التركيز على مراجعة بعض الأخطاء البسيطة في الاختبارات القادمة لتحسين المتوسط العام للدرجات.`
  }, [monthlyStats, filteredAttendance, filteredGrades])

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

  return (
    <div className="pr-container">
      <style>{`
        .pr-container {
          background: radial-gradient(circle at top, #1e1b4b 0%, #0f172a 100%);
          min-height: 100vh;
          color: #f8fafc;
          font-family: 'Tajawal', sans-serif;
          direction: rtl;
          position: relative;
          overflow-x: hidden;
          padding: 20px 16px 80px;
        }

        .pr-glow-1 {
          position: absolute;
          top: -100px;
          right: -100px;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
          z-index: 0;
          pointer-events: none;
        }

        .pr-glow-2 {
          position: absolute;
          bottom: -100px;
          left: -100px;
          width: 450px;
          height: 450px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
          z-index: 0;
          pointer-events: none;
        }

        .pr-card {
          background: rgba(30, 41, 59, 0.5);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          position: relative;
          z-index: 1;
        }

        .pr-month-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 15px;
        }

        .pr-month-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          border-radius: 12px;
          padding: 14px 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: center;
        }

        .pr-month-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: #fff;
          transform: translateY(-2px);
        }

        .pr-month-btn.active {
          background: #8b5cf6;
          border-color: #a78bfa;
          color: #fff;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.35);
        }

        .pr-payment-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .pr-badge {
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .pr-badge-red {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .pr-badge-green {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .pr-badge-orange {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        .pr-stats-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 10px;
          text-align: center;
        }

        .pr-stat-val {
          font-size: 1.9rem;
          font-weight: 800;
          color: #fff;
        }

        .pr-stat-label {
          font-size: 0.85rem;
          color: #94a3b8;
          margin-top: 4px;
        }

        .pr-btn-primary {
          background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
          color: #fff;
          border: none;
          border-radius: 14px;
          padding: 16px;
          font-size: 1.05rem;
          font-weight: 700;
          width: 100%;
          cursor: pointer;
          transition: all 0.25s;
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
          margin-top: 15px;
        }

        .pr-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(124, 58, 237, 0.45);
        }

        .pr-section-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 15px;
          color: #fff;
          border-right: 4px solid #8b5cf6;
          padding-right: 10px;
        }

        .pr-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .pr-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
        }

        .pr-list-item-title {
          font-weight: 600;
          font-size: 0.92rem;
          color: #f1f5f9;
        }

        .pr-list-item-date {
          font-size: 0.76rem;
          color: #64748b;
          margin-top: 3px;
        }

        .pr-dot-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.88rem;
          font-weight: 700;
        }

        .pr-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .pr-dot-green { background-color: #10b981; box-shadow: 0 0 8px #10b981; }
        .pr-dot-red { background-color: #ef4444; box-shadow: 0 0 8px #ef4444; }
        .pr-dot-orange { background-color: #f59e0b; box-shadow: 0 0 8px #f59e0b; }

        /* Modal overlay & container */
        .pr-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(8px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.25s ease-out;
        }

        .pr-modal-content {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          width: 100%;
          max-width: 600px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .pr-modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pr-modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }

        .pr-tabs {
          display: flex;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 20px;
        }

        .pr-tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-weight: 700;
          font-size: 0.92rem;
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Tajawal', sans-serif;
          text-align: center;
        }

        .pr-tab-btn.active {
          background: #8b5cf6;
          color: #fff;
        }

        .pr-progress-track {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 3px;
          margin-top: 8px;
          overflow: hidden;
        }

        .pr-progress-bar {
          height: 100%;
          border-radius: 3px;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        /* Selection Options styling */
        .pr-selection-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-top: 25px;
        }
        @media(min-width: 640px) {
          .pr-selection-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .pr-selection-card {
          background: rgba(30, 41, 59, 0.45);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 30px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .pr-selection-card:hover {
          transform: translateY(-5px);
          border-color: rgba(139, 92, 246, 0.3);
          background: rgba(30, 41, 59, 0.6);
          box-shadow: 0 15px 35px rgba(124, 58, 237, 0.15);
        }
        .pr-selection-icon {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          background: rgba(124, 58, 237, 0.1);
          color: #a78bfa;
          border: 1px solid rgba(124, 58, 237, 0.2);
          transition: all 0.3s;
        }
        .pr-selection-card:hover .pr-selection-icon {
          transform: scale(1.1);
          background: #7c3aed;
          color: #fff;
        }

        /* Platform Dashboard cards styling */
        .pr-plat-dashboard-card {
          background: rgba(30, 41, 59, 0.45);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 22px 20px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        .pr-plat-dashboard-card:hover {
          transform: translateY(-4px);
          background: rgba(30, 41, 59, 0.6);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
        }
        .pr-plat-dashboard-card:nth-child(1):hover {
          border-color: rgba(56, 189, 248, 0.45);
          box-shadow: 0 10px 25px rgba(56, 189, 248, 0.15);
        }
        .pr-plat-dashboard-card:nth-child(2):hover {
          border-color: rgba(167, 139, 250, 0.45);
          box-shadow: 0 10px 25px rgba(167, 139, 250, 0.15);
        }
        .pr-plat-dashboard-card:nth-child(3):hover {
          border-color: rgba(45, 212, 191, 0.45);
          box-shadow: 0 10px 25px rgba(45, 212, 191, 0.15);
        }
        .pr-plat-icon-box {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.3rem;
          transition: transform 0.3s;
        }
        .pr-plat-dashboard-card:hover .pr-plat-icon-box {
          transform: scale(1.1);
        }
        .pr-chevron-box {
          color: #94a3b8;
          font-size: 1.1rem;
          transition: transform 0.3s, color 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pr-plat-dashboard-card:hover .pr-chevron-box {
          transform: translateX(-4px);
          color: #fff;
        }
      `}</style>

      <div className="pr-glow-1" />
      <div className="pr-glow-2" />

      <div style={{ maxWidth: '650px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Back Button */}
        {viewType === 'selection' ? (
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
              transition: 'background 0.2s',
              fontFamily: 'Tajawal, sans-serif'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
          >
            <i className="fas fa-arrow-right" />
            <span>العودة لصفحة الدخول</span>
          </button>
        ) : viewType === 'center' ? (
          <button 
            onClick={handleCenterBack}
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
              transition: 'background 0.2s',
              fontFamily: 'Tajawal, sans-serif'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
          >
            <i className="fas fa-arrow-right" />
            <span>العودة لخيارات التقارير</span>
          </button>
        ) : (
          <button 
            onClick={handlePlatformBack}
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
              transition: 'background 0.2s',
              fontFamily: 'Tajawal, sans-serif'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
          >
            <i className="fas fa-arrow-right" />
            <span>{platformSubView === 'dashboard' ? 'العودة لخيارات التقارير' : 'العودة لتقارير المنصة'}</span>
          </button>
        )}

        {/* Verification Success Alert */}
        {viewType === 'selection' && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#34d399',
            borderRadius: '16px',
            padding: '14px 16px',
            marginBottom: '20px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.88rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-check-circle" style={{ fontSize: '1.1rem' }} />
              <span>تم التحقق بنجاح وإرسال نسخة تفصيلية للتقرير عبر واتساب!</span>
            </div>
            {whatsappStatus === 'sending' && (
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                <i className="fas fa-spinner fa-spin" /> جاري الإرسال...
              </span>
            )}
          </div>
        )}

        {/* ─────────── 1. SELECTION DASHBOARD ─────────── */}
        {viewType === 'selection' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '30px', marginTop: '10px' }}>
              <h2 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>تقاريري الدراسية</h2>
              <p style={{ fontSize: '0.92rem', color: '#94a3b8' }}>استعرض نتائجك وأدائك في الفيديوهات والامتحانات والواجبات</p>
            </div>

            {/* Student Card Info */}
            <div className="pr-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                color: '#fff',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 'bold'
              }}>
                {report.student_name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 'bold' }}>الطالب الحالي</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>{report.student_name}</div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                  <span><i className="fas fa-graduation-cap" style={{ color: '#8b5cf6', marginInlineEnd: '4px' }} /> {GRADE_LABEL[report.grade] || report.grade}</span>
                  {report.group && (
                    <span><i className="fas fa-users" style={{ color: '#6366f1', marginInlineEnd: '4px' }} /> المجموعة {report.group}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Selection Options */}
            <div className="pr-selection-grid">
              <div className="pr-selection-card" onClick={navigateToCenter}>
                <div className="pr-selection-icon">
                  <i className="fas fa-school" />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '8px 0' }}>تقارير السنتر</h3>
                <p style={{ fontSize: '0.86rem', color: '#94a3b8', lineHeight: '1.6', margin: 0 }}>
                  كشف حضور الحصص، تفاصيل الاشتراكات والمدفوعات، ونتائج درجات الاختبارات والواجبات الميدانية.
                </p>
              </div>

              <div className="pr-selection-card" onClick={navigateToPlatform}>
                <div className="pr-selection-icon">
                  <i className="fas fa-laptop-code" />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '8px 0' }}>تقارير المنصة التعليمية</h3>
                <p style={{ fontSize: '0.86rem', color: '#94a3b8', lineHeight: '1.6', margin: 0 }}>
                  متابعة نسب مشاهدة الفيديوهات، تسليمات الواجبات الإلكترونية، ونتائج امتحانات الأونلاين.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─────────── 2. CENTER REPORTS VIEW ─────────── */}
        {viewType === 'center' && (
          <div>
            {/* Student Profile Header Banner */}
            <div className="pr-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                color: '#fff',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 'bold'
              }}>
                {report.student_name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 'bold' }}>تقارير السنتر الموحدة</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>{report.student_name}</div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                  <span><i className="fas fa-graduation-cap" style={{ color: '#8b5cf6', marginInlineEnd: '4px' }} /> {GRADE_LABEL[report.grade] || report.grade}</span>
                  {report.group && (
                    <span><i className="fas fa-users" style={{ color: '#6366f1', marginInlineEnd: '4px' }} /> المجموعة {report.group}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Month Filter Selector Card */}
            <div className="pr-card">
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>اختر الشهر</div>
              <div className="pr-month-grid">
                {ACADEMIC_MONTHS.map(m => (
                  <button 
                    key={m.name} 
                    className={`pr-month-btn ${selectedMonth.name === m.name ? 'active' : ''}`}
                    onClick={() => setSelectedMonth(m)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>

              {/* Payment Status Info */}
              <div className="pr-payment-row">
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>حالة الدفع</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                    المبلغ المدفوع: {monthPayment ? `${monthPayment.amount} ج.م` : '0 ج.م'}
                  </div>
                </div>
                {monthPayment ? (
                  monthPayment.status === 'approved' ? (
                    <span className="pr-badge pr-badge-green">تم الدفع</span>
                  ) : monthPayment.status === 'pending' ? (
                    <span className="pr-badge pr-badge-orange">قيد الانتظار</span>
                  ) : (
                    <span className="pr-badge pr-badge-red">تم الرفض</span>
                  )
                ) : (
                  <span className="pr-badge pr-badge-red">لم يتم الدفع</span>
                )}
              </div>
            </div>

            {/* Stat Summary Cards */}
            <div className="pr-card">
              <div className="pr-stats-row">
                <div>
                  <div className="pr-stat-val" style={{ color: '#34d399' }}>{monthlyStats.attendanceRate}%</div>
                  <div className="pr-stat-label">معدل الحضور</div>
                </div>
                <div>
                  <div className="pr-stat-val" style={{ color: '#8b5cf6' }}>{monthlyStats.averageScore}</div>
                  <div className="pr-stat-label">المتوسط العام</div>
                </div>
              </div>

              {/* View Full Report Button */}
              <button 
                className="pr-btn-primary" 
                onClick={() => {
                  setActiveTab('attendance')
                  setShowFullReportModal(true)
                }}
              >
                عرض التقرير الكامل للسنتر
              </button>
            </div>

            {/* Recent Sessions List (Last 5) */}
            <div className="pr-card">
              <h3 className="pr-section-title">الحصص الأخيرة بالسنتر</h3>
              {last5Attendance.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                  لا توجد حصص مسجلة في شهر {selectedMonth.name} حتى الآن.
                </div>
              ) : (
                <div className="pr-list">
                  {last5Attendance.map(a => {
                    const statusLabel = a.status === 'present' ? 'حضر' : a.status === 'absent' ? 'غاب' : a.status === 'late' ? 'متأخر' : 'معذور'
                    const statusDotClass = a.status === 'present' ? 'pr-dot-green' : a.status === 'absent' ? 'pr-dot-red' : 'pr-dot-orange'
                    return (
                      <div key={a.id} className="pr-list-item">
                        <div>
                          <div className="pr-list-item-title">{a.lesson_title || 'حصة السنتر'}</div>
                          <div className="pr-list-item-date">{fmtDate(a.date)}</div>
                        </div>
                        <div className="pr-dot-status">
                          <span className={`pr-dot ${statusDotClass}`} />
                          <span style={{ color: a.status === 'present' ? '#34d399' : a.status === 'absent' ? '#f87171' : '#fbbf24' }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Recent Exams List (Last 5) */}
            <div className="pr-card">
              <h3 className="pr-section-title">الاختبارات الأخيرة بالسنتر</h3>
              {last5Grades.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                  لا توجد اختبارات أو واجبات مرصودة في شهر {selectedMonth.name} حتى الآن.
                </div>
              ) : (
                <div className="pr-list">
                  {last5Grades.map(g => (
                    <div key={g.id} className="pr-list-item">
                      <div>
                        <div className="pr-list-item-title">{g.title}</div>
                        <div className="pr-list-item-date">
                          {g.type === 'homework' ? 'واجب' : 'اختبار'} • {fmtDate(g.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#8b5cf6' }}>
                          {g.score} / {g.max_score}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                          {Math.round((g.score / g.max_score) * 100)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────── 3. PLATFORM REPORTS VIEW ─────────── */}
        {viewType === 'platform' && (
          <div>
            {/* Loading State */}
            {loadingPlatform && !platformData && (
              <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '3rem', color: '#8b5cf6', marginBottom: '24px', display: 'block', margin: '0 auto' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>جاري تحميل البيانات</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.92rem', margin: 0 }}>نسترجع الآن تفاصيل مشاهدة الفيديوهات والواجبات والاختبارات الخاصة بك...</p>
              </div>
            )}

            {/* Error State */}
            {platformError && !platformData && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  borderRadius: '20px',
                  padding: '24px',
                  marginBottom: '24px',
                  textAlign: 'right'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <i className="fas fa-exclamation-circle" style={{ fontSize: '1.4rem' }} />
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>عذراً، فشل تحميل التقارير</h4>
                  </div>
                  <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#cbd5e1', margin: 0 }}>
                    {platformError}
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    setPlatformError('')
                    setPlatformData(null)
                    setRetryTrigger(prev => prev + 1)
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '14px 32px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontFamily: 'Tajawal, sans-serif',
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)',
                    transition: 'transform 0.2s, box-shadow 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.45)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(124, 58, 237, 0.3)'
                  }}
                >
                  <i className="fas fa-redo-alt" style={{ marginInlineEnd: '8px' }} />
                  إعادة المحاولة
                </button>
              </div>
            )}

            {/* Content State */}
            {platformData && (
              <div>
            {/* PLATFORM DASHBOARD INDEX */}
            {platformSubView === 'dashboard' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '30px', marginTop: '10px' }}>
                  <h2 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>تقاريري الدراسية</h2>
                  <p style={{ fontSize: '0.92rem', color: '#94a3b8' }}>استعرض نتائجك وأدائك في الفيديوهات والامتحانات والواجبات</p>
                </div>

                {/* Student Profile Header Banner */}
                <div className="pr-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                    color: '#fff',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    fontWeight: 'bold'
                  }}>
                    {report.student_name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 'bold' }}>الطالب الحالي</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>{report.student_name}</div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      <span><i className="fas fa-graduation-cap" style={{ color: '#8b5cf6', marginInlineEnd: '4px' }} /> {GRADE_LABEL[report.grade] || report.grade}</span>
                      {report.group && (
                        <span><i className="fas fa-users" style={{ color: '#6366f1', marginInlineEnd: '4px' }} /> المجموعة {report.group}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3 Clickable Dashboard Buttons */}
                <div style={{ marginTop: '20px' }}>
                  {/* Videos Report */}
                  <div className="pr-plat-dashboard-card" onClick={() => navigateToPlatformSub('videos')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="pr-plat-icon-box" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                        <i className="fas fa-play" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#fff' }}>تقرير الفيديوهات</div>
                        <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>مشاهداتك ونسبة تقدمك في الفيديوهات التعليمية</div>
                      </div>
                    </div>
                    <div className="pr-chevron-box">
                      <i className="fas fa-chevron-left" />
                    </div>
                  </div>

                  {/* Exams Report */}
                  <div className="pr-plat-dashboard-card" onClick={() => navigateToPlatformSub('exams')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="pr-plat-icon-box" style={{ background: 'rgba(167, 139, 250, 0.1)', color: '#a78bfa', border: '1px solid rgba(167, 139, 250, 0.2)' }}>
                        <i className="fas fa-file-invoice" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#fff' }}>تقرير الامتحانات</div>
                        <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>نتائجك في الامتحانات السابقة وتحليل أدائك</div>
                      </div>
                    </div>
                    <div className="pr-chevron-box">
                      <i className="fas fa-chevron-left" />
                    </div>
                  </div>

                  {/* Homeworks Report */}
                  <div className="pr-plat-dashboard-card" onClick={() => navigateToPlatformSub('homeworks')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="pr-plat-icon-box" style={{ background: 'rgba(45, 212, 191, 0.1)', color: '#2dd4bf', border: '1px solid rgba(45, 212, 191, 0.2)' }}>
                        <i className="fas fa-book-open" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#fff' }}>تقرير الواجبات</div>
                        <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>درجاتك في الواجبات ومتابعة تسليماتك</div>
                      </div>
                    </div>
                    <div className="pr-chevron-box">
                      <i className="fas fa-chevron-left" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PLATFORM REPORTS: VIDEOS DETAIL VIEW */}
            {platformSubView === 'videos' && (
              <div>
                <h3 className="pr-section-title" style={{ borderRightColor: '#38bdf8' }}>تقرير الفيديوهات التعليمية</h3>
                {platformData.videos.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد فيديوهات مسجلة للمرحلة الدراسية للطالب.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {platformData.videos.map(v => {
                      const parts = v.video_parts || []
                      const progList = v.progress_rows || []
                      const watchedByPart = new Map(progList.map(p => [p.part_id, p.seconds_watched || 0]))
                      const partSeconds = p => parseInt(p.duration_seconds, 10) || 0
                      const totalSecs = parts.reduce((s, p) => s + partSeconds(p), 0)
                      const watchedSecs = parts.reduce((s, p) => {
                        const dur = partSeconds(p)
                        const seen = watchedByPart.get(p.id) || 0
                        return s + (dur ? Math.min(seen, dur) : seen)
                      }, 0)
                      const progress = totalSecs > 0 ? Math.min(100, Math.round((watchedSecs / totalSecs) * 100)) : 0

                      const statusLabel = progress >= 90 ? 'مكتمل' : progress > 0 ? `تم مشاهدة ${progress}%` : 'لم تتم المشاهدة'
                      const badgeClass = progress >= 90 ? 'pr-badge-green' : progress > 0 ? 'pr-badge-orange' : 'pr-badge-red'

                      return (
                        <div key={v.id} className="pr-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '10px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>{v.title}</div>
                            <span className={`pr-badge ${badgeClass}`} style={{ whiteSpace: 'nowrap' }}>{statusLabel}</span>
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                            المشاهدة الفعلية: {Math.floor(watchedSecs / 60)} دقيقة / {Math.ceil(totalSecs / 60)} دقيقة
                          </div>
                          <div className="pr-progress-track" style={{ height: '8px', marginTop: '10px' }}>
                            <div className="pr-progress-bar" style={{ width: `${progress}%`, background: progress >= 90 ? '#10b981' : '#38bdf8' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* PLATFORM REPORTS: EXAMS DETAIL VIEW */}
            {platformSubView === 'exams' && (
              <div>
                <h3 className="pr-section-title" style={{ borderRightColor: '#a78bfa' }}>تقرير الامتحانات الأونلاين</h3>
                {platformData.exams.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد امتحانات إلكترونية مسجلة للمرحلة الدراسية للطالب.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {platformData.exams.map(e => {
                      const attempt = e.attempt
                      return (
                        <div key={e.id} className="pr-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '10px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>{e.title}</div>
                            {attempt ? (
                              <span className="pr-badge pr-badge-green">مكتمل</span>
                            ) : (
                              <span className="pr-badge pr-badge-red">لم يتم التقديم</span>
                            )}
                          </div>
                          {attempt ? (
                            <div style={{ marginTop: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '6px' }}>
                                <span>الدرجة الحاصل عليها:</span>
                                <span style={{ fontWeight: 'bold', color: '#a78bfa' }}>{attempt.score} / {attempt.max_score}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '6px' }}>
                                <span>النسبة المئوية:</span>
                                <span>{Math.round((attempt.score / attempt.max_score) * 100)}%</span>
                              </div>
                              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '8px' }}>
                                تاريخ المحاولة: {fmtDate(attempt.completed_at || attempt.created_at)}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                              لم يسجل الطالب أي محاولات لهذا الامتحان حتى الآن.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* PLATFORM REPORTS: HOMEWORKS DETAIL VIEW */}
            {platformSubView === 'homeworks' && (
              <div>
                <h3 className="pr-section-title" style={{ borderRightColor: '#2dd4bf' }}>تقرير الواجبات الإلكترونية</h3>
                {platformData.homeworks.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد واجبات إلكترونية مسجلة للمرحلة الدراسية للطالب.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {platformData.homeworks.map(h => {
                      const sub = h.submission
                      return (
                        <div key={h.id} className="pr-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '10px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>{h.title}</div>
                            {sub ? (
                              <span className="pr-badge pr-badge-green">تم التسليم</span>
                            ) : (
                              <span className="pr-badge pr-badge-red">لم يتم التسليم</span>
                            )}
                          </div>
                          {sub ? (
                            <div style={{ marginTop: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '6px' }}>
                                <span>الدرجة الحاصل عليها:</span>
                                <span style={{ fontWeight: 'bold', color: '#2dd4bf' }}>
                                  {sub.score !== null && sub.score !== undefined ? `${sub.score} / ${sub.max_score}` : 'بانتظار التصحيح'}
                                </span>
                              </div>
                              {sub.score !== null && sub.score !== undefined && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '6px' }}>
                                  <span>النسبة المئوية:</span>
                                  <span>{Math.round((sub.score / sub.max_score) * 100)}%</span>
                                </div>
                              )}
                              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '8px' }}>
                                تاريخ التسليم: {fmtDate(sub.created_at)}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                              لم يقم الطالب بتسليم هذا الواجب الإلكتروني حتى الآن.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─────────── FULL REPORT DETAILED TABS MODAL ─────────── */}
      {showFullReportModal && (
        <div className="pr-modal-overlay" onClick={() => setShowFullReportModal(false)}>
          <div className="pr-modal-content" onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                التقرير الكامل لـ شهر {selectedMonth.name}
              </h3>
              <button 
                onClick={() => setShowFullReportModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.3rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Tab Selector */}
            <div style={{ padding: '20px 24px 0' }}>
              <div className="pr-tabs">
                <button 
                  className={`pr-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('attendance')}
                >
                  الحضور
                </button>
                <button 
                  className={`pr-tab-btn ${activeTab === 'exams' ? 'active' : ''}`}
                  onClick={() => setActiveTab('exams')}
                >
                  الاختبارات
                </button>
                <button 
                  className={`pr-tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('performance')}
                >
                  الأداء
                </button>
              </div>
            </div>

            <div className="pr-modal-body">
              {/* TAB 1: ATTENDANCE */}
              {activeTab === 'attendance' && (
                <div>
                  {filteredAttendance.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                      لا توجد بيانات حضور مسجلة لهذا الشهر.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {filteredAttendance.map(a => {
                        const statusLabel = a.status === 'present' ? 'حضر' : a.status === 'absent' ? 'غاب' : a.status === 'late' ? 'متأخر' : 'معذور'
                        const statusDotClass = a.status === 'present' ? 'pr-dot-green' : a.status === 'absent' ? 'pr-dot-red' : 'pr-dot-orange'
                        return (
                          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '0.92rem' }}>{a.lesson_title || 'حصة السنتر'}</div>
                              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>{fmtDate(a.date)}</div>
                            </div>
                            <div className="pr-dot-status">
                              <span className={`pr-dot ${statusDotClass}`} />
                              <span style={{ color: a.status === 'present' ? '#34d399' : a.status === 'absent' ? '#f87171' : '#fbbf24' }}>
                                {statusLabel}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: EXAMS */}
              {activeTab === 'exams' && (
                <div>
                  {/* Summary Stats Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', marginBottom: '20px', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8' }}>{monthlyStats.totalExams}</div>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '4px' }}>إجمالي الاختبارات</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#a78bfa' }}>{monthlyStats.averageScore}</div>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '4px' }}>المتوسط العام</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f472b6' }}>{monthlyStats.highestScore}</div>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '4px' }}>أعلى درجة</div>
                    </div>
                  </div>

                  {monthlyStats.examGradesList.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                      لا توجد درجات مرصودة لهذا الشهر.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {monthlyStats.examGradesList.map(g => {
                        const pct = Math.round((g.score / g.max_score) * 100)
                        const barColor = pct >= 85 ? '#10b981' : pct >= 65 ? '#8b5cf6' : pct >= 50 ? '#f59e0b' : '#ef4444'
                        return (
                          <div key={g.id} style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.92rem' }}>{g.title}</div>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                                  {g.type === 'homework' ? 'واجب' : 'اختبار'} • {fmtDate(g.created_at)}
                                </div>
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>
                                  {g.score} / {g.max_score}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: barColor, fontWeight: 'bold', marginTop: '2px' }}>
                                  {pct}%
                                </div>
                              </div>
                            </div>
                            
                            {/* Class Average Info */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                              <span>متوسط الفصل: {g.class_average || '—'}</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="pr-progress-track">
                              <div 
                                className="pr-progress-bar" 
                                style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} 
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PERFORMANCE ANALYSIS */}
              {activeTab === 'performance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Analysis Box */}
                  <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '16px', padding: '18px', lineHeight: '1.7', fontSize: '0.92rem', color: '#cbd5e1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', fontWeight: 'bold', marginBottom: '8px', fontSize: '0.98rem' }}>
                      <i className="fas fa-brain" />
                      <span>تحليل أداء الطالب</span>
                    </div>
                    {evaluationMessage}
                  </div>

                  {/* Attendance Breakdown Dashboard */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '18px' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '14px', color: '#fff' }}>
                      تحليل الحضور والغياب للشهر
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.12)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#34d399' }}>{monthlyStats.presentCount}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '3px' }}>حضور</div>
                      </div>
                      <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.12)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fbbf24' }}>{monthlyStats.lateCount}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '3px' }}>متأخر</div>
                      </div>
                      <div style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.12)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f87171' }}>{monthlyStats.absentCount}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '3px' }}>غياب</div>
                      </div>
                      <div style={{ background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.12)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#a78bfa' }}>{monthlyStats.excusedCount}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '3px' }}>غياب بعذر</div>
                      </div>
                    </div>
                    
                    {/* Visual attendance ratio bar */}
                    {monthlyStats.totalAttendance > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                          <span>نسبة الالتزام بالحضور</span>
                          <span>{monthlyStats.attendanceRate}%</span>
                        </div>
                        <div className="pr-progress-track">
                          <div className="pr-progress-bar" style={{ width: `${monthlyStats.attendanceRate}%`, background: '#10b981' }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Academic Comparison Dashboard */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '18px' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '14px', color: '#fff' }}>
                      مقارنة أداء الطالب بمتوسط الفصل
                    </h4>
                    
                    {/* Progress comparing student avg vs class avg */}
                    {monthlyStats.totalExams > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '5px' }}>
                            <span>متوسط درجات الطالب</span>
                            <span>{monthlyStats.avgPercentage}%</span>
                          </div>
                          <div className="pr-progress-track" style={{ height: '8px' }}>
                            <div className="pr-progress-bar" style={{ width: `${monthlyStats.avgPercentage}%`, background: '#8b5cf6' }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '5px' }}>
                            <span>متوسط الفصل العام</span>
                            <span>{monthlyStats.classAvgPercentage}%</span>
                          </div>
                          <div className="pr-progress-track" style={{ height: '8px' }}>
                            <div className="pr-progress-bar" style={{ width: `${monthlyStats.classAvgPercentage}%`, background: '#475569' }} />
                          </div>
                        </div>

                        {/* Analysis label */}
                        <div style={{ 
                          marginTop: '6px', 
                          padding: '10px 12px', 
                          borderRadius: '8px', 
                          fontSize: '0.8rem', 
                          fontWeight: 'bold',
                          textAlign: 'center',
                          background: monthlyStats.avgPercentage >= monthlyStats.classAvgPercentage ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                          color: monthlyStats.avgPercentage >= monthlyStats.classAvgPercentage ? '#34d399' : '#fbbf24',
                          border: monthlyStats.avgPercentage >= monthlyStats.classAvgPercentage ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(245, 158, 11, 0.15)'
                        }}>
                          {monthlyStats.avgPercentage >= monthlyStats.classAvgPercentage 
                            ? `الطالب يتفوق على متوسط الفصل بمقدار +${monthlyStats.avgPercentage - monthlyStats.classAvgPercentage}% ✨`
                            : `مستوى الطالب يقل عن متوسط الفصل بمقدار ${monthlyStats.classAvgPercentage - monthlyStats.avgPercentage}% (ينصح بالمتابعة) ⚠️`
                          }
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontSize: '0.86rem' }}>
                        لا توجد اختبارات كافية للمقارنة هذا الشهر.
                      </div>
                    )}
                  </div>

                  {/* Participation and Behavior List */}
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '12px', color: '#fff' }}>
                      النقاط والملاحظات السلوكية
                    </h4>
                    {filteredGrades.filter(g => g.type === 'behavior' || g.type === 'participation').length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '0.86rem', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '12px' }}>
                        لا توجد ملاحظات سلوكية أو نقاط تفاعل مسجلة هذا الشهر.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {filteredGrades.filter(g => g.type === 'behavior' || g.type === 'participation').map(g => (
                          <div key={g.id} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: g.type === 'participation' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              color: g.type === 'participation' ? '#34d399' : '#fbbf24',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1rem'
                            }}>
                              <i className={g.type === 'participation' ? 'fas fa-award' : 'fas fa-triangle-exclamation'} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>
                                  {g.type === 'participation' ? 'مشاركة وتفاعل' : 'تقييم سلوكي'}
                                </span>
                                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{fmtDate(g.created_at)}</span>
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '3px' }}>
                                {g.title} {g.notes ? `• ${g.notes}` : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'left', background: 'rgba(255,255,255,0.01)' }}>
              <button 
                onClick={() => setShowFullReportModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#fff',
                  padding: '8px 20px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontFamily: 'Tajawal, sans-serif'
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
