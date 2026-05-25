import React, { useState, useEffect, useMemo } from 'react'
import { listExams, updateExamAvailability } from '@backend/examsApi'
import { listVideos, updateVideoAvailability } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import {
  listOverridesForTarget,
  upsertOverride,
  groupTargetId,
} from '@backend/overridesApi'
import { cached, LIST_TTL } from '../../utils/cache'
import {
  GradePickerCards,
  GroupPickerCards,
  GRADE_LABEL,
} from './shared'

export default function AvailabilityPanel({ onBack, flash, restrictTo }) {
  const [tab, setTab] = useState(restrictTo || 'exams')

  const [audience, setAudience] = useState('all')
  const [grade, setGrade]       = useState('first-prep')
  const [groupValue, setGroupValue] = useState('')
  const [studentId, setStudentId] = useState('')

  const [exams, setExams] = useState([])
  const [videos, setVideos] = useState([])
  const [students, setStudents] = useState([])
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
        const [ex, vd, st] = await Promise.all([
          cached('exams', LIST_TTL, listExams),
          cached('videos', LIST_TTL, listVideos),
          cached('students', LIST_TTL, listStudents),
        ])
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
        const map = await listOverridesForTarget(scope, target, itemType)
        if (cancelled) return
        const out = new Map()
        for (const [, r] of map) {
          out.set(r.item_id, { available_hours: r.available_hours ?? null, allowed: r.allowed !== false })
        }
        setOverrides(out)
      } catch { if (!cancelled) setOverrides(new Map()) }
    })()
    return () => { cancelled = true }
  }, [audience, grade, groupValue, studentId, itemType])

  const rows = tab === 'exams' ? exams : videos
  const targetGrade =
    audience === 'grade'   ? grade
    : audience === 'group' ? grade
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
    if (audience === 'group') return `${groupValue || 'مجموعة'} — ${GRADE_LABEL[grade] || grade}`
    if (audience === 'student') return selectedStudent?.name || 'طالب محدد'
    return ''
  }

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
        const { scope, target: targetId } = audienceTarget()
        if (!scope || !targetId) {
          flash(audience === 'group'
            ? 'اختر المرحلة والمجموعة أولاً'
            : 'اختر المرحلة أو الطالب أولاً',
            'warning')
          return
        }
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

  const clearOverride = async (item) => {
    if (audience === 'all') return
    const { scope, target: targetId } = audienceTarget()
    if (!scope || !targetId) return
    try {
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
        <h2><i className="fas fa-hourglass-half"></i> مدة الإتاحة</h2>
        <p>
          حدّد الجمهور، ثم عدّل عدد الساعات التي يظل فيها كل {tab === 'exams' ? 'امتحان' : 'فيديو'} متاحاً.
        </p>
      </div>

      {!restrictTo && (
        <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button
            className={`cp-btn ${tab === 'exams' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            type="button"
            onClick={() => setTab('exams')}
          >
            <i className="fas fa-file-alt"></i> الامتحانات
          </button>
          <button
            className={`cp-btn ${tab === 'videos' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            type="button"
            onClick={() => setTab('videos')}
          >
            <i className="fas fa-play-circle"></i> الفيديوهات
          </button>
        </div>
      )}

      <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap', marginTop: restrictTo ? 0 : 12 }}>
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
        <div className="cp-search" style={{ marginTop: 12 }}>
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder={`ابحث باسم ${tab === 'exams' ? 'الامتحان' : 'الفيديو'} أو المرحلة...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="cp-search-clear" type="button" onClick={() => setQuery('')}>
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
            <p>لا توجد عناصر مطابقة</p>
          </div>
        ) : (
          <ul className="cp-items" style={{ marginTop: 15 }}>
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
  const defaultHours = isExam ? (item.available_hours || 72) : (item.active_hours || 24)
  const savedHours = audience === 'all'
    ? defaultHours
    : (overrideHours ?? defaultHours)
  const inherited = audience !== 'all' && overrideHours == null

  const [draft, setDraft] = useState(savedHours)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(savedHours) }, [savedHours])

  const dirty = Number(draft) !== Number(savedHours)

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
    try { await onSave(clamp(draft)) } catch { } finally { setSaving(false) }
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
            <span className="cp-status-pill" style={{ background: 'rgba(99, 102, 241, 0.08)', color: 'var(--season-accent, #6366f1)' }}>
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
          <button className="cp-stepper-btn" type="button" onClick={() => setDraft(clamp(draft - 1))}>
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
          <button className="cp-stepper-btn" type="button" onClick={() => setDraft(clamp(draft + 1))}>
            <i className="fas fa-plus"></i>
          </button>
          <span className="cp-stepper-lbl">ساعة</span>
        </div>
        <button
          className={`cp-btn ${dirty ? 'cp-btn-success' : 'cp-btn-ghost'}`}
          type="button"
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
            type="button"
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
