import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
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

/* ─────────── Student ─────────── */

function StudentDashboard() {
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const [recent, setRecent] = useState(() => safeParse('masar-recent', []))
  const [progress] = useState(() => safeParse('masar-progress', {
    lectures: { done: 0, total: 0 },
    videos:   { done: 0, total: 0 },
    exams:    { done: 0, total: 0 },
  }))
  const [upcoming] = useState(() => safeParse('masar-upcoming-exam', null))

  const routeLabels = {
    lectures: t('dashboard.lecturesLabel'),
    exams: t('dashboard.examsLabel'),
    videos: t('dashboard.videosLabel'),
    report: t('reports.pageTitle'),
  }

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
        title={t('dashboard.continueTitle')}
        accent="violet"
      >
        {lastItem ? (
          <button
            className="hdash-continue"
            onClick={() => navigate(lastItem.route)}
          >
            <div className="hdash-continue-main">
              <span className="hdash-continue-label">{routeLabels[lastItem.type] || lastItem.type}</span>
              <span className="hdash-continue-hint">{t('dashboard.lastVisit')} {relTime(lastItem.at, t)}</span>
            </div>
            <i className={`fas ${lang === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}`}></i>
          </button>
        ) : (
          <EmptyHint icon="fa-seedling" text={t('dashboard.startLearning')} />
        )}
      </WidgetCard>

      <WidgetCard
        icon="fa-chart-simple"
        title={t('dashboard.progressTitle')}
        accent="cyan"
      >
        <ProgressRow label={t('dashboard.lecturesLabel')} data={progress.lectures} accent="#8b5cf6" />
        <ProgressRow label={t('dashboard.videosLabel')} data={progress.videos}   accent="#06b6d4" />
        <ProgressRow label={t('dashboard.examsLabel')} data={progress.exams}    accent="#f59e0b" />
      </WidgetCard>

      <WidgetCard
        icon="fa-hourglass-half"
        title={t('dashboard.nextExam')}
        accent="amber"
      >
        {upcoming && countdown ? (
          <div className="hdash-countdown">
            <div className="hdash-countdown-title">{upcoming.title}</div>
            <div className="hdash-countdown-grid">
              <CountCell value={countdown.days} label={t('common.day')} />
              <CountCell value={countdown.hours} label={t('common.hour')} />
              <CountCell value={countdown.minutes} label={t('common.minute')} />
              <CountCell value={countdown.seconds} label={t('common.second')} />
            </div>
            <Link to="/exams" className="hdash-countdown-cta">
              {t('dashboard.getReady')} <i className={`fas ${lang === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}`}></i>
            </Link>
          </div>
        ) : (
          <EmptyHint icon="fa-calendar-check" text={t('dashboard.noScheduledExams')} />
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
  const { t } = useI18n()
  const stats = useMemo(() => safeParse('masar-content-counts', {
    students: 0, lectures: 0, videos: 0, exams: 0,
  }), [])
  const recent = safeParse('masar-content-recent', [])

  const routeLabels = {
    lectures: t('dashboard.lectures'),
    exams: t('dashboard.exams'),
    videos: t('dashboard.videos'),
    report: t('reports.pageTitle'),
  }

  return (
    <section className="hdash hdash-admin">
      <WidgetCard icon="fa-gauge-high" title={t('dashboard.overview')} accent="violet">
        <div className="hdash-stats">
          <StatCell icon="fa-user-graduate" label={t('dashboard.students')}     value={stats.students} />
          <StatCell icon="fa-book"          label={t('dashboard.lectures')} value={stats.lectures} />
          <StatCell icon="fa-video"         label={t('dashboard.videos')} value={stats.videos} />
          <StatCell icon="fa-file-alt"      label={t('dashboard.exams')} value={stats.exams} />
        </div>
      </WidgetCard>

      <WidgetCard icon="fa-clock" title={t('dashboard.recentAdds')} accent="cyan">
        {recent.length ? (
          <ul className="hdash-recent-list">
            {recent.slice(0, 5).map((r, i) => (
              <li key={i}>
                <i className={`fas ${ROUTE_META[r.type]?.icon || 'fa-circle'}`}></i>
                <span className="hdash-recent-title">{r.title}</span>
                <span className="hdash-recent-time">{relTime(r.at, t)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint icon="fa-inbox" text={t('dashboard.noRecentContent')} />
        )}
      </WidgetCard>

      <WidgetCard icon="fa-bolt" title={t('dashboard.quickActions')} accent="amber">
        <div className="hdash-quick">
          <Link to="/exams"  className="hdash-quick-btn"><i className="fas fa-plus"></i> {t('dashboard.newExam')}</Link>
          <Link to="/videos" className="hdash-quick-btn"><i className="fas fa-plus"></i> {t('dashboard.newVideo')}</Link>
          <Link to="/report"       className="hdash-quick-btn hdash-quick-ghost"><i className="fas fa-chart-line"></i> {t('dashboard.reportsLink')}</Link>
          <Link to="/control-panel" className="hdash-quick-btn hdash-quick-ghost"><i className="fas fa-gear"></i> {t('dashboard.controlPanelLink')}</Link>
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

function relTime(iso, t) {
  if (!iso) return ''
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return t('common.now')
    if (diff < 3600) return t('common.minutesAgo').replace('{n}', Math.floor(diff / 60))
    if (diff < 86400) return t('common.hoursAgo').replace('{n}', Math.floor(diff / 3600))
    return t('common.daysAgo').replace('{n}', Math.floor(diff / 86400))
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
