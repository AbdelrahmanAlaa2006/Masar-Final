import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTenant } from '../contexts/TenantContext'
import PrintReportHeader from '../components/PrintReportHeader'
import {
  listPreAssessmentReport,
  getPreAssessmentStats,
  getPreAssessmentFilterOptions,
} from '@backend/videoAssessmentsApi'
import { listBranches } from '@backend/branchesApi'
import { listGroups } from '@backend/groupsApi'
import './PreAssessmentReport.css'

/**
 * Dedicated report for Pre-Video Assessments.
 *
 * Deliberately NOT merged into the exams report: a gate sitting has its own
 * allowance, its own pass mark and its own lock/unlock meaning, and mixing the
 * two made both unreadable.
 *
 * Everything heavy happens in Postgres (pre_assessment_report /
 * _stats): filtering, the (gate x eligible student) cohort, best/latest score,
 * attempt counts, and pagination. This page fetches one page at a time and
 * never holds the full roster in memory, so it stays flat as the tenant grows
 * past a few thousand students.
 */

const PAGE_SIZE = 50

const STATUS_TABS = [
  { key: 'all',           label: 'الجميع',        icon: 'fa-th-list' },
  { key: 'passed',        label: 'ناجحون',        icon: 'fa-check' },
  { key: 'failed',        label: 'راسبون',        icon: 'fa-times' },
  { key: 'completed',     label: 'أدّوا التقييم',  icon: 'fa-clipboard-check' },
  { key: 'not_completed', label: 'لم يبدأوا',      icon: 'fa-hourglass-half' },
]

const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

const fmtDuration = (secs) => {
  if (secs == null) return '—'
  const s = Math.max(0, Math.floor(secs))
  if (s < 60) return `${s} ثانية`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')} دقيقة`
  return `${Math.floor(m / 60)} س ${m % 60} د`
}

