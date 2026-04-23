import React, { useMemo, useState, useEffect } from 'react'
import { listExams, setExamRevealGrades } from '@backend/examsApi'
import { listVideos } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import './ControlPanel.css'

const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}
const GRADE_ORDER = ['first-prep', 'second-prep', 'third-prep']

const DEFAULT_VIDEO_ATTEMPTS = 3
const DEFAULT_EXAM_ATTEMPTS = 1

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('')

const fmtDate = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('ar-EG') } catch { return '' }
}

/* ──────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────── */
export default function ControlPanel() {
  /* navigation */
  const [section, setSection] = useState('home') // 'home' | 'videos' | 'exams' | 'reveal'
  const [scope, setScope] = useState(null) // 'prep' | 'student'
  const [target, setTarget] = useState(null) // { kind, id, name, prep?, ... }
  const [pickerQuery, setPickerQuery] = useState('')

  /* real data from Supabase */
  const [students, setStudents] = useState([])
  const [videos, setVideos]     = useState([])
  const [exams, setExams]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')

  /* per-target overrides (client-side only for MVP — no access_overrides table yet):
     key = `${kind}:${targetId}:${itemId}` -> { allowed, attempts } */
  const [overrides, setOverrides] = useState({})

  /* toast */
  const [toast, setToast] = useState(null)
  const flash = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2200)
  }

  /* ── Initial fetch of real data ─────────────────────────── */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, v, e] = await Promise.all([listStudents(), listVideos(), listExams()])
        if (cancelled) return
        setStudents(s)
        setVideos(v)
        setExams(e)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  /* ───── derived data for picker lists ───── */
  const allStudents = useMemo(
    () => students.map((s) => ({
      id: s.id,
      displayId: s.phone || s.id.slice(0, 8),
      name: s.name,
      grade: s.grade,
      prep: GRADE_LABEL[s.grade] || '—',
    })),
    [students]
  )

  const allPreps = useMemo(() => {
    const counts = {}
    students.forEach((s) => {
      if (!s.grade) return
      counts[s.grade] = (counts[s.grade] || 0) + 1
    })
    return GRADE_ORDER
      .filter((g) => counts[g] !== undefined)
      .map((g) => ({
        id: g,              // DB enum value
        name: GRADE_LABEL[g],
        studentCount: counts[g],
      }))
  }, [students])

  /* DB grade key for the items list once a target is chosen */
  const targetGrade = useMemo(() => {
    if (!target) return null
    if (target.kind === 'prep') return target.id      // already DB enum
    if (target.kind === 'student') return target.grade
    return null
  }, [target])

  const items = useMemo(() => {
    if (!targetGrade) return []
    if (section === 'videos') {
      return videos
        .filter((v) => v.grade === targetGrade)
        .map((v) => ({
          id: v.id,
          title: v.title,
          subject: v.description || '',
          date: fmtDate(v.created_at),
        }))
    }
    if (section === 'exams') {
      return exams
        .filter((e) => e.grade === targetGrade)
        .map((e) => ({
          id: e.id,
          title: e.title,
          subject: e.number ? `رقم ${e.number}` : '',
          date: fmtDate(e.created_at),
        }))
    }
    return []
  }, [section, targetGrade, videos, exams])

  /* ───── override helpers ───── */
  const keyFor = (item) =>
    target ? `${target.kind}:${target.id}:${item.id}` : ''

  const stateFor = (item) => {
    const o = overrides[keyFor(item)]
    return {
      allowed: o?.allowed ?? true,
      attempts:
        o?.attempts ??
        (section === 'videos' ? DEFAULT_VIDEO_ATTEMPTS : DEFAULT_EXAM_ATTEMPTS),
    }
  }

  const updateItem = (item, patch) => {
    const key = keyFor(item)
    setOverrides((prev) => ({
      ...prev,
      [key]: { ...stateFor(item), ...prev[key], ...patch },
    }))
  }

  const setAttempts = (item, value) => {
    const v = Math.max(0, Math.min(99, parseInt(value, 10) || 0))
    updateItem(item, { attempts: v })
  }

  const bumpAttempts = (item, delta) => {
    const cur = stateFor(item).attempts
    setAttempts(item, cur + delta)
  }

  const toggleAllowed = (item) => {
    const cur = stateFor(item).allowed
    updateItem(item, { allowed: !cur })
  }

  const bulkSet = (allowed) => {
    items.forEach((item) => updateItem(item, { allowed }))
    flash(allowed ? 'تم السماح بكل العناصر' : 'تم منع كل العناصر')
  }

  const bulkAddAttempt = () => {
    items.forEach((item) => bumpAttempts(item, 1))
    flash('تم إضافة محاولة لكل العناصر')
  }

  /* ───── navigation helpers ───── */
  const goHome = () => {
    setSection('home')
    setScope(null)
    setTarget(null)
    setPickerQuery('')
  }
  const enterSection = (s) => {
    setSection(s)
    setScope(null)
    setTarget(null)
    setPickerQuery('')
  }
  const chooseScope = (s) => {
    setScope(s)
    setTarget(null)
    setPickerQuery('')
  }
  const chooseTarget = (kind, entity) => {
    setTarget({ kind, ...entity })
  }
  const backFromTarget = () => setTarget(null)
  const backFromScope = () => setScope(null)

  /* ───── picker filtering ───── */
  const pickerList = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    let list = []
    if (scope === 'student') list = allStudents
    else if (scope === 'prep') list = allPreps
    if (!q) return list
    return list.filter((row) =>
      Object.values(row).join(' ').toLowerCase().includes(q)
    )
  }, [scope, pickerQuery, allStudents, allPreps])

  /* ───── derived counts for breadcrumb / stats ───── */
  const stats = useMemo(() => {
    const total = items.length
    let blocked = 0
    let allowedCount = 0
    items.forEach((it) => {
      const s = stateFor(it)
      if (s.allowed) allowedCount++
      else blocked++
    })
    return { total, allowed: allowedCount, blocked }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, overrides, section])

  /* ──────────────────────────────────────────────────────────
     RENDER
     ────────────────────────────────────────────────────────── */
  return (
    <main className="cp-page">
      <div className="cp-container">
        {/* Top header */}
        <div className="cp-page-header">
          <div className="cp-page-icon">
            <i className="fas fa-sliders"></i>
          </div>
          <div>
            <h1>لوحة التحكم</h1>
            <p>إدارة صلاحيات الفيديوهات والامتحانات للطلاب والمراحل الدراسية</p>
          </div>
        </div>

        {loadError && (
          <div className="cp-empty" style={{ color: '#c53030' }}>
            <i className="fas fa-circle-exclamation"></i>
            <p>{loadError}</p>
          </div>
        )}

        {/* Breadcrumbs */}
        <Breadcrumbs
          section={section}
          scope={scope}
          target={target}
          onHome={goHome}
          onSection={() => enterSection(section)}
          onScope={() => chooseScope(scope)}
        />

        {/* HOME */}
        {section === 'home' && (
          <div className="cp-home-grid">
            <SectionCard
              icon="fa-play-circle"
              accent="blue"
              title="إدارة الفيديوهات"
              desc="تحكم في صلاحيات المشاهدة وعدد المحاولات لكل طالب أو مرحلة"
              onClick={() => enterSection('videos')}
            />
            <SectionCard
              icon="fa-file-alt"
              accent="orange"
              title="إدارة الامتحانات"
              desc="السماح بدخول الامتحانات وتعديل عدد المحاولات"
              onClick={() => enterSection('exams')}
            />
            <SectionCard
              icon="fa-eye"
              accent="purple"
              title="إظهار نتائج الامتحانات"
              desc="التحكم في إظهار أو إخفاء درجات كل امتحان للطلاب في تقاريرهم"
              onClick={() => enterSection('reveal')}
            />
          </div>
        )}

        {/* REVEAL PANEL — real exams from DB, toggle reveal_grades */}
        {section === 'reveal' && (
          <RevealPanel onBack={goHome} flash={flash} />
        )}

        {/* Loading state for non-home sections */}
        {section !== 'home' && section !== 'reveal' && loading && (
          <div className="cp-empty">
            <i className="fas fa-spinner fa-spin"></i>
            <p>جارٍ التحميل...</p>
          </div>
        )}

        {/* SCOPE PICKER */}
        {section !== 'home' && section !== 'reveal' && !loading && !scope && (
          <ScopePicker section={section} onPick={chooseScope} onBack={goHome} />
        )}

        {/* TARGET PICKER */}
        {section !== 'home' && section !== 'reveal' && !loading && scope && !target && (
          <TargetPicker
            scope={scope}
            list={pickerList}
            query={pickerQuery}
            onQuery={setPickerQuery}
            onPick={chooseTarget}
            onBack={backFromScope}
          />
        )}

        {/* ITEMS (videos/exams) FOR TARGET */}
        {section !== 'home' && section !== 'reveal' && !loading && target && (
          <ItemsManager
            section={section}
            scope={scope}
            target={target}
            items={items}
            stats={stats}
            stateFor={stateFor}
            onToggle={toggleAllowed}
            onAttempts={setAttempts}
            onBump={bumpAttempts}
            onReset={(item) => {
              const key = keyFor(item)
              setOverrides((prev) => {
                const n = { ...prev }
                delete n[key]
                return n
              })
              flash('تم استرجاع الإعدادات الافتراضية')
            }}
            onBulkAllow={() => bulkSet(true)}
            onBulkBlock={() => bulkSet(false)}
            onBulkAddAttempt={bulkAddAttempt}
            onBack={backFromTarget}
          />
        )}
      </div>

      {toast && (
        <div className={`cp-toast cp-toast-${toast.kind}`}>
          <i
            className={`fas ${
              toast.kind === 'success'
                ? 'fa-circle-check'
                : toast.kind === 'warning'
                ? 'fa-circle-exclamation'
                : 'fa-circle-info'
            }`}
          ></i>
          <span>{toast.msg}</span>
        </div>
      )}
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────────────────── */

function Breadcrumbs({ section, scope, target, onHome, onSection, onScope }) {
  const sectionLabel =
    section === 'videos' ? 'الفيديوهات'
    : section === 'exams' ? 'الامتحانات'
    : section === 'reveal' ? 'إظهار نتائج الامتحانات'
    : ''
  const scopeLabel =
    scope === 'student' ? 'حسب الطالب' : scope === 'prep' ? 'حسب المرحلة' : ''
  return (
    <nav className="cp-crumbs" aria-label="breadcrumb">
      <button onClick={onHome} className={section === 'home' ? 'is-active' : ''}>
        <i className="fas fa-house"></i> الرئيسية
      </button>
      {section !== 'home' && (
        <>
          <i className="fas fa-chevron-left cp-crumb-sep"></i>
          <button onClick={onSection} className={!scope ? 'is-active' : ''}>
            {sectionLabel}
          </button>
        </>
      )}
      {scope && (
        <>
          <i className="fas fa-chevron-left cp-crumb-sep"></i>
          <button onClick={onScope} className={!target ? 'is-active' : ''}>
            {scopeLabel}
          </button>
        </>
      )}
      {target && (
        <>
          <i className="fas fa-chevron-left cp-crumb-sep"></i>
          <button className="is-active">{target.name}</button>
        </>
      )}
    </nav>
  )
}

function SectionCard({ icon, title, desc, accent, onClick }) {
  return (
    <button className={`cp-section-card cp-accent-${accent}`} onClick={onClick}>
      <div className="cp-section-icon">
        <i className={`fas ${icon}`}></i>
      </div>
      <div className="cp-section-body">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <i className="fas fa-arrow-left cp-section-arrow"></i>
    </button>
  )
}

function ScopePicker({ section, onPick, onBack }) {
  const verb = section === 'videos' ? 'الفيديوهات' : 'الامتحانات'
  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className="fas fa-arrow-right"></i> رجوع
      </button>
      <header className="cp-panel-header">
        <h2>اختر نطاق التحكم في {verb}</h2>
        <p>حدّد المستوى الذي تريد تطبيق التغييرات عليه</p>
      </header>

      <div className="cp-scope-grid">
        <ScopeCard
          icon="fa-user"
          color="purple"
          title="حسب الطالب"
          desc="تحكم في صلاحيات طالب محدد بشكل فردي"
          onClick={() => onPick('student')}
        />
        <ScopeCard
          icon="fa-graduation-cap"
          color="orange"
          title="حسب المرحلة الدراسية"
          desc="طبّق التغييرات على جميع طلاب المرحلة"
          onClick={() => onPick('prep')}
        />
      </div>
    </section>
  )
}

