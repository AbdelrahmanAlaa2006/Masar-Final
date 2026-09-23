import React, { useMemo, useState } from 'react'
import { GRADE_LABEL, GRADE_ORDER } from '../pages/ControlPanel/shared'
import './GradePicker.css'

/* The stage picker shared by every group report (exams, grades, homework,
   attendance, finance, videos).

   Each report used to render its own row of large buttons — one per grade —
   so a centre teaching two stages still faced fifteen big chips, most of them
   showing 0 students. This is one compact component instead:

     - grades are grouped under their stage (ابتدائي / إعدادي / ثانوي / بكالوريا)
     - chips are small, with the student count beside the name
     - grades with no students are folded away behind one link, so the picker
       shows what the centre actually teaches

   It renders inside a `.cp-panel`, which the print stylesheet already hides,
   so printed reports stay clean.

   Props:
     grades       — grade ids to offer (already filtered by the tenant)
     counts       — { [gradeId]: studentCount }
     value        — selected grade id
     onChange     — (gradeId) => void
     activeCount  — optional exact count for the selected grade, when the page
                    has the loaded students and knows better than `counts`
     showCounts   — false on content pages (lectures), where a grade is a filter
                    and there is no student count to show. Empty grades are then
                    never folded away, because "empty" cannot be known.
     labels       — optional { [gradeId]: name } when the tenant renames grades
     allLabel     — when set, adds a leading chip with the value 'all'
     bare         — render without the panel box/title, to sit inside another card
     title / emptyText / style — optional overrides
*/

const STAGES = [
  { id: 'primary',   label: 'المرحلة الابتدائية', match: (g) => g.startsWith('primary-') },
  { id: 'prep',      label: 'المرحلة الإعدادية',  match: (g) => g.endsWith('-prep') },
  { id: 'secondary', label: 'المرحلة الثانوية',   match: (g) => g.endsWith('-sec') },
  { id: 'bac',       label: 'البكالوريا',          match: (g) => g.startsWith('bac-') },
]

export default function GradePicker({
  grades = [],
  counts = {},
  value = '',
  selectedGrade = '',
  onChange,
  onSelectGrade,
  activeCount = null,
  showCounts = true,
  labels = null,
  allLabel = '',
  bare = false,
  title = 'اختر الصف الدراسي',
  emptyText = 'لا يوجد طلاب مسجلون بعد.',
  style,
}) {
  const [showEmpty, setShowEmpty] = useState(false)
  const actualValue = value || selectedGrade || ''
  const actualOnChange = onChange || onSelectGrade

  const countOf = (grade) =>
    (actualValue === grade && activeCount != null ? activeCount : counts[grade] || 0)

  const ordered = useMemo(() => {
    const rank = (g) => {
      const i = GRADE_ORDER.indexOf(g)
      return i === -1 ? GRADE_ORDER.length : i
    }
    return [...grades].sort((a, b) => rank(a) - rank(b))
  }, [grades])

  // A grade stays visible while it is selected, even with no students.
  // Without counts there is nothing to fold away, so everything shows.
  const hidden = showCounts ? ordered.filter((g) => countOf(g) === 0 && g !== actualValue) : []
  const visible = showCounts && !showEmpty
    ? ordered.filter((g) => countOf(g) > 0 || g === actualValue)
    : ordered

  const sections = []
  for (const stage of STAGES) {
    const items = visible.filter(stage.match)
    if (items.length) sections.push({ id: stage.id, label: stage.label, items })
  }
  // Anything a tenant added that is not one of the four stages.
  const other = visible.filter((g) => !STAGES.some((s) => s.match(g)))
  if (other.length) sections.push({ id: 'other', label: 'صفوف أخرى', items: other })

  const body = (
    <>
      {ordered.length === 0 ? (
        <p className="gp-empty">{emptyText}</p>
      ) : (
        <>
          {allLabel && (
            <div className="gp-chips" style={{ marginBottom: 10 }}>
              <button
                type="button"
                aria-pressed={actualValue === 'all'}
                className={`gp-chip ${actualValue === 'all' ? 'is-active' : ''}`}
                onClick={() => actualOnChange?.('all')}
              >
                <span>{allLabel}</span>
              </button>
            </div>
          )}

          {sections.map((section) => (
            <div className="gp-section" key={section.id}>
              {sections.length > 1 && <div className="gp-stage">{section.label}</div>}
              <div className="gp-chips">
                {section.items.map((grade) => {
                  const n = countOf(grade)
                  const active = actualValue === grade
                  return (
                    <button
                      key={grade}
                      type="button"
                      aria-pressed={active}
                      className={`gp-chip ${active ? 'is-active' : ''} ${showCounts && n === 0 ? 'is-empty' : ''}`}
                      onClick={() => actualOnChange?.(grade)}
                    >
                      <span>{(labels && labels[grade]) || GRADE_LABEL[grade] || grade}</span>
                      {showCounts && <span className="gp-chip-count">{n}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {hidden.length > 0 && (
            <button type="button" className="gp-toggle" onClick={() => setShowEmpty((v) => !v)}>
              <i className={`fas fa-chevron-${showEmpty ? 'up' : 'down'}`}></i>
              {showEmpty ? ' إخفاء الصفوف بدون طلاب' : ` إظهار الصفوف بدون طلاب (${hidden.length})`}
            </button>
          )}
        </>
      )}
    </>
  )

  if (bare) {
    return (
      <div className="gp-bare" style={style}>
        {title && <div className="gp-bare-title"><i className="fas fa-filter"></i> {title}</div>}
        {body}
      </div>
    )
  }

  return (
    <div className="cp-panel gp-panel" style={style}>
      <h2 className="gp-title">
        <i className="fas fa-school"></i> {title}
      </h2>
      {body}
    </div>
  )
}