const pct = (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`)

// امتحان and تسميع are the same kind of gate and read identically, so this is
// ONE report with a type dropdown — not two near-duplicate reports.
const TYPE_TABS = [
  { key: 'all',     label: 'الكل',    icon: 'fa-layer-group' },
  { key: 'exam',    label: 'امتحان',  icon: 'fa-file-pen' },
  { key: 'tasmee3', label: 'تسميع',   icon: 'fa-microphone-lines' },
]

export default function PreAssessmentReport() {
  const navigate = useNavigate()
  const { gradesList } = useTenant()
  const [searchParams] = useSearchParams()

  /* Individual mode: ?id=<uuid> pins the report to one student, the same way
     the other فردية reports do. Everything else is the group view. */
  const studentId = searchParams.get('id') || ''
  const studentNameParam = searchParams.get('student') || ''
  const isIndividual = !!studentId

  // ── Filters ────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [grade, setGrade] = useState('')
  const [branchId, setBranchId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [videoId, setVideoId] = useState('')
  const [assessmentId, setAssessmentId] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')

  // ── Data ───────────────────────────────────────────────────
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [stats, setStats] = useState(null)
  const [options, setOptions] = useState({ videos: [], assessments: [], gates: [] })
  const [branches, setBranches] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Typing in the search box must not fire a query per keystroke — the RPC
  // does an ILIKE across the roster.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const filters = useMemo(() => ({
    // In individual mode the student is pinned by id, so the roster-wide
    // filters (search / grade / branch / group) are irrelevant and hidden.
    studentId: studentId || null,
    search: isIndividual ? null : (debouncedSearch || null),
    grade: isIndividual ? null : (grade || null),
    branchId: isIndividual ? null : (branchId || null),
    groupId: isIndividual ? null : (groupId || null),
    videoId: videoId || null,
    assessmentId: assessmentId || null,
    status,
    type,
  }), [studentId, isIndividual, debouncedSearch, grade, branchId, groupId, videoId, assessmentId, status, type])

  // Any filter change resets to the first page.
  useEffect(() => { setPage(0) }, [filters])

  // Lookup lists — loaded once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [opts, br, gr] = await Promise.all([
          getPreAssessmentFilterOptions(),
          listBranches().catch(() => []),
          listGroups().catch(() => []),
        ])
        if (cancelled) return
        setOptions(opts || { videos: [], assessments: [], gates: [] })
        setBranches(br || [])
        setGroups(gr || [])
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل خيارات التصفية')
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Guard against an older request resolving after a newer one and
  // overwriting the fresher page.
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    const myReq = ++reqIdRef.current
    setLoading(true)
    setLoadError('')
    try {
      const [{ rows: r, total: t }, s] = await Promise.all([
        listPreAssessmentReport(filters, { limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
        getPreAssessmentStats(filters),
      ])
      if (myReq !== reqIdRef.current) return
      setRows(r)
      setTotal(t)
      setStats(s)
    } catch (err) {
      if (myReq !== reqIdRef.current) return
      setLoadError(err.message || 'تعذر تحميل التقرير')
      setRows([])
      setTotal(0)
    } finally {
      if (myReq === reqIdRef.current) setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { load() }, [load])

  const groupsForGrade = useMemo(
    () => (grade ? groups.filter(g => g.grade === grade) : groups),
    [groups, grade]
  )

  // Gate pairs (video ↔ assessment) restricted to this report's type. Drives
  // both the video list and the type-aware assessment list.
  const typedGates = useMemo(
    () => (options.gates || []).filter(g => type === 'all' || g.type === type),
    [options.gates, type]
  )

  // Only videos that actually carry an assessment of this type.
  const videoOptions = useMemo(() => {
    const ids = new Set(typedGates.map(g => g.video_id))
    return (options.videos || []).filter(v => ids.has(v.id))
  }, [options.videos, typedGates])

  // The assessment dropdown shows ONLY assessments attached to the chosen
  // video (the teacher's ask). With no video picked it lists every assessment
  // of this type. Deduped by assessment id.
  const assessmentOptions = useMemo(() => {
    const pool = videoId ? typedGates.filter(g => g.video_id === videoId) : typedGates
    const seen = new Map()
    for (const g of pool) {
      if (!seen.has(g.assessment_id)) {
        seen.set(g.assessment_id, { id: g.assessment_id, title: g.title, type: g.type })
      }
    }
    return [...seen.values()]
  }, [typedGates, videoId])

  // If the selected assessment no longer belongs to the selected video, clear it.
  useEffect(() => {
    if (assessmentId && !assessmentOptions.some(a => a.id === assessmentId)) {
      setAssessmentId('')
    }
  }, [assessmentOptions, assessmentId])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const resetFilters = () => {
    setSearch(''); setGrade(''); setBranchId(''); setGroupId('')
    setVideoId(''); setAssessmentId(''); setStatus('all'); setType('all')
  }

  const activeFilterCount = [
    isIndividual ? '' : debouncedSearch,
    isIndividual ? '' : grade,
    isIndividual ? '' : branchId,
    isIndividual ? '' : groupId,
    videoId, assessmentId,
  ].filter(Boolean).length + (status !== 'all' ? 1 : 0) + (type !== 'all' ? 1 : 0)

  // In individual mode the rows all belong to one student, so their name is
  // the page subject rather than a column value.
  const studentLabel = rows[0]?.student_name || studentNameParam || ''
  const studentMeta = rows[0] || null
  // 15 columns in group mode; individual mode drops the 5 identity columns.
  const colCount = isIndividual ? 10 : 15

  /* Export pulls EVERY matching row, not just the visible page — a report you
     can only export one page of is useless. Paged server-side so a large
     tenant doesn't try to build one enormous response. */
  const exportToCsv = async () => {
    setLoading(true)
    try {
      const all = []
      let offset = 0
      // Hard stop so a runaway filter can't spin forever.
      while (offset < 20000) {
        const { rows: chunk, total: t } = await listPreAssessmentReport(
          filters, { limit: 500, offset }
        )
        all.push(...chunk)
        offset += 500
        if (offset >= t || chunk.length === 0) break
      }

      const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
      const headers = [
        'اسم الطالب', 'رقم الطالب', 'الصف', 'الفرع', 'المجموعة',
        'الفيديو', 'التقييم', 'النوع',
        'المحاولات المستخدمة', 'المحاولات المسموحة',
        'أفضل نتيجة %', 'آخر نتيجة %', 'نسبة النجاح المطلوبة %',
        'الحالة', 'تاريخ الإنجاز', 'الوقت المستغرق',
      ]
      const body = all.map(r => [
        r.student_name, r.student_phone, r.grade, r.branch_name || '—', r.group_name || '—',
        r.video_title, r.assessment_title,
        r.assessment_type === 'tasmee3' ? 'تسميع' : 'امتحان',
        r.attempts_used,
        r.allowed_attempts === 0 ? 'غير محدود' : r.allowed_attempts,
        r.best_percent ?? '', r.latest_percent ?? '', r.passing_score,
        r.passed ? 'ناجح' : r.completed ? 'راسب' : 'لم يبدأ',
        r.last_submitted_at ? fmtDate(r.last_submitted_at) : '—',
        fmtDuration(r.seconds_taken),
      ])

      // The BOM makes Excel open the file as UTF-8 instead of mangling Arabic.
      const content = '﻿' + [headers.map(cell).join(','), ...body.map(r => r.map(cell).join(','))].join('\n')
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pre-assessment-report-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      setLoadError(err.message || 'تعذر تصدير التقرير')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="par-page" dir="rtl">
      <div className="par-container">
        {/* ── Header ── */}
        <div className="cp-header">
          <button className="par-back-btn" onClick={() => navigate('/report')}>
            <i className="fas fa-arrow-right"></i> العودة للتقارير
          </button>
          <div className="par-title-block">
            <h1>
              <i className="fas fa-clipboard-check"></i>
              تقرير التقييمات قبل الفيديو
            </h1>
            <p>
              {isIndividual
                ? `أداء ${studentLabel || 'الطالب'} في الامتحانات والتسميعات المطلوبة قبل مشاهدة الفيديوهات`
                : 'متابعة أداء الطلاب في الامتحانات والتسميعات المطلوبة قبل مشاهدة الفيديوهات'}
            </p>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {loadError && (
          <div className="par-error"><i className="fas fa-triangle-exclamation"></i> {loadError}</div>
        )}

        {/* Individual mode: the student's identity, lifted out of the table. */}
        {isIndividual && (
          <div className="par-student-banner">
            <div className="par-student-avatar"><i className="fas fa-user"></i></div>
            <div className="par-student-info">
              <div className="par-student-name">{studentLabel || '—'}</div>
              <div className="par-student-meta">
                {studentMeta?.student_phone && (
                  <span><i className="fas fa-id-badge"></i> {studentMeta.student_phone}</span>
                )}
                {studentMeta?.grade && (
                  <span><i className="fas fa-graduation-cap"></i> {studentMeta.grade}</span>
                )}
                {studentMeta?.branch_name && (
                  <span><i className="fas fa-building"></i> {studentMeta.branch_name}</span>
                )}
                {studentMeta?.group_name && (
                  <span><i className="fas fa-user-group"></i> {studentMeta.group_name}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Statistics ── */}
        {stats && (
          <div className="par-stats">
            <Stat icon="fa-users"           color="#5bc2e7" value={stats.total_students}    label="إجمالي الطلاب" />
            <Stat icon="fa-check-circle"    color="#10b981" value={stats.passed_count}      label="ناجحون" />
            <Stat icon="fa-times-circle"    color="#ef4444" value={stats.failed_count}      label="راسبون" />
            <Stat icon="fa-hourglass-half"  color="#94a3b8" value={stats.not_started_count} label="لم يبدأوا" />
            <Stat icon="fa-percentage"      color="#ed8936" value={pct(stats.average_score)}   label="متوسط الدرجات" />
            <Stat icon="fa-arrow-up"        color="#22c55e" value={pct(stats.highest_score)}   label="أعلى درجة" />
            <Stat icon="fa-arrow-down"      color="#f97316" value={pct(stats.lowest_score)}    label="أقل درجة" />
            <Stat icon="fa-repeat"          color="#8b5cf6" value={Number(stats.average_attempts || 0).toFixed(1)} label="متوسط المحاولات" />
            <Stat icon="fa-trophy"          color="#818cf8" value={pct(stats.pass_rate)}       label="نسبة النجاح" />
            <Stat icon="fa-chart-line"      color="#f43f5e" value={pct(stats.failure_rate)}    label="نسبة الرسوب" />
          </div>
        )}

        {/* ── Filters ── */}
        <div className="cp-panel par-filters">
          <div className="par-filters-head">
            <h2><i className="fas fa-filter"></i> تصفية النتائج</h2>
            {activeFilterCount > 0 && (
              <button className="par-reset" onClick={resetFilters}>
                <i className="fas fa-rotate-left"></i> مسح التصفية ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="par-filter-grid">
            {/* Roster-wide filters are meaningless once the report is pinned
                to one student, so individual mode drops them entirely. */}
            {!isIndividual && (
              <>
                <div className="par-field par-field-wide">
                  <label>بحث عن طالب</label>
                  <div className="par-search">
                    <i className="fas fa-magnifying-glass"></i>
                    <input
                      type="text"
                      placeholder="الاسم أو رقم الهاتف..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="par-field">
                  <label>الصف الدراسي</label>
                  <select value={grade} onChange={(e) => { setGrade(e.target.value); setGroupId('') }}>
                    <option value="">كل الصفوف</option>
                    {(gradesList || []).map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="par-field">
                  <label>الفرع</label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">كل الفروع</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div className="par-field">
                  <label>المجموعة</label>
                  <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                    <option value="">كل المجموعات</option>
                    {groupsForGrade.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </>
            )}

            <div className="par-field">
              <label>الفيديو</label>
              <select value={videoId} onChange={(e) => setVideoId(e.target.value)}>
                <option value="">كل الفيديوهات</option>
                {videoOptions.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
            </div>

            <div className="par-field">
              <label>التقييم</label>
              <select value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
                <option value="">
                  {videoId ? 'كل تقييمات هذا الفيديو' : 'كل التقييمات'}
                </option>
                {assessmentOptions.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.type === 'tasmee3' ? 'تسميع' : 'امتحان'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Type: one report, filtered — not two separate reports. */}
          <div className="par-tabs par-tabs-type">
            <span className="par-tabs-label"><i className="fas fa-shapes"></i> النوع:</span>
            {TYPE_TABS.map(t => (
              <button
                key={t.key}
                className={`cp-btn ${type === t.key ? 'cp-btn-info-active' : 'cp-btn-ghost'}`}
                onClick={() => setType(t.key)}
              >
                <i className={`fas ${t.icon}`}></i> {t.label}
              </button>
            ))}
          </div>

          <div className="par-tabs">
            <span className="par-tabs-label"><i className="fas fa-filter"></i> الحالة:</span>
            {STATUS_TABS.map(t => (
              <button
                key={t.key}
                className={`cp-btn ${status === t.key ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                onClick={() => setStatus(t.key)}
              >
                <i className={`fas ${t.icon}`}></i> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="cp-table-card par-table-card">
          <PrintReportHeader
            subtitle={isIndividual && studentLabel
              ? `تقرير التقييمات قبل الفيديو — ${studentLabel}`
              : 'تقرير التقييمات قبل الفيديو'}
          />

          <div className="par-table-head">
            <div className="par-table-title">
              <h2><i className="fas fa-clipboard-list"></i> النتائج التفصيلية</h2>
              <span className="cp-badge cp-badge-neutral">{total}</span>
            </div>
            <div className="par-table-actions">
              <button onClick={exportToCsv} disabled={loading || total === 0}>
                <i className="fas fa-file-excel"></i> تصدير Excel
              </button>
              <button onClick={() => window.print()} disabled={total === 0}>
                <i className="fas fa-print"></i> طباعة / PDF
              </button>
            </div>
          </div>

          <div className="cp-table-container">
            <table className="cp-table par-table">
              <thead>
                <tr>
                  <th>#</th>
                  {/* In individual mode every row is the same student, so the
                      identity columns collapse into the banner above. */}
                  {!isIndividual && <th>اسم الطالب</th>}
                  {!isIndividual && <th>رقم الطالب</th>}
                  {!isIndividual && <th>الصف</th>}
                  {!isIndividual && <th>الفرع</th>}
                  {!isIndividual && <th>المجموعة</th>}
                  <th>الفيديو</th>
                  <th>التقييم</th>
                  <th>المحاولات</th>
                  <th>أفضل نتيجة</th>
                  <th>آخر نتيجة</th>
                  <th>نسبة النجاح</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنجاز</th>
                  <th>الوقت المستغرق</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={colCount} className="par-msg">
                    <i className="fas fa-spinner fa-spin"></i> جاري التحميل...
                  </td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={colCount} className="par-msg">
                    <i className="fas fa-inbox"></i> لا توجد نتائج مطابقة
                  </td></tr>
                )}
                {!loading && rows.map((r, i) => (
                  <tr key={`${r.gate_id}_${r.student_id}`}>
                    <td>{page * PAGE_SIZE + i + 1}</td>
                    {!isIndividual && <td className="par-name">{r.student_name}</td>}
                    {!isIndividual && <td>{r.student_phone || '—'}</td>}
                    {!isIndividual && <td>{r.grade || '—'}</td>}
                    {!isIndividual && <td>{r.branch_name || '—'}</td>}
                    {!isIndividual && <td>{r.group_name || '—'}</td>}
                    <td className="par-truncate" title={r.video_title}>{r.video_title}</td>
                    <td className="par-truncate" title={r.assessment_title}>
                      <span className={`par-type par-type-${r.assessment_type}`}>
                        {r.assessment_type === 'tasmee3' ? 'تسميع' : 'امتحان'}
                      </span>
                      {r.assessment_title}
                    </td>
                    <td>
                      {r.attempts_used} / {r.allowed_attempts === 0 ? '∞' : r.allowed_attempts}
                    </td>
                    <td className="par-score">{pct(r.best_percent)}</td>
                    <td>{pct(r.latest_percent)}</td>
                    <td>{pct(r.passing_score)}</td>
                    <td>
                      <span className={`par-status ${r.passed ? 'is-pass' : r.completed ? 'is-fail' : 'is-none'}`}>
                        {r.passed ? 'ناجح' : r.completed ? 'راسب' : 'لم يبدأ'}
                      </span>
                    </td>
                    <td>{fmtDate(r.last_submitted_at)}</td>
                    <td>{fmtDuration(r.seconds_taken)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="par-pager">
              <button disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>
                <i className="fas fa-chevron-right"></i> السابق
              </button>
              <span>صفحة {page + 1} من {totalPages}</span>
              <button disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)}>
                التالي <i className="fas fa-chevron-left"></i>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, color, value, label }) {
  return (
    <div className="par-stat" style={{ borderInlineStart: `3px solid ${color}` }}>
      <i className={`fas ${icon}`} style={{ color }}></i>
      <div>
        <div className="par-stat-val" style={{ color }}>{value ?? 0}</div>
        <div className="par-stat-lbl">{label}</div>
      </div>
    </div>
  )
}
