import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  lectures: { label: 'المحاضرات',  icon: 'fa-book-bookmark',  route: '/lectures' },
  exams:    { label: 'الامتحانات', icon: 'fa-file-alt',       route: '/exams' },
  videos:   { label: 'الفيديوهات', icon: 'fa-video',          route: '/videos' },
  report:   { label: 'التقارير',   icon: 'fa-chart-line',     route: '/report' },
}

export default function HomeDashboard({ role }) {
  return role === 'admin' ? <AdminDashboard /> : <StudentDashboard />
}

/* ─────────── Student ─────────── */

function StudentDashboard() {
  const navigate = useNavigate()
  const [recent, setRecent] = useState(() => safeParse('masar-recent', []))
  const [progress] = useState(() => safeParse('masar-progress', {
    lectures: { done: 0, total: 0 },
    videos:   { done: 0, total: 0 },
    exams:    { done: 0, total: 0 },
  }))
  const [upcoming] = useState(() => safeParse('masar-upcoming-exam', null))

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'masar-recent') setRecent(safeParse('masar-recent', []))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const lastItem = recent[0]
  const countdown = useCountdown(upcoming?.at)

  return (
    <section className="hdash hdash-student">
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
              <span className="hdash-continue-label">{ROUTE_META[lastItem.type]?.label || lastItem.type}</span>
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
  const stats = useMemo(() => safeParse('masar-content-counts', {
    students: 0, lectures: 0, videos: 0, exams: 0,
  }), [])
  const recent = safeParse('masar-content-recent', [])

  return (
    <section className="hdash hdash-admin">
      <WidgetCard icon="fa-gauge-high" title="نظرة عامة" accent="violet">
        <div className="hdash-stats">
          <StatCell icon="fa-user-graduate" label="الطلاب"     value={stats.students} />
          <StatCell icon="fa-book"          label="المحاضرات" value={stats.lectures} />
          <StatCell icon="fa-video"         label="الفيديوهات" value={stats.videos} />
          <StatCell icon="fa-file-alt"      label="الامتحانات" value={stats.exams} />
        </div>
      </WidgetCard>

      <WidgetCard icon="fa-clock" title="أحدث الإضافات" accent="cyan">
        {recent.length ? (
          <ul className="hdash-recent-list">
            {recent.slice(0, 5).map((r, i) => (
              <li key={i}>
                <i className={`fas ${ROUTE_META[r.type]?.icon || 'fa-circle'}`}></i>
                <span className="hdash-recent-title">{r.title}</span>
                <span className="hdash-recent-time">{relTime(r.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint icon="fa-inbox" text="لم تتم إضافة محتوى مؤخرًا" />
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
