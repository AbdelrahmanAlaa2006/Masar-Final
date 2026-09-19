import React, { useMemo, useState } from 'react'
import { GRADE_LABEL, GRADE_ORDER } from '../pages/ControlPanel/shared'

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
  onChange,
  activeCount = null,
  title = 'اختر الصف الدراسي',
  emptyText = 'لا يوجد طلاب مسجلون بعد.',
  style,
}) {
  const [showEmpty, setShowEmpty] = useState(false)

  const countOf = (grade) =>
    (value === grade && activeCount != null ? activeCount : counts[grade] || 0)

  const ordered = useMemo(() => {
    const rank = (g) => {
      const i = GRADE_ORDER.indexOf(g)
      return i === -1 ? GRADE_ORDER.length : i
    }
    return [...grades].sort((a, b) => rank(a) - rank(b))
  }, [grades])

  // A grade stays visible while it is selected, even with no students.
  const hidden = ordered.filter((g) => countOf(g) === 0 && g !== value)
  const visible = showEmpty ? ordered : ordered.filter((g) => countOf(g) > 0 || g === value)

  const sections = []
  for (const stage of STAGES) {
    const items = visible.filter(stage.match)
    if (items.length) sections.push({ id: stage.id, label: stage.label, items })
  }
  // Anything a tenant added that is not one of the four stages.
  const other = visible.filter((g) => !STAGES.some((s) => s.match(g)))
  if (other.length) sections.push({ id: 'other', label: 'صفوف أخرى', items: other })

  return (
    <div className="cp-panel gp-panel" style={style}>
      <h2 className="gp-title">
        <i className="fas fa-school"></i> {title}
      </h2>

      {ordered.length === 0 ? (
        <p className="gp-empty">{emptyText}</p>
      ) : (
        <>
          {sections.map((section) => (
            <div className="gp-section" key={section.id}>
              {sections.length > 1 && <div className="gp-stage">{section.label}</div>}
              <div className="gp-chips">
                {section.items.map((grade) => {
                  const n = countOf(grade)
                  const active = value === grade
                  return (
                    <button
                      key={grade}
                      type="button"
                      aria-pressed={active}
                      className={`gp-chip ${active ? 'is-active' : ''} ${n === 0 ? 'is-empty' : ''}`}
                      onClick={() => onChange?.(grade)}
                    >
                      <span>{GRADE_LABEL[grade] || grade}</span>
                      <span className="gp-chip-count">{n}</span>
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
    </div>
  )
}
