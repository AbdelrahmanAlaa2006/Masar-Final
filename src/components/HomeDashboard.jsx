import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listHomeworks } from '@backend/homeworksApi'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { cached, LIST_TTL } from '../utils/cache'
import { getStudentCount } from '@backend/profilesApi'
import { supabase } from '@backend/supabase'
import './HomeDashboard.css'

const safeParse = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}

const ROUTE_META = {
  homeworks: { icon: 'fa-clipboard-list', route: '/homework' },
  exams:     { icon: 'fa-file-alt',       route: '/exams' },
  videos:    { icon: 'fa-video',          route: '/videos' },
  report:    { icon: 'fa-chart-line',     route: '/report' },
}

export default function HomeDashboard({ role }) {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div className="hdash-card hdash-accent-violet" style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <EmptyHint icon="fa-spinner fa-spin" text="جاري تحميل لوحة التحكم..." />
      </div>
    )
  }

  if (role === 'super_admin') {
    return (
      <div className="hdash-card hdash-accent-violet" style={{ gridColumn: '1 / -1', padding: '36px', textAlign: 'center', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '24px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--cp-text-main, #1e293b)', marginBottom: '10px' }}>مرحباً بك في لوحة المطور والتحكم العام</h3>
        <p style={{ color: 'var(--cp-text-muted, #64748b)', marginBottom: '20px', fontSize: '0.92rem' }}>يمكنك الانتقال مباشرة لإدارة المدرسين والمنصات والقيام بعمليات تنظيف وتصفير قاعدة البيانات للبدء من جديد.</p>
        <Link to="/control-panel" className="cp-btn cp-btn-primary" style={{ display: 'inline-flex', padding: '10px 24px', borderRadius: '12px', fontWeight: 'bold', textDecoration: 'none', background: 'var(--primary, #6366f1)', color: '#fff' }}>
          الدخول للوحة التحكم والمطور
        </Link>
      </div>
    )
  }

  return (role === 'admin' || role === 'assistant') ? <AdminDashboard role={role} /> : <StudentDashboard />
}

