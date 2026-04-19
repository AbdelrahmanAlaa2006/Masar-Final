import React, { useMemo, useState } from 'react'
import { notifyExamRevealed } from '../services/notifications'
import './ControlPanel.css'

/* ──────────────────────────────────────────────────────────────
   Mock data — same structure used by the report pages.
   Replace with Supabase queries when wiring up.
   ────────────────────────────────────────────────────────────── */
const studentsByGroup = {
  'مجموعة السبت 10ص': [
    { id: 'ST001', name: 'أحمد علي محمد' },
    { id: 'ST002', name: 'سارة محمد أحمد' },
    { id: 'ST003', name: 'محمد أحمد' },
    { id: 'ST004', name: 'فاطمة حسن' },
  ],
  'مجموعة الثلاثاء 3م': [
    { id: 'ST005', name: 'محمود عبد الله' },
    { id: 'ST006', name: 'منى حسين' },
    { id: 'ST007', name: 'يوسف إبراهيم' },
  ],
  'مجموعة الخميس 5م': [
    { id: 'ST008', name: 'محمد حسين' },
    { id: 'ST009', name: 'نور الدين عمر' },
    { id: 'ST010', name: 'هدى مصطفى' },
  ],
  'مجموعة الأحد 11ص': [
    { id: 'ST011', name: 'كريم سامي' },
    { id: 'ST012', name: 'ليلى أشرف' },
    { id: 'ST013', name: 'عمر خالد' },
  ],
  'مجموعة الإثنين 4م': [
    { id: 'ST014', name: 'مريم طارق' },
    { id: 'ST015', name: 'حسن وليد' },
  ],
  'مجموعة الأربعاء 6م': [
    { id: 'ST016', name: 'دينا فؤاد' },
    { id: 'ST017', name: 'خالد رضا' },
    { id: 'ST018', name: 'إيمان سعيد' },
  ],
}

const groupsByGrade = {
  'الأول الإعدادي': ['مجموعة السبت 10ص', 'مجموعة الثلاثاء 3م', 'مجموعة الخميس 5م'],
  'الثاني الإعدادي': ['مجموعة الأحد 11ص', 'مجموعة الإثنين 4م'],
  'الثالث الإعدادي': ['مجموعة الأربعاء 6م'],
}

const videosByGrade = {
  'الأول الإعدادي': [
    { id: 'V101', title: 'مقدمة في الجبر', subject: 'رياضيات' },
    { id: 'V102', title: 'المعادلات الخطية', subject: 'رياضيات' },
    { id: 'V103', title: 'الكسور والأعداد العشرية', subject: 'رياضيات' },
    { id: 'V104', title: 'مدخل إلى الفيزياء', subject: 'علوم' },
  ],
  'الثاني الإعدادي': [
    { id: 'V201', title: 'الهندسة المستوية', subject: 'رياضيات' },
    { id: 'V202', title: 'نظرية فيثاغورس', subject: 'رياضيات' },
    { id: 'V203', title: 'التفاعلات الكيميائية', subject: 'علوم' },
  ],
  'الثالث الإعدادي': [
    { id: 'V301', title: 'حساب المثلثات', subject: 'رياضيات' },
    { id: 'V302', title: 'الإحصاء والاحتمالات', subject: 'رياضيات' },
    { id: 'V303', title: 'الكهرباء والمغناطيسية', subject: 'علوم' },
  ],
}

const examsByGrade = {
  'الأول الإعدادي': [
    { id: 'E101', title: 'اختبار الفصل الأول — رياضيات', subject: 'رياضيات', date: '2026-03-12' },
    { id: 'E102', title: 'اختبار قصير — علوم', subject: 'علوم', date: '2026-03-22' },
    { id: 'E103', title: 'الاختبار النصفي', subject: 'رياضيات', date: '2026-04-05' },
  ],
  'الثاني الإعدادي': [
    { id: 'E201', title: 'اختبار الهندسة', subject: 'رياضيات', date: '2026-03-18' },
    { id: 'E202', title: 'اختبار التفاعلات', subject: 'علوم', date: '2026-04-02' },
  ],
  'الثالث الإعدادي': [
    { id: 'E301', title: 'اختبار حساب المثلثات', subject: 'رياضيات', date: '2026-04-10' },
    { id: 'E302', title: 'الاختبار التشخيصي', subject: 'علوم', date: '2026-04-15' },
  ],
}

