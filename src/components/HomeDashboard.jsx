import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listLectures } from '@backend/lecturesApi'
import { listStudents } from '@backend/profilesApi'
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
  lectures: { icon: 'fa-book-bookmark',  route: '/lectures' },
  exams:    { icon: 'fa-file-alt',       route: '/exams' },
  videos:   { icon: 'fa-video',          route: '/videos' },
  report:   { icon: 'fa-chart-line',     route: '/report' },
}

export default function HomeDashboard({ role }) {
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
function useContentStats({ role }) {
  const [stats,  setStats]  = useState({ students: 0, lectures: 0, videos: 0, exams: 0 })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  // Manual refresh — bumping this triggers a re-fetch.
  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)

  useEffect(() => {
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
        const [L, V, E, S] = await Promise.all([
          wrap(listLectures(), 'lectures'),
          wrap(listVideos(),   'videos'),
          wrap(listExams(),    'exams'),
          // Students aren't allowed to read other profiles → skip that.
          role === 'admin' ? wrap(listStudents(), 'students') : Promise.resolve({ ok: true, v: [] }),
        ])
        if (cancelled) return

        const lectures = L.ok ? L.v : []
        const videos   = V.ok ? V.v : []
        const exams    = E.ok ? E.v : []
        const students = S.ok ? S.v : []

        setStats({
          students: students.length,
          lectures: lectures.length,
          videos:   videos.length,
          exams:    exams.length,
        })

        // Carry richer per-item details into the recent panel: the type
        // (so we can render the right icon/label), grade (so we can show
        // a pill), and one extra piece of context per resource.
        const combined = [
          ...lectures.map(r => ({
            type: 'lectures', title: r.title, at: r.created_at,
            grade: r.grade, extra: r.subject || r.teacher || null,
          })),
          ...videos.map(r => ({
            type: 'videos', title: r.title, at: r.created_at,
            grade: r.grade,
            extra: r.video_parts ? `${r.video_parts.length} جزء` : null,
          })),
          ...exams.map(r => ({
            type: 'exams', title: r.title, at: r.created_at,
            grade: r.grade,
            extra: r.duration_minutes ? `${r.duration_minutes} د` : null,
          })),
        ]
        combined.sort((a, b) => new Date(b.at) - new Date(a.at))
        setRecent(combined.slice(0, 5))

        const fails = [L, V, E, S].filter((r) => !r.ok)
        if (fails.length) {
          setError(fails.map((f) => `${f.label}: ${f.e?.message || 'failed'}`).join(' • '))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [role, tick])

  return { stats, recent, loading, error, refresh }
}

// Arabic short labels for grade enums + content types — used by the
// recent-additions panel.
const GRADE_SHORT = {
  'first-prep':  'أولى إعدادي',
  'second-prep': 'تانية إعدادي',
  'third-prep':  'تالتة إعدادي',
}
const TYPE_LABEL = {
  lectures: 'محاضرة',
  videos:   'فيديو',
  exams:    'امتحان',
}

/* ─────────── Student ─────────── */

function StudentDashboard() {
  const navigate = useNavigate()
  const [recentNav, setRecentNav] = useState(() => safeParse('masar-recent', []))
  const [progress] = useState(() => safeParse('masar-progress', {
    lectures: { done: 0, total: 0 },
    videos:   { done: 0, total: 0 },
    exams:    { done: 0, total: 0 },
  }))
  const [upcoming] = useState(() => safeParse('masar-upcoming-exam', null))
  // Live content for THIS student's grade (RLS does the filtering).
  const { stats, recent, loading, error, refresh } = useContentStats({ role: 'student' })

  const routeLabels = {
    lectures: 'المحاضرات',
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

  const lastItem = recentNav[0]
  const countdown = useCountdown(upcoming?.at)

  return (
    <section className="hdash hdash-student">
      {/* Live grade-scoped overview — RLS shows only this student's grade. */}
      <WidgetCard icon="fa-gauge-high" title="نظرة عامة" accent="violet">
        <div className="hdash-stats">
          <StatCell icon="fa-book"     label="المحاضرات" value={stats.lectures} />
          <StatCell icon="fa-video"    label="الفيديوهات"   value={stats.videos} />
          <StatCell icon="fa-file-alt" label="الامتحانات"    value={stats.exams} />
        </div>
      </WidgetCard>

      <RecentAddsCard
        loading={loading}
        recent={recent}
        error={error}
        onRefresh={refresh}
        navigate={navigate}
      />

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
        <ProgressRow label="المحاضرات" data={progress.lectures} accent="#8b5cf6" />
        <ProgressRow label="الفيديوهات" data={progress.videos}   accent="#06b6d4" />
        <ProgressRow label="الامتحانات" data={progress.exams}    accent="#f59e0b" />
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
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, #06b6d4)` }}
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
  const { stats, recent, loading, error, refresh } = useContentStats({ role: 'admin' })

  return (
    <section className="hdash hdash-admin">
      <WidgetCard icon="fa-gauge-high" title="نظرة عامة" accent="violet">
        <div className="hdash-stats">
          <StatCell icon="fa-user-graduate" label="الطلاب" value={stats.students} />
          <StatCell icon="fa-book"          label="المحاضرات" value={stats.lectures} />
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

      <RecentAddsCard
        loading={loading}
        recent={recent}
        error={error}
        onRefresh={refresh}
        navigate={navigate}
      />

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

/* Recent additions panel — shared between admin and student. Each row
   shows: type icon, title, type+grade pills, an optional extra detail
   (subject / parts count / duration), and the relative time. The whole
   row navigates to the section. A small refresh button on the header
   lets the user re-pull without reloading the page. */
function RecentAddsCard({ loading, recent, onRefresh, navigate }) {
  return (
    <div className="hdash-card hdash-accent-cyan">
      <div className="hdash-card-head" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="hdash-card-icon"><i className="fas fa-clock"></i></div>
          <h3>أحدث الإضافات</h3>
        </div>
        <button
          onClick={onRefresh}
          title="تحديث"
          aria-label="تحديث"
          style={{
            border: 'none', background: 'transparent', color: 'inherit',
            cursor: 'pointer', padding: 6, borderRadius: 6, opacity: 0.7,
          }}
        >
          <i className={`fas fa-rotate-right ${loading ? 'fa-spin' : ''}`}></i>
        </button>
      </div>
      <div className="hdash-card-body">
        {loading ? (
          <EmptyHint icon="fa-spinner" text="جاري التحميل..." />
        ) : recent.length ? (
          <ul className="hdash-recent-list">
            {recent.map((r, i) => (
              <li
                key={i}
                onClick={() => navigate(ROUTE_META[r.type]?.route || '/')}
                style={{ cursor: 'pointer', alignItems: 'flex-start' }}
              >
                <i className={`fas ${ROUTE_META[r.type]?.icon || 'fa-circle'}`}></i>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="hdash-recent-title" style={{ fontWeight: 700 }}>{r.title}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
                    <span style={pillStyle('#7c3aed')}>{TYPE_LABEL[r.type]}</span>
                    {r.grade && (
                      <span style={pillStyle('#06b6d4')}>{GRADE_SHORT[r.grade] || r.grade}</span>
                    )}
                    {r.extra && (
                      <span style={pillStyle('#64748b')}>{r.extra}</span>
                    )}
                  </div>
                </div>
                <span className="hdash-recent-time" style={{ flexShrink: 0 }}>{relTime(r.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint icon="fa-inbox" text="لم تتم إضافة محتوى مؤخرًا" />
        )}
      </div>
    </div>
  )
}

const pillStyle = (color) => ({
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px', borderRadius: 999,
  background: `${color}1a`, color, fontWeight: 700,
  border: `1px solid ${color}40`,
  whiteSpace: 'nowrap',
})

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