function ScopeCard({ icon, title, desc, color, onClick }) {
  return (
    <button className={`cp-scope-card cp-color-${color}`} onClick={onClick}>
      <div className="cp-scope-icon">
        <i className={`fas ${icon}`}></i>
      </div>
      <h4>{title}</h4>
      <p>{desc}</p>
      <span className="cp-scope-cta">
        اختر <i className="fas fa-arrow-left"></i>
      </span>
    </button>
  )
}

function TargetPicker({ scope, list, query, onQuery, onPick, onBack }) {
  const label = scope === 'student' ? 'الطلاب' : 'المراحل الدراسية'
  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className="fas fa-arrow-right"></i> رجوع
      </button>

      <header className="cp-panel-header">
        <h2>اختر من {label}</h2>
        <p>ابحث ثم انقر على العنصر للانتقال إلى لوحة التحكم الخاصة به</p>
      </header>

      <div className="cp-search">
        <i className="fas fa-search"></i>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={
            scope === 'student'
              ? 'ابحث بالاسم أو رقم الطالب أو المرحلة...'
              : 'ابحث بالمرحلة...'
          }
        />
        {query && (
          <button className="cp-search-clear" onClick={() => onQuery('')}>
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>

      <div className="cp-target-meta">
        <i className="fas fa-list-ul"></i>
        <span>{list.length} نتيجة</span>
      </div>

      {list.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-folder-open"></i>
          <p>لا توجد نتائج مطابقة</p>
        </div>
      ) : (
        <div className="cp-target-grid">
          {list.map((row) => (
            <TargetRow key={row.id} scope={scope} row={row} onPick={onPick} />
          ))}
        </div>
      )}
    </section>
  )
}