/* ─────────── Live content stats ───────────
   For admins this loads everything (no grade filter). For students,
   Supabase RLS already restricts each list() to their own grade — so
   the same calls just naturally return their grade's content.

   Returns:
     stats   — { students, lectures, videos, exams }
     recent  — newest 5 items across lectures/videos/exams (by created_at)
     loading — true while the initial fetch is in flight
*/
function useContentStats({ role, grade }) {
  const [stats,  setStats]  = useState({ students: 0, homeworks: 0, videos: 0, exams: 0 })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  // Manual refresh — bumping this triggers a re-fetch.
  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)

  useEffect(() => {
    if (!role) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        // Run all four in parallel. Each call is wrapped so a single
        // failing endpoint (RLS, network) doesn't blank the whole panel —
        // it just shows zero for that resource and we surface the error
        // text below the cards.
        const wrap = (p, label) => p.then(
          (v) => ({ ok: true, v }),
          (e) => ({ ok: false, label, e })
        )
        // Share the 60s cache with Videos / Lectures / ControlPanel so
        // navigating Home → Videos doesn't double-fetch the same lists.
        // We only need counts here, so use the lean variant for exams.
        const [H, V, E, S] = await Promise.all([
          wrap(cached('homeworks', LIST_TTL, listHomeworks), 'homeworks'),
          wrap(cached('videos',    LIST_TTL, listVideos),    'videos'),
          wrap(cached('exams-lean', LIST_TTL, () => listExams({ lean: true })), 'exams'),
          // We only need the count here — a head-only COUNT query, not the
          // whole roster. Students aren't allowed to read other profiles → skip.
          (role === 'admin' || role === 'assistant')
            ? wrap(cached('students-count', LIST_TTL, getStudentCount), 'students')
            : Promise.resolve({ ok: true, v: 0 }),
        ])
        if (cancelled) return

        let homeworks = H.ok ? H.v : []
        let videos    = V.ok ? V.v : []
        let exams     = E.ok ? E.v : []
        const studentCount = S.ok ? S.v : 0

        if (role === 'student' && grade) {
          homeworks = homeworks.filter(h => h.grade === grade)
          videos    = videos.filter(v => v.grade === grade)
          exams     = exams.filter(e => e.grade === grade)
        }

        setStats({
          students:  studentCount,
          homeworks: homeworks.length,
          videos:    videos.length,
          exams:     exams.length,
        })

        const fails = [H, V, E, S].filter((r) => !r.ok)
        if (fails.length) {
          setError(fails.map((f) => `${f.label}: ${f.e?.message || 'failed'}`).join(' • '))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [role, tick, grade])

  return { stats, loading, error, refresh }
}

// Arabic short labels for grade enums + content types — used by the
// recent-additions panel.
const GRADE_SHORT = {
  'first-prep':  'أولى إعدادي',
  'second-prep': 'تانية إعدادي',
  'third-prep':  'تالتة إعدادي',
  'first-sec':   'أولى ثانوي',
  'second-sec':  'تانية ثانوي',
  'third-sec':   'تالتة ثانوي',
}
const TYPE_LABEL = {
  homeworks: 'واجب',
  videos:    'فيديو',
  exams:     'امتحان',
}

/* ─────────── Student ─────────── */

function StudentDashboard() {
  const { isFeatureEnabled } = useTenant()
  const navigate = useNavigate()
  const [recentNav, setRecentNav] = useState(() => safeParse('masar-recent', []))
  
  const { user } = useAuth()
  const userId = user?.id || null
  const userGrade = user?.grade || null

  const [completedIds, setCompletedIds] = useState({
    homeworks: new Set(),
    videos: new Set(),
    exams: new Set(),
  })
  
  const [upcoming, setUpcoming] = useState(null)
  
  // Live content for THIS student's grade
  const { stats, loading, error, refresh } = useContentStats({ role: 'student', grade: userGrade })

  const progress = useMemo(() => {
    return {
      homeworks: { done: completedIds.homeworks.size, total: stats.homeworks },
      videos:    { done: completedIds.videos.size, total: stats.videos },
      exams:     { done: completedIds.exams.size, total: stats.exams },
    }
  }, [completedIds, stats.homeworks, stats.videos, stats.exams])

  const routeLabels = {
    homeworks: 'الواجبات',
    exams: 'الامتحانات',
    videos: 'الفيديوهات',
    report: 'التقارير',
  }

  // Refresh navigation history when the user visits another section in
  // the same tab (the trackVisit helper fires `masar-recent-change`),
  // and across tabs via the standard `storage` event.
  useEffect(() => {
    const reload = () => setRecentNav(safeParse('masar-recent', []))
    const onStorage = (e) => { if (e.key === 'masar-recent') reload() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('masar-recent-change', reload)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('masar-recent-change', reload)
    }
  }, [])

  // Load student dynamic progress statistics & upcoming exams
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    ;(async () => {
      try {
        // 1. Fetch live student progress statistics in parallel
        const [subs, prog, attempts] = await Promise.all([
          cached(`student-hws-${userId}`, LIST_TTL, () =>
            supabase
              .from('homework_submissions')
              .select('homework_id')
              .eq('student_id', userId)
              .then((r) => { if (r.error) throw r.error; return r.data || [] })
          ),
          cached(`student-vids-${userId}`, LIST_TTL, () =>
            supabase
              .from('video_progress')
              .select('video_id')
              .eq('student_id', userId)
              .then((r) => { if (r.error) throw r.error; return r.data || [] })
          ),
          cached(`student-exams-${userId}`, LIST_TTL, () =>
            supabase
              .from('exam_attempts')
              .select('exam_id')
              .eq('student_id', userId)
              .not('submitted_at', 'is', null)
              // Pre-video gate attempts aren't exams the student "took".
              .is('video_assessment_id', null)
              .then((r) => { if (r.error) throw r.error; return r.data || [] })
          ),
        ])

        if (cancelled) return

        const completedHws = new Set((subs || []).map(s => s.homework_id))
        const completedVids = new Set((prog || []).map(p => p.video_id))
        const completedExs = new Set((attempts || []).map(a => a.exam_id))

        setCompletedIds({
          homeworks: completedHws,
          videos: completedVids,
          exams: completedExs,
        })

        // 2. Query scheduled_events first
        const nowIso = new Date().toISOString()
        const { data: dbEvents } = await supabase
          .from('scheduled_events')
          .select('id, title, event_type, starts_at')
          .eq('grade', userGrade)
          .gte('starts_at', nowIso)
          .order('starts_at', { ascending: true })
          .limit(1)

        if (cancelled) return

        if (dbEvents && dbEvents.length > 0) {
          const nextEvent = dbEvents[0]
          setUpcoming({
            id: nextEvent.id,
            title: nextEvent.title,
            event_type: nextEvent.event_type,
            at: nextEvent.starts_at,
            isScheduledEvent: true
          })
        } else {
          // Fallback: Resolve "Next/Upcoming Exam" from the old exams system
          const dbExams = await cached(`upcoming-exam-${userGrade}`, LIST_TTL, () =>
            supabase
              .from('exams')
              .select('id, title, created_at, available_hours')
              .eq('grade', userGrade)
              // Pre-video gate assessments are not exams the student can go
              // and sit — never surface one as "your next exam".
              .eq('origin', 'library')
              .order('created_at', { ascending: false })
              .then((r) => { if (r.error) throw r.error; return r.data || [] })
          )

          if (cancelled) return

          if (dbExams && dbExams.length > 0) {
            const nextExam = dbExams.find(e => !completedExs.has(e.id))
            if (nextExam) {
              const createdTime = new Date(nextExam.created_at).getTime()
              const availableHours = nextExam.available_hours || 72
              const availableUntil = createdTime + availableHours * 60 * 60 * 1000
              
              if (availableUntil > Date.now()) {
                setUpcoming({
                  id: nextExam.id,
                  title: nextExam.title,
                  event_type: 'exam',
                  at: new Date(availableUntil).toISOString(),
                  isScheduledEvent: false
                })
              } else {
                setUpcoming(null)
              }
            } else {
              setUpcoming(null)
            }
          } else {
            setUpcoming(null)
          }
        }
      } catch (err) {
        console.error('Error loading live student dashboard stats:', err)
      }
    })()

    return () => { cancelled = true }
  }, [userId, userGrade])

  const lastItem = recentNav[0]
  const countdown = useCountdown(upcoming?.at)

  const cardTitle = useMemo(() => {
    if (!upcoming) return 'الامتحان القادم'
    switch (upcoming.event_type) {
      case 'video': return 'المحاضرة القادمة 🎥'
      case 'homework': return 'الواجب القادم 📖'
      case 'exam': return 'الامتحان القادم 📝'
      case 'payment': return 'موعد الدفع القادم 💳'
      case 'announcement': return 'تنبيه هام 🔔'
      default: return 'الفعالية القادمة 📅'
    }
  }, [upcoming])

  const cardIcon = useMemo(() => {
    if (!upcoming) return 'fa-hourglass-half'
    switch (upcoming.event_type) {
      case 'video': return 'fa-video'
      case 'homework': return 'fa-clipboard-list'
      case 'exam': return 'fa-file-signature'
      case 'payment': return 'fa-credit-card'
      case 'announcement': return 'fa-bullhorn'
      default: return 'fa-calendar-days'
    }
  }, [upcoming])

  const linkInfo = useMemo(() => {
    if (!upcoming) return { to: '/exams', label: 'استعد الآن' }
    switch (upcoming.event_type) {
      case 'video': return { to: '/videos', label: 'شاهد الآن' }
      case 'homework': return { to: '/homework', label: 'افتح الواجب' }
      case 'exam': return { to: '/exams', label: 'استعد الآن' }
      case 'payment': return { to: '/payments', label: 'تفاصيل الدفع' }
      default: return { to: '/shop', label: 'افتح المتجر' }
    }
  }, [upcoming])

  return (
    <section className="hdash hdash-student">
      {/* Live grade-scoped overview — RLS shows only this student's grade. */}
      <WidgetCard icon="fa-gauge-high" title="نظرة عامة" accent="violet">
        <div className="hdash-stats">
          {isFeatureEnabled('homework') && <StatCell icon="fa-clipboard-list" label="الواجبات" value={stats.homeworks} type="homeworks" />}
          {isFeatureEnabled('videos') && <StatCell icon="fa-video" label="الفيديوهات" value={stats.videos} type="videos" />}
          {isFeatureEnabled('exams') && <StatCell icon="fa-file-alt" label="الامتحانات" value={stats.exams} type="exams" />}
        </div>
      </WidgetCard>

      <WidgetCard
        icon="fa-clock-rotate-left"
        title="أكمل من حيث توقفت"
        accent="violet"
      >
        {lastItem ? (
          <button
            className="hdash-continue"
            onClick={() => navigate(lastItem.route)}
          >
            <div className="hdash-continue-main">
              <span className="hdash-continue-label">{routeLabels[lastItem.type] || lastItem.type}</span>
              <span className="hdash-continue-hint">آخر زيارة: {relTime(lastItem.at)}</span>
            </div>
            <i className="fas fa-arrow-left"></i>
          </button>
        ) : (
          <EmptyHint icon="fa-seedling" text="ابدأ التعلم ليظهر آخر نشاط هنا" />
        )}
      </WidgetCard>

      <WidgetCard
        icon="fa-chart-simple"
        title="تقدمك"
        accent="cyan"
      >
        {isFeatureEnabled('homework') && <ProgressRow label="الواجبات" data={progress.homeworks} accent="var(--primary, #8b5cf6)" />}
        {isFeatureEnabled('videos') && <ProgressRow label="الفيديوهات" data={progress.videos}   accent="var(--secondary, #06b6d4)" />}
        {isFeatureEnabled('exams') && <ProgressRow label="الامتحانات" data={progress.exams}    accent="var(--season-accent-soft, var(--primary, #f59e0b))" />}
      </WidgetCard>

      <WidgetCard
        icon={cardIcon}
        title={cardTitle}
        accent="amber"
      >
        {upcoming && countdown ? (
          <div className="hdash-countdown">
            <div className="hdash-countdown-title">{upcoming.title}</div>
            <div className="hdash-countdown-grid">
              <CountCell value={countdown.days} label="يوم" />
              <CountCell value={countdown.hours} label="ساعة" />
              <CountCell value={countdown.minutes} label="دقيقة" />
              <CountCell value={countdown.seconds} label="ثانية" />
            </div>
            <Link to={linkInfo.to} className="hdash-countdown-cta">
              {linkInfo.label} <i className="fas fa-arrow-left"></i>
            </Link>
          </div>
        ) : (
          <EmptyHint icon="fa-calendar-check" text="لا توجد محاضرات أو امتحانات مجدولة حالياً" />
        )}
      </WidgetCard>
    </section>
  )
}

