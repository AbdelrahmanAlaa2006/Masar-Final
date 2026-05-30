import React, { useState, useEffect, useMemo } from 'react'

export const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}

export const GRADE_ORDER = ['first-prep', 'second-prep', 'third-prep']

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('')

export function Breadcrumbs({ section, scope, target, onHome, onSection, onScope }) {
  const sectionLabel =
    section === 'videos' ? 'الفيديوهات'
    : section === 'exams' ? 'الامتحانات'
    : section === 'homeworks' ? 'الواجبات'
    : section === 'accounts' ? 'حسابات الطلاب والتفعيل'
    : section === 'students' ? 'مزامنة الطلاب'
    : section === 'resets' ? 'طلبات استعادة الحساب'
    : section === 'violations' ? 'سجلات الحماية الأمنية'
    : section === 'seasons' ? 'السمات الموسمية'
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

export function SectionCard({ icon, title, desc, accent, onClick }) {
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

export function ScopePicker({ section, onPick, onBack }) {
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

export function ScopeCard({ icon, title, desc, color, onClick }) {
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

export function TargetPicker({ scope, list, query, onQuery, onPick, onBack }) {
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

export function TargetRow({ scope, row, onPick }) {
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

export function ItemsManager({
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

export function ItemRow({ item, isVideo, state, onToggle, onAttempts, onBump, onReset }) {
  const [draft, setDraft] = useState(state.attempts)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(state.attempts)
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
        <label className="cp-switch" title={state.allowed ? 'مسموح بالوصول' : 'الوصول محظور'}>
          <input type="checkbox" checked={state.allowed} onChange={onToggle} />
          <span className="cp-switch-slider"></span>
        </label>

        <div className="cp-stepper" title="محاولات إضافية فوق الإعداد الافتراضي">
          <button className="cp-stepper-btn" type="button" onClick={() => setDraftClamped(draft - 1)} aria-label="إنقاص">
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
          <button className="cp-stepper-btn" type="button" onClick={() => setDraftClamped(draft + 1)} aria-label="زيادة">
            <i className="fas fa-plus"></i>
          </button>
          <span className="cp-stepper-lbl">محاولات إضافية</span>
        </div>

        <button
          className={`cp-btn ${dirty ? 'cp-btn-success' : 'cp-btn-ghost'}`}
          type="button"
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
          type="button"
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

export function GradePickerCards({ value, onChange, students = [] }) {
  const counts = useMemo(() => {
    const out = { 'first-prep': 0, 'second-prep': 0, 'third-prep': 0 }
    for (const s of students) if (s?.grade && out[s.grade] !== undefined) out[s.grade]++
    return out
  }, [students])

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
            type="button"
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

export function GroupPickerCards({ grade, value, onChange, students = [] }) {
  const groups = useMemo(() => {
    const set = new Set()
    for (const s of students) {
      if (s?.grade !== grade) continue
      const g = (s.group || '').trim()
      if (g) set.add(g)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [students, grade])

  const counts = useMemo(() => {
    const out = {}
    for (const s of students) {
      if (s?.grade !== grade) continue
      const g = (s.group || '').trim()
      if (!g) continue
      out[g] = (out[g] || 0) + 1
    }
    return out
  }, [students, grade])

  if (groups.length === 0) {
    return (
      <div className="cp-empty" style={{ marginTop: 12 }}>
        <i className="fas fa-circle-info"></i>
        <p>لا توجد مجموعات معرّفة لهذه المرحلة بعد. أضف عمود <code>group</code> في ملف الطلاب وأعد المزامنة.</p>
      </div>
    )
  }

  return (
    <div
      className="cp-group-picker"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 12,
      }}
    >
      {groups.map((g) => {
        const active = value === g
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            className={`cp-btn ${active ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            style={{ borderRadius: 999 }}
          >
            <i className="fas fa-user-group"></i>
            <span>{g}</span>
            <span
              className="cp-id-pill cp-id-pill-sm"
              style={{ marginInlineStart: 6 }}
            >
              {counts[g] || 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}
