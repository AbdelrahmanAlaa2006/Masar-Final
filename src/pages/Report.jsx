import React, { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { listStudents } from '@backend/profilesApi'
import { cached, LIST_TTL } from '../utils/cache'
import './Report.css'

import { GRADE_LABEL } from './ControlPanel/shared'

export default function Report() {
  const navigate = useNavigate()
  const [currentUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('masar-user')) || null } catch { return null }
  })
  const isStudent = currentUser?.role !== 'admin' && currentUser?.role !== 'assistant'
  const studentGradeLabel = GRADE_LABEL[currentUser?.grade] || ''
  const [studentInput, setStudentInput] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerType, setPickerType] = useState(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const boxRef = useRef(null)

  /* Real students from Supabase (admin only — RLS lets admins read all profiles).
     We shape them as { name, id, prep, group, phone, avatar_url } to stay
     compatible with the existing UI that renders prep/group meta. There is
     no "group" concept in the MVP schema, so we leave it blank. */
  const [allStudents, setAllStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')

  useEffect(() => {
    if (isStudent) return           // students don't need the roster
    let cancelled = false
    ;(async () => {
      try {
        setStudentsLoading(true)
        setStudentsError('')
        const rows = await cached('students', LIST_TTL, listStudents)
        if (cancelled) return
        setAllStudents(rows.map((r) => ({
          id:         r.id,
          name:       r.name || '—',
          phone:      r.phone || '',
          prep:       GRADE_LABEL[r.grade] || '—',
          group:      '',           // no groups in the current schema
          avatar_url: r.avatar_url,
        })))
      } catch (e) {
        if (!cancelled) setStudentsError(e.message || 'تعذّر تحميل قائمة الطلاب')
      } finally {
        if (!cancelled) setStudentsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isStudent])

  /* close on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = studentInput.trim().toLowerCase()
    if (!q) return allStudents.slice(0, 8)
    return allStudents
      .filter((s) =>
        [s.name, s.id, s.group, s.prep]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12)
  }, [studentInput, allStudents])

  const onChange = (value) => {
    setStudentInput(value)
    setSelectedStudent(null)
    setShowSuggestions(true)
    setActiveIndex(-1)
  }

  const selectStudent = (student) => {
    setSelectedStudent(student)
    setStudentInput(student.name)
    setShowSuggestions(false)
    setActiveIndex(-1)
  }

  const clearSelection = () => {
    setSelectedStudent(null)
    setStudentInput('')
    setShowSuggestions(false)
  }

  const onKeyDown = (e) => {
    if (!showSuggestions || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = activeIndex >= 0 ? filtered[activeIndex] : filtered[0]
      if (pick) selectStudent(pick)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const navigateToReport = (type, student) => {
    const params = new URLSearchParams({
      student: student.name || '',
      id: student.id || '',
      group: student.group || '',
      prep: student.prep || '',
    })
    if (type === 'videos') navigate(`/videos-report?${params.toString()}`)
    else if (type === 'exams') {
      params.set('type', 'exam')
      navigate(`/exams-report?${params.toString()}`)
    }
    else if (type === 'quizzes') {
      params.set('type', 'quiz')
      navigate(`/exams-report?${params.toString()}`)
    }
    else if (type === 'homework') navigate(`/homework-report?${params.toString()}`)
  }

  /* Student viewing their own report: go in with no URL params.
     The downstream pages read the logged-in profile from localStorage
     and Supabase RLS scopes the data to auth.uid() automatically. */
  const goToMyReport = (type) => {
    if (type === 'videos') navigate('/videos-report')
    else if (type === 'exams') navigate('/exams-report?type=exam')
    else if (type === 'quizzes') navigate('/exams-report?type=quiz')
    else if (type === 'homework') navigate('/homework-report')
  }

  const initials = (name) =>
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')

  if (isStudent) {
    return (
      <main className="cp-page">
        <div className="cp-container">
          <div className="cp-page-header">
            <div className="cp-page-header-text">
              <h1>تقاريري الدراسية</h1>
              <p>استعرض نتائجك وأدائك في الفيديوهات والامتحانات والواجبات</p>
            </div>
            <div className="cp-page-icon">
              <i className="fas fa-chart-bar"></i>
            </div>
          </div>
          <div className="cp-header-divider"></div>

          <div className="cp-target-banner" style={{ marginBottom: 24 }}>
            <div className="cp-avatar cp-avatar-purple">
              {currentUser?.avatar_url
                ? <img src={currentUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : initials(currentUser?.name || 'طالب')}
            </div>
            <div className="cp-target-banner-body">
              <div className="cp-target-banner-label">
                <i className="fas fa-circle-check"></i> الطالب الحالي
              </div>
              <div className="cp-target-banner-name">{currentUser?.name || 'الطالب'}</div>
              <div className="cp-target-banner-meta">
                {studentGradeLabel && (
                  <span><i className="fas fa-graduation-cap"></i> {studentGradeLabel}</span>
                )}
                {currentUser?.phone && (
                  <span><i className="fas fa-phone"></i> {currentUser.phone}</span>
                )}
              </div>
            </div>
          </div>

          <div className="cp-home-grid">
            <button className="cp-section-card cp-accent-blue" onClick={() => goToMyReport('videos')}>
              <div className="cp-section-icon">
                <i className="fas fa-play-circle"></i>
              </div>
              <div className="cp-section-body">
                <h3>تقرير الفيديوهات</h3>
                <p>مشاهداتك ونسبة تقدمك في الفيديوهات التعليمية</p>
              </div>
              <div className="cp-section-chevron-circle">
                <i className="fas fa-chevron-left"></i>
              </div>
            </button>

            <button className="cp-section-card cp-accent-purple" onClick={() => goToMyReport('exams')}>
              <div className="cp-section-icon">
                <i className="fas fa-file-alt"></i>
              </div>
              <div className="cp-section-body">
                <h3>تقرير الامتحانات</h3>
                <p>نتائجك في الامتحانات السابقة وتحليل أدائك</p>
              </div>
              <div className="cp-section-chevron-circle">
                <i className="fas fa-chevron-left"></i>
              </div>
            </button>

            <button className="cp-section-card cp-accent-blue" onClick={() => goToMyReport('quizzes')}>
              <div className="cp-section-icon">
                <i className="fas fa-book-open"></i>
              </div>
              <div className="cp-section-body">
                <h3>تقرير التسميعات</h3>
                <p>نتائجك في تسميعات الحفظ وتقييم المتابعة الأسبوعي</p>
              </div>
              <div className="cp-section-chevron-circle">
                <i className="fas fa-chevron-left"></i>
              </div>
            </button>

            <button className="cp-section-card cp-accent-teal" onClick={() => goToMyReport('homework')}>
              <div className="cp-section-icon">
                <i className="fas fa-book-open"></i>
              </div>
              <div className="cp-section-body">
                <h3>تقرير الواجبات</h3>
                <p>درجاتك في الواجبات ومتابعة تسليماتك</p>
              </div>
              <div className="cp-section-chevron-circle">
                <i className="fas fa-chevron-left"></i>
              </div>
            </button>
          </div>
        </div>
      </main>
    )
  }

  const goTo = (type) => {
    /* If user typed something but didn't click — auto-pick the first match */
    let student = selectedStudent
    if (!student && studentInput.trim() && filtered.length > 0) {
      student = filtered[0]
      setSelectedStudent(student)
      setStudentInput(student.name)
    }
    if (!student) {
      /* Open the picker modal instead of a browser alert */
      setPickerType(type)
      setPickerQuery('')
      setPickerOpen(true)
      return
    }
    navigateToReport(type, student)
  }

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return allStudents
    return allStudents.filter((s) =>
      [s.name, s.id, s.group, s.prep].join(' ').toLowerCase().includes(q)
    )
  }, [pickerQuery, allStudents])

  const pickFromModal = (s) => {
    setSelectedStudent(s)
    setStudentInput(s.name)
    setPickerOpen(false)
    if (pickerType) navigateToReport(pickerType, s)
  }

  const goToGroupReport = (type) => {
    if (type === 'videos') navigate('/videos-group-report')
    else if (type === 'exams') navigate('/exams-group-report?type=exam')
    else if (type === 'quizzes') navigate('/exams-group-report?type=quiz')
    else if (type === 'homework') navigate('/homework-group-report')
  }


  return (
    <main className="cp-page">
      <div className="cp-container">

        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>تقارير الطلاب</h1>
            <p>ابحث عن طالب واستعرض تقاريره الدراسية بالتفصيل</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-chart-bar"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {studentsLoading && (
          <div style={{ textAlign: 'center', padding: 12, color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-spinner fa-spin"></i> جارٍ تحميل قائمة الطلاب...
          </div>
        )}
        {studentsError && (
          <div style={{ textAlign: 'center', padding: 12, color: '#c53030' }}>
            <i className="fas fa-exclamation-triangle"></i> {studentsError}
          </div>
        )}

        <div className="cp-panel" style={{ padding: '1.6rem' }} ref={boxRef}>
          <div className="cp-search" style={{ margin: 0 }}>
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="ابحث بالاسم، رقم الطالب، المجموعة، أو المرحلة..."
              value={studentInput}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={onKeyDown}
            />
            {studentInput && (
              <button
                type="button"
                className="cp-search-clear"
                onClick={clearSelection}
                aria-label="مسح"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          {/* Selected student chip */}
          {selectedStudent && (
            <div className="cp-target-banner" style={{ margin: '16px 0 0 0' }}>
              <div className="cp-avatar cp-avatar-purple">
                {initials(selectedStudent.name)}
              </div>
              <div className="cp-target-banner-body">
                <div className="cp-target-banner-label">
                  <i className="fas fa-circle-check"></i> الطالب المحدد
                </div>
                <div className="cp-target-banner-name">{selectedStudent.name}</div>
                <div className="cp-target-banner-meta">
                  <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {selectedStudent.id}</span>
                  <span><i className="fas fa-graduation-cap"></i> {selectedStudent.prep}</span>
                  {selectedStudent.group && <span><i className="fas fa-users"></i> {selectedStudent.group}</span>}
                </div>
              </div>
              <button className="cp-crumbs-back" onClick={clearSelection} style={{ padding: '6px 12px', background: 'transparent' }}>
                <i className="fas fa-times"></i> مسح التحديد
              </button>
            </div>
          )}

          {showSuggestions && (
            <div className="cp-table-container" style={{ marginTop: 10, maxHeight: 380, overflowY: 'auto' }}>
              <div style={{ padding: '10px 15px', background: 'var(--cp-list-header-bg)', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--cp-divider)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--cp-text-muted)' }}>
                  <i className="fas fa-list" style={{ marginLeft: 6 }}></i>
                  {filtered.length > 0
                    ? `${filtered.length} ${filtered.length === 1 ? 'نتيجة' : 'نتائج'}`
                    : 'لا توجد نتائج'}
                </span>
              </div>
              {filtered.length > 0 ? (
                <ul className="cp-items" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {filtered.map((s, index) => (
                    <li
                      key={s.id}
                      className={`cp-item ${index === activeIndex ? 'is-active' : ''}`}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: index === activeIndex ? 'var(--cp-hover-bg)' : 'transparent',
                        borderBottom: '1px solid var(--cp-divider)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectStudent(s)}
                    >
                      <div className="cp-avatar cp-avatar-purple" style={{ width: 36, height: 36, fontSize: '0.8rem' }}>{initials(s.name)}</div>
                      <div className="cp-item-body" style={{ flex: 1 }}>
                        <div className="cp-item-title" style={{ fontWeight: 700, fontSize: '0.94rem' }}>{s.name}</div>
                        <div className="cp-item-meta" style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: '0.78rem', color: 'var(--cp-text-muted)' }}>
                          <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {s.id}</span>
                          <span><i className="fas fa-graduation-cap"></i> {s.prep}</span>
                          {s.group && <span><i className="fas fa-users"></i> {s.group}</span>}
                        </div>
                      </div>
                      <i className="fas fa-arrow-left cp-target-arrow"></i>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--cp-text-muted)' }}>
                  <i className="fas fa-user-slash" style={{ fontSize: '1.6rem', marginBottom: 8, display: 'block' }}></i>
                  <p style={{ margin: 0, fontSize: '0.88rem' }}>لم يتم العثور على طالب يطابق البحث</p>
                </div>
              )}
            </div>
          )}
        </div>

        <h2 className="cp-panel-header" style={{ margin: '2rem 0 1rem', fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-user-graduate" style={{ color: '#5bc2e7' }}></i>
          <span>تقارير فردية</span>
        </h2>

        <div className="cp-home-grid" style={{ marginBottom: '2.5rem' }}>
          <button className="cp-section-card cp-accent-blue" onClick={() => goTo('videos')}>
            <div className="cp-section-icon">
              <i className="fas fa-play-circle"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير الفيديوهات</h3>
              <p>تتبع حالة مشاهدة الفيديوهات التعليمية ومدى تقدم الطالب فيها</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>

          <button className="cp-section-card cp-accent-orange" onClick={() => goTo('exams')}>
            <div className="cp-section-icon">
              <i className="fas fa-file-alt"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير الامتحانات</h3>
              <p>مراجعة نتائج الامتحانات وتحليل أداء الطالب في كل اختبار</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>

          <button className="cp-section-card cp-accent-blue" onClick={() => goTo('quizzes')}>
            <div className="cp-section-icon">
              <i className="fas fa-book-reader"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير التسميعات</h3>
              <p>مراجعة نتائج التسميعات الأسبوعية ومستوى حفظ الطالب</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>

          <button className="cp-section-card cp-accent-teal" onClick={() => goTo('homework')}>
            <div className="cp-section-icon">
              <i className="fas fa-book-open"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير الواجبات</h3>
              <p>متابعة تسليم الواجبات وتحليل أداء الطالب في كل واجب</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>
        </div>

        <h2 className="cp-panel-header" style={{ margin: '2rem 0 1rem', fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-users" style={{ color: '#5bc2e7' }}></i>
          <span>تقارير جماعية</span>
        </h2>

        <div className="cp-home-grid" style={{ marginBottom: '2.5rem' }}>
          <button className="cp-section-card cp-accent-teal" onClick={() => goToGroupReport('videos')}>
            <div className="cp-section-icon">
              <i className="fas fa-chart-line"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير جماعي للفيديوهات</h3>
              <p>إحصائيات المشاهدة وتقرير الأداء العام لجميع الطلاب</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>

          <button className="cp-section-card cp-accent-orange" onClick={() => goToGroupReport('exams')}>
            <div className="cp-section-icon">
              <i className="fas fa-chart-pie"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير جماعي للامتحانات</h3>
              <p>نتائج وتحليل أداء جميع الطلاب في الامتحانات</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>

          <button className="cp-section-card cp-accent-blue" onClick={() => goToGroupReport('quizzes')}>
            <div className="cp-section-icon">
              <i className="fas fa-chart-line"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير جماعي للتسميعات</h3>
              <p>نتائج وتحليل أداء جميع الطلاب في التسميعات الأسبوعية</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>

          <button className="cp-section-card cp-accent-green" onClick={() => goToGroupReport('homework')}>
            <div className="cp-section-icon">
              <i className="fas fa-chart-bar"></i>
            </div>
            <div className="cp-section-body">
              <h3>تقرير جماعي للواجبات</h3>
              <p>إحصائيات التسليم وتقرير الأداء العام لجميع الطلاب في الواجبات</p>
            </div>
            <div className="cp-section-chevron-circle">
              <i className="fas fa-chevron-left"></i>
            </div>
          </button>
        </div>

      </div>

      {/* ── Student Picker Modal (replaces browser alert) ── */}
      {pickerOpen && createPortal(
        <div
          className="rp-modal-overlay"
          onClick={() => setPickerOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)' }}>
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon">
                <i className="fas fa-user-graduate"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)' }}>اختر الطالب</h3>
                <p style={{ color: 'var(--cp-text-muted)' }}>
                  لعرض {pickerType === 'videos' ? 'تقرير الفيديوهات' : pickerType === 'exams' ? 'تقرير الامتحانات' : pickerType === 'quizzes' ? 'تقرير التسميعات' : 'تقرير الواجبات'} يرجى اختيار طالب من القائمة
                </p>
              </div>
              <button
                className="rp-modal-close"
                onClick={() => setPickerOpen(false)}
                aria-label="إغلاق"
                style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="rp-modal-search">
              <i className="fas fa-search" style={{ color: 'var(--cp-text-muted)' }}></i>
              <input
                type="text"
                autoFocus
                placeholder="ابحث بالاسم أو رقم الطالب..."
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                style={{ background: 'var(--cp-bg)', border: '1px solid var(--cp-input-border)', color: 'var(--cp-text-main)' }}
              />
            </div>

            <div className="rp-modal-meta" style={{ color: 'var(--cp-text-muted)' }}>
              <i className="fas fa-list-ul" style={{ color: '#5bc2e7' }}></i>
              <span>
                {pickerResults.length}{' '}
                {pickerResults.length === 1 ? 'طالب' : 'طالب'}
              </span>
            </div>

            <ul className="rp-modal-list">
              {pickerResults.map((s) => (
                <li key={s.id} onClick={() => pickFromModal(s)} style={{ borderBottom: '1px solid var(--cp-divider)', padding: '12px 16px' }} className="cp-item">
                  <div className="rp-modal-avatar cp-avatar cp-avatar-purple">{initials(s.name)}</div>
                  <div className="rp-modal-info">
                    <div className="rp-modal-name" style={{ color: 'var(--cp-text-main)' }}>
                      <span>{s.name}</span>
                      <span className="cp-id-pill">
                        <i className="fas fa-id-badge"></i> {s.id}
                      </span>
                    </div>
                    <div className="rp-modal-sub" style={{ color: 'var(--cp-text-muted)' }}>
                      <span><i className="fas fa-graduation-cap"></i> {s.prep}</span>
                      {s.group && (
                        <>
                          <span className="rp-dot" style={{ color: 'var(--cp-divider)' }}>•</span>
                          <span><i className="fas fa-users"></i> {s.group}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <i className="fas fa-arrow-left cp-target-arrow"></i>
                </li>
              ))}
              {pickerResults.length === 0 && (
                <li className="rp-modal-empty" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <i className="fas fa-user-slash" style={{ fontSize: '1.8rem', color: 'var(--cp-text-muted)' }}></i>
                  <p style={{ color: 'var(--cp-text-muted)' }}>لم يتم العثور على نتائج</p>
                </li>
              )}
            </ul>
          </div>
        </div>,
        document.body
      )}
    </main>
  )
}