function ProgressRow({ label, data, accent }) {
  const total = Math.max(0, Number(data?.total) || 0)
  const done  = Math.max(0, Math.min(total, Number(data?.done) || 0))
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="hdash-progress-row">
      <div className="hdash-progress-head">
        <span>{label}</span>
        <span className="hdash-progress-count">{done} من {total || '—'}</span>
      </div>
      <div className="hdash-progress-bar">
        <div
          className="hdash-progress-fill"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, var(--secondary, #06b6d4))` }}
        />
      </div>
    </div>
  )
}

function CountCell({ value, label }) {
  return (
    <div className="hdash-count-cell">
      <div className="hdash-count-value">{String(value ?? 0).padStart(2, '0')}</div>
      <div className="hdash-count-label">{label}</div>
    </div>
  )
}

/* ─────────── Admin ─────────── */

function AdminDashboard({ role }) {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const { isFeatureEnabled } = useTenant()
  // Pulled live from Supabase — totals across all grades.
  const { stats, loading, error, refresh } = useContentStats({ role })

  // A disabled feature disappears entirely (feature flag) — even before the
  // per-assistant permission check.
  const allowedExams = isFeatureEnabled('exams') && (role === 'admin' || hasPermission('exams'))
  const allowedVideos = isFeatureEnabled('videos') && (role === 'admin' || hasPermission('videos'))
  const allowedReports = isFeatureEnabled('reports') && (role === 'admin' || hasPermission('reports'))

  return (
    <section className="hdash hdash-admin">
      <WidgetCard icon="fa-gauge-high" title="نظرة عامة" accent="violet">
        <div className="hdash-stats">
          <StatCell icon="fa-user-graduate" label="الطلاب" value={stats.students} type="students" />
          {isFeatureEnabled('homework') && <StatCell icon="fa-clipboard-list" label="الواجبات" value={stats.homeworks} type="homeworks" />}
          {isFeatureEnabled('videos') && <StatCell icon="fa-video" label="الفيديوهات" value={stats.videos} type="videos" />}
          {isFeatureEnabled('exams') && <StatCell icon="fa-file-alt" label="الامتحانات" value={stats.exams} type="exams" />}
        </div>
        {error && (
          <div style={{
            marginTop: 15, padding: '10px 12px', borderRadius: 12,
            background: 'rgba(239,68,68,0.08)', color: '#ef4444',
            fontSize: 12, fontWeight: 600,
            border: '1px solid rgba(239,68,68,0.15)'
          }}>
            <i className="fas fa-triangle-exclamation" style={{ marginInlineEnd: 6 }}></i>
            تعذر تحميل بعض البيانات: {error}
          </div>
        )}
      </WidgetCard>

      <WidgetCard icon="fa-bolt" title="إجراءات سريعة" accent="amber">
        <div className="hdash-quick">
          {allowedExams && (
            <Link to="/exams" onClick={handleRipple} className="hdash-quick-card-btn hdash-quick-primary">
              <span className="hdash-quick-icon-chip"><i className="fas fa-plus"></i></span>
              <span className="hdash-quick-text">امتحان جديد</span>
            </Link>
          )}
          {allowedVideos && (
            <Link to="/videos" onClick={handleRipple} className="hdash-quick-card-btn hdash-quick-primary">
              <span className="hdash-quick-icon-chip"><i className="fas fa-plus"></i></span>
              <span className="hdash-quick-text">فيديو جديد</span>
            </Link>
          )}
          {allowedReports && (
            <Link to="/report" onClick={handleRipple} className="hdash-quick-card-btn hdash-quick-ghost">
              <span className="hdash-quick-icon-chip"><i className="fas fa-chart-line"></i></span>
              <span className="hdash-quick-text">التقارير</span>
            </Link>
          )}
          <Link to="/control-panel" onClick={handleRipple} className="hdash-quick-card-btn hdash-quick-ghost">
            <span className="hdash-quick-icon-chip"><i className="fas fa-gear"></i></span>
            <span className="hdash-quick-text">لوحة التحكم</span>
          </Link>
        </div>
      </WidgetCard>
    </section>
  )
}