function TargetRow({ scope, row, onPick }) {
  if (scope === 'student') {
    return (
      <button className="cp-target cp-target-student" onClick={() => onPick('student', row)}>
        <div className="cp-avatar cp-avatar-purple">{initials(row.name)}</div>
        <div className="cp-target-body">
          <div className="cp-target-name">
            <span>{row.name}</span>
            <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {row.displayId}</span>
          </div>
          <div className="cp-target-sub">
            <span><i className="fas fa-graduation-cap"></i> {row.prep}</span>
          </div>
        </div>
        <i className="fas fa-arrow-left cp-target-arrow"></i>
      </button>
    )
  }
  /* prep */
  return (
    <button className="cp-target cp-target-prep" onClick={() => onPick('prep', row)}>
      <div className="cp-avatar cp-avatar-orange"><i className="fas fa-graduation-cap"></i></div>
      <div className="cp-target-body">
        <div className="cp-target-name"><span>{row.name}</span></div>
        <div className="cp-target-sub">
          <span><i className="fas fa-user"></i> {row.studentCount} طالب</span>
        </div>
      </div>
      <i className="fas fa-arrow-left cp-target-arrow"></i>
    </button>
  )
}

function ItemsManager({
  section,
  scope,
  target,
  items,
  stats,
  stateFor,
  onToggle,
  onAttempts,
  onBump,
  onReset,
  onBulkAllow,
  onBulkBlock,
  onBulkAddAttempt,
  onBack,
}) {
  const isVideo = section === 'videos'
  const scopeLabel = scope === 'student' ? 'الطالب' : 'المرحلة'

  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className="fas fa-arrow-right"></i> رجوع
      </button>

      {/* Target summary */}
      <div className="cp-target-banner">
        <div className={`cp-avatar ${
          scope === 'student' ? 'cp-avatar-purple' : 'cp-avatar-orange'
        }`}>
          {scope === 'student' ? initials(target.name) : <i className="fas fa-graduation-cap"></i>}
        </div>
        <div className="cp-target-banner-body">
          <div className="cp-target-banner-label">
            <i className="fas fa-bullseye"></i> {scopeLabel}
          </div>
          <div className="cp-target-banner-name">{target.name}</div>
          <div className="cp-target-banner-meta">
            {scope === 'student' && (
              <>
                <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {target.displayId}</span>
                <span><i className="fas fa-graduation-cap"></i> {target.prep}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats + bulk actions */}
      <div className="cp-stats-row">
        <div className="cp-stat">
          <i className={`fas ${isVideo ? 'fa-play-circle' : 'fa-file-alt'}`}></i>
          <div>
            <div className="cp-stat-val">{stats.total}</div>
            <div className="cp-stat-lbl">{isVideo ? 'فيديوهات' : 'امتحانات'}</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-good">
          <i className="fas fa-circle-check"></i>
          <div>
            <div className="cp-stat-val">{stats.allowed}</div>
            <div className="cp-stat-lbl">مسموح</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-bad">
          <i className="fas fa-ban"></i>
          <div>
            <div className="cp-stat-val">{stats.blocked}</div>
            <div className="cp-stat-lbl">محظور</div>
          </div>
        </div>
      </div>

      <div className="cp-bulk-bar">
        <span className="cp-bulk-label">
          <i className="fas fa-bolt"></i> إجراءات جماعية:
        </span>
        <button className="cp-btn cp-btn-success" onClick={onBulkAllow}>
          <i className="fas fa-check-double"></i> سماح الكل
        </button>
        <button className="cp-btn cp-btn-danger" onClick={onBulkBlock}>
          <i className="fas fa-ban"></i> منع الكل
        </button>
        <button className="cp-btn cp-btn-ghost" onClick={onBulkAddAttempt}>
          <i className="fas fa-plus"></i> +1 محاولة للكل
        </button>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-inbox"></i>
          <p>لا توجد {isVideo ? 'فيديوهات' : 'امتحانات'} في هذه المرحلة بعد</p>
        </div>
      ) : (
        <ul className="cp-items">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              isVideo={isVideo}
              state={stateFor(item)}
              onToggle={() => onToggle(item)}
              onAttempts={(v) => onAttempts(item, v)}
              onBump={(d) => onBump(item, d)}
              onReset={() => onReset(item)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ItemRow({ item, isVideo, state, onToggle, onAttempts, onBump, onReset }) {
  return (
    <li className={`cp-item ${state.allowed ? '' : 'is-blocked'}`}>
      <div className="cp-item-icon">
        <i className={`fas ${isVideo ? 'fa-play-circle' : 'fa-file-alt'}`}></i>
      </div>

      <div className="cp-item-body">
        <div className="cp-item-title">
          <span>{item.title}</span>
        </div>
        <div className="cp-item-meta">
          {item.subject && <span><i className="fas fa-book"></i> {item.subject}</span>}
          {item.date && <span><i className="fas fa-calendar"></i> {item.date}</span>}
          <span className={`cp-status-pill ${state.allowed ? 'cp-status-on' : 'cp-status-off'}`}>
            <i className={`fas ${state.allowed ? 'fa-circle-check' : 'fa-ban'}`}></i>
            {state.allowed ? 'مسموح' : 'محظور'}
          </span>
        </div>
      </div>

      <div className="cp-item-controls">
        {/* Allow toggle */}
        <label className="cp-switch" title={state.allowed ? 'مسموح بالوصول' : 'الوصول محظور'}>
          <input type="checkbox" checked={state.allowed} onChange={onToggle} />
          <span className="cp-switch-slider"></span>
        </label>

        {/* Attempts stepper */}
        <div className="cp-stepper" title="عدد المحاولات المسموح بها">
          <button className="cp-stepper-btn" onClick={() => onBump(-1)} aria-label="إنقاص">
            <i className="fas fa-minus"></i>
          </button>
          <input
            type="number"
            min="0"
            max="99"
            value={state.attempts}
            onChange={(e) => onAttempts(e.target.value)}
            className="cp-stepper-input"
          />
          <button className="cp-stepper-btn" onClick={() => onBump(1)} aria-label="زيادة">
            <i className="fas fa-plus"></i>
          </button>
          <span className="cp-stepper-lbl">محاولة</span>
        </div>

        <button className="cp-icon-btn" onClick={onReset} title="استرجاع الإعدادات الافتراضية">
          <i className="fas fa-rotate-left"></i>
        </button>
      </div>
    </li>
  )
}

/* ──────────────────────────────────────────────────────────────
   RevealPanel — lists real exams and lets the admin toggle the
   per-exam reveal_grades flag straight in Supabase.
   ────────────────────────────────────────────────────────────── */
function RevealPanel({ onBack, flash }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [busyId, setBusyId]   = useState(null)
  const [query, setQuery]     = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const data = await listExams()
        if (!cancelled) setRows(data)
      } catch (e) {
        if (!cancelled) setError(e.message || 'تعذّر تحميل الامتحانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.title, r.number, GRADE_LABEL[r.grade]].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [rows, query])

  const handleToggle = async (exam) => {
    const next = !exam.reveal_grades
    setBusyId(exam.id)
    try {
      await setExamRevealGrades(exam.id, next)
      setRows((prev) => prev.map((r) => r.id === exam.id ? { ...r, reveal_grades: next } : r))
      flash(
        next
          ? `تم إظهار نتائج: ${exam.title} للطلاب`
          : `تم إخفاء نتائج: ${exam.title}`,
        next ? 'success' : 'warning'
      )
    } catch (e) {
      flash(e.message || 'تعذّر تحديث الحالة', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const revealedCount = rows.filter((r) => r.reveal_grades).length
  const hiddenCount   = rows.length - revealedCount

  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className="fas fa-arrow-right"></i> رجوع
      </button>

      <div className="cp-panel-header">
        <h2><i className="fas fa-eye"></i> إظهار نتائج الامتحانات</h2>
        <p>تحكّم في ظهور درجات كل امتحان للطلاب في تقاريرهم الفردية.</p>
      </div>

      {/* Stats */}
      <div className="cp-stats-row">
        <div className="cp-stat">
          <i className="fas fa-file-alt"></i>
          <div>
            <div className="cp-stat-val">{rows.length}</div>
            <div className="cp-stat-lbl">امتحانات</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-info">
          <i className="fas fa-eye"></i>
          <div>
            <div className="cp-stat-val">{revealedCount}</div>
            <div className="cp-stat-lbl">نتائج معلنة</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-bad">
          <i className="fas fa-eye-slash"></i>
          <div>
            <div className="cp-stat-val">{hiddenCount}</div>
            <div className="cp-stat-lbl">نتائج مخفية</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="cp-search">
        <i className="fas fa-search"></i>
        <input
          type="text"
          placeholder="ابحث باسم الامتحان أو المرحلة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="cp-search-clear" onClick={() => setQuery('')} aria-label="مسح">
            <i className="fas fa-xmark"></i>
          </button>
        )}
      </div>

      {loading && (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جارٍ التحميل...</p>
        </div>
      )}
      {error && !loading && (
        <div className="cp-empty">
          <i className="fas fa-circle-exclamation" style={{ color: '#c53030' }}></i>
          <p style={{ color: '#c53030' }}>{error}</p>
        </div>
      )}

      {!loading && !error && (
        filtered.length === 0 ? (
          <div className="cp-empty">
            <i className="fas fa-inbox"></i>
            <p>لا توجد امتحانات مطابقة</p>
          </div>
        ) : (
          <ul className="cp-items">
            {filtered.map((ex) => {
              const revealed = !!ex.reveal_grades
              const busy = busyId === ex.id
              return (
                <li key={ex.id} className="cp-item">
                  <div className="cp-item-icon">
                    <i className="fas fa-file-alt"></i>
                  </div>
                  <div className="cp-item-body">
                    <div className="cp-item-title">
                      <span>{ex.title}</span>
                      {ex.number && (
                        <span className="cp-id-pill cp-id-pill-sm">
                          <i className="fas fa-hashtag"></i>{ex.number}
                        </span>
                      )}
                    </div>
                    <div className="cp-item-meta">
                      <span><i className="fas fa-graduation-cap"></i> {GRADE_LABEL[ex.grade] || ex.grade}</span>
                      <span><i className="fas fa-clock"></i> {ex.duration_minutes} دقيقة</span>
                      <span><i className="fas fa-star"></i> {ex.total_points} درجة</span>
                      <span className={`cp-status-pill ${revealed ? 'cp-status-reveal' : 'cp-status-hidden'}`}>
                        <i className={`fas ${revealed ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        {revealed ? 'النتائج معلنة' : 'النتائج مخفية'}
                      </span>
                    </div>
                  </div>
                  <div className="cp-item-controls">
                    <button
                      className={`cp-btn ${revealed ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                      onClick={() => handleToggle(ex)}
                      disabled={busy}
                      title="إظهار / إخفاء النتائج للطلاب"
                    >
                      {busy ? (
                        <><i className="fas fa-spinner fa-spin"></i> جارٍ...</>
                      ) : (
                        <><i className={`fas ${revealed ? 'fa-eye-slash' : 'fa-eye'}`}></i> {revealed ? 'إخفاء النتائج' : 'إظهار النتائج'}</>
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      )}
    </section>
  )
}
