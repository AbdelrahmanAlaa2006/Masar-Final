import React, { useMemo, useState, useEffect } from 'react'
import { listExams, setExamRevealGrades, updateExamAvailability } from '@backend/examsApi'
import { listVideos, updateVideoAvailability } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import { resetStudentVideoAttempts, resetGradeVideoAttempts } from '@backend/progressApi'
import { syncStudentsCsv } from '@backend/studentsSyncApi'
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
  const [section, setSection] = useState('home') // 'home' | 'videos' | 'exams' | 'students'
  // Which sub-panel is active inside a section. Videos has: attempts, availability.
  // Exams adds: reveal. Only meaningful when section !== 'home'.
  const [subtab, setSubtab] = useState('attempts') // 'attempts' | 'availability' | 'reveal'
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
    return persistItem(item, { attempts: v })
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
    // Even if there is no override row, we still want the reset button to
    // zero the actual usage counter for videos (that was the user's main
    // pain: the counter never went back to 0). For exams there is nothing
    // else to clear, so an absent override means "already at default".
    if (!prev && section !== 'videos') return
    if (prev) {
      setOverrides((p) => { const n = { ...p }; delete n[key]; return n })
    }
    try {
      if (prev) {
        await deleteOverride({
          scope: target.kind,
          targetId: target.id,
          itemType: section === 'videos' ? 'video' : 'exam',
          itemId: item.id,
        })
      }
      // For videos, also zero out the per-student view counter so a fresh
      // bonus allowance actually starts from 0/N — not (5+N)/N.
      if (section === 'videos') {
        if (target.kind === 'student') {
          await resetStudentVideoAttempts({ student_id: target.id, video_id: item.id })
        } else if (target.kind === 'prep') {
          await resetGradeVideoAttempts({ grade: target.id, video_id: item.id })
        }
      }
      flash(section === 'videos'
        ? 'تم تصفير المحاولات وإعادة الإعدادات الافتراضية'
        : 'تم استرجاع الإعدادات الافتراضية')
    } catch (e) {
      if (prev) setOverrides((p) => ({ ...p, [key]: prev }))
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
    setSubtab('attempts')
  }
  const enterSection = (s) => {
    setSection(s)
    setScope(null)
    setTarget(null)
    setPickerQuery('')
    setSubtab('attempts')
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

        {/* HOME — only two entry tiles; availability + reveal are
            now sub-tabs inside those sections (user asked to merge
            them to reduce clutter). */}
        {section === 'home' && (
          <div className="cp-home-grid">
            <SectionCard
              icon="fa-play-circle"
              accent="blue"
              title="إدارة الفيديوهات"
              desc="صلاحيات المشاهدة، المحاولات الإضافية، ومدة الإتاحة"
              onClick={() => enterSection('videos')}
            />
            <SectionCard
              icon="fa-file-alt"
              accent="orange"
              title="إدارة الامتحانات"
              desc="المحاولات الإضافية، مدة الإتاحة، وإظهار نتائج الامتحانات"
              onClick={() => enterSection('exams')}
            />
            <SectionCard
              icon="fa-users"
              accent="green"
              title="مزامنة الطلاب"
              desc="رفع ملف CSV لإضافة/تحديث الطلاب وحذف من تم استبعاده"
              onClick={() => enterSection('students')}
            />
          </div>
        )}

        {section === 'students' && <StudentsSyncPanel />}

        {/* SUB-TAB BAR — videos: attempts/availability. exams: + reveal. */}
        {(section === 'videos' || section === 'exams') && (
          <div className="cp-subtabs" style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
            margin: '12px 0 18px',
          }}>
            <button
              className={`cp-btn ${subtab === 'attempts' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
              onClick={() => setSubtab('attempts')}
            >
              <i className="fas fa-user-shield"></i> الصلاحيات والمحاولات
            </button>
            <button
              className={`cp-btn ${subtab === 'availability' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
              onClick={() => setSubtab('availability')}
            >
              <i className="fas fa-hourglass-half"></i> مدة الإتاحة
            </button>
            {section === 'exams' && (
              <button
                className={`cp-btn ${subtab === 'reveal' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                onClick={() => setSubtab('reveal')}
              >
                <i className="fas fa-eye"></i> إظهار النتائج
              </button>
            )}
          </div>
        )}

        {/* AVAILABILITY sub-panel — restricted to the current section's type */}
        {(section === 'videos' || section === 'exams') && subtab === 'availability' && (
          <AvailabilityPanel
            restrictTo={section === 'exams' ? 'exams' : 'videos'}
            onBack={goHome}
            flash={flash}
          />
        )}

        {/* REVEAL sub-panel — only inside Exams */}
        {section === 'exams' && subtab === 'reveal' && (
          <RevealPanel onBack={goHome} flash={flash} />
        )}

        {/* ATTEMPTS FLOW — the original scope/target/items navigation */}
        {(section === 'videos' || section === 'exams') && subtab === 'attempts' && loading && (
          <div className="cp-empty">
            <i className="fas fa-spinner fa-spin"></i>
            <p>جارٍ التحميل...</p>
          </div>
        )}

        {(section === 'videos' || section === 'exams') && subtab === 'attempts' && !loading && !scope && (
          <ScopePicker section={section} onPick={chooseScope} onBack={goHome} />
        )}

        {(section === 'videos' || section === 'exams') && subtab === 'attempts' && !loading && scope && !target && (
          <TargetPicker
            scope={scope}
            list={pickerList}
            query={pickerQuery}
            onQuery={setPickerQuery}
            onPick={chooseTarget}
            onBack={backFromScope}
          />
        )}

        {(section === 'videos' || section === 'exams') && subtab === 'attempts' && !loading && target && (
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

        <button
          className="cp-icon-btn"
          onClick={onReset}
          title={isVideo
            ? 'تصفير المحاولات المستخدمة وإرجاع الإعدادات الافتراضية'
            : 'استرجاع الإعدادات الافتراضية'}
        >
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
      const me = JSON.parse(sessionStorage.getItem('masar-user') || 'null')
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

      {/* Grade picker — card grid, visually consistent with the rest of CP. */}
      {audience === 'grade' && (
        <GradePickerCards value={grade} onChange={setGrade} students={students} />
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

/* ──────────────────────────────────────────────────────────────
   GradePickerCards — shared 3-card grade chooser. Replaces the
   plain <select> we used before; lines up visually with the rest
   of the Control Panel (same shapes as prep TargetRow).
   ────────────────────────────────────────────────────────────── */
function GradePickerCards({ value, onChange, students = [] }) {
  // Tiny bar-chart-friendly student count per grade, so admins see
  // at a glance how many people the pick will affect.
  const counts = useMemo(() => {
    const out = { 'first-prep': 0, 'second-prep': 0, 'third-prep': 0 }
    for (const s of students) if (s?.grade && out[s.grade] !== undefined) out[s.grade]++
    return out
  }, [students])

  // NB: we purposely do NOT hard-code colors here — the `.cp-target` rule
  // already resolves to dark-mode-aware CSS vars (--card-bg, --text-color,
  // etc.) set up by ControlPanel.css. The extra ring for the active card is
  // applied through the `is-active` class, see the tiny CSS block below.
  return (
    <div
      className="cp-grade-picker"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
        marginTop: 12,
      }}
    >
      {GRADE_ORDER.map((g) => {
        const active = value === g
        return (
          <button
            key={g}
            onClick={() => onChange(g)}
            className={`cp-target cp-target-prep ${active ? 'is-active' : ''}`}
            style={{ padding: 14, borderRadius: 12, textAlign: 'start' }}
          >
            <div className="cp-avatar cp-avatar-orange" style={{ flexShrink: 0 }}>
              <i className="fas fa-graduation-cap"></i>
            </div>
            <div className="cp-target-body">
              <div className="cp-target-name">
                <span>{GRADE_LABEL[g]}</span>
                {active && (
                  <span className="cp-id-pill cp-id-pill-active">
                    <i className="fas fa-circle-check"></i> مختارة
                  </span>
                )}
              </div>
              <div className="cp-target-sub">
                <span><i className="fas fa-user"></i> {counts[g] || 0} طالب</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   AvailabilityPanel — edit how many hours an exam or a video
   remains available after it was created.

   Audience-aware (mirrors RevealPanel):
     • 'all'     → writes to the item column itself (exams.available_hours,
                   videos.active_hours) — affects every student.
     • 'grade'   → upsert into access_overrides (scope='prep',
                   available_hours=N) for exactly that prep.
     • 'student' → same but scope='student'. Admin can also clear the
                   override to fall back to the item's default.

   For non-'all' audiences the draft starts from the override if it
   exists, else from the item's default (shown as "موروث").
   ────────────────────────────────────────────────────────────── */
function AvailabilityPanel({ onBack, flash, restrictTo }) {
  // `restrictTo` = 'exams' | 'videos' | undefined. When set, the internal
  // tab bar is hidden and only the matching list is shown (this panel is
  // now rendered inside the Videos / Exams sections, so the outer section
  // tells us which type to show).
  const [tab, setTab] = useState(restrictTo || 'exams')

  // Audience targeting mirrors RevealPanel so admins learn one pattern.
  const [audience, setAudience] = useState('all')
  const [grade, setGrade]       = useState('first-prep')
  const [studentId, setStudentId] = useState('')

  const [exams, setExams] = useState([])
  const [videos, setVideos] = useState([])
  const [students, setStudents] = useState([])
  // itemId -> { available_hours:int|null, allowed:bool } for the selected audience
  const [overrides, setOverrides] = useState(new Map())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [studentQuery, setStudentQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [ex, vd, st] = await Promise.all([listExams(), listVideos(), listStudents()])
        if (!cancelled) { setExams(ex); setVideos(vd); setStudents(st) }
      } catch (e) {
        if (!cancelled) setError(e.message || 'تعذّر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const itemType = tab === 'exams' ? 'exam' : 'video'

  // When audience/target/tab changes, refetch overrides for that audience.
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
          itemType
        )
        if (cancelled) return
        const out = new Map()
        for (const [, r] of map) {
          out.set(r.item_id, { available_hours: r.available_hours ?? null, allowed: r.allowed !== false })
        }
        setOverrides(out)
      } catch { if (!cancelled) setOverrides(new Map()) }
    })()
    return () => { cancelled = true }
  }, [audience, grade, studentId, itemType])

  // Filter by grade when an audience is selected so admins don't see
  // items irrelevant to their audience (e.g. exams from other preps).
  const rows = tab === 'exams' ? exams : videos
  const targetGrade =
    audience === 'grade' ? grade
    : audience === 'student' ? (students.find((s) => s.id === studentId)?.grade || null)
    : null

  const baseRows = useMemo(() => {
    if (!targetGrade) return rows
    return rows.filter((r) => r.grade === targetGrade)
  }, [rows, targetGrade])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return baseRows
    return baseRows.filter((r) =>
      [r.title, r.number, GRADE_LABEL[r.grade]].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [baseRows, query])

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      [s.name, s.phone, GRADE_LABEL[s.grade]].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [students, studentQuery])

  const selectedStudent = students.find((s) => s.id === studentId) || null

  const audienceLabel = () => {
    if (audience === 'all') return 'كل الطلاب'
    if (audience === 'grade') return GRADE_LABEL[grade] || grade
    if (audience === 'student') return selectedStudent?.name || 'طالب محدد'
    return ''
  }

  // Save handler: 'all' updates the item column itself; grade/student
  // upserts an override row with available_hours. Returning the new saved
  // state lets the row re-sync its dirty flag.
  const saveRow = async (item, hours) => {
    try {
      if (audience === 'all') {
        if (tab === 'exams') {
          await updateExamAvailability(item.id, hours)
          setExams((p) => p.map((r) => r.id === item.id ? { ...r, available_hours: hours } : r))
        } else {
          const updated = await updateVideoAvailability(item.id, hours)
          setVideos((p) => p.map((r) => r.id === item.id ? {
            ...r, active_hours: hours, expiry_at: updated.expiry_at,
          } : r))
        }
      } else {
        const scope = audience === 'grade' ? 'prep' : 'student'
        const targetId = audience === 'grade' ? grade : studentId
        if (!targetId) { flash('اختر المرحلة أو الطالب أولاً', 'warning'); return }
        await upsertOverride({ scope, targetId, itemType, itemId: item.id, availableHours: hours })
        setOverrides((p) => {
          const n = new Map(p)
          const prev = n.get(item.id) || { allowed: true }
          n.set(item.id, { ...prev, available_hours: hours })
          return n
        })
      }
      flash(`تم تحديث مدة الإتاحة: ${item.title} — ${audienceLabel()}`, 'success')
    } catch (e) {
      flash(e.message || 'تعذّر الحفظ', 'warning')
      throw e
    }
  }

  // Clear a per-audience override — row falls back to the item default.
  const clearOverride = async (item) => {
    if (audience === 'all') return // 'all' can't be "cleared" — it IS the default
    const scope = audience === 'grade' ? 'prep' : 'student'
    const targetId = audience === 'grade' ? grade : studentId
    if (!targetId) return
    try {
      // Use upsert with available_hours:null so we don't wipe allowed/attempts
      // if the admin set those in another panel — only the hours override
      // goes back to inherit.
      await upsertOverride({ scope, targetId, itemType, itemId: item.id, availableHours: null })
      setOverrides((p) => {
        const n = new Map(p)
        const prev = n.get(item.id)
        if (prev) n.set(item.id, { ...prev, available_hours: null })
        return n
      })
      flash(`تم استرجاع الإعداد الافتراضي: ${item.title}`, 'success')
    } catch (e) {
      flash(e.message || 'تعذّر الاسترجاع', 'warning')
    }
  }

  const canInteract = audience === 'all'
                   || (audience === 'grade'   && !!grade)
                   || (audience === 'student' && !!studentId)

  return (
    <section className="cp-panel">
      <div className="cp-panel-header">
        <h2><i className="fas fa-hourglass-half"></i> مدة الإتاحة</h2>
        <p>
          حدّد الجمهور، ثم عدّل عدد الساعات التي يظل فيها كل {tab === 'exams' ? 'امتحان' : 'فيديو'} متاحاً.
        </p>
      </div>

      {/* (legacy) type tabs — hidden when the parent section restricts us */}
      {!restrictTo && (
        <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button
            className={`cp-btn ${tab === 'exams' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setTab('exams')}
          >
            <i className="fas fa-file-alt"></i> الامتحانات
          </button>
          <button
            className={`cp-btn ${tab === 'videos' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setTab('videos')}
          >
            <i className="fas fa-play-circle"></i> الفيديوهات
          </button>
        </div>
      )}

      {/* Audience selector — mirrors RevealPanel for familiarity. */}
      <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'all',     icon: 'fa-users',       label: 'كل الطلاب' },
          { id: 'grade',   icon: 'fa-layer-group', label: 'مرحلة محددة' },
          { id: 'student', icon: 'fa-user',        label: 'طالب محدد' },
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

      {/* Grade card picker */}
      {audience === 'grade' && (
        <GradePickerCards value={grade} onChange={setGrade} students={students} />
      )}

      {/* Student picker (reuse same pattern as RevealPanel) */}
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

      {canInteract && (
        <div className="cp-search">
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder={`ابحث باسم ${tab === 'exams' ? 'الامتحان' : 'الفيديو'} أو المرحلة...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="cp-search-clear" onClick={() => setQuery('')}>
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
            <p>لا توجد عناصر مطابقة</p>
          </div>
        ) : (
          <ul className="cp-items">
            {filtered.map((item) => (
              <AvailabilityRow
                key={item.id}
                item={item}
                isExam={tab === 'exams'}
                audience={audience}
                overrideHours={overrides.get(item.id)?.available_hours ?? null}
                onSave={(h) => saveRow(item, h)}
                onClear={audience !== 'all' ? () => clearOverride(item) : null}
              />
            ))}
          </ul>
        )
      )}
    </section>
  )
}

function AvailabilityRow({ item, isExam, audience, overrideHours, onSave, onClear }) {
  // The item's default (the "all-students" value) — always read from row.
  const defaultHours = isExam ? (item.available_hours || 72) : (item.active_hours || 24)
  // The "currently-saved" value for this audience is either the override
  // hours (when set) or the item default (inherited).
  const savedHours = audience === 'all'
    ? defaultHours
    : (overrideHours ?? defaultHours)
  const inherited = audience !== 'all' && overrideHours == null

  const [draft, setDraft] = useState(savedHours)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(savedHours) }, [savedHours])

  const dirty = Number(draft) !== Number(savedHours)

  // Preview "available until" anchored on created_at so admins see the
  // consequence of their edit before they save.
  const anchor = item.created_at ? new Date(item.created_at).getTime() : Date.now()
  const previewUntil = new Date(anchor + Math.max(1, draft) * 3600 * 1000)
  const previewText = isNaN(previewUntil) ? '—' :
    previewUntil.toLocaleDateString('ar-EG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const clamp = (v) => Math.max(1, Math.min(24 * 365, parseInt(v, 10) || 1))

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    try { await onSave(clamp(draft)) } catch { /* flashed */ } finally { setSaving(false) }
  }

  return (
    <li className="cp-item">
      <div className="cp-item-icon">
        <i className={`fas ${isExam ? 'fa-file-alt' : 'fa-play-circle'}`}></i>
      </div>
      <div className="cp-item-body">
        <div className="cp-item-title">
          <span>{item.title}</span>
          {item.number && (
            <span className="cp-id-pill cp-id-pill-sm">
              <i className="fas fa-hashtag"></i>{item.number}
            </span>
          )}
        </div>
        <div className="cp-item-meta">
          <span><i className="fas fa-graduation-cap"></i> {GRADE_LABEL[item.grade] || item.grade}</span>
          <span><i className="fas fa-hourglass-half"></i> {savedHours} ساعة</span>
          <span><i className="fas fa-calendar-check"></i> متاح حتى {previewText}</span>
          {inherited && (
            <span className="cp-status-pill" style={{ background: '#e0e7ff', color: '#3730a3' }}>
              <i className="fas fa-link"></i> موروث من الافتراضي
            </span>
          )}
          {audience !== 'all' && !inherited && (
            <span className="cp-status-pill" style={{ background: '#dcfce7', color: '#166534' }}>
              <i className="fas fa-user-shield"></i> مخصص لهذا الجمهور
            </span>
          )}
          {dirty && (
            <span className="cp-status-pill" style={{ background: '#fef3c7', color: '#92400e' }}>
              <i className="fas fa-pen"></i> تغييرات غير محفوظة
            </span>
          )}
        </div>
      </div>
      <div className="cp-item-controls">
        <div className="cp-stepper" title="عدد الساعات المتاحة منذ إنشاء العنصر">
          <button className="cp-stepper-btn" onClick={() => setDraft(clamp(draft - 1))}>
            <i className="fas fa-minus"></i>
          </button>
          <input
            type="number"
            min="1"
            value={draft}
            onChange={(e) => setDraft(clamp(e.target.value))}
            className="cp-stepper-input"
            style={{ width: 72 }}
          />
          <button className="cp-stepper-btn" onClick={() => setDraft(clamp(draft + 1))}>
            <i className="fas fa-plus"></i>
          </button>
          <span className="cp-stepper-lbl">ساعة</span>
        </div>
        <button
          className={`cp-btn ${dirty ? 'cp-btn-success' : 'cp-btn-ghost'}`}
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <><i className="fas fa-spinner fa-spin"></i> جارٍ الحفظ...</>
          ) : (
            <><i className="fas fa-floppy-disk"></i> حفظ</>
          )}
        </button>
        {onClear && !inherited && (
          <button
            className="cp-icon-btn"
            onClick={onClear}
            title="استرجاع الإعداد الافتراضي لهذا الجمهور"
          >
            <i className="fas fa-rotate-left"></i>
          </button>
        )}
      </div>
    </li>
  )
}

