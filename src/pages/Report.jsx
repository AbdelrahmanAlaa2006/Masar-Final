import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Report.css'

/* Mock student database — same structure used in group reports.
   In production, replace with a fetch from Supabase. */
const studentsByGroup = {
  'مجموعة السبت 10ص': [
    { name: 'أحمد علي محمد', id: 'ST001' },
    { name: 'سارة محمد أحمد', id: 'ST002' },
    { name: 'محمد أحمد', id: 'ST003' },
    { name: 'فاطمة حسن', id: 'ST004' },
  ],
  'مجموعة الثلاثاء 3م': [
    { name: 'محمود عبد الله', id: 'ST005' },
    { name: 'منى حسين', id: 'ST006' },
    { name: 'يوسف إبراهيم', id: 'ST007' },
  ],
  'مجموعة الخميس 5م': [
    { name: 'محمد حسين', id: 'ST008' },
    { name: 'نور الدين عمر', id: 'ST009' },
    { name: 'هدى مصطفى', id: 'ST010' },
  ],
  'مجموعة الأحد 11ص': [
    { name: 'كريم سامي', id: 'ST011' },
    { name: 'ليلى أشرف', id: 'ST012' },
    { name: 'عمر خالد', id: 'ST013' },
  ],
  'مجموعة الإثنين 4م': [
    { name: 'مريم طارق', id: 'ST014' },
    { name: 'حسن وليد', id: 'ST015' },
  ],
  'مجموعة الأربعاء 6م': [
    { name: 'دينا فؤاد', id: 'ST016' },
    { name: 'خالد رضا', id: 'ST017' },
    { name: 'إيمان سعيد', id: 'ST018' },
  ],
}

const groupsByGrade = {
  'الأول الإعدادي': ['مجموعة السبت 10ص', 'مجموعة الثلاثاء 3م', 'مجموعة الخميس 5م'],
  'الثاني الإعدادي': ['مجموعة الأحد 11ص', 'مجموعة الإثنين 4م'],
  'الثالث الإعدادي': ['مجموعة الأربعاء 6م'],
}

/* Flatten into one searchable list: { name, id, group, prep } */
function buildAllStudents() {
  const rows = []
  Object.entries(groupsByGrade).forEach(([prep, groups]) => {
    groups.forEach((group) => {
      ;(studentsByGroup[group] || []).forEach((s) => {
        rows.push({ ...s, group, prep })
      })
    })
  })
  return rows
}

export default function Report() {
  const navigate = useNavigate()
  const [studentInput, setStudentInput] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const boxRef = useRef(null)

  const allStudents = useMemo(() => buildAllStudents(), [])

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

  const goTo = (type) => {
    /* If user typed something but didn't click — auto-pick the first match */
    let student = selectedStudent
    if (!student && studentInput.trim() && filtered.length > 0) {
      student = filtered[0]
      setSelectedStudent(student)
      setStudentInput(student.name)
    }
    if (!student) {
      setShowSuggestions(true)
      return
    }
    const params = new URLSearchParams({
      student: student.name,
      id: student.id,
      group: student.group,
      prep: student.prep,
    }).toString()
    if (type === 'videos') navigate(`/videos-report?${params}`)
    else if (type === 'exams') navigate(`/exams-report?${params}`)
  }

  const goToGroupReport = (type) => {
    if (type === 'videos') navigate('/videos-group-report')
    else if (type === 'exams') navigate('/exams-group-report')
  }

  const initials = (name) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')

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
    </main>
  )
}