function handleRipple(e) {
  const btn = e.currentTarget
  const rect = btn.getBoundingClientRect()
  const circle = document.createElement('span')
  const diameter = Math.max(rect.width, rect.height)
  const radius = diameter / 2

  circle.style.width = circle.style.height = `${diameter}px`
  circle.style.left = `${e.clientX - rect.left - radius}px`
  circle.style.top = `${e.clientY - rect.top - radius}px`
  circle.classList.add('btn-ripple-wave')

  const existing = btn.getElementsByClassName('btn-ripple-wave')[0]
  if (existing) existing.remove()

  btn.appendChild(circle)
  setTimeout(() => circle.remove(), 600)
}

function CountUp({ end, duration = 800 }) {
  const [count, setCount] = useState(0)
  const target = Number(end) || 0

  useEffect(() => {
    let frameId
    const startTime = performance.now()

    const update = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Smooth easeOutExpo curve
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setCount(Math.round(target * ease))

      if (progress < 1) {
        frameId = requestAnimationFrame(update)
      }
    }

    frameId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frameId)
  }, [target, duration])

  return <>{count}</>
}

function StatCell({ icon, label, value, type = 'students', loading = false }) {
  return (
    <div className={`hdash-stat hdash-stat--${type}`}>
      <span className="hdash-stat-accent-bar" aria-hidden="true" />
      <div className="hdash-stat-watermark" aria-hidden="true">
        <i className={`fas ${icon}`}></i>
      </div>
      <div className="hdash-stat-icon"><i className={`fas ${icon}`}></i></div>
      <div className="hdash-stat-info">
        <div className="hdash-stat-value">
          {loading || value === undefined || value === null ? (
            <div className="hdash-skeleton" style={{ width: 56, height: 28, borderRadius: 6 }} />
          ) : (
            <CountUp end={value} />
          )}
        </div>
        <div className="hdash-stat-label">{label}</div>
      </div>
    </div>
  )
}

/* ─────────── Shared ─────────── */

function WidgetCard({ icon, title, accent, children }) {
  return (
    <div className={`hdash-card hdash-accent-${accent}`}>
      <div className="hdash-card-head">
        <div className="hdash-card-icon"><i className={`fas ${icon}`}></i></div>
        <h3>{title}</h3>
      </div>
      <div className="hdash-card-body">{children}</div>
    </div>
  )
}
function EmptyHint({ icon, text }) {
  return (
    <div className="hdash-empty">
      <i className={`fas ${icon}`}></i>
      <span>{text}</span>
    </div>
  )
}
function relTime(iso) {
  if (!iso) return ''
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'الآن'
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`
    return `منذ ${Math.floor(diff / 86400)} يوم`
  } catch {
    return ''
  }
}

function useCountdown(targetIso) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!targetIso) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetIso])
  if (!targetIso) return null
  const diff = Math.max(0, new Date(targetIso).getTime() - now)
  const days    = Math.floor(diff / 86400000)
  const hours   = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return { days, hours, minutes, seconds }
}
