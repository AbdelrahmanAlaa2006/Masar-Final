import React, { useMemo, useState, useEffect } from 'react'
import { listExams, setExamRevealGrades } from '@backend/examsApi'
import { listVideos } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import {
  listOverridesForTarget,
  upsertOverride,
  deleteOverride,
} from '@backend/overridesApi'
import { createNotification } from '@backend/notificationsApi'
import './ControlPanel.css'

const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}
const GRADE_ORDER = ['first-prep', 'second-prep', 'third-prep']

// The stepper now represents *bonus* tries granted on top of the item's
// default — so "0" means "no extra tries" (the item's own default applies).
const DEFAULT_VIDEO_ATTEMPTS = 0
const DEFAULT_EXAM_ATTEMPTS = 0

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

  /* per-target overrides, loaded from access_overrides when a target is chosen:
     key = `${kind}:${targetId}:${itemId}` -> { allowed, attempts } */
  const [overrides, setOverrides] = useState({})
  const [savingKey, setSavingKey] = useState(null)

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

  /* ── Load existing overrides for the chosen target+section ── */
  useEffect(() => {
    if (!target || (section !== 'videos' && section !== 'exams')) return
    let cancelled = false
    ;(async () => {
      try {
        const itemType = section === 'videos' ? 'video' : 'exam'
        const rows = await listOverridesForTarget(target.kind, target.id, itemType)
        if (cancelled) return
        const next = {}
        for (const [, r] of rows) {
          next[`${target.kind}:${target.id}:${r.item_id}`] = {
            allowed: r.allowed !== false,
            attempts: r.attempts ?? null,
          }
        }
        setOverrides(next)
      } catch (e) {
        if (!cancelled) flash(e.message || 'تعذر تحميل الإعدادات', 'warning')
      }
    })()
    return () => { cancelled = true }
  }, [target, section]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ───── override helpers ───── */
  const keyFor = (item) =>
    target ? `${target.kind}:${target.id}:${item.id}` : ''

  const defaultAttemptsFor = () =>
    section === 'videos' ? DEFAULT_VIDEO_ATTEMPTS : DEFAULT_EXAM_ATTEMPTS

  const stateFor = (item) => {
    const o = overrides[keyFor(item)]
    return {
      allowed: o?.allowed ?? true,
      attempts: (o?.attempts ?? null) ?? defaultAttemptsFor(),
      hasOverride: !!o,
    }
  }

  /* Persist + optimistic UI update. `patch` is a partial of {allowed, attempts}. */
  const persistItem = async (item, patch) => {
    const key = keyFor(item)
    const prev = overrides[key] || { allowed: true, attempts: null }
    const next = { ...prev, ...patch }
    setOverrides((p) => ({ ...p, [key]: next }))
    setSavingKey(key)
    try {
      await upsertOverride({
        scope: target.kind,
        targetId: target.id,
        itemType: section === 'videos' ? 'video' : 'exam',
        itemId: item.id,
        ...(patch.allowed  !== undefined ? { allowed:  patch.allowed }  : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
      })
    } catch (e) {
      // rollback
      setOverrides((p) => ({ ...p, [key]: prev }))
      flash(e.message || 'تعذر حفظ التعديل', 'warning')
    } finally {
      setSavingKey(null)
    }
  }

  const setAttempts = (item, value) => {
    const v = Math.max(0, Math.min(99, parseInt(value, 10) || 0))
    persistItem(item, { attempts: v })
  }

  const bumpAttempts = (item, delta) => {
    const cur = stateFor(item).attempts
    const v = Math.max(0, Math.min(99, cur + delta))
    persistItem(item, { attempts: v })
  }

  const toggleAllowed = (item) => {
    const cur = stateFor(item).allowed
    persistItem(item, { allowed: !cur })
  }

  const resetItem = async (item) => {
    const key = keyFor(item)
    const prev = overrides[key]
    if (!prev) return // already default
    setOverrides((p) => { const n = { ...p }; delete n[key]; return n })
    try {
      await deleteOverride({
        scope: target.kind,
        targetId: target.id,
        itemType: section === 'videos' ? 'video' : 'exam',
        itemId: item.id,
      })
      flash('تم استرجاع الإعدادات الافتراضية')
    } catch (e) {
      setOverrides((p) => ({ ...p, [key]: prev }))
      flash(e.message || 'تعذر الاسترجاع', 'warning')
    }
  }

  const bulkSet = async (allowed) => {
    try {
      await Promise.all(items.map((item) =>
        persistItem(item, { allowed })
      ))
      flash(allowed ? 'تم السماح بكل العناصر' : 'تم منع كل العناصر')
    } catch (e) { /* individual errors already flashed */ }
  }

  const bulkAddAttempt = async () => {
    try {
      await Promise.all(items.map((item) => {
        const cur = stateFor(item).attempts
        return persistItem(item, { attempts: Math.min(99, cur + 1) })
      }))
      flash('تم إضافة محاولة لكل العناصر')
    } catch (e) { /* ignore */ }
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
            onReset={(item) => resetItem(item)}
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
          <i className="fas fa-plus"></i> +1 محاولة إضافية للكل
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
  // Draft vs saved: the stepper now edits a local draft until the admin
  // clicks Save. This makes the "I changed something" vs "I committed it"
  // distinction visible, which matches how admins expect form controls
  // to behave (and avoids the previous every-keystroke persistence).
  const [draft, setDraft] = useState(state.attempts)
  const [saving, setSaving] = useState(false)

  // If the saved value changes (e.g. from a bulk action, reset, or a
  // fresh load), reset the draft to match — but only when the user has
  // no pending in-progress edit.
  useEffect(() => {
    setDraft(state.attempts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts])

  const dirty = Number(draft) !== Number(state.attempts)

  const setDraftClamped = (v) => {
    const n = Math.max(0, Math.min(99, parseInt(v, 10) || 0))
    setDraft(n)
  }

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    try { await onAttempts(draft) } finally { setSaving(false) }
  }

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
          {dirty && (
            <span className="cp-status-pill cp-status-dirty" style={{ background: '#fef3c7', color: '#92400e' }}>
              <i className="fas fa-pen"></i>
              تغييرات غير محفوظة
            </span>
          )}
        </div>
      </div>

      <div className="cp-item-controls">
        {/* Allow toggle (saves instantly — it's a boolean) */}
        <label className="cp-switch" title={state.allowed ? 'مسموح بالوصول' : 'الوصول محظور'}>
          <input type="checkbox" checked={state.allowed} onChange={onToggle} />
          <span className="cp-switch-slider"></span>
        </label>

        {/* Bonus-attempts stepper — draft until Save is clicked */}
        <div className="cp-stepper" title="محاولات إضافية فوق الإعداد الافتراضي">
          <button className="cp-stepper-btn" onClick={() => setDraftClamped(draft - 1)} aria-label="إنقاص">
            <i className="fas fa-minus"></i>
          </button>
          <input
            type="number"
            min="0"
            max="99"
            value={draft}
            onChange={(e) => setDraftClamped(e.target.value)}
            className="cp-stepper-input"
          />
          <button className="cp-stepper-btn" onClick={() => setDraftClamped(draft + 1)} aria-label="زيادة">
            <i className="fas fa-plus"></i>
          </button>
          <span className="cp-stepper-lbl">محاولات إضافية</span>
        </div>

        <button
          className={`cp-btn ${dirty ? 'cp-btn-success' : 'cp-btn-ghost'}`}
          onClick={handleSave}
          disabled={!dirty || saving}
          title="حفظ عدد المحاولات الإضافية"
        >
          {saving ? (
            <><i className="fas fa-spinner fa-spin"></i> جارٍ الحفظ...</>
          ) : (
            <><i className="fas fa-floppy-disk"></i> حفظ</>
          )}
        </button>

        <button className="cp-icon-btn" onClick={onReset} title="استرجاع الإعدادات الافتراضية">
          <i className="fas fa-rotate-left"></i>
        </button>
      </div>
    </li>
  )
}

/* ──────────────────────────────────────────────────────────────
   RevealPanel — admin reveals an exam's results to one of three
   audiences:

     • all students    → flips exams.reveal_grades on the row itself
                         (the global flag), and posts an "all" notification.
     • a specific grade → upserts an access_override row
                         (scope='prep', item_type='exam_reveal', allowed=true)
                         and posts a grade-scoped notification.
     • a specific student → upserts an override row
                         (scope='student', item_type='exam_reveal', allowed=true)
                         and posts a student-scoped notification.

   Hiding is the inverse: clear the global flag / delete the override,
   no notification.
   ────────────────────────────────────────────────────────────── */
function RevealPanel({ onBack, flash }) {
  // Audience the reveal action targets.
  //   'all'     → flips exams.reveal_grades (global toggle)
  //   'grade'   → upsert access_overrides scope='prep',  target_id=grade
  //   'student' → upsert access_overrides scope='student', target_id=studentId
  const [audience, setAudience] = useState('all')
  const [grade, setGrade]       = useState('first-prep')
  const [studentId, setStudentId] = useState('')

  const [exams, setExams]       = useState([])
  const [students, setStudents] = useState([])
  // Maps examId -> {allowed} for the currently-selected target (grade/student)
  const [overrides, setOverrides] = useState(new Map())

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [busyId, setBusyId]   = useState(null)
  const [query, setQuery]     = useState('')
  const [studentQuery, setStudentQuery] = useState('')

  // Load exams + students once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [ex, st] = await Promise.all([listExams(), listStudents()])
        if (!cancelled) {
          setExams(ex)
          setStudents(st)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'تعذّر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // When audience/target changes, fetch existing overrides for that target.
  useEffect(() => {
    if (audience === 'all') { setOverrides(new Map()); return }
    const target = audience === 'grade' ? grade : studentId
    if (!target) { setOverrides(new Map()); return }
    let cancelled = false
    ;(async () => {
      try {
        const map = await listOverridesForTarget(
          audience === 'grade' ? 'prep' : 'student',
          target,
          'exam_reveal'
        )
        if (cancelled) return
        // listOverridesForTarget keys by "item_type:item_id" — unwrap.
        const out = new Map()
        for (const [k, v] of map) {
          const [, id] = k.split(':')
          out.set(id, v)
        }
        setOverrides(out)
      } catch { if (!cancelled) setOverrides(new Map()) }
    })()
    return () => { cancelled = true }
  }, [audience, grade, studentId])

  // Effective revealed state per exam under the current audience.
  const isRevealed = (ex) => {
    if (audience === 'all') return !!ex.reveal_grades
    // If the global flag is on, it's revealed for everyone regardless of overrides.
    if (ex.reveal_grades === true) return true
    const o = overrides.get(ex.id)
    return !!o && o.allowed !== false
  }

  // List of exams relevant to this audience (grade-filtered when grade/student).
  const targetGrade = audience === 'grade'
    ? grade
    : audience === 'student'
      ? (students.find((s) => s.id === studentId)?.grade || null)
      : null

  const baseExams = useMemo(() => {
    if (!targetGrade) return exams
    return exams.filter((e) => e.grade === targetGrade)
  }, [exams, targetGrade])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return baseExams
    return baseExams.filter((r) =>
      [r.title, r.number, GRADE_LABEL[r.grade]].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [baseExams, query])

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      [s.name, s.phone, GRADE_LABEL[s.grade]].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [students, studentQuery])

  const selectedStudent = students.find((s) => s.id === studentId) || null

  // Build a human-friendly "audience label" for flashes + notification titles.
  const audienceLabel = () => {
    if (audience === 'all') return 'كل الطلاب'
    if (audience === 'grade') return GRADE_LABEL[grade] || grade
    if (audience === 'student') return selectedStudent?.name || 'طالب محدد'
    return ''
  }

  // Post a notification to match the audience so students see a real entry
  // in their notification bell the moment the exam is revealed.
  const notify = async (exam) => {
    const title = `تم إعلان نتيجة: ${exam.title}`
    const message = `أصبحت نتيجة الامتحان متاحة الآن في صفحة تقاريرك.`
    try {
      const me = JSON.parse(localStorage.getItem('masar-user') || 'null')
      const createdBy = me?.id || null
      if (audience === 'all') {
        await createNotification({ title, message, level: 'success', scope: 'all',
          meta: { examId: exam.id, kind: 'reveal' }, createdBy })
      } else if (audience === 'grade') {
        await createNotification({ title, message, level: 'success', scope: 'grade',
          targetGrade: grade, meta: { examId: exam.id, kind: 'reveal' }, createdBy })
      } else if (audience === 'student' && studentId) {
        await createNotification({ title, message, level: 'success', scope: 'student',
          targetStudent: studentId, meta: { examId: exam.id, kind: 'reveal' }, createdBy })
      }
    } catch { /* non-fatal — reveal already saved */ }
  }

  const handleToggle = async (exam) => {
    const currentlyRevealed = isRevealed(exam)
    const next = !currentlyRevealed
    setBusyId(exam.id)
    try {
      if (audience === 'all') {
        await setExamRevealGrades(exam.id, next)
        setExams((prev) => prev.map((r) => r.id === exam.id ? { ...r, reveal_grades: next } : r))
      } else {
        const scope    = audience === 'grade' ? 'prep' : 'student'
        const targetId = audience === 'grade' ? grade  : studentId
        if (!targetId) { flash('اختر المرحلة أو الطالب أولاً', 'warning'); return }

        if (next) {
          await upsertOverride({
            scope, targetId, itemType: 'exam_reveal',
            itemId: exam.id, allowed: true,
          })
          setOverrides((p) => { const n = new Map(p); n.set(exam.id, { allowed: true, attempts: null }); return n })
        } else {
          await deleteOverride({
            scope, targetId, itemType: 'exam_reveal', itemId: exam.id,
          })
          setOverrides((p) => { const n = new Map(p); n.delete(exam.id); return n })
        }
      }

      if (next) await notify(exam)

      flash(
        next
          ? `تم إظهار نتائج: ${exam.title} — ${audienceLabel()}`
          : `تم إخفاء نتائج: ${exam.title} — ${audienceLabel()}`,
        next ? 'success' : 'warning'
      )
    } catch (e) {
      flash(e.message || 'تعذّر تحديث الحالة', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const revealedCount = filtered.filter(isRevealed).length
  const hiddenCount   = filtered.length - revealedCount
  const canInteract   = audience === 'all'
                     || (audience === 'grade' && !!grade)
                     || (audience === 'student' && !!studentId)

  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className="fas fa-arrow-right"></i> رجوع
      </button>

      <div className="cp-panel-header">
        <h2><i className="fas fa-eye"></i> إظهار نتائج الامتحانات</h2>
        <p>اختر الجمهور أولاً، ثم فعِّل ظهور النتائج لكل امتحان — وسيصل إشعار تلقائي للطلاب.</p>
      </div>

      {/* Audience selector */}
      <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'all',     icon: 'fa-users',     label: 'كل الطلاب' },
          { id: 'grade',   icon: 'fa-layer-group', label: 'مرحلة محددة' },
          { id: 'student', icon: 'fa-user',      label: 'طالب محدد' },
        ].map((opt) => (
          <button
            key={opt.id}
            className={`cp-btn ${audience === opt.id ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setAudience(opt.id)}
          >
            <i className={`fas ${opt.icon}`}></i> {opt.label}
          </button>
        ))}
      </div>

      {/* Grade dropdown */}
      {audience === 'grade' && (
        <div className="cp-search" style={{ marginTop: 12 }}>
          <i className="fas fa-graduation-cap"></i>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15 }}>
            <option value="first-prep">الأول الإعدادي</option>
            <option value="second-prep">الثاني الإعدادي</option>
            <option value="third-prep">الثالث الإعدادي</option>
          </select>
        </div>
      )}

      {/* Student picker */}
      {audience === 'student' && (
        <div style={{ marginTop: 12 }}>
          {selectedStudent ? (
            <div className="cp-search" style={{ background: '#eef2ff' }}>
              <i className="fas fa-user-check"></i>
              <span style={{ flex: 1, fontWeight: 600 }}>
                {selectedStudent.name} — {GRADE_LABEL[selectedStudent.grade] || '—'}
              </span>
              <button className="cp-search-clear" onClick={() => setStudentId('')}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
          ) : (
            <>
              <div className="cp-search">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="ابحث عن طالب بالاسم أو الهاتف..."
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                />
              </div>
              <ul className="cp-items" style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
                {filteredStudents.slice(0, 50).map((s) => (
                  <li key={s.id} className="cp-item" style={{ cursor: 'pointer' }} onClick={() => setStudentId(s.id)}>
                    <div className="cp-item-icon"><i className="fas fa-user"></i></div>
                    <div className="cp-item-body">
                      <div className="cp-item-title"><span>{s.name}</span></div>
                      <div className="cp-item-meta">
                        <span><i className="fas fa-phone"></i> {s.phone || '—'}</span>
                        <span><i className="fas fa-graduation-cap"></i> {GRADE_LABEL[s.grade] || '—'}</span>
                      </div>
                    </div>
                  </li>
                ))}
                {filteredStudents.length === 0 && (
                  <div className="cp-empty"><i className="fas fa-inbox"></i><p>لا يوجد طلاب مطابقون</p></div>
                )}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Stats */}
      {canInteract && (
        <div className="cp-stats-row">
          <div className="cp-stat">
            <i className="fas fa-file-alt"></i>
            <div>
              <div className="cp-stat-val">{filtered.length}</div>
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
      )}

      {/* Exam search */}
      {canInteract && (
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
      )}

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

      {!loading && !error && canInteract && (
        filtered.length === 0 ? (
          <div className="cp-empty">
            <i className="fas fa-inbox"></i>
            <p>لا توجد امتحانات مطابقة</p>
          </div>
        ) : (
          <ul className="cp-items">
            {filtered.map((ex) => {
              const revealed = isRevealed(ex)
              const busy = busyId === ex.id
              const forcedByGlobal = audience !== 'all' && ex.reveal_grades === true
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
                      {forcedByGlobal && (
                        <span className="cp-status-pill" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                          <i className="fas fa-globe"></i> معلن للكل
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="cp-item-controls">
                    <button
                      className={`cp-btn ${revealed ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                      onClick={() => handleToggle(ex)}
                      disabled={busy || forcedByGlobal}
                      title={forcedByGlobal
                        ? 'النتائج معلنة لكل الطلاب — ألغِ الإعلان العام من تبويب "كل الطلاب" أولاً'
                        : 'إظهار / إخفاء النتائج للطلاب'}
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
