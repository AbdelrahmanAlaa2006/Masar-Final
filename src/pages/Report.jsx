import React, { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { listStudents } from '@backend/profilesApi'
import './Report.css'

/* Map DB grade enum → Arabic label shown in the UI */
const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}

export default function Report() {
  const navigate = useNavigate()
  const [currentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('masar-user')) || null } catch { return null }
  })
  const isStudent = currentUser?.role !== 'admin'
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
        const rows = await listStudents()
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
    }).toString()
    if (type === 'videos') navigate(`/videos-report?${params}`)
    else if (type === 'exams') navigate(`/exams-report?${params}`)
  }

  /* Student viewing their own report: go in with no URL params.
     The downstream pages read the logged-in profile from localStorage
     and Supabase RLS scopes the data to auth.uid() automatically. */
  const goToMyReport = (type) => {
    if (type === 'videos') navigate('/videos-report')
    else if (type === 'exams') navigate('/exams-report')
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
      <main className="report-page">
        <div className="report-container">
          <div className="report-header">
            <div className="report-header-icon"><i className="fas fa-chart-bar"></i></div>
            <h1>تقاريري الدراسية</h1>
            <p>استعرض نتائجك وأدائك في الفيديوهات والامتحانات</p>
          </div>

          <div className="report-selected-chip" style={{ marginBottom: 24 }}>
            <div className="report-selected-avatar">
              {currentUser?.avatar_url
                ? <img src={currentUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : initials(currentUser?.name || 'طالب')}
            </div>
            <div className="report-selected-info">
              <div className="report-selected-name">
                <i className="fas fa-circle-check"></i>
                {currentUser?.name || 'الطالب'}
              </div>
              <div className="report-selected-meta">
                {studentGradeLabel && (
                  <span><i className="fas fa-graduation-cap"></i> {studentGradeLabel}</span>
                )}
                {currentUser?.phone && (
                  <span><i className="fas fa-phone"></i> {currentUser.phone}</span>
                )}
              </div>
            </div>
          </div>

          <div className="report-cards-grid">
            <div className="report-card" onClick={() => goToMyReport('videos')}>
              <div className="report-card-icon report-card-icon--blue">
                <i className="fas fa-play-circle"></i>
              </div>
              <div className="report-card-body">
                <h3>تقرير الفيديوهات</h3>
                <p>مشاهداتك ونسبة تقدمك في الفيديوهات التعليمية</p>
              </div>
              <i className="fas fa-chevron-left report-card-arrow"></i>
            </div>

            <div className="report-card" onClick={() => goToMyReport('exams')}>
              <div className="report-card-icon report-card-icon--purple">
                <i className="fas fa-file-alt"></i>
              </div>
              <div className="report-card-body">
                <h3>تقرير الامتحانات</h3>
                <p>نتائجك في الامتحانات السابقة وتحليل أدائك</p>
              </div>
              <i className="fas fa-chevron-left report-card-arrow"></i>
            </div>
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
    else if (type === 'exams') navigate('/exams-group-report')
  }


  return (
    <main className="report-page">
      <div className="report-container">

        <div className="report-header">
          <div className="report-header-icon">
            <i className="fas fa-chart-bar"></i>
          </div>
          <h1>تقارير الطلاب</h1>
          <p>ابحث عن طالب واستعرض تقاريره الدراسية بالتفصيل</p>
        </div>

        {studentsLoading && (
          <div style={{ textAlign: 'center', padding: 12, color: '#718096' }}>
            <i className="fas fa-spinner fa-spin"></i> جارٍ تحميل قائمة الطلاب...
          </div>
        )}
        {studentsError && (
          <div style={{ textAlign: 'center', padding: 12, color: '#c53030' }}>
            <i className="fas fa-exclamation-triangle"></i> {studentsError}
          </div>
        )}

        <div className="report-search-box" ref={boxRef}>
          <div className="report-search-row">
            <div className="report-search-field">
              <i className="fas fa-search report-search-icon"></i>
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
                  className="report-clear-btn"
                  onClick={clearSelection}
                  aria-label="مسح"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>
          </div>

          {/* Selected student chip */}
          {selectedStudent && (
            <div className="report-selected-chip">
              <div className="report-selected-avatar">
                {initials(selectedStudent.name)}
              </div>
              <div className="report-selected-info">
                <div className="report-selected-name">
                  <i className="fas fa-circle-check"></i>
                  {selectedStudent.name}
                </div>
                <div className="report-selected-meta">
                  <span><i className="fas fa-id-badge"></i> {selectedStudent.id}</span>
                  <span><i className="fas fa-graduation-cap"></i> {selectedStudent.prep}</span>
                  <span><i className="fas fa-users"></i> {selectedStudent.group}</span>
                </div>
              </div>
              <button className="report-selected-clear" onClick={clearSelection}>
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}

          {showSuggestions && (
            <div className="report-suggestions-wrap">
              <div className="report-suggestions-header">
                <i className="fas fa-list"></i>
                <span>
                  {filtered.length > 0
                    ? `${filtered.length} ${filtered.length === 1 ? 'نتيجة' : 'نتائج'}`
                    : 'لا توجد نتائج'}
                </span>
              </div>
              {filtered.length > 0 ? (
                <ul className="report-suggestions">
                  {filtered.map((s, index) => (
                    <li
                      key={s.id}
                      className={index === activeIndex ? 'is-active' : ''}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectStudent(s)}
                    >
                      <div className="rs-avatar">{initials(s.name)}</div>
                      <div className="rs-body">
                        <div className="rs-name">{s.name}</div>
                        <div className="rs-meta">
                          <span className="rs-pill rs-pill-id">
                            <i className="fas fa-id-badge"></i> {s.id}
                          </span>
                          <span className="rs-meta-item">
                            <i className="fas fa-graduation-cap"></i> {s.prep}
                          </span>
                          <span className="rs-meta-item">
                            <i className="fas fa-users"></i> {s.group}
                          </span>
                        </div>
                      </div>
                      <i className="fas fa-arrow-left rs-arrow"></i>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="report-suggestions-empty">
                  <i className="fas fa-user-slash"></i>
                  <p>لم يتم العثور على طالب يطابق البحث</p>
                </div>
              )}
            </div>
          )}
        </div>

        <h2 className="report-section-label">
          <i className="fas fa-user-graduate"></i>
          تقارير فردية
        </h2>

        <div className="report-cards-grid">
          <div className="report-card" onClick={() => goTo('videos')}>
            <div className="report-card-icon report-card-icon--blue">
              <i className="fas fa-play-circle"></i>
            </div>
            <div className="report-card-body">
              <h3>تقرير الفيديوهات</h3>
              <p>تتبع حالة مشاهدة الفيديوهات التعليمية ومدى تقدم الطالب فيها</p>
            </div>
            <i className="fas fa-chevron-left report-card-arrow"></i>
          </div>

          <div className="report-card" onClick={() => goTo('exams')}>
            <div className="report-card-icon report-card-icon--purple">
              <i className="fas fa-file-alt"></i>
            </div>
            <div className="report-card-body">
              <h3>تقرير الامتحانات</h3>
              <p>مراجعة نتائج الامتحانات وتحليل أداء الطالب في كل اختبار</p>
            </div>
            <i className="fas fa-chevron-left report-card-arrow"></i>
          </div>
        </div>

        <h2 className="report-section-label">
          <i className="fas fa-users"></i>
          تقارير جماعية
        </h2>

        <div className="report-cards-grid">
          <div className="report-card" onClick={() => goToGroupReport('videos')}>
            <div className="report-card-icon report-card-icon--teal">
              <i className="fas fa-chart-line"></i>
            </div>
            <div className="report-card-body">
              <h3>تقرير جماعي للفيديوهات</h3>
              <p>إحصائيات المشاهدة وتقرير الأداء العام لجميع الطلاب</p>
            </div>
            <i className="fas fa-chevron-left report-card-arrow"></i>
          </div>

          <div className="report-card" onClick={() => goToGroupReport('exams')}>
            <div className="report-card-icon report-card-icon--orange">
              <i className="fas fa-chart-pie"></i>
            </div>
            <div className="report-card-body">
              <h3>تقرير جماعي للامتحانات</h3>
              <p>نتائج وتحليل أداء جميع الطلاب في الامتحانات</p>
            </div>
            <i className="fas fa-chevron-left report-card-arrow"></i>
          </div>
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
          <div className="rp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-header">
              <div className="rp-modal-icon">
                <i className="fas fa-user-graduate"></i>
              </div>
              <div className="rp-modal-title">
                <h3>اختر الطالب</h3>
                <p>
                  لعرض {pickerType === 'videos' ? 'تقرير الفيديوهات' : 'تقرير الامتحانات'} يرجى اختيار طالب من القائمة
                </p>
              </div>
              <button
                className="rp-modal-close"
                onClick={() => setPickerOpen(false)}
                aria-label="إغلاق"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="rp-modal-search">
              <i className="fas fa-search"></i>
              <input
                type="text"
                autoFocus
                placeholder="ابحث بالاسم أو رقم الطالب..."
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
              />
            </div>

            <div className="rp-modal-meta">
              <i className="fas fa-list-ul"></i>
              <span>
                {pickerResults.length}{' '}
                {pickerResults.length === 1 ? 'طالب' : 'طالب'}
              </span>
            </div>

            <ul className="rp-modal-list">
              {pickerResults.map((s) => (
                <li key={s.id} onClick={() => pickFromModal(s)}>
                  <div className="rp-modal-avatar">{initials(s.name)}</div>
                  <div className="rp-modal-info">
                    <div className="rp-modal-name">
                      <span>{s.name}</span>
                      <span className="rp-modal-id">
                        <i className="fas fa-id-badge"></i> {s.id}
                      </span>
                    </div>
                    <div className="rp-modal-sub">
                      <span><i className="fas fa-graduation-cap"></i> {s.prep}</span>
                      <span className="rp-dot">•</span>
                      <span><i className="fas fa-users"></i> {s.group}</span>
                    </div>
                  </div>
                  <i className="fas fa-arrow-left rp-modal-arrow"></i>
                </li>
              ))}
              {pickerResults.length === 0 && (
                <li className="rp-modal-empty">
                  <i className="fas fa-user-slash"></i>
                  <p>لم يتم العثور على نتائج</p>
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
