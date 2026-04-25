import React, { useMemo, useState, useEffect } from 'react'
import { listExams, setExamRevealGrades, updateExamAvailability } from '@backend/examsApi'
import { listVideos, updateVideoAvailability } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import {
  listOverridesForTarget,
  upsertOverride,
  deleteOverride,
} from '@backend/overridesApi'
import { createNotification } from '@backend/notificationsApi'
import { useI18n } from '../i18n'
import './ControlPanel.css'

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
  const { t, lang } = useI18n()
  
  const GRADE_LABEL = {
    'first-prep':  t('grades.first'),
    'second-prep': t('grades.second'),
    'third-prep':  t('grades.third'),
  }

  /* navigation */
  const [section, setSection] = useState('home') // 'home' | 'videos' | 'exams'
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
        if (!cancelled) setLoadError(err.message || (lang === 'ar' ? 'تعذر تحميل البيانات' : 'Failed to load data'))
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
        if (!cancelled) flash(e.message || (lang === 'ar' ? 'تعذر تحميل الإعدادات' : 'Failed to load settings'), 'warning')
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
      flash(e.message || (lang === 'ar' ? 'تعذر حفظ التعديل' : 'Failed to save changes'), 'warning')
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
    if (!prev) return // already default
    setOverrides((p) => { const n = { ...p }; delete n[key]; return n })
    try {
      await deleteOverride({
        scope: target.kind,
        targetId: target.id,
        itemType: section === 'videos' ? 'video' : 'exam',
        itemId: item.id,
      })
      flash(lang === 'ar' ? 'تم استرجاع الإعدادات الافتراضية' : 'Default settings restored')
    } catch (e) {
      setOverrides((p) => ({ ...p, [key]: prev }))
      flash(e.message || (lang === 'ar' ? 'تعذر الاسترجاع' : 'Failed to restore'), 'warning')
    }
  }

  const bulkSet = async (allowed) => {
    try {
      await Promise.all(items.map((item) =>
        persistItem(item, { allowed })
      ))
      flash(allowed ? (lang === 'ar' ? 'تم السماح بكل العناصر' : 'All items allowed') : (lang === 'ar' ? 'تم منع كل العناصر' : 'All items blocked'))
    } catch (e) { /* individual errors already flashed */ }
  }

  const bulkAddAttempt = async () => {
    try {
      await Promise.all(items.map((item) => {
        const cur = stateFor(item).attempts
        return persistItem(item, { attempts: Math.min(99, cur + 1) })
      }))
      flash(lang === 'ar' ? 'تم إضافة محاولة لكل العناصر' : 'Added an attempt to all items')
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
            <h1>{t('adminPanel.controlPanelTitle') || (lang === 'ar' ? 'لوحة التحكم' : 'Control Panel')}</h1>
            <p>{lang === 'ar' ? 'إدارة صلاحيات الفيديوهات والامتحانات للطلاب والمراحل الدراسية' : 'Manage video and exam permissions for students and grades'}</p>
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
          t={t}
          lang={lang}
        />

        {/* HOME — only two entry tiles; availability + reveal are
            now sub-tabs inside those sections (user asked to merge
            them to reduce clutter). */}
        {section === 'home' && (
          <div className="cp-home-grid">
            <SectionCard
              icon="fa-play-circle"
              accent="blue"
              title={lang === 'ar' ? 'إدارة الفيديوهات' : 'Videos Management'}
              desc={lang === 'ar' ? 'صلاحيات المشاهدة، المحاولات الإضافية، ومدة الإتاحة' : 'Viewing permissions, extra attempts, and availability duration'}
              onClick={() => enterSection('videos')}
            />
            <SectionCard
              icon="fa-file-alt"
              accent="orange"
              title={lang === 'ar' ? 'إدارة الامتحانات' : 'Exams Management'}
              desc={lang === 'ar' ? 'المحاولات الإضافية، مدة الإتاحة، وإظهار نتائج الامتحانات' : 'Extra attempts, availability, and exam results reveal'}
              onClick={() => enterSection('exams')}
            />
          </div>
        )}

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
              <i className="fas fa-user-shield"></i> {lang === 'ar' ? 'الصلاحيات والمحاولات' : 'Permissions & Attempts'}
            </button>
            <button
              className={`cp-btn ${subtab === 'availability' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
              onClick={() => setSubtab('availability')}
            >
              <i className="fas fa-hourglass-half"></i> {lang === 'ar' ? 'مدة الإتاحة' : 'Availability Duration'}
            </button>
            {section === 'exams' && (
              <button
                className={`cp-btn ${subtab === 'reveal' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                onClick={() => setSubtab('reveal')}
              >
                <i className="fas fa-eye"></i> {lang === 'ar' ? 'إظهار النتائج' : 'Reveal Results'}
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
            t={t}
            lang={lang}
          />
        )}

        {/* REVEAL sub-panel — only inside Exams */}
        {section === 'exams' && subtab === 'reveal' && (
          <RevealPanel onBack={goHome} flash={flash} t={t} lang={lang} />
        )}

        {/* ATTEMPTS FLOW — the original scope/target/items navigation */}
        {(section === 'videos' || section === 'exams') && subtab === 'attempts' && loading && (
          <div className="cp-empty">
            <i className="fas fa-spinner fa-spin"></i>
            <p>{t('common.loading')}...</p>
          </div>
        )}

        {(section === 'videos' || section === 'exams') && subtab === 'attempts' && !loading && !scope && (
          <ScopePicker section={section} onPick={chooseScope} onBack={goHome} t={t} lang={lang} />
        )}

        {(section === 'videos' || section === 'exams') && subtab === 'attempts' && !loading && scope && !target && (
          <TargetPicker
            scope={scope}
            list={pickerList}
            query={pickerQuery}
            onQuery={setPickerQuery}
            onPick={chooseTarget}
            onBack={backFromScope}
            t={t}
            lang={lang}
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
            t={t}
            lang={lang}
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

function Breadcrumbs({ section, scope, target, onHome, onSection, onScope, t, lang }) {
  const sectionLabel =
    section === 'videos' ? (lang === 'ar' ? 'الفيديوهات' : 'Videos')
    : section === 'exams' ? (lang === 'ar' ? 'الامتحانات' : 'Exams')
    : ''
  const scopeLabel =
    scope === 'student' ? (lang === 'ar' ? 'حسب الطالب' : 'By Student') 
    : scope === 'prep' ? (lang === 'ar' ? 'حسب المرحلة' : 'By Grade') : ''
  return (
    <nav className="cp-crumbs" aria-label="breadcrumb">
      <button onClick={onHome} className={section === 'home' ? 'is-active' : ''}>
        <i className="fas fa-house"></i> {t('common.home') || (lang === 'ar' ? 'الرئيسية' : 'Home')}
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

function ScopePicker({ section, onPick, onBack, t, lang }) {
  const verb = section === 'videos' ? (lang === 'ar' ? 'الفيديوهات' : 'Videos') : (lang === 'ar' ? 'الامتحانات' : 'Exams')
  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className={`fas ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i> {t('common.back')}
      </button>
      <header className="cp-panel-header">
        <h2>{lang === 'ar' ? `اختر نطاق التحكم في ${verb}` : `Choose control scope for ${verb}`}</h2>
        <p>{lang === 'ar' ? 'حدّد المستوى الذي تريد تطبيق التغييرات عليه' : 'Select the level to apply changes to'}</p>
      </header>

      <div className="cp-scope-grid">
        <ScopeCard
          icon="fa-user"
          color="purple"
          title={lang === 'ar' ? 'حسب الطالب' : 'By Student'}
          desc={lang === 'ar' ? 'تحكم في صلاحيات طالب محدد بشكل فردي' : 'Control permissions for a specific student'}
          onClick={() => onPick('student')}
          lang={lang}
        />
        <ScopeCard
          icon="fa-graduation-cap"
          color="orange"
          title={lang === 'ar' ? 'حسب المرحلة الدراسية' : 'By Grade Level'}
          desc={lang === 'ar' ? 'طبّق التغييرات على جميع طلاب المرحلة' : 'Apply changes to all students in the grade'}
          onClick={() => onPick('prep')}
          lang={lang}
        />
      </div>
    </section>
  )
}

function ScopeCard({ icon, title, desc, color, onClick, lang }) {
  return (
    <button className={`cp-scope-card cp-color-${color}`} onClick={onClick}>
      <div className="cp-scope-icon">
        <i className={`fas ${icon}`}></i>
      </div>
      <h4>{title}</h4>
      <p>{desc}</p>
      <span className="cp-scope-cta">
        {lang === 'ar' ? 'اختر' : 'Choose'} <i className={`fas ${lang === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}`}></i>
      </span>
    </button>
  )
}

function TargetPicker({ scope, list, query, onQuery, onPick, onBack, t, lang }) {
  const label = scope === 'student' ? (lang === 'ar' ? 'الطلاب' : 'Students') : (lang === 'ar' ? 'المراحل الدراسية' : 'Grade Levels')
  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className={`fas ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i> {t('common.back')}
      </button>

      <header className="cp-panel-header">
        <h2>{lang === 'ar' ? `اختر من ${label}` : `Choose from ${label}`}</h2>
        <p>{lang === 'ar' ? 'ابحث ثم انقر على العنصر للانتقال إلى لوحة التحكم الخاصة به' : 'Search and click on an item to open its control panel'}</p>
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
              ? (lang === 'ar' ? 'ابحث بالاسم أو رقم الطالب أو المرحلة...' : 'Search by name, ID or grade...')
              : (lang === 'ar' ? 'ابحث بالمرحلة...' : 'Search by grade...')
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
        <span>{list.length} {lang === 'ar' ? 'نتيجة' : 'results'}</span>
      </div>

      {list.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-folder-open"></i>
          <p>{lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results'}</p>
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
  t,
  lang,
}) {
  const isVideo = section === 'videos'
  const scopeLabel = scope === 'student' ? (lang === 'ar' ? 'الطالب' : 'Student') : (lang === 'ar' ? 'المرحلة' : 'Grade')

  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className={`fas ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i> {t('common.back')}
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
            <div className="cp-stat-lbl">{isVideo ? (lang === 'ar' ? 'فيديوهات' : 'Videos') : (lang === 'ar' ? 'امتحانات' : 'Exams')}</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-good">
          <i className="fas fa-circle-check"></i>
          <div>
            <div className="cp-stat-val">{stats.allowed}</div>
            <div className="cp-stat-lbl">{lang === 'ar' ? 'مسموح' : 'Allowed'}</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-bad">
          <i className="fas fa-ban"></i>
          <div>
            <div className="cp-stat-val">{stats.blocked}</div>
            <div className="cp-stat-lbl">{lang === 'ar' ? 'محظور' : 'Blocked'}</div>
          </div>
        </div>
      </div>

      <div className="cp-bulk-bar">
        <span className="cp-bulk-label">
          <i className="fas fa-bolt"></i> {lang === 'ar' ? 'إجراءات جماعية:' : 'Bulk Actions:'}
        </span>
        <button className="cp-btn cp-btn-success" onClick={onBulkAllow}>
          <i className="fas fa-check-double"></i> {lang === 'ar' ? 'سماح الكل' : 'Allow All'}
        </button>
        <button className="cp-btn cp-btn-danger" onClick={onBulkBlock}>
          <i className="fas fa-ban"></i> {lang === 'ar' ? 'منع الكل' : 'Block All'}
        </button>
        <button className="cp-btn cp-btn-ghost" onClick={onBulkAddAttempt}>
          <i className="fas fa-plus"></i> {lang === 'ar' ? '+1 محاولة إضافية للكل' : '+1 Additional Attempt All'}
        </button>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-inbox"></i>
          <p>{lang === 'ar' ? `لا توجد ${isVideo ? 'فيديوهات' : 'امتحانات'} في هذه المرحلة بعد` : `No ${isVideo ? 'videos' : 'exams'} in this grade yet`}</p>
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
              lang={lang}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ItemRow({ item, isVideo, state, onToggle, onAttempts, onBump, onReset, lang }) {
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
            {state.allowed ? (lang === 'ar' ? 'مسموح' : 'Allowed') : (lang === 'ar' ? 'محظور' : 'Blocked')}
          </span>
          {dirty && (
            <span className="cp-status-pill cp-status-dirty" style={{ background: '#fef3c7', color: '#92400e' }}>
              <i className="fas fa-pen"></i>
              {lang === 'ar' ? 'تغييرات غير محفوظة' : 'Unsaved changes'}
            </span>
          )}
        </div>
      </div>

      <div className="cp-item-controls">
        {/* Allow toggle (saves instantly — it's a boolean) */}
        <label className="cp-switch" title={state.allowed ? (lang === 'ar' ? 'مسموح بالوصول' : 'Access Allowed') : (lang === 'ar' ? 'الوصول محظور' : 'Access Blocked')}>
          <input type="checkbox" checked={state.allowed} onChange={onToggle} />
          <span className="cp-switch-slider"></span>
        </label>

        {/* Bonus-attempts stepper — draft until Save is clicked */}
        <div className="cp-stepper" title={lang === 'ar' ? 'محاولات إضافية فوق الإعداد الافتراضي' : 'Extra attempts beyond default'}>
          <button className="cp-stepper-btn" onClick={() => setDraftClamped(draft - 1)} aria-label={lang === 'ar' ? 'إنقاص' : 'Decrease'}>
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
          <button className="cp-stepper-btn" onClick={() => setDraftClamped(draft + 1)} aria-label={lang === 'ar' ? 'زيادة' : 'Increase'}>
            <i className="fas fa-plus"></i>
          </button>
          <span className="cp-stepper-lbl">{lang === 'ar' ? 'محاولات إضافية' : 'Extra Attempts'}</span>
        </div>

        <button
          className={`cp-btn ${dirty ? 'cp-btn-success' : 'cp-btn-ghost'}`}
          onClick={handleSave}
          disabled={!dirty || saving}
          title={lang === 'ar' ? 'حفظ عدد المحاولات الإضافية' : 'Save extra attempts'}
        >
          {saving ? (
            <><i className="fas fa-spinner fa-spin"></i> {lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...'}</>
          ) : (
            <><i className="fas fa-floppy-disk"></i> {lang === 'ar' ? 'حفظ' : 'Save'}</>
          )}
        </button>

        <button className="cp-icon-btn" onClick={onReset} title={lang === 'ar' ? 'استرجاع الإعدادات الافتراضية' : 'Restore Default Settings'}>
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
function RevealPanel({ onBack, flash, t, lang }) {
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
    if (audience === 'all') return lang === 'ar' ? 'كل الطلاب' : 'All Students'
    if (audience === 'grade') return GRADE_LABEL[grade] || grade
    if (audience === 'student') return selectedStudent?.name || (lang === 'ar' ? 'طالب محدد' : 'Specific Student')
    return ''
  }

  // Post a notification to match the audience so students see a real entry
  // in their notification bell the moment the exam is revealed.
  const notify = async (exam) => {
    const title = lang === 'ar' ? `تم إعلان نتيجة: ${exam.title}` : `Result Announced: ${exam.title}`
    const message = lang === 'ar' ? `أصبحت نتيجة الامتحان متاحة الآن في صفحة تقاريرك.` : `Your exam result is now available in your reports page.`
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
          ? (lang === 'ar' ? `تم إظهار نتائج: ${exam.title} — ${audienceLabel()}` : `Revealed results: ${exam.title} — ${audienceLabel()}`)
          : (lang === 'ar' ? `تم إخفاء نتائج: ${exam.title} — ${audienceLabel()}` : `Hidden results: ${exam.title} — ${audienceLabel()}`),
        next ? 'success' : 'warning'
      )
    } catch (e) {
      flash(e.message || (lang === 'ar' ? 'تعذّر تحديث الحالة' : 'Failed to update status'), 'warning')
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
        <h2><i className="fas fa-eye"></i> {lang === 'ar' ? 'إظهار نتائج الامتحانات' : 'Reveal Exam Results'}</h2>
        <p>{lang === 'ar' ? 'اختر الجمهور أولاً، ثم فعِّل ظهور النتائج لكل امتحان — وسيصل إشعار تلقائي للطلاب.' : 'Select the audience first, then reveal results per exam — an automatic notification will be sent fully to students.'}</p>
      </div>

      {/* Audience selector */}
      <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'all',     icon: 'fa-users',     label: lang === 'ar' ? 'كل الطلاب' : 'All Students' },
          { id: 'grade',   icon: 'fa-layer-group', label: lang === 'ar' ? 'مرحلة محددة' : 'Specific Grade' },
          { id: 'student', icon: 'fa-user',      label: lang === 'ar' ? 'طالب محدد' : 'Specific Student' },
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
              <div className="cp-stat-lbl">{lang === 'ar' ? 'امتحانات' : 'Exams'}</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-info">
            <i className="fas fa-eye"></i>
            <div>
              <div className="cp-stat-val">{revealedCount}</div>
              <div className="cp-stat-lbl">{lang === 'ar' ? 'نتائج معلنة' : 'Revealed'}</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-bad">
            <i className="fas fa-eye-slash"></i>
            <div>
              <div className="cp-stat-val">{hiddenCount}</div>
              <div className="cp-stat-lbl">{lang === 'ar' ? 'نتائج مخفية' : 'Hidden'}</div>
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
            placeholder={lang === 'ar' ? 'ابحث باسم الامتحان أو المرحلة...' : 'Search by exam name or grade...'}
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
            <p>{lang === 'ar' ? 'لا توجد امتحانات مطابقة' : 'No matching exams'}</p>
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
                      <span><i className="fas fa-clock"></i> {ex.duration_minutes} {lang === 'ar' ? 'دقيقة' : 'min'}</span>
                      <span><i className="fas fa-star"></i> {ex.total_points} {lang === 'ar' ? 'درجة' : 'pts'}</span>
                      <span className={`cp-status-pill ${revealed ? 'cp-status-reveal' : 'cp-status-hidden'}`}>
                        <i className={`fas ${revealed ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        {revealed ? (lang === 'ar' ? 'النتائج معلنة' : 'Results Revealed') : (lang === 'ar' ? 'النتائج مخفية' : 'Results Hidden')}
                      </span>
                      {forcedByGlobal && (
                        <span className="cp-status-pill" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                          <i className="fas fa-globe"></i> {lang === 'ar' ? 'معلن للكل' : 'Revealed to All'}
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
                        ? (lang === 'ar' ? 'النتائج معلنة لكل الطلاب — ألغِ الإعلان العام من تبويب "كل الطلاب" أولاً' : 'Results revealed to all — Uncheck global reveal from "All students" first')
                        : (lang === 'ar' ? 'إظهار / إخفاء النتائج للطلاب' : 'Reveal / hide results')}
                    >
                      {busy ? (
                        <><i className="fas fa-spinner fa-spin"></i> {lang === 'ar' ? 'جارٍ...' : 'Loading...'}</>
                      ) : (
                        <><i className={`fas ${revealed ? 'fa-eye-slash' : 'fa-eye'}`}></i> {revealed ? (lang === 'ar' ? 'إخفاء النتائج' : 'Hide Results') : (lang === 'ar' ? 'إظهار النتائج' : 'Reveal Results')}</>
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
function GradePickerCards({ value, onChange, students = [], lang }) {
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
                    <i className="fas fa-circle-check"></i> {lang === 'ar' ? 'مختارة' : 'Selected'}
                  </span>
                )}
              </div>
              <div className="cp-target-sub">
                <span><i className="fas fa-user"></i> {counts[g] || 0} {lang === 'ar' ? 'طالب' : 'student(s)'}</span>
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
function AvailabilityPanel({ onBack, flash, restrictTo, t, lang }) {
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
    if (audience === 'all') return lang === 'ar' ? 'كل الطلاب' : 'All Students'
    if (audience === 'grade') return GRADE_LABEL[grade] || grade
    if (audience === 'student') return selectedStudent?.name || (lang === 'ar' ? 'طالب محدد' : 'Specific Student')
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
        <h2><i className="fas fa-hourglass-half"></i> {lang === 'ar' ? 'مدة الإتاحة' : 'Availability Duration'}</h2>
        <p>
          {lang === 'ar' ? `حدّد الجمهور، ثم عدّل عدد الساعات التي يظل فيها كل ${tab === 'exams' ? 'امتحان' : 'فيديو'} متاحاً.` : `Select the audience, then adjust the duration for which each ${tab === 'exams' ? 'exam' : 'video'} remains available.`}
        </p>
      </div>

      {/* (legacy) type tabs — hidden when the parent section restricts us */}
      {!restrictTo && (
        <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button
            className={`cp-btn ${tab === 'exams' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setTab('exams')}
          >
            <i className="fas fa-file-alt"></i> {lang === 'ar' ? 'الامتحانات' : 'Exams'}
          </button>
          <button
            className={`cp-btn ${tab === 'videos' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setTab('videos')}
          >
            <i className="fas fa-play-circle"></i> {lang === 'ar' ? 'الفيديوهات' : 'Videos'}
          </button>
        </div>
      )}

      {/* Audience selector — mirrors RevealPanel for familiarity. */}
      <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'all',     icon: 'fa-users',       label: lang === 'ar' ? 'كل الطلاب' : 'All Students' },
          { id: 'grade',   icon: 'fa-layer-group', label: lang === 'ar' ? 'مرحلة محددة' : 'Specific Grade' },
          { id: 'student', icon: 'fa-user',        label: lang === 'ar' ? 'طالب محدد' : 'Specific Student' },
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
        <GradePickerCards value={grade} onChange={setGrade} students={students} lang={lang} />
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
            <p>{lang === 'ar' ? 'لا توجد عناصر مطابقة' : 'No matching items'}</p>
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
                lang={lang}
              />
            ))}
          </ul>
        )
      )}
    </section>
  )
}

function AvailabilityRow({ item, isExam, audience, overrideHours, onSave, onClear, lang }) {
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

  // A helper since GradePickerCards maps grades
  const GRADE_LABEL = {
    'first-prep':  lang === 'ar' ? 'الأول الإعدادي' : 'First Prep',
    'second-prep': lang === 'ar' ? 'الثاني الإعدادي' : 'Second Prep',
    'third-prep':  lang === 'ar' ? 'الثالث الإعدادي' : 'Third Prep',
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
          <span><i className="fas fa-hourglass-half"></i> {savedHours} {lang === 'ar' ? 'ساعة' : 'hours'}</span>
          <span><i className="fas fa-calendar-check"></i> {lang === 'ar' ? 'متاح حتى' : 'Available until'} {previewText}</span>
          {inherited && (
            <span className="cp-status-pill" style={{ background: '#e0e7ff', color: '#3730a3' }}>
              <i className="fas fa-link"></i> {lang === 'ar' ? 'موروث من الافتراضي' : 'Inherited from default'}
            </span>
          )}
          {audience !== 'all' && !inherited && (
            <span className="cp-status-pill" style={{ background: '#dcfce7', color: '#166534' }}>
              <i className="fas fa-user-shield"></i> {lang === 'ar' ? 'مخصص لهذا الجمهور' : 'Assigned to this audience'}
            </span>
          )}
          {dirty && (
            <span className="cp-status-pill" style={{ background: '#fef3c7', color: '#92400e' }}>
              <i className="fas fa-pen"></i> {lang === 'ar' ? 'تغييرات غير محفوظة' : 'Unsaved changes'}
            </span>
          )}
        </div>
      </div>
      <div className="cp-item-controls">
        <div className="cp-stepper" title={lang === 'ar' ? 'عدد الساعات المتاحة منذ إنشاء العنصر' : 'Number of hours available since creation'}>
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
          <span className="cp-stepper-lbl">{lang === 'ar' ? 'ساعة' : 'h'}</span>
        </div>
        <button
          className={`cp-btn ${dirty ? 'cp-btn-success' : 'cp-btn-ghost'}`}
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <><i className="fas fa-spinner fa-spin"></i> {lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...'}</>
          ) : (
            <><i className="fas fa-floppy-disk"></i> {lang === 'ar' ? 'حفظ' : 'Save'}</>
          )}
        </button>
        {onClear && !inherited && (
          <button
            className="cp-icon-btn"
            onClick={onClear}
            title={lang === 'ar' ? 'استرجاع الإعداد الافتراضي لهذا الجمهور' : 'Reset default setting for this audience'}
          >
            <i className="fas fa-rotate-left"></i>
          </button>
        )}
      </div>
    </li>
  )
}