const DEFAULT_VIDEO_ATTEMPTS = 3
const DEFAULT_EXAM_ATTEMPTS = 1

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('')

/* ──────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────── */
export default function ControlPanel() {
  /* navigation */
  const [section, setSection] = useState('home') // 'home' | 'videos' | 'exams'
  const [scope, setScope] = useState(null) // 'prep' | 'group' | 'student'
  const [target, setTarget] = useState(null) // { kind, id, name, prep?, group? }
  const [pickerQuery, setPickerQuery] = useState('')

  /* per-target overrides:
     key = `${kind}:${targetId}:${itemId}` -> { allowed, attempts, revealed? } */
  const [overrides, setOverrides] = useState({})

  /* "revealed" exam status is global per exam (admin-controlled visibility) */
  const [revealedExams, setRevealedExams] = useState({}) // { examId: true }

  /* toast */
  const [toast, setToast] = useState(null)
  const flash = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2200)
  }

  /* ───── derived data for picker lists ───── */
  const allStudents = useMemo(() => {
    const rows = []
    Object.entries(groupsByGrade).forEach(([prep, groups]) => {
      groups.forEach((group) => {
        ;(studentsByGroup[group] || []).forEach((s) =>
          rows.push({ ...s, group, prep })
        )
      })
    })
    return rows
  }, [])

  const allGroups = useMemo(() => {
    const rows = []
    Object.entries(groupsByGrade).forEach(([prep, groups]) => {
      groups.forEach((g) =>
        rows.push({
          id: g,
          name: g,
          prep,
          studentCount: (studentsByGroup[g] || []).length,
        })
      )
    })
    return rows
  }, [])

  const allPreps = useMemo(
    () =>
      Object.entries(groupsByGrade).map(([prep, groups]) => ({
        id: prep,
        name: prep,
        groupCount: groups.length,
        studentCount: groups.reduce(
          (acc, g) => acc + (studentsByGroup[g] || []).length,
          0
        ),
      })),
    []
  )

  /* prep/grade key for the items list once a target is chosen */
  const targetPrep = useMemo(() => {
    if (!target) return null
    if (target.kind === 'prep') return target.id
    if (target.kind === 'group') {
      return Object.entries(groupsByGrade).find(([, gs]) =>
        gs.includes(target.id)
      )?.[0]
    }
    if (target.kind === 'student') return target.prep
    return null
  }, [target])

  const items = useMemo(() => {
    if (!targetPrep) return []
    if (section === 'videos') return videosByGrade[targetPrep] || []
    if (section === 'exams') return examsByGrade[targetPrep] || []
    return []
  }, [section, targetPrep])

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

  const toggleReveal = (exam) => {
    setRevealedExams((prev) => {
      const next = { ...prev, [exam.id]: !prev[exam.id] }
      const isReveal = !!next[exam.id]

      // Auto-notify students when results become visible
      if (isReveal) {
        let notifyTarget = { type: 'all' }
        if (scope === 'student' && target?.id) {
          notifyTarget = { type: 'students', value: [target.id] }
        } else if (scope === 'group' && target?.id) {
          notifyTarget = { type: 'group', value: target.id }
        } else if (scope === 'prep' && target?.id) {
          notifyTarget = { type: 'prep', value: String(target.id).replace('-prep', '') }
        }
        notifyExamRevealed({ examTitle: exam.title, target: notifyTarget })
      }

      flash(
        isReveal
          ? `تم إظهار نتائج: ${exam.title} للطلاب (تم إرسال إشعار)`
          : `تم إخفاء نتائج: ${exam.title}`,
        isReveal ? 'success' : 'warning'
      )
      return next
    })
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
    else if (scope === 'group') list = allGroups
    else if (scope === 'prep') list = allPreps
    if (!q) return list
    return list.filter((row) =>
      Object.values(row).join(' ').toLowerCase().includes(q)
    )
  }, [scope, pickerQuery, allStudents, allGroups, allPreps])

  /* ───── derived counts for breadcrumb / stats ───── */
  const stats = useMemo(() => {
    const total = items.length
    let blocked = 0
    let allowedCount = 0
    let revealed = 0
    items.forEach((it) => {
      const s = stateFor(it)
      if (s.allowed) allowedCount++
      else blocked++
      if (section === 'exams' && revealedExams[it.id]) revealed++
    })
    return { total, allowed: allowedCount, blocked, revealed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, overrides, revealedExams, section])

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
            <p>إدارة صلاحيات الفيديوهات والامتحانات للطلاب والمجموعات والمراحل</p>
          </div>
        </div>

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
              desc="تحكم في صلاحيات المشاهدة وعدد المحاولات لكل طالب أو مجموعة أو مرحلة"
              onClick={() => enterSection('videos')}
            />
            <SectionCard
              icon="fa-file-alt"
              accent="orange"
              title="إدارة الامتحانات"
              desc="السماح بدخول الامتحانات، تعديل المحاولات، وإظهار النتائج للطلاب"
              onClick={() => enterSection('exams')}
            />
          </div>
        )}

        {/* SCOPE PICKER */}
        {section !== 'home' && !scope && (
          <ScopePicker section={section} onPick={chooseScope} onBack={goHome} />
        )}

        {/* TARGET PICKER */}
        {section !== 'home' && scope && !target && (
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
        {section !== 'home' && target && (
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
            revealedExams={revealedExams}
            onToggleReveal={toggleReveal}
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
    section === 'videos' ? 'الفيديوهات' : section === 'exams' ? 'الامتحانات' : ''
  const scopeLabel =
    scope === 'student' ? 'حسب الطالب' : scope === 'group' ? 'حسب المجموعة' : scope === 'prep' ? 'حسب المرحلة' : ''
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
          icon="fa-users"
          color="green"
          title="حسب المجموعة"
          desc="طبّق التغييرات على جميع طلاب مجموعة معينة دفعة واحدة"
          onClick={() => onPick('group')}
        />
        <ScopeCard
          icon="fa-graduation-cap"
          color="orange"
          title="حسب المرحلة الدراسية"
          desc="طبّق التغييرات على جميع طلاب المرحلة في كل المجموعات"
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
  const label =
    scope === 'student' ? 'الطلاب' : scope === 'group' ? 'المجموعات' : 'المراحل الدراسية'
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
              ? 'ابحث بالاسم أو رقم الطالب أو المجموعة...'
              : scope === 'group'
              ? 'ابحث بالمجموعة أو المرحلة...'
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
            <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {row.id}</span>
          </div>
          <div className="cp-target-sub">
            <span><i className="fas fa-graduation-cap"></i> {row.prep}</span>
            <span className="cp-dot">•</span>
            <span><i className="fas fa-users"></i> {row.group}</span>
          </div>
        </div>
        <i className="fas fa-arrow-left cp-target-arrow"></i>
      </button>
    )
  }
  if (scope === 'group') {
    return (
      <button className="cp-target cp-target-group" onClick={() => onPick('group', row)}>
        <div className="cp-avatar cp-avatar-green"><i className="fas fa-users"></i></div>
        <div className="cp-target-body">
          <div className="cp-target-name"><span>{row.name}</span></div>
          <div className="cp-target-sub">
            <span><i className="fas fa-graduation-cap"></i> {row.prep}</span>
            <span className="cp-dot">•</span>
            <span><i className="fas fa-user"></i> {row.studentCount} طالب</span>
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
          <span><i className="fas fa-users"></i> {row.groupCount} مجموعة</span>
          <span className="cp-dot">•</span>
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
  revealedExams,
  onToggleReveal,
  onBack,
}) {
  const isVideo = section === 'videos'
  const scopeLabel =
    scope === 'student' ? 'الطالب' : scope === 'group' ? 'المجموعة' : 'المرحلة'

  return (
    <section className="cp-panel">
      <button className="cp-back" onClick={onBack}>
        <i className="fas fa-arrow-right"></i> رجوع
      </button>

      {/* Target summary */}
      <div className="cp-target-banner">
        <div className={`cp-avatar ${
          scope === 'student' ? 'cp-avatar-purple' :
          scope === 'group' ? 'cp-avatar-green' : 'cp-avatar-orange'
        }`}>
          {scope === 'student' ? initials(target.name) :
            scope === 'group' ? <i className="fas fa-users"></i> :
            <i className="fas fa-graduation-cap"></i>}
        </div>
        <div className="cp-target-banner-body">
          <div className="cp-target-banner-label">
            <i className="fas fa-bullseye"></i> {scopeLabel}
          </div>
          <div className="cp-target-banner-name">{target.name}</div>
          <div className="cp-target-banner-meta">
            {scope === 'student' && (
              <>
                <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {target.id}</span>
                <span><i className="fas fa-graduation-cap"></i> {target.prep}</span>
                <span><i className="fas fa-users"></i> {target.group}</span>
              </>
            )}
            {scope === 'group' && <span><i className="fas fa-graduation-cap"></i> {target.prep}</span>}
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
        {!isVideo && (
          <div className="cp-stat cp-stat-info">
            <i className="fas fa-eye"></i>
            <div>
              <div className="cp-stat-val">{stats.revealed}</div>
              <div className="cp-stat-lbl">نتائج معلنة</div>
            </div>
          </div>
        )}
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
              revealed={!isVideo ? !!revealedExams[item.id] : false}
              onToggleReveal={!isVideo ? () => onToggleReveal(item) : null}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ItemRow({ item, isVideo, state, onToggle, onAttempts, onBump, onReset, revealed, onToggleReveal }) {
  return (
    <li className={`cp-item ${state.allowed ? '' : 'is-blocked'}`}>
      <div className="cp-item-icon">
        <i className={`fas ${isVideo ? 'fa-play-circle' : 'fa-file-alt'}`}></i>
      </div>

      <div className="cp-item-body">
        <div className="cp-item-title">
          <span>{item.title}</span>
          <span className="cp-id-pill cp-id-pill-sm"><i className="fas fa-hashtag"></i>{item.id}</span>
        </div>
        <div className="cp-item-meta">
          {item.subject && <span><i className="fas fa-book"></i> {item.subject}</span>}
          {item.date && <span><i className="fas fa-calendar"></i> {item.date}</span>}
          <span className={`cp-status-pill ${state.allowed ? 'cp-status-on' : 'cp-status-off'}`}>
            <i className={`fas ${state.allowed ? 'fa-circle-check' : 'fa-ban'}`}></i>
            {state.allowed ? 'مسموح' : 'محظور'}
          </span>
          {!isVideo && (
            <span className={`cp-status-pill ${revealed ? 'cp-status-reveal' : 'cp-status-hidden'}`}>
              <i className={`fas ${revealed ? 'fa-eye' : 'fa-eye-slash'}`}></i>
              {revealed ? 'النتائج معلنة' : 'النتائج مخفية'}
            </span>
          )}
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

        {/* Reveal toggle (exams only) */}
        {!isVideo && (
          <button
            className={`cp-btn ${revealed ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={onToggleReveal}
            title="إظهار / إخفاء النتائج للطلاب في تقاريرهم الفردية"
          >
            <i className={`fas ${revealed ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            {revealed ? 'إخفاء النتائج' : 'إظهار النتائج'}
          </button>
        )}

        <button className="cp-icon-btn" onClick={onReset} title="استرجاع الإعدادات الافتراضية">
          <i className="fas fa-rotate-left"></i>
        </button>
      </div>
    </li>
  )
}
