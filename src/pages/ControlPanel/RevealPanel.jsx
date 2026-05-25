import React, { useState, useEffect, useMemo, useRef } from 'react'
import { listExams, setExamRevealGrades } from '@backend/examsApi'
import { listStudents } from '@backend/profilesApi'
import {
  listOverridesForTarget,
  upsertOverride,
  deleteOverride,
  groupTargetId,
} from '@backend/overridesApi'
import { createNotification } from '@backend/notificationsApi'
import { supabase } from '@backend/supabase'
import { cached, LIST_TTL, invalidatePrefix } from '../../utils/cache'
import {
  GradePickerCards,
  GroupPickerCards,
  GRADE_LABEL,
} from './shared'

export default function RevealPanel({ onBack, flash }) {
  const [audience, setAudience] = useState('all')
  const [grade, setGrade]       = useState('first-prep')
  const [groupValue, setGroupValue] = useState('')
  const [studentId, setStudentId] = useState('')

  const [exams, setExams]       = useState([])
  const [students, setStudents] = useState([])
  const [overrides, setOverrides] = useState(new Map())

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [busyId, setBusyId]   = useState(null)
  const [query, setQuery]     = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const busyIdsRef = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [ex, st] = await Promise.all([
          cached('exams', LIST_TTL, listExams),
          cached('students', LIST_TTL, listStudents),
        ])
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

  const audienceTarget = () => {
    if (audience === 'grade')   return { scope: 'prep',    target: grade }
    if (audience === 'group')   return { scope: 'group',   target: grade && groupValue ? groupTargetId(grade, groupValue) : '' }
    if (audience === 'student') return { scope: 'student', target: studentId }
    return { scope: null, target: '' }
  }

  useEffect(() => {
    if (audience === 'all') { setOverrides(new Map()); return }
    const { scope, target } = audienceTarget()
    if (!scope || !target) { setOverrides(new Map()); return }
    let cancelled = false
    ;(async () => {
      try {
        const map = await listOverridesForTarget(scope, target, 'exam_reveal')
        if (cancelled) return
        const out = new Map()
        for (const [k, v] of map) {
          const [, id] = k.split(':')
          out.set(id, v)
        }
        setOverrides(out)
      } catch { if (!cancelled) setOverrides(new Map()) }
    })()
    return () => { cancelled = true }
  }, [audience, grade, groupValue, studentId])

  const isRevealed = (ex) => {
    if (audience === 'all') return !!ex.reveal_grades
    if (ex.reveal_grades === true) return true
    const o = overrides.get(ex.id)
    return !!o && o.allowed !== false
  }

  const targetGrade =
    audience === 'grade'   ? grade
    : audience === 'group' ? grade
    : audience === 'student' ? (students.find((s) => s.id === studentId)?.grade || null)
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

  const audienceLabel = () => {
    if (audience === 'all') return 'كل الطلاب'
    if (audience === 'grade') return GRADE_LABEL[grade] || grade
    if (audience === 'group') return `${groupValue || 'مجموعة'} — ${GRADE_LABEL[grade] || grade}`
    if (audience === 'student') return selectedStudent?.name || 'طالب محدد'
    return ''
  }

  const notify = async (exam) => {
    const title = `تم إعلان نتيجة: ${exam.title}`
    const message = `أصبحت نتيجة الامتحان متاحة الآن في صفحة تقاريرك.`
    try {
      const me = JSON.parse(sessionStorage.getItem('masar-user') || 'null')
      const createdBy = me?.id || null

      let checkQuery = supabase
        .from('notifications')
        .select('id')
        .eq('scope', audience)
        .contains('meta', { examId: exam.id, kind: 'reveal' })

      if (audience === 'grade') {
        checkQuery = checkQuery.eq('target_grade', grade)
      } else if (audience === 'group' && grade && groupValue) {
        checkQuery = checkQuery.eq('target_group', groupTargetId(grade, groupValue))
      } else if (audience === 'student' && studentId) {
        checkQuery = checkQuery.eq('target_student', studentId)
      }

      const { data: existing } = await checkQuery.limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('notifications')
          .update({ created_at: new Date().toISOString() })
          .eq('id', existing[0].id)
        invalidatePrefix('notifications')
        return
      }

      if (audience === 'all') {
        await createNotification({ title, message, level: 'success', scope: 'all',
          meta: { examId: exam.id, kind: 'reveal' }, createdBy })
      } else if (audience === 'grade') {
        await createNotification({ title, message, level: 'success', scope: 'grade',
          targetGrade: grade, meta: { examId: exam.id, kind: 'reveal' }, createdBy })
      } else if (audience === 'group' && grade && groupValue) {
        await createNotification({ title, message, level: 'success', scope: 'group',
          targetGroup: groupTargetId(grade, groupValue),
          meta: { examId: exam.id, kind: 'reveal' }, createdBy })
      } else if (audience === 'student' && studentId) {
        await createNotification({ title, message, level: 'success', scope: 'student',
          targetStudent: studentId, meta: { examId: exam.id, kind: 'reveal' }, createdBy })
      }
    } catch { }
  }

  const handleToggle = async (exam) => {
    if (busyIdsRef.current.has(exam.id)) return
    busyIdsRef.current.add(exam.id)
    const currentlyRevealed = isRevealed(exam)
    const next = !currentlyRevealed
    setBusyId(exam.id)
    try {
      if (audience === 'all') {
        await setExamRevealGrades(exam.id, next)
        setExams((prev) => prev.map((r) => r.id === exam.id ? { ...r, reveal_grades: next } : r))
      } else {
        const { scope, target: targetId } = audienceTarget()
        if (!scope || !targetId) {
          flash(audience === 'group'
            ? 'اختر المرحلة والمجموعة أولاً'
            : 'اختر المرحلة أو الطالب أولاً',
            'warning')
          return
        }

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

      if (next) {
        await notify(exam)
      } else {
        let deleteQuery = supabase
          .from('notifications')
          .delete()
          .eq('scope', audience)
          .contains('meta', { examId: exam.id, kind: 'reveal' })

        if (audience === 'grade') {
          deleteQuery = deleteQuery.eq('target_grade', grade)
        } else if (audience === 'group' && grade && groupValue) {
          deleteQuery = deleteQuery.eq('target_group', groupTargetId(grade, groupValue))
        } else if (audience === 'student' && studentId) {
          deleteQuery = deleteQuery.eq('target_student', studentId)
        }

        await deleteQuery
        invalidatePrefix('notifications')
      }

      flash(
        next
          ? `تم إظهار نتائج: ${exam.title} — ${audienceLabel()}`
          : `تم إخفاء نتائج: ${exam.title} — ${audienceLabel()}`,
        next ? 'success' : 'warning'
      )
    } catch (e) {
      flash(e.message || 'تعذّر تحديث الحالة', 'warning')
    } finally {
      busyIdsRef.current.delete(exam.id)
      setBusyId(null)
    }
  }

  const revealedCount = filtered.filter(isRevealed).length
  const hiddenCount   = filtered.length - revealedCount
  const canInteract   = audience === 'all'
                     || (audience === 'grade'   && !!grade)
                     || (audience === 'group'   && !!grade && !!groupValue)
                     || (audience === 'student' && !!studentId)

  return (
    <section className="cp-panel">
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header">
        <h2><i className="fas fa-eye"></i> إظهار نتائج الامتحانات</h2>
        <p>اختر الجمهور أولاً، ثم فعِّل ظهور النتائج لكل امتحان — وسيصل إشعار تلقائي للطلاب.</p>
      </div>

      <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'all',     icon: 'fa-users',       label: 'كل الطلاب' },
          { id: 'grade',   icon: 'fa-layer-group', label: 'مرحلة محددة' },
          { id: 'group',   icon: 'fa-user-group',  label: 'مجموعة محددة' },
          { id: 'student', icon: 'fa-user',        label: 'طالب محدد' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`cp-btn ${audience === opt.id ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setAudience(opt.id)}
          >
            <i className={`fas ${opt.icon}`}></i> {opt.label}
          </button>
        ))}
      </div>

      {(audience === 'grade' || audience === 'group') && (
        <GradePickerCards
          value={grade}
          onChange={(g) => { setGrade(g); setGroupValue('') }}
          students={students}
        />
      )}

      {audience === 'group' && grade && (
        <GroupPickerCards
          grade={grade}
          value={groupValue}
          onChange={setGroupValue}
          students={students}
        />
      )}

      {audience === 'student' && (
        <div style={{ marginTop: 12 }}>
          {selectedStudent ? (
            <div className="cp-search" style={{ background: 'rgba(99, 102, 241, 0.08)' }}>
              <i className="fas fa-user-check" style={{ color: 'var(--season-accent, #6366f1)' }}></i>
              <span style={{ flex: 1, fontWeight: 600 }}>
                {selectedStudent.name} — {GRADE_LABEL[selectedStudent.grade] || '—'}
              </span>
              <button className="cp-search-clear" type="button" onClick={() => setStudentId('')}>
                <i className="fas fa-times"></i>
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
        <div className="cp-stats-row" style={{ marginTop: 12 }}>
          <div className="cp-stat">
            <i className="fas fa-file-alt"></i>
            <div>
              <div className="cp-stat-val">{filtered.length}</div>
              <div className="cp-stat-lbl">امتحانات</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-good">
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

      {canInteract && (
        <div className="cp-search" style={{ marginTop: 12 }}>
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="ابحث باسم الامتحان أو المرحلة..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="cp-search-clear" type="button" onClick={() => setQuery('')} aria-label="مسح">
              <i className="fas fa-times"></i>
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
          <ul className="cp-items" style={{ marginTop: 15 }}>
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
                      <span className={`cp-status-pill ${revealed ? 'cp-status-on' : 'cp-status-off'}`}>
                        <i className={`fas ${revealed ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        {revealed ? 'النتائج معلنة' : 'النتائج مخفية'}
                      </span>
                      {forcedByGlobal && (
                        <span className="cp-status-pill" style={{ background: 'rgba(99, 102, 241, 0.08)', color: 'var(--season-accent, #6366f1)' }}>
                          <i className="fas fa-globe"></i> معلن للكل
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="cp-item-controls">
                    <button
                      className={`cp-btn ${revealed ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                      type="button"
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
