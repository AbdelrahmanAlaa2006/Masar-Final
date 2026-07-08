import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@backend/supabase'
import { uploadAvatarImage, deleteR2Object } from '@backend/r2'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { GRADE_LABEL } from './ControlPanel/shared'
import './Profile.css'

export default function Profile() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const { refreshProfile } = useAuth()
  const { isFeatureEnabled } = useTenant()
  const [user, setUser] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')


  // Student stats states
  const [attendanceSummary, setAttendanceSummary] = useState(null)
  const [gradesSummary, setGradesSummary] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)

  // Digital card modal state
  const [showDigitalCard, setShowDigitalCard] = useState(false)

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      if (!u) { navigate('/login'); return }
      setUser(u)
      if (u.avatar_url) setAvatarUrl(u.avatar_url)

      // Fetch fresh profile data to get database fields (including created_at, parent_phone, qr_token)
      refreshProfile().then((fresh) => {
        if (fresh) {
          setUser(fresh)
          if (fresh.avatar_url) setAvatarUrl(fresh.avatar_url)
        }
      }).catch(err => console.error('Failed to refresh profile on mount:', err))
    } catch {
      navigate('/login')
    }
  }, [navigate])

  // Online-only students have no center features (attendance, barcode, center grades)
  const isOnlineStudent = user?.enrollment_type === 'ONLINE'

  // Load student stats dynamically (lazy loaded APIs)
  useEffect(() => {
    if (user && user.role === 'student') {
      const loadStats = async () => {
        setLoadingStats(true)
        try {
          if (isFeatureEnabled('attendance') && user.enrollment_type !== 'ONLINE') {
            const { getStudentAttendanceSummary } = await import('@backend/attendanceApi')
            const att = await getStudentAttendanceSummary(user.id)
            setAttendanceSummary(att)
          }

          if (isFeatureEnabled('grades')) {
            const { getStudentGradesSummary } = await import('@backend/gradesApi')
            const grd = await getStudentGradesSummary(user.id)
            setGradesSummary(grd)
          }
        } catch (err) {
          console.error('Failed to load student statistics summaries:', err)
        } finally {
          setLoadingStats(false)
        }
      }

      loadStats()
    }
  }, [user, isFeatureEnabled])

  const initial = (user?.name || 'U').trim().charAt(0).toUpperCase()
  const roleName = user?.role === 'super_admin' ? 'سوبر أدمن (مطور)' : user?.role === 'admin' ? 'مشرف' : user?.role === 'assistant' ? 'مساعد' : 'طالب'
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const isAssistant = user?.role === 'assistant'

  const gradeLabel = GRADE_LABEL[user?.grade] || '—'

  // Real join date only — never a fabricated fallback
  const joinDate = (() => {
    if (!user?.created_at) return null
    try {
      const d = new Date(user.created_at)
      if (isNaN(d.getTime())) return null
      const months = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ]
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
    } catch {
      return null
    }
  })()

  // Real account status — the chip used to claim "نشط" unconditionally
  const STATUS_CHIP_LABEL = { active: 'نشط', inactive: 'غير نشط', suspended: 'موقوف', graduated: 'خريج', archived: 'مؤرشف' }
  const isAccountActive = user?.is_active !== false && (!user?.status || user.status === 'active')
  const statusChipLabel = isAccountActive ? 'نشط' : (STATUS_CHIP_LABEL[user?.status] || 'غير نشط')

  const handleCopyId = () => {
    if (!user?.id) return
    navigator.clipboard.writeText(user.id)
    setSuccessMsg('تم نسخ معرّف المستخدم بنجاح')
    setTimeout(() => setSuccessMsg(''), 2200)
  }

  // Upload avatar
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      setErrorMsg('يرجى اختيار صورة صالحة')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('حجم الصورة يجب أن لا يتجاوز 2 ميجابايت')
      return
    }

    setUploading(true)
    setErrorMsg('')

    // Snapshot the previous URL BEFORE we overwrite it so we can clean
    // up the orphan in R2 once the new image is safely persisted.
    const previousUrl = (user.avatar_url || '').split('?')[0] || null

    try {
      // Upload directly to Cloudflare R2
      const { publicUrl } = await uploadAvatarImage(file)

      // Persist the bare URL on the row.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      // Best-effort cleanup of the previous avatar object
      if (previousUrl && previousUrl !== publicUrl) {
        deleteR2Object({ url: previousUrl }).catch(() => { })
      }

      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`
      setAvatarUrl(urlWithCacheBust)

      const updated = { ...user, avatar_url: urlWithCacheBust }
      sessionStorage.setItem('masar-user', JSON.stringify(updated))
      window.dispatchEvent(new Event('masar-user-updated'))
      setUser(updated)
      setSuccessMsg('تم تحديث الصورة بنجاح')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      console.error('Avatar upload error:', err)
      setErrorMsg('فشل رفع الصورة: ' + (err.message || 'خطأ غير معروف'))
    } finally {
      setUploading(false)
    }
  }

  // Remove avatar
  const handleRemoveAvatar = async () => {
    if (!avatarUrl) return
    setUploading(true)
    setErrorMsg('')

    // Snapshot for the post-update cleanup.
    const targetUrl = (user.avatar_url || avatarUrl || '').split('?')[0]

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)

      if (updateError) throw updateError

      // Delete the R2 object
      if (targetUrl) {
        deleteR2Object({ url: targetUrl }).catch(() => { })
      }

      setAvatarUrl(null)
      const updated = { ...user, avatar_url: null }
      sessionStorage.setItem('masar-user', JSON.stringify(updated))
      window.dispatchEvent(new Event('masar-user-updated'))
      setUser(updated)
      setSuccessMsg('تم حذف الصورة')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setErrorMsg('فشل حذف الصورة')
    } finally {
      setUploading(false)
    }
  }

  if (!user) return null

  // Barcode for the student's digital card (QR removed).
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(user.barcode_token || '')}&scale=3&rotate=N&includetext=true`

  return (
    <div className="profile-page" dir="rtl">
      {/* Decorative background */}
      <div className="profile-bg-decor">
        <div className="profile-bg-blob profile-bg-blob--1" />
        <div className="profile-bg-blob profile-bg-blob--2" />
        <div className="profile-bg-blob profile-bg-blob--3" />
      </div>

      <div className="profile-container">
        {/* Cinematic Header Card */}
        <div className="profile-hero-card">
          <div className="profile-hero-bg" />
          <div className="profile-hero-content">
            {/* Avatar area */}
            <div className="profile-avatar-wrapper">
              <div className={`profile-avatar ${uploading ? 'is-uploading' : ''}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="صورة شخصية" className="profile-avatar-img" />
                ) : (
                  <span className="profile-avatar-letter">{initial}</span>
                )}
                <div className="profile-avatar-ring" />
                {uploading && (
                  <div className="profile-avatar-loader">
                    <div className="profile-spinner" />
                  </div>
                )}
              </div>

              {/* Floating Camera Edit FAB */}
              <button
                type="button"
                className="profile-avatar-fab profile-avatar-fab--upload"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="تغيير الصورة"
              >
                <i className="fas fa-camera" />
              </button>

              {/* Floating Trash Remove FAB */}
              {avatarUrl && (
                <button
                  type="button"
                  className="profile-avatar-fab profile-avatar-fab--remove"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  title="إزالة الصورة"
                >
                  <i className="fas fa-trash-can" />
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                hidden
              />
            </div>

            <h1 className="profile-hero-name">{user.name}</h1>

            {/* Badges / Chips Row */}
            <div className="profile-hero-chips">
              {isAdmin && (
                <span className="profile-chip profile-chip--admin">
                  <i className="fas fa-shield-halved" />
                  <span>{roleName}</span>
                </span>
              )}
              {isAssistant && (
                <span className="profile-chip profile-chip--assistant">
                  <i className="fas fa-user-shield" />
                  <span>{roleName}</span>
                </span>
              )}
              {!isAdmin && !isAssistant && (
                <span className="profile-chip profile-chip--student">
                  <i className="fas fa-graduation-cap" />
                  <span>{roleName}</span>
                </span>
              )}

              <span className="profile-chip profile-chip--active" style={isAccountActive ? undefined : { background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}>
                <span className="profile-status-dot" style={isAccountActive ? undefined : { background: '#ef4444' }} />
                <span>{statusChipLabel}</span>
              </span>
            </div>

            {/* Meta Strip */}
            <div className="profile-meta-strip">
              {joinDate && (
                <>
                  <span><i className="fas fa-calendar" /> عضو منذ {joinDate}</span>
                  <span className="profile-meta-sep">·</span>
                </>
              )}
              <span><i className="fas fa-globe" /> العربية</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="profile-toast profile-toast--success" role="status" aria-live="polite">
            <i className="fas fa-circle-check" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="profile-toast profile-toast--error" role="status" aria-live="polite">
            <i className="fas fa-circle-exclamation" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Student warning indicators if attendance is low */}
        {isFeatureEnabled('attendance') && user.role === 'student' && !isOnlineStudent && attendanceSummary && attendanceSummary.totalSessions > 0 && attendanceSummary.attendancePercentage < 75 && (
          <div className="profile-warning-alert" style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444',
            padding: '16px 20px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.96rem',
            fontWeight: '600',
            animation: 'profileFadeUp 0.5s ease'
          }}>
            <i className="fas fa-triangle-exclamation" style={{ fontSize: '1.2rem' }}></i>
            <span><strong>تنبيه الحضور:</strong> نسبة حضورك منخفضة حالياً — حضرت {attendanceSummary.attended} من {attendanceSummary.totalSessions} حصة ({attendanceSummary.attendancePercentage}%). يرجى الالتزام بحضور الحصص القادمة لتفادي تجميد حسابك الدراسي.</span>
          </div>
        )}

        {/* Info Cards Grid */}
        <div className="profile-grid">
          {/* Personal info card */}
          <div className="profile-form-card">
            <h2 className="profile-card-title">
              <span className="profile-card-accent-bar" />
              <i className="fas fa-user" />
              <span>المعلومات الشخصية</span>
            </h2>

            <div className="profile-info-row">
              <span className="profile-info-label">
                <i className="fas fa-user" />
                الاسم الكامل
              </span>
              <span className="profile-info-value">{user.name || '—'}</span>
            </div>

            <div className="profile-info-row">
              <span className="profile-info-label">
                <i className="fas fa-phone" />
                رقم الهاتف
              </span>
              <span className="profile-info-value" dir="ltr">{user.phone || '—'}</span>
            </div>

            {/* Parent contact follow-up phone (read-only for students, edit disabled) */}
            {user.role === 'student' && (
              <div className="profile-info-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span className="profile-info-label">
                    <i className="fab fa-whatsapp" />
                    هاتف ولي الأمر (للمتابعة)
                  </span>
                  <div className="parent-phone-value-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="profile-info-value" dir="ltr" style={{ opacity: 0.85 }}>
                      {user.parent_phone || 'غير مسجل'}
                    </span>
                    <i className="fas fa-lock" style={{ color: 'var(--profile-row-label-icon)', fontSize: '0.8rem' }} title="تعديل رقم ولي الأمر غير متاح" />
                  </div>
                </div>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', background: 'rgba(255, 255, 255, 0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--profile-card-border)' }}>
                  <i className="fas fa-circle-info" style={{ color: 'var(--profile-accent-icon)', fontSize: '0.9rem' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--profile-row-label)', lineHeight: '1.4' }}>
                    يتم إدخال رقم ولي الأمر عند التسجيل فقط. لتعديله، يرجى التواصل مع الإدارة.
                  </span>
                </div>
              </div>
            )}

            {/* Level / Stage — students see their grade. */}
            {!isAdmin && !isAssistant && (
              <div className="profile-info-row">
                <span className="profile-info-label">
                  <i className="fas fa-graduation-cap" />
                  المرحلة الدراسية
                </span>
                <span className="profile-info-value">{gradeLabel}</span>
              </div>
            )}

            {/* Group / class */}
            {!isAdmin && !isAssistant && (
              <div className="profile-info-row">
                <span className="profile-info-label">
                  <i className="fas fa-user-group" />
                  المجموعة
                </span>
                {user.group
                  ? <span className="profile-info-value">{user.group}</span>
                  : <span className="profile-coming-badge">قريبًا</span>}
              </div>
            )}
          </div>

          {/* Account info card */}
          <div className="profile-info-card">
            <h2 className="profile-card-title">
              <span className="profile-card-accent-bar" />
              <i className="fas fa-shield-halved" />
              <span>معلومات الحساب</span>
            </h2>

            <div className="profile-info-row">
              <span className="profile-info-label">
                <i className="fas fa-user-shield" />
                نوع الحساب
              </span>
              <span className="profile-info-value profile-info-value--badge">{roleName}</span>
            </div>

            <div className="profile-info-row profile-info-row--copyable" onClick={handleCopyId} title="انقر لنسخ معرّف المستخدم">
              <span className="profile-info-label">
                <i className="fas fa-fingerprint" />
                معرّف المستخدم
              </span>
              <div className="profile-info-value-container">
                <span className="profile-info-value profile-info-value--mono">{user.id ? `${user.id.slice(0, 8)}...` : '—'}</span>
                <button type="button" className="profile-copy-btn" aria-label="نسخ المعرّف">
                  <i className="fas fa-copy" />
                </button>
              </div>
            </div>
          </div>

          {/* Digital Student Card (Only for Student) */}
          {isFeatureEnabled('qr_attendance') && user.role === 'student' && !isOnlineStudent && (
            <div className="profile-form-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', animationDelay: '200ms' }}>
              <h2 className="profile-card-title" style={{ width: '100%' }}>
                <span className="profile-card-accent-bar" />
                <i className="fas fa-id-card" />
                <span>بطاقة الطالب الرقمية</span>
              </h2>

              <p style={{ fontSize: '0.88rem', color: 'var(--profile-row-label)', margin: '0 0 16px', lineHeight: '1.6' }}>
                استخدم هذه البطاقة لتسجيل الحضور والانصراف تلقائياً عند الدخول إلى المركز التعليمي.
              </p>

              <button
                onClick={() => setShowDigitalCard(true)}
                className="profile-digital-card-btn"
              >
                <i className="fas fa-barcode" />
                عرض بطاقة الطالب الرقمية
              </button>
            </div>
          )}

          {/* Student Performance and Attendance Summaries (Only for Student) */}
          {user.role === 'student' && ((isFeatureEnabled('attendance') && !isOnlineStudent) || isFeatureEnabled('grades')) && (
            <div className="profile-info-card" style={{ animationDelay: '240ms' }}>
              <h2 className="profile-card-title">
                <span className="profile-card-accent-bar" />
                <i className="fas fa-chart-line" />
                <span>ملخص الأداء والتقييمات</span>
              </h2>

              {loadingStats ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px', color: 'var(--profile-row-label)' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', marginBottom: '8px' }}></i>
                  <span>جاري تحميل إحصائيات الأداء...</span>
                </div>
              ) : (
                <div className="profile-stats-grid" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Attendance Indicator (center/hybrid students only) */}
                  {isFeatureEnabled('attendance') && !isOnlineStudent && attendanceSummary && (
                    <div className="stat-progress-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', fontWeight: 'bold', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                        <span>الحضور بالسنتر</span>
                        {attendanceSummary.totalSessions > 0 ? (
                          <span style={{ color: attendanceSummary.attendancePercentage >= 75 ? '#10b981' : '#ef4444' }}>
                            حضر {attendanceSummary.attended} من {attendanceSummary.totalSessions} حصة ({attendanceSummary.attendancePercentage}%)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--profile-row-label)', fontWeight: 'normal' }}>
                            لم يتم تسجيل أي حصص بعد
                          </span>
                        )}
                      </div>
                      <div style={{ height: '8px', background: 'var(--profile-avatar-bg)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${attendanceSummary.totalSessions > 0 ? attendanceSummary.attendancePercentage : 0}%`,
                          background: attendanceSummary.attendancePercentage >= 75 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #ef4444, #f87171)',
                          borderRadius: '999px'
                        }}></div>
                      </div>
                      {attendanceSummary.totalSessions > 0 && (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '0.75rem', color: 'var(--profile-row-label)', flexWrap: 'wrap' }}>
                          <span style={{ color: '#10b981' }}>✓ حضور: {attendanceSummary.present}</span>
                          <span style={{ color: '#f59e0b' }}>⏱ تأخير: {attendanceSummary.late}</span>
                          <span style={{ color: '#ef4444' }}>✗ غياب: {attendanceSummary.absent}</span>
                          {attendanceSummary.excused > 0 && <span>غياب بعذر: {attendanceSummary.excused}</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Grades summaries */}
                  {isFeatureEnabled('grades') && gradesSummary && (
                    <>
                      {/* Homework Average */}
                      <div className="stat-progress-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', fontWeight: 'bold', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                          <span>تقييم الواجبات</span>
                          {gradesSummary.homeworkCount > 0 ? (
                            <span>
                              {gradesSummary.homeworkScore} من {gradesSummary.homeworkMax} درجة في {gradesSummary.homeworkCount} واجب ({gradesSummary.homeworkAverage}%)
                            </span>
                          ) : (
                            <span style={{ color: 'var(--profile-row-label)', fontWeight: 'normal' }}>
                              لا توجد واجبات مُقيَّمة بعد
                            </span>
                          )}
                        </div>
                        <div style={{ height: '8px', background: 'var(--profile-avatar-bg)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${gradesSummary.homeworkAverage || 0}%`,
                            background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                            borderRadius: '999px'
                          }}></div>
                        </div>
                      </div>

                      {/* Exams Average */}
                      <div className="stat-progress-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', fontWeight: 'bold', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                          <span>درجات الامتحانات</span>
                          {gradesSummary.examCount > 0 ? (
                            <span>
                              {gradesSummary.examScore} من {gradesSummary.examMax} درجة في {gradesSummary.examCount} امتحان ({gradesSummary.examAverage}%)
                            </span>
                          ) : (
                            <span style={{ color: 'var(--profile-row-label)', fontWeight: 'normal' }}>
                              لا توجد امتحانات مُقيَّمة بعد
                            </span>
                          )}
                        </div>
                        <div style={{ height: '8px', background: 'var(--profile-avatar-bg)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${gradesSummary.examAverage || 0}%`,
                            background: 'linear-gradient(90deg, #06b6d4, #0891b2)',
                            borderRadius: '999px'
                          }}></div>
                        </div>
                      </div>

                      {/* Badges for other evaluations */}
                      <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <span className="profile-chip" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                          <i className="fas fa-star" />
                          <span>{gradesSummary.participationCount} مشاركات وتفاعل</span>
                        </span>
                        <span className="profile-chip" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
                          <i className="fas fa-clipboard-list" />
                          <span>{gradesSummary.behaviorNotesCount} ملاحظات سلوكية</span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Digital Student Card Lightbox Modal overlay */}
      {showDigitalCard && (
        <div className="digital-card-modal-overlay" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '24px',
          animation: 'profileToastIn 0.3s ease'
        }} onClick={() => setShowDigitalCard(false)}>

          {/* Card Body */}
          <div className="digital-student-id-card" style={{
            maxWidth: '380px',
            width: '100%',
            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '36px 28px',
            boxShadow: '0 30px 60px rgba(0, 0, 0, 0.8)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: 'Tajawal, sans-serif'
          }} onClick={(e) => e.stopPropagation()}>

            {/* Holographic background line */}
            <div style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 60%)', pointerEvents: 'none' }} />

            {/* Close button */}
            <button
              onClick={() => setShowDigitalCard(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}
            >
              <i className="fas fa-times" />
            </button>

            {/* School / Platform Logo header */}
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #06b6d4, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#fff' }}>م</div>
              <span>بطاقة الهوية الرقمية</span>
            </div>

            {/* Student Image / Avatar inside digital card */}
            <div style={{ width: '90px', height: '90px', borderRadius: '50%', border: '3px solid rgba(255, 255, 255, 0.1)', margin: '0 auto 16px', overflow: 'hidden', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="صورة الطالب" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span>{initial}</span>
              )}
            </div>

            {/* Student Info */}
            <h3 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 'bold', margin: '0 0 6px' }}>{user.name}</h3>
            <span className="profile-chip profile-chip--student" style={{ marginBottom: '24px' }}>
              <i className="fas fa-graduation-cap" />
              <span>{gradeLabel}</span>
            </span>

            {/* Codes Container (QR removed — barcode only) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
              {/* Barcode */}
              {user.barcode_token && (
                <div style={{
                  background: '#fff',
                  padding: '12px 16px',
                  borderRadius: '16px',
                  display: 'inline-block',
                  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.3)',
                  border: '3px solid rgba(99, 102, 241, 0.2)',
                  width: '100%',
                  maxWidth: '260px'
                }}>
                  <img
                    src={barcodeUrl}
                    alt="Barcode"
                    style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '75px' }}
                  />
                </div>
              )}
            </div>

            {/* Raw codes and copy buttons */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              alignItems: 'center'
            }}>
              {user.barcode_token && (
                <div style={{ width: '100%' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>رمز الباركود:</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: '#cbd5e1',
                        fontFamily: 'monospace',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'left'
                      }}
                    >
                      {user.barcode_token}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(user.barcode_token)
                        setSuccessMsg('تم نسخ رمز الباركود بنجاح')
                        setTimeout(() => setSuccessMsg(''), 2200)
                      }}
                      style={{
                        background: '#10b981',
                        border: 'none',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                      onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
                    >
                      <i className="fas fa-copy" />
                      نسخ
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Help note */}
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 12px', lineHeight: '1.5' }}>
              قم بتقريب الرمز من قارئ الكاميرا لدى المشرف أو المعلم لتسجيل حضورك الفوري للدرس.
            </p>
            <p style={{ fontSize: '0.74rem', color: '#64748b', margin: 0, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', lineHeight: '1.4' }}>
              * للتجربة بدون قارئ حقيقي: انسخ الرمز أعلاه، ثم افتح لوحة التحضير، والصقه في حقل قارئ الكاشير واضغط Enter.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
