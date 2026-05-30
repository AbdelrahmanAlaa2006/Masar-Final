import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listHomeworks } from '@backend/homeworksApi'
import { useAuth } from '../contexts/AuthContext'
import { cached, LIST_TTL } from '../utils/cache'
import { listStudents } from '@backend/profilesApi'
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
  return role === 'admin' ? <AdminDashboard /> : <StudentDashboard />
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
          wrap(cached('exams',     LIST_TTL, listExams),     'exams'),
          // Students aren't allowed to read other profiles → skip that.
          role === 'admin'
            ? wrap(cached('students', LIST_TTL, listStudents), 'students')
            : Promise.resolve({ ok: true, v: [] }),
        ])
        if (cancelled) return

        let homeworks = H.ok ? H.v : []
        let videos    = V.ok ? V.v : []
        let exams     = E.ok ? E.v : []
        const students  = S.ok ? S.v : []

        if (role === 'student' && grade) {
          homeworks = homeworks.filter(h => h.grade === grade)
          videos    = videos.filter(v => v.grade === grade)
          exams     = exams.filter(e => e.grade === grade)
        }

        setStats({
          students:  students.length,
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
}
const TYPE_LABEL = {
  homeworks: 'واجب',
  videos:    'فيديو',
  exams:     'امتحان',
}

/* ─────────── Student ─────────── */

function StudentDashboard() {
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

        // 2. Resolve "Next/Upcoming Exam"
        // Find the newest exam available for this student's grade that they have NOT completed yet
        const dbExams = await cached(`upcoming-exam-${userGrade}`, LIST_TTL, () =>
          supabase
            .from('exams')
            .select('id, title, created_at, available_hours')
            .eq('grade', userGrade)
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
                at: new Date(availableUntil).toISOString()
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
      } catch (err) {
        console.error('Error loading live student dashboard stats:', err)
      }
    })()

    return () => { cancelled = true }
  }, [userId, userGrade])

  const lastItem = recentNav[0]
  const countdown = useCountdown(upcoming?.at)

  return (
    <section className="hdash hdash-student">
      {/* Live grade-scoped overview — RLS shows only this student's grade. */}
      <WidgetCard icon="fa-gauge-high" title="نظرة عامة" accent="violet">
        <div className="hdash-stats">
          <StatCell icon="fa-clipboard-list" label="الواجبات"   value={stats.homeworks} />
          <StatCell icon="fa-video"    label="الفيديوهات"   value={stats.videos} />
          <StatCell icon="fa-file-alt" label="الامتحانات"    value={stats.exams} />
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
        <ProgressRow label="الواجبات" data={progress.homeworks} accent="var(--primary, #8b5cf6)" />
        <ProgressRow label="الفيديوهات" data={progress.videos}   accent="var(--secondary, #06b6d4)" />
        <ProgressRow label="الامتحانات" data={progress.exams}    accent="var(--season-accent-soft, var(--primary, #f59e0b))" />
      </WidgetCard>

      <WidgetCard
        icon="fa-hourglass-half"
        title="الامتحان القادم"
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
            <Link to="/exams" className="hdash-countdown-cta">
              استعد الآن <i className="fas fa-arrow-left"></i>
            </Link>
          </div>
        ) : (
          <EmptyHint icon="fa-calendar-check" text="لا توجد امتحانات مجدولة حاليًا" />
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
        <span className="hdash-progress-count">{done} / {total || '—'}</span>
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

function AdminDashboard() {
  const navigate = useNavigate()
  // Pulled live from Supabase — totals across all grades.
  const { stats, loading, error, refresh } = useContentStats({ role: 'admin' })

  return (
    <section className="hdash hdash-admin">
      <WidgetCard icon="fa-gauge-high" title="نظرة عامة" accent="violet">
        <div className="hdash-stats">
          <StatCell icon="fa-user-graduate" label="الطلاب" value={stats.students} />
          <StatCell icon="fa-clipboard-list" label="الواجبات"  value={stats.homeworks} />
          <StatCell icon="fa-video"         label="الفيديوهات"   value={stats.videos} />
          <StatCell icon="fa-file-alt"      label="الامتحانات"    value={stats.exams} />
        </div>
        {error && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', color: '#dc2626',
            fontSize: 12, fontWeight: 600,
          }}>
            <i className="fas fa-triangle-exclamation" style={{ marginInlineEnd: 6 }}></i>
            تعذر تحميل بعض البيانات: {error}
          </div>
        )}
      </WidgetCard>

      <WidgetCard icon="fa-bolt" title="إجراءات سريعة" accent="amber">
        <div className="hdash-quick">
          <Link to="/exams"  className="hdash-quick-btn"><i className="fas fa-plus"></i> امتحان جديد</Link>
          <Link to="/videos" className="hdash-quick-btn"><i className="fas fa-plus"></i> فيديو جديد</Link>
          <Link to="/report"       className="hdash-quick-btn hdash-quick-ghost"><i className="fas fa-chart-line"></i> التقارير</Link>
          <Link to="/control-panel" className="hdash-quick-btn hdash-quick-ghost"><i className="fas fa-gear"></i> لوحة التحكم</Link>
        </div>
      </WidgetCard>
    </section>
  )
}

function StatCell({ icon, label, value }) {
  return (
    <div className="hdash-stat">
      <div className="hdash-stat-icon"><i className={`fas ${icon}`}></i></div>
      <div>
        <div className="hdash-stat-value">{value}</div>
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
