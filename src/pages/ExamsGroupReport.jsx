import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './ExamsGroupReport.css'

export default function ExamsGroupReport() {
  const navigate = useNavigate()
  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('')
  const [currentExam, setCurrentExam] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')
  const [allStudentsData, setAllStudentsData] = useState([])
  const [displayedStudents, setDisplayedStudents] = useState([])

  const groupsByGrade = {
    'الأول الإعدادي': ['مجموعة السبت 10ص', 'مجموعة الثلاثاء 3م', 'مجموعة الخميس 5م'],
    'الثاني الإعدادي': ['مجموعة السبت 12م', 'مجموعة الأحد 2م', 'مجموعة الثلاثاء 5م'],
    'الثالث الإعدادي': ['مجموعة السبت 4م', 'مجموعة الاثنين 6م', 'مجموعة الأربعاء 7م']
  }

  const studentsByGroup = {
    'مجموعة السبت 10ص': [
      { name: 'أحمد علي محمد', id: 'ST001' },
      { name: 'سارة محمد أحمد', id: 'ST002' },
      { name: 'محمود إبراهيم حسن', id: 'ST003' },
      { name: 'فاطمة يوسف علي', id: 'ST004' }
    ],
    'مجموعة الثلاثاء 3م': [
      { name: 'عمر خالد محمد', id: 'ST005' },
      { name: 'نور الهدى أحمد', id: 'ST006' },
      { name: 'يوسف عبدالله', id: 'ST007' }
    ],
    'مجموعة الخميس 5م': [
      { name: 'ليلى حسام الدين', id: 'ST008' },
      { name: 'كريم مصطفى', id: 'ST009' },
      { name: 'دينا محمد علي', id: 'ST010' }
    ],
    'مجموعة السبت 12م': [
      { name: 'ندى حسن محمد', id: 'ST011' },
      { name: 'ياسر جمال أحمد', id: 'ST012' },
      { name: 'رنا يوسف إبراهيم', id: 'ST013' },
      { name: 'حسام محمد علي', id: 'ST014' }
    ],
    'مجموعة الأحد 2م': [
      { name: 'مريم أحمد حسن', id: 'ST015' },
      { name: 'عبدالرحمن محمد', id: 'ST016' },
      { name: 'هبة سامح علي', id: 'ST017' }
    ],
    'مجموعة الثلاثاء 5م': [
      { name: 'محمد أحمد سعد', id: 'ST018' },
      { name: 'آية محمود حسن', id: 'ST019' },
      { name: 'أسامة خالد محمد', id: 'ST020' }
    ],
    'مجموعة السبت 4م': [
      { name: 'زينب علي أحمد', id: 'ST021' },
      { name: 'أحمد محمد إبراهيم', id: 'ST022' },
      { name: 'لمياء حسن علي', id: 'ST023' }
    ],
    'مجموعة الاثنين 6م': [
      { name: 'كارم يوسف محمد', id: 'ST024' },
      { name: 'نهى أحمد حسن', id: 'ST025' },
      { name: 'عماد محمود علي', id: 'ST026' }
    ],
    'مجموعة الأربعاء 7م': [
      { name: 'إسلام محمد أحمد', id: 'ST027' },
      { name: 'روان علي حسن', id: 'ST028' },
      { name: 'تامر خالد يوسف', id: 'ST029' }
    ]
  }

  const exams = [
    'امتحان الرياضيات - الوحدة الأولى',
    'امتحان العلوم - الفصل الأول',
    'امتحان الجبر المتقدم',
    'امتحان الهندسة'
  ]

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setCurrentExam('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    setCurrentExam('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const handleExamChange = (exam) => {
    setCurrentExam(exam)
    if (exam) loadReport(exam)
  }

  const loadReport = (exam) => {
    const students = studentsByGroup[currentGroup] || []
    const newData = students.map((student) => {
      const score = Math.floor(Math.random() * 101)
      const maxScore = 100
      const date = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
      const attempts = Math.floor(Math.random() * 3) + 1
      const maxAttempts = 3

      let rating = 'ممتاز'
      if (score < 60) rating = 'يحتاج تحسين'
      else if (score < 80) rating = 'جيد'

      return {
        name: student.name,
        id: student.id,
        group: currentGroup,
        exam,
        date: date.toLocaleDateString('ar-EG'),
        score,
        maxScore,
        result: score >= 60 ? 'نجح' : 'لم ينجح',
        rating,
        attempts,
        maxAttempts,
        status: score >= 60 ? 'passed' : 'failed'
      }
    })

    setAllStudentsData(newData)
    setDisplayedStudents(newData)
  }

  const filterStudents = (filter) => {
    setCurrentFilter(filter)
    let filteredData = allStudentsData
    switch (filter) {
      case 'passed': filteredData = allStudentsData.filter((s) => s.score >= 60); break
      case 'failed': filteredData = allStudentsData.filter((s) => s.score < 60); break
      case 'high': filteredData = allStudentsData.filter((s) => s.score >= 80); break
      default: filteredData = allStudentsData
    }
    setDisplayedStudents(filteredData)
  }

  // Summary stats
  const totalStudents = allStudentsData.length
  const passedCount = allStudentsData.filter((s) => s.score >= 60).length
  const failedCount = allStudentsData.filter((s) => s.score < 60).length
  const excellentCount = allStudentsData.filter((s) => s.score >= 80).length
  const avgScore = totalStudents > 0
    ? Math.round(allStudentsData.reduce((s, x) => s + x.score, 0) / totalStudents)
    : 0
  const passRate = totalStudents > 0 ? Math.round((passedCount / totalStudents) * 100) : 0

  return (
    <main className="egr-page">
      <div className="egr-container">

        {/* Back */}
        <button className="egr-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Header */}
        <div className="egr-header">
          <div className="egr-header-icon">
            <i className="fas fa-chart-pie"></i>
          </div>
          <h1>التقرير الجماعي للامتحانات</h1>
          <p>تحليل نتائج الطلاب وأداء المجموعات الدراسية</p>
        </div>

        {/* Stepper */}
        <div className="egr-stepper">
          <div className={`egr-step ${currentGrade ? 'done' : 'active'}`}>
            <div className="egr-step-num">
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span>الصف</span>
          </div>
          <div className="egr-step-line"></div>
          <div className={`egr-step ${currentGroup ? 'done' : currentGrade ? 'active' : ''}`}>
            <div className="egr-step-num">
              {currentGroup ? <i className="fas fa-check"></i> : 2}
            </div>
            <span>المجموعة</span>
          </div>
          <div className="egr-step-line"></div>
          <div className={`egr-step ${currentExam ? 'done' : currentGroup ? 'active' : ''}`}>
            <div className="egr-step-num">
              {currentExam ? <i className="fas fa-check"></i> : 3}
            </div>
            <span>الامتحان</span>
          </div>
        </div>

        {/* Grade */}
        <div className="egr-section">
          <h2 className="egr-section-title">
            <i className="fas fa-school"></i>
            اختر الصف الدراسي
          </h2>
          <div className="egr-chips">
            {Object.keys(groupsByGrade).map((grade) => (
              <button
                key={grade}
                className={`egr-chip ${currentGrade === grade ? 'active' : ''}`}
                onClick={() => selectGrade(grade)}
              >
                <i className="fas fa-graduation-cap"></i>
                {grade}
              </button>
            ))}
          </div>
        </div>

        {/* Group */}
        {currentGrade && (
          <div className="egr-section">
            <h2 className="egr-section-title">
              <i className="fas fa-users"></i>
              اختر المجموعة
            </h2>
            <div className="egr-chips">
              {groupsByGrade[currentGrade].map((group) => (
                <button
                  key={group}
                  className={`egr-chip ${currentGroup === group ? 'active' : ''}`}
                  onClick={() => selectGroup(group)}
                >
                  <i className="fas fa-layer-group"></i>
                  {group}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exam */}
        {currentGroup && (
          <div className="egr-section">
            <h2 className="egr-section-title">
              <i className="fas fa-file-alt"></i>
              اختر الامتحان
            </h2>
            <div className="egr-select-wrap">
              <i className="fas fa-clipboard-list egr-select-icon"></i>
              <select
                className="egr-select"
                value={currentExam}
                onChange={(e) => handleExamChange(e.target.value)}
              >
                <option value="">-- اختر الامتحان --</option>
                {exams.map((exam) => (
                  <option key={exam} value={exam}>{exam}</option>
                ))}
              </select>
              <i className="fas fa-chevron-down egr-select-arrow"></i>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {displayedStudents.length > 0 && (
          <div className="egr-summary">
            <div className="egr-sum-card">
              <i className="fas fa-users egr-sum-icon" style={{color:'var(--primary)'}}></i>
              <span className="egr-sum-val" style={{color:'var(--primary)'}}>{totalStudents}</span>
              <span className="egr-sum-lbl">إجمالي الطلاب</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-check-circle egr-sum-icon" style={{color:'#48bb78'}}></i>
              <span className="egr-sum-val" style={{color:'#48bb78'}}>{passedCount}</span>
              <span className="egr-sum-lbl">ناجحون</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-times-circle egr-sum-icon" style={{color:'#ef4444'}}></i>
              <span className="egr-sum-val" style={{color:'#ef4444'}}>{failedCount}</span>
              <span className="egr-sum-lbl">راسبون</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-star egr-sum-icon" style={{color:'#f59e0b'}}></i>
              <span className="egr-sum-val" style={{color:'#f59e0b'}}>{excellentCount}</span>
              <span className="egr-sum-lbl">ممتازون</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-percentage egr-sum-icon" style={{color:'#ed8936'}}></i>
              <span className="egr-sum-val" style={{color:'#ed8936'}}>{avgScore}%</span>
              <span className="egr-sum-lbl">متوسط الدرجات</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-trophy egr-sum-icon" style={{color:'var(--secondary)'}}></i>
              <span className="egr-sum-val" style={{color:'var(--secondary)'}}>{passRate}%</span>
              <span className="egr-sum-lbl">نسبة النجاح</span>
            </div>
          </div>
        )}

        {/* Filter Chips */}
        {currentExam && allStudentsData.length > 0 && (
          <div className="egr-section">
            <h2 className="egr-section-title">
              <i className="fas fa-filter"></i>
              تصفية النتائج
            </h2>
            <div className="egr-chips">
              {[
                { key: 'all', label: 'الجميع', icon: 'fa-th-list' },
                { key: 'passed', label: 'ناجحون (≥60%)', icon: 'fa-check' },
                { key: 'failed', label: 'راسبون (<60%)', icon: 'fa-times' },
                { key: 'high', label: 'ممتازون (≥80%)', icon: 'fa-star' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  className={`egr-chip egr-filter-chip ${currentFilter === key ? 'active' : ''}`}
                  onClick={() => filterStudents(key)}
                >
                  <i className={`fas ${icon}`}></i>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report Table */}
        {displayedStudents.length > 0 && (
          <div className="egr-card" id="egr-reportTable">
            <div className="egr-card-header">
              <h2 className="egr-card-title">
                <i className="fas fa-clipboard-list"></i>
                تقرير النتائج التفصيلي
                <span className="egr-count-badge">{displayedStudents.length}</span>
              </h2>
              <button onClick={() => window.print()} className="egr-print-btn">
                <i className="fas fa-print"></i>
                طباعة التقرير
              </button>
            </div>

            <div className="egr-table-container">
              <table className="egr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الطالب</th>
                    <th>رقم الطالب</th>
                    <th>المجموعة</th>
                    <th>التاريخ</th>
                    <th>النتيجة</th>
                    <th>التقييم</th>
                    <th>المحاولات</th>
                    <th>الدرجة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={student.id} className="egr-tr">
                      <td className="egr-td-num">{index + 1}</td>
                      <td className="egr-td-name">
                        <div className="egr-name-cell">
                          <div className="egr-mini-avatar">
                            <i className="fas fa-user"></i>
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      <td><span className="egr-id-pill">{student.id}</span></td>
                      <td>{student.group}</td>
                      <td>{student.date}</td>
                      <td>
                        <span className={`egr-badge ${student.status === 'passed' ? 'egr-badge-passed' : 'egr-badge-failed'}`}>
                          <i className={`fas ${student.status === 'passed' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {student.result}
                        </span>
                      </td>
                      <td>
                        <span className={`egr-rating ${
                          student.score >= 80 ? 'egr-rating-excellent' :
                          student.score >= 60 ? 'egr-rating-good' : 'egr-rating-poor'
                        }`}>
                          {student.rating}
                        </span>
                      </td>
                      <td><span className="egr-attempts">{student.attempts}/{student.maxAttempts}</span></td>
                      <td>
                        <div className="egr-score-cell">
                          <div className="egr-progress-bar">
                            <div
                              className={`egr-progress-fill ${
                                student.score >= 80 ? 'egr-prog-high' :
                                student.score >= 60 ? 'egr-prog-medium' : 'egr-prog-low'
                              }`}
                              style={{ width: `${student.score}%` }}
                            ></div>
                          </div>
                          <span className="egr-pct-text">{student.score}/{student.maxScore}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