/* ──────────────────────────────────────────────────────────────
   StudentsSyncPanel — admin uploads a CSV of students and the
   sync-students Edge Function mirrors it into auth + profiles.
   Dry-run by default; the admin must explicitly confirm to apply
   destructive deletes.
   ────────────────────────────────────────────────────────────── */
// ── IndexedDB tiny helper for storing the FileSystemFileHandle ─────
// We use IDB instead of localStorage because file handles are not JSON-
// serializable. This is the only place in the app that needs IDB so we
// keep it inline (~20 lines) rather than pulling a library.
const IDB_NAME = 'masar-cp'
const IDB_STORE = 'kv'
function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function idbGet(key) {
  try {
    const db = await idbOpen()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => reject(req.error)
    })
  } catch { return null }
}
async function idbSet(key, value) {
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}
async function idbDel(key) {
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

const CSV_HANDLE_KEY = 'students-csv-handle'
const CSV_TEXT_KEY   = 'masar-students-csv-text'
const CSV_NAME_KEY   = 'masar-students-csv-name'

function StudentsSyncPanel() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [confirmApply, setConfirmApply] = useState(false)
  // True when we restored a previously-picked file at mount time. We show
  // a small "auto" badge so the admin knows where the content came from.
  const [restored, setRestored] = useState(false)
  // Live FileSystemFileHandle (Chrome/Edge only) — kept in a ref so it
  // survives renders without triggering them.
  const fileHandleRef = React.useRef(null)
  const supportsFsAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window

  // Read the latest content from a stored file handle, requesting permission
  // first if needed. Falls back silently if the user revokes permission.
  const reReadFromHandle = React.useCallback(async (handle, opts = {}) => {
    if (!handle) return null
    try {
      // Permission state may have lapsed since the previous session.
      let perm = await handle.queryPermission?.({ mode: 'read' })
      if (perm !== 'granted' && opts.requestIfNeeded) {
        perm = await handle.requestPermission?.({ mode: 'read' })
      }
      if (perm !== 'granted') return null
      const file = await handle.getFile()
      const text = await file.text()
      setCsvText(text)
      setFileName(file.name)
      return text
    } catch { return null }
  }, [])

  // ── On mount: restore the previously-picked file ─────────────────
  // Show the cached text instantly so the admin sees something even
  // if permission has lapsed. Then, if the FS handle is still in
  // 'granted' state from a prior session, re-read the live file
  // silently — that's how edits the admin made in Excel (Ctrl+S)
  // get picked up on refresh without a permission prompt. We never
  // call requestPermission here; that requires a user gesture.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // (1) Cached-text path — immediate, no prompt.
      try {
        const txt = localStorage.getItem(CSV_TEXT_KEY)
        const name = localStorage.getItem(CSV_NAME_KEY)
        if (txt && !cancelled) {
          setCsvText(txt)
          setFileName(name || 'students.csv')
          setRestored(true)
        }
      } catch { /* ignore */ }
      // (2) FS handle path — silently re-read if permission survived.
      if (supportsFsAccess) {
        const handle = await idbGet(CSV_HANDLE_KEY)
        if (handle && !cancelled) {
          fileHandleRef.current = handle
          await reReadFromHandle(handle, { requestIfNeeded: false })
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsFsAccess])

  // Auto-refresh: when the admin returns to the tab after editing the
  // CSV in Excel, silently re-read the live file. No permission prompt
  // (queryPermission only); falls back silently if revoked.
  useEffect(() => {
    if (!supportsFsAccess) return
    const refresh = () => {
      const h = fileHandleRef.current
      if (h) reReadFromHandle(h, { requestIfNeeded: false })
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [supportsFsAccess, reReadFromHandle])

  // Whenever csvText changes (from any path), mirror it to localStorage
  // so even non-FS-Access browsers keep the file across reloads.
  useEffect(() => {
    try {
      if (csvText) {
        localStorage.setItem(CSV_TEXT_KEY, csvText)
        localStorage.setItem(CSV_NAME_KEY, fileName || 'students.csv')
      }
    } catch { /* quota — ignore */ }
  }, [csvText, fileName])

  // Read a freshly-picked File (drag-drop, or fallback <input type=file>).
  const readFile = (file) => {
    if (!file) return
    setFileName(file.name)
    setError(null)
    setReport(null)
    setRestored(false)
    const reader = new FileReader()
    reader.onload = () => setCsvText(String(reader.result || ''))
    reader.onerror = () => setError('تعذر قراءة الملف')
    reader.readAsText(file, 'utf-8')
  }

  // Preferred picker for Chrome/Edge: returns a handle we can re-read.
  const pickWithFsAccess = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'CSV',
          accept: { 'text/csv': ['.csv'] },
        }],
        multiple: false,
        excludeAcceptAllOption: false,
      })
      if (!handle) return
      fileHandleRef.current = handle
      await idbSet(CSV_HANDLE_KEY, handle)
      const file = await handle.getFile()
      readFile(file)
    } catch (e) {
      // User cancelled / permission denied — silent.
      if (e?.name !== 'AbortError') setError(e.message || 'تعذر فتح الملف')
    }
  }

  const onFile = (e) => readFile(e.target.files?.[0])
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    readFile(e.dataTransfer.files?.[0])
  }
  // When the drop zone is clicked, prefer the FS Access picker (so the
  // file persists + auto-refreshes); fall back to native input otherwise.
  const onDropZoneClick = (e) => {
    if (supportsFsAccess) {
      e.preventDefault()
      pickWithFsAccess()
    }
    // else: the wrapping <label> opens the hidden <input>, business as usual
  }

  const clearFile = async () => {
    setCsvText(''); setFileName(''); setReport(null); setError(null); setRestored(false)
    fileHandleRef.current = null
    await idbDel(CSV_HANDLE_KEY)
    try {
      localStorage.removeItem(CSV_TEXT_KEY)
      localStorage.removeItem(CSV_NAME_KEY)
    } catch { /* ignore */ }
  }

  const run = async (apply) => {
    setError(null)
    // If we have a live FS handle (Chrome/Edge), re-read the file from
    // disk first so any edits the admin made in Excel are picked up
    // automatically. Click is a real user gesture, so requestPermission
    // works cleanly here. Falls back to whatever's already in csvText
    // when permission is denied / API not supported.
    let textToSend = csvText
    if (fileHandleRef.current) {
      const fresh = await reReadFromHandle(fileHandleRef.current, { requestIfNeeded: true })
      if (fresh) textToSend = fresh
    }
    if (!textToSend.trim()) { setError('اختر ملف الطلاب أولاً'); return }
    setBusy(true)
    try {
      const data = await syncStudentsCsv(textToSend, { apply })
      setReport(data)
    } catch (err) {
      setError(err.message || 'فشل الاتصال بالخادم')
    } finally {
      setBusy(false)
    }
  }

  // Step 1: pick file. Step 2: preview shown after first run. Step 3: confirm dialog.
  const orphans = report?.orphans || []
  const willAdd = report?.ok || 0

  return (
    <section className="cp-panel sync-panel">
      <div className="cp-panel-head">
        <div>
          <h2><i className="fas fa-users"></i> مزامنة الطلاب</h2>
          <p className="cp-panel-sub">
            اختر ملف الطلاب (Excel أو CSV). سنريك أولاً ما الذي سيتغيّر،
            ثم تضغط على «تطبيق» لحفظ التعديلات.
          </p>
        </div>
      </div>

      {/* ── Step 1: file picker / drop zone ─────────────────────── */}
      {!fileName && (
        <label
          className={`sync-drop ${dragOver ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={onDropZoneClick}
        >
          <div className="sync-drop-icon"><i className="fas fa-file-csv"></i></div>
          <div className="sync-drop-title">اسحب ملف الطلاب هنا</div>
          <div className="sync-drop-sub">
            أو اضغط لاختيار ملف من جهازك
            {supportsFsAccess && ' — سيتم تذكّر الملف وتحديثه تلقائياً عند تعديله'}
          </div>
          <input type="file" accept=".csv,text/csv" onChange={onFile} hidden />
        </label>
      )}

      {/* ── File chip ──────────────────────────────────────────── */}
      {fileName && (
        <div className="sync-file-chip">
          <i className="fas fa-file-csv sync-file-chip-icon"></i>
          <div className="sync-file-chip-meta">
            <div className="sync-file-chip-name">
              {fileName}
              {restored && (
                <span style={{
                  marginInlineStart: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(34, 197, 94, 0.14)',
                  color: '#16a34a',
                }}>
                  <i className="fas fa-rotate"></i> محفوظ تلقائياً
                </span>
              )}
            </div>
            <div className="sync-file-chip-sub">
              {fileHandleRef.current
                ? 'سيتم قراءة آخر تعديلات الملف تلقائياً عند المعاينة'
                : 'جاهز للمعاينة'}
            </div>
          </div>
          <button className="sync-file-chip-x" onClick={clearFile} title="إزالة الملف">
            <i className="fas fa-xmark"></i>
          </button>
        </div>
      )}

      {/* ── Action: preview ────────────────────────────────────── */}
      {fileName && !report && (
        <div className="sync-actions">
          <button
            className="sync-btn sync-btn-primary"
            onClick={() => run(false)}
            disabled={busy}
          >
            {busy
              ? <><i className="fas fa-spinner fa-spin"></i> جارٍ التحقق...</>
              : <><i className="fas fa-magnifying-glass"></i> معاينة التغييرات</>}
          </button>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <div className="sync-alert sync-alert-error">
          <i className="fas fa-circle-exclamation"></i>
          <span>{error}</span>
        </div>
      )}

      {/* ── Report (preview or applied) ────────────────────────── */}
      {report && (
        <div className="sync-report">
          {/* Big stat cards */}
          <div className="sync-stats">
            <div className="sync-stat sync-stat-add">
              <div className="sync-stat-num">{willAdd}</div>
              <div className="sync-stat-lbl">
                {report.apply ? 'طالب تم تحديثه' : 'طالب سيُحفظ'}
              </div>
              <i className="fas fa-user-plus sync-stat-icon"></i>
            </div>
            <div className="sync-stat sync-stat-del">
              <div className="sync-stat-num">
                {report.apply ? report.deleted : orphans.length}
              </div>
              <div className="sync-stat-lbl">
                {report.apply ? 'طالب تم حذفه' : 'طالب سيُحذف'}
              </div>
              <i className="fas fa-user-minus sync-stat-icon"></i>
            </div>
            {(report.failed > 0 || report.skipped > 0) && (
              <div className="sync-stat sync-stat-warn">
                <div className="sync-stat-num">{report.failed + report.skipped}</div>
                <div className="sync-stat-lbl">سطور لم تُنفّذ</div>
                <i className="fas fa-triangle-exclamation sync-stat-icon"></i>
              </div>
            )}
          </div>

          {/* Orphans list — shown only on preview */}
          {!report.apply && orphans.length > 0 && (
            <div className="sync-section">
              <h4 className="sync-section-title">
                <i className="fas fa-trash-can"></i>
                سيتم حذف هؤلاء الطلاب نهائيًا
              </h4>
              <ul className="sync-orphan-list">
                {orphans.map(o => (
                  <li key={o.id} className="sync-orphan-item">
                    <span className="sync-orphan-avatar">
                      {(o.name || '?').trim().charAt(0)}
                    </span>
                    <div className="sync-orphan-meta">
                      <div className="sync-orphan-name">{o.name}</div>
                      <div className="sync-orphan-phone" dir="ltr">{o.phone}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.apply && (
            <div className="sync-alert sync-alert-success">
              <i className="fas fa-circle-check"></i>
              <span>تمت المزامنة بنجاح. قاعدة البيانات الآن مطابقة للملف.</span>
            </div>
          )}

          {/* Action buttons */}
          {!report.apply && (
            <div className="sync-actions">
              <button
                className="sync-btn sync-btn-success"
                onClick={() => setConfirmApply(true)}
                disabled={busy}
              >
                {busy
                  ? <><i className="fas fa-spinner fa-spin"></i> جارٍ التنفيذ...</>
                  : <><i className="fas fa-check"></i> تطبيق التغييرات</>}
              </button>
              <button
                className="sync-btn sync-btn-ghost"
                onClick={() => run(false)}
                disabled={busy}
                title="إعادة المعاينة"
              >
                <i className="fas fa-rotate"></i> إعادة الفحص
              </button>
            </div>
          )}
          {report.apply && (
            <div className="sync-actions">
              {/* Primary post-apply action: re-preview after the admin
                  edited the CSV again. We clear the previous report so
                  the preview cards re-render with the new diff. */}
              <button
                className="sync-btn sync-btn-primary"
                onClick={() => { setReport(null); run(false) }}
                disabled={busy}
                title="قراءة آخر تعديلات الملف وإظهار التغييرات الجديدة"
              >
                {busy
                  ? <><i className="fas fa-spinner fa-spin"></i> جارٍ التحقق...</>
                  : <><i className="fas fa-rotate"></i> إعادة الفحص</>}
              </button>
              <button className="sync-btn sync-btn-ghost" onClick={clearFile}>
                <i className="fas fa-arrow-rotate-left"></i> رفع ملف آخر
              </button>
            </div>
          )}
          {/* Tech log — formatted as a beautiful table */}
          {report.logs && report.logs.length > 0 && (
            <details className="sync-tech">
              <summary>تفاصيل تقنية ({report.logs.length} سجل)</summary>
              <div className="sync-tech-table-wrapper">
                <table className="sync-tech-table">
                  <thead>
                    <tr>
                      <th>الإجراء</th>
                      <th>الطالب</th>
                      <th>الجوال</th>
                      <th>المرحلة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.logs.map((logStr, i) => {
                      let action = 'معلومة';
                      let type = 'info';
                      let student = '—';
                      let phone = '—';
                      let grade = '—';
                      const cleanLog = logStr.trim();
                      let isUpsert = cleanLog.startsWith('would upsert:') || cleanLog.startsWith('ok:');
                      let isDelete = cleanLog.startsWith('would delete:') || cleanLog.startsWith('deleted:');

                      if (isUpsert) {
                        type = 'upsert';
                        action = cleanLog.startsWith('would') ? 'تجهيز للحفظ' : 'تم الحفظ';
                        
                        const prefixMatch = cleanLog.match(/^(?:would upsert|ok):\s*(.+)$/i);
                        if (prefixMatch) {
                          const rest = prefixMatch[1]; // "Name (phone) → grade"
                          const parts = rest.split('→'); // Handle Backend Arrow
                          const leftPart = parts[0].trim();
                          const rightPart = parts[1] ? parts[1].trim() : '';
                          
                          const studentMatch = leftPart.match(/(.+?)\s*\(([^)]+)\)$/);
                          if (studentMatch) {
                            student = studentMatch[1].trim();
                            phone = studentMatch[2].trim();
                          } else {
                            student = leftPart;
                          }
                          
                          if (rightPart) {
                            grade = GRADE_LABEL[rightPart] || rightPart;
                          }
                        } else {
                          student = cleanLog;
                        }
                      } else if (isDelete) {
                        type = 'delete';
                        action = cleanLog.startsWith('would') ? 'تجهيز للحذف' : 'تم الحذف';
                        
                        const prefixMatch = cleanLog.match(/^(?:would delete|deleted):\s*(.+)$/i);
                        if (prefixMatch) {
                          const rest = prefixMatch[1];
                          const studentMatch = rest.match(/(.+?)\s*\(([^)]+)\)$/);
                          if (studentMatch) {
                            student = studentMatch[1].trim();
                            phone = studentMatch[2].trim();
                          } else {
                            student = rest;
                          }
                        } else {
                          student = cleanLog;
                        }
                      } else {
                        if (cleanLog.startsWith('skip:') || cleanLog.includes('fail')) {
                           type = 'delete'; // mark errors red
                           action = 'خطأ';
                        }
                        student = cleanLog;
                      }

                      return (
                        <tr key={i} className={`sync-tr-${type}`}>
                          <td>
                            <span className={`sync-badge sync-badge-${type}`}>
                              {action}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{student}</td>
                          <td dir="ltr" style={{ textAlign: 'right', fontFamily: 'monospace' }}>{phone}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{grade}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Confirm dialog for apply ───────────────────────────── */}
      {confirmApply && (
        <div className="sync-confirm-backdrop" onClick={() => setConfirmApply(false)}>
          <div className="sync-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="sync-confirm-icon"><i className="fas fa-triangle-exclamation"></i></div>
            <h3>تأكيد تطبيق التغييرات</h3>
            <p>
              سيتم حفظ <strong>{willAdd}</strong> طالبًا
              {orphans.length > 0 && <> وحذف <strong>{orphans.length}</strong> طالبًا غير موجود بالملف</>}.
              لا يمكن التراجع بعد التنفيذ.
            </p>
            <div className="sync-confirm-actions">
              <button className="sync-btn sync-btn-ghost" onClick={() => setConfirmApply(false)}>
                إلغاء
              </button>
              <button
                className="sync-btn sync-btn-success"
                onClick={() => { setConfirmApply(false); run(true) }}
              >
                <i className="fas fa-check"></i> نعم، نفّذ المزامنة
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
