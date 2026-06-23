import React, { useState, useEffect, useMemo, useRef } from 'react'
import { listHomeworks, updateHomework } from '@backend/homeworksApi'
import { createNotification } from '@backend/notificationsApi'
import { supabase } from '@backend/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cached, invalidate as invalidateCache, invalidatePrefix, LIST_TTL } from '../../utils/cache'
import { useTenant } from '../../contexts/TenantContext'

import {
  GRADE_LABEL,
  GRADE_ORDER,
} from './shared'

export default function HomeworkRevealPanel({ onBack, flash }) {
  const { user: me } = useAuth()
  const { gradesList } = useTenant()

  const [homeworks, setHomeworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [query, setQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all') // 'all' | 'first-prep' | 'second-prep' | 'third-prep'
  const busyIdsRef = useRef(new Set())

  // Load homeworks
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const hw = await cached('homeworks', LIST_TTL, listHomeworks)
        if (!cancelled) {
          setHomeworks(hw)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'تعذّر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Filter homeworks by grade then by search query
  const filtered = useMemo(() => {
    let list = homeworks
    if (gradeFilter !== 'all') {
      list = list.filter((hw) => hw.grade === gradeFilter)
    }
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((hw) =>
      [hw.title, hw.week, hw.subject, GRADE_LABEL[hw.grade]].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [homeworks, gradeFilter, query])

  const notify = async (hw) => {
    const title = `تم إعلان نتيجة: ${hw.title}`
    const message = `أصبحت نتيجة الواجب متاحة الآن في صفحة تقاريرك.`
    try {
      const createdBy = me?.id || null

      // Check if a notification for this homework reveal already exists
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('scope', 'grade')
        .eq('target_grade', hw.grade)
        .contains('meta', { homeworkId: hw.id, kind: 'reveal_hw' })
        .limit(1)

      if (existing && existing.length > 0) {
        // Already notified! Just bump the timestamp to move it to the top
        await supabase
          .from('notifications')
          .update({ created_at: new Date().toISOString() })
          .eq('id', existing[0].id)
        invalidatePrefix('notifications')
        return
      }

      await createNotification({
        title,
        message,
        level: 'success',
        scope: 'grade',
        targetGrade: hw.grade,
        meta: { homeworkId: hw.id, kind: 'reveal_hw' },
        createdBy
      })
    } catch { /* non-fatal */ }
  }

  const handleToggle = async (hw) => {
    if (busyIdsRef.current.has(hw.id)) return
    busyIdsRef.current.add(hw.id)
    const next = !hw.reveal_grades
    setBusyId(hw.id)
    try {
      await updateHomework(hw.id, { reveal_grades: next })
      invalidateCache('homeworks')
      setHomeworks((prev) => prev.map((r) => r.id === hw.id ? { ...r, reveal_grades: next } : r))
      
      if (next) {
        await notify(hw)
      } else {
        // Clean up: delete active reveal notification when results are hidden
        await supabase
          .from('notifications')
          .delete()
          .eq('scope', 'grade')
          .eq('target_grade', hw.grade)
          .contains('meta', { homeworkId: hw.id, kind: 'reveal_hw' })
        invalidatePrefix('notifications')
      }

      flash(
        next
          ? `تم إظهار نتائج: ${hw.title} — للطلاب`
          : `تم إخفاء نتائج: ${hw.title} — عن الطلاب`,
        next ? 'success' : 'warning'
      )
    } catch (e) {
      flash(e.message || 'تعذّر تحديث الحالة', 'warning')
    } finally {
      busyIdsRef.current.delete(hw.id)
      setBusyId(null)
    }
  }

  // Stats for the currently filtered grade scope
  const scopeList = gradeFilter === 'all' ? homeworks : homeworks.filter((h) => h.grade === gradeFilter)
  const totalCount = scopeList.length
  const revealedCount = scopeList.filter((h) => h.reveal_grades).length
  const hiddenCount = totalCount - revealedCount

  // Count per grade for the filter pills
  const gradeCount = useMemo(() => {
    const counts = { 'all': homeworks.length }
    GRADE_ORDER.forEach((g) => { counts[g] = homeworks.filter((h) => h.grade === g).length })
    return counts
  }, [homeworks])

  const tabs = useMemo(() => {
    const list = [{ id: 'all', icon: 'fa-layer-group', label: 'الكل' }]
    const iconMap = {
      'first-prep': 'fa-seedling',
      'second-prep': 'fa-book-open-reader',
      'third-prep': 'fa-trophy',
      'first-sec': 'fa-graduation-cap',
      'second-sec': 'fa-user-graduate',
      'third-sec': 'fa-award',
      'primary-1': 'fa-child', 'primary-2': 'fa-child', 'primary-3': 'fa-child',
      'primary-4': 'fa-child', 'primary-5': 'fa-child', 'primary-6': 'fa-child',
      'bac-1': 'fa-graduation-cap', 'bac-2': 'fa-graduation-cap', 'bac-3': 'fa-graduation-cap',
    }
    for (const g of gradesList) {
      list.push({
        id: g.id,
        icon: iconMap[g.id] || 'fa-graduation-cap',
        label: g.name
      })
    }
    return list
  }, [gradesList])


  return (
    <section className="cp-panel">
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header">
        <h2><i className="fas fa-book-open"></i> إظهار نتائج الواجبات</h2>
        <p>التحكم في إظهار درجات وملاحظات تصحيح الواجبات للطلاب، وسيصل إشعار تلقائي لطلاب المرحلة عند الإعلان.</p>
      </div>

      {/* Grade filter tabs */}
      <div className="cp-stats-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`cp-btn ${gradeFilter === opt.id ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setGradeFilter(opt.id)}
          >
            <i className={`fas ${opt.icon}`}></i> {opt.label}
            {gradeCount[opt.id] > 0 && (
              <span style={{
                marginInlineStart: 6, background: 'rgba(255,255,255,0.18)',
                borderRadius: 99, padding: '1px 7px', fontSize: 12, fontWeight: 700
              }}>
                {gradeCount[opt.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats cards */}
      <div className="cp-stats-row" style={{ marginBottom: 20 }}>
        <div className="cp-stat">
          <i className="fas fa-book-open"></i>
          <div>
            <div className="cp-stat-val">{totalCount}</div>
            <div className="cp-stat-lbl">إجمالي الواجبات</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-good">
          <i className="fas fa-eye"></i>
          <div>
            <div className="cp-stat-val">{revealedCount}</div>
            <div className="cp-stat-lbl">النتائج المعلنة</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-bad">
          <i className="fas fa-eye-slash"></i>
          <div>
            <div className="cp-stat-val">{hiddenCount}</div>
            <div className="cp-stat-lbl">النتائج المخفية</div>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="cp-search">
        <i className="fas fa-search"></i>
        <input
          type="text"
          placeholder="ابحث عن واجب بالعنوان، الأسبوع، أو المرحلة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="cp-search-clear" type="button" onClick={() => setQuery('')}>
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جارٍ التحميل...</p>
        </div>
      ) : error ? (
        <div className="cp-empty" style={{ color: '#c53030' }}>
          <i className="fas fa-circle-exclamation"></i>
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-folder-open"></i>
          <p>لا توجد واجبات مطابقة</p>
        </div>
      ) : (
        <ul className="cp-items" style={{ marginTop: 15 }}>
          {filtered.map((hw) => {
            const isBusy = busyId === hw.id
            return (
              <li key={hw.id} className={`cp-item ${hw.reveal_grades ? '' : 'is-blocked'}`}>
                <div className="cp-item-icon">
                  <i className="fas fa-book-open"></i>
                </div>

                <div className="cp-item-body">
                  <div className="cp-item-title">
                    <span>{hw.title}</span>
                  </div>
                  <div className="cp-item-meta">
                    {hw.week && <span><i className="fas fa-calendar"></i> {hw.week}</span>}
                    {hw.subject && <span><i className="fas fa-book"></i> {hw.subject}</span>}
                    <span><i className="fas fa-graduation-cap"></i> {GRADE_LABEL[hw.grade] || hw.grade}</span>
                    <span className={`cp-status-pill ${hw.reveal_grades ? 'cp-status-on' : 'cp-status-off'}`}>
                      <i className={`fas ${hw.reveal_grades ? 'fa-circle-check' : 'fa-ban'}`}></i>
                      {hw.reveal_grades ? 'معلنة للطلاب' : 'مخفية عن الطلاب'}
                    </span>
                  </div>
                </div>

                <div className="cp-item-controls">
                  <label className="cp-switch" title={hw.reveal_grades ? 'إخفاء الدرجات' : 'إظهار الدرجات'}>
                    <input
                      type="checkbox"
                      checked={hw.reveal_grades}
                      disabled={isBusy}
                      onChange={() => handleToggle(hw)}
                    />
                    <span className="cp-switch-slider"></span>
                  </label>
                  {isBusy && <i className="fas fa-spinner fa-spin" style={{ color: 'var(--season-accent, #6366f1)' }}></i>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
