import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Report.css'

export default function Report() {
  const navigate = useNavigate()
  const [studentInput, setStudentInput] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredNames, setFilteredNames] = useState([])

  const studentNames = ['محمد أحمد', 'محمود عبد الله', 'منى حسين', 'محمد حسين']

  const filterNames = (value) => {
    setStudentInput(value)
    setSelectedStudent('')

    if (value.trim().length === 0) {
      setShowSuggestions(false)
      setFilteredNames([])
      return
    }

    const filtered = studentNames.filter(name => name.includes(value))
    setFilteredNames(filtered)
    setShowSuggestions(filtered.length > 0)
  }

  const selectStudent = (name) => {
    setSelectedStudent(name)
    setStudentInput(name)
    setShowSuggestions(false)
  }

  const searchStudent = () => {
    const input = studentInput.trim()
    if (input) {
      setSelectedStudent(input)
      alert('تم اختيار الطالب: ' + input)
    } else {
      alert('من فضلك أدخل اسم الطالب أولاً.')
    }
  }

  const goTo = (type) => {
    const student = selectedStudent || studentInput.trim()
    if (!student) {
      alert('من فضلك اختر اسم الطالب أولاً.')
      return
    }
    if (type === 'videos') {
      navigate(`/videos-report?student=${encodeURIComponent(student)}`)
    } else if (type === 'exams') {
      navigate(`/exams-report?student=${encodeURIComponent(student)}`)
    }
  }

  const goToGroupReport = (type) => {
    if (type === 'videos') {
      navigate('/videos-group-report')
    } else if (type === 'exams') {
      navigate('/exams-group-report')
    }
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

        <div className="report-search-box">
          <div className="report-search-row">
            <div className="report-search-field">
              <i className="fas fa-search report-search-icon"></i>
              <input
                type="text"
                placeholder="اكتب اسم الطالب للبحث..."
                value={studentInput}
                onChange={(e) => filterNames(e.target.value)}
              />
            </div>
            <button onClick={searchStudent} className="report-search-btn">
              <i className="fas fa-arrow-left"></i>
              بحث
            </button>
          </div>
          {showSuggestions && (
            <ul className="report-suggestions">
              {filteredNames.map((name, index) => (
                <li key={index} onClick={() => selectStudent(name)}>
                  <i className="fas fa-user"></i>
                  {name}
                </li>
              ))}
            </ul>
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
