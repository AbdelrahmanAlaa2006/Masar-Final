import React, { useState, useEffect } from 'react'
import './ExamsGroupReport.css'

export default function ExamsGroupReport() {
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

  useEffect(() => {
    // Create floating particles
    const createParticle = () => {
      const particle = document.createElement('div')
      particle.className = 'particle'
      particle.style.left = Math.random() * 100 + 'vw'
      particle.style.animationDelay = Math.random() * 15 + 's'
      particle.style.animationDuration = Math.random() * 10 + 10 + 's'
      document.body.appendChild(particle)

      setTimeout(() => {
        particle.remove()
      }, 25000)
    }

    const particleInterval = setInterval(createParticle, 3000)

    for (let i = 0; i < 5; i++) {
      setTimeout(createParticle, i * 1000)
    }

    return () => clearInterval(particleInterval)
  }, [])

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
    if (exam) {
      loadReport(exam)
    }
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
        exam: exam,
        date: date.toLocaleDateString('ar-EG'),
        score: score,
        maxScore: maxScore,
        result: score >= 60 ? 'نجح' : 'لم ينجح',
        rating: rating,
        attempts: attempts,
        maxAttempts: maxAttempts,
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
      case 'passed':
        filteredData = allStudentsData.filter((student) => student.score >= 60)
        break
      case 'failed':
        filteredData = allStudentsData.filter((student) => student.score < 60)
        break
      case 'high':
        filteredData = allStudentsData.filter((student) => student.score >= 80)
        break
      case 'low':
        filteredData = allStudentsData.filter((student) => student.score < 60)
        break
      default:
        filteredData = allStudentsData
    }

    setDisplayedStudents(filteredData)
  }

  const printReport = () => {
    window.print()
  }

  return (
    <main className="exams-group-report-page">
      <div className="container">
        <h1 className="page-title">📊 نظام التقرير الجماعي للامتحانات</h1>

        {/* اختيار الصف */}
        <div className="card">
          <h2 className="card-title">اختر الصف الدراسي</h2>
          <div className="button-group">
            {Object.keys(groupsByGrade).map((grade) => (
              <button
                key={grade}
                className={`btn grade-btn ${currentGrade === grade ? 'active' : ''}`}
                onClick={() => selectGrade(grade)}
              >
                {grade}
              </button>
            ))}
          </div>
        </div>

        {/* اختيار المجموعة */}
        {currentGrade && (
          <div className="card">
            <h2 className="card-title">اختر المجموعة</h2>
            <div className="button-group">
              {groupsByGrade[currentGrade].map((group) => (
                <button
                  key={group}
                  className={`btn grade-btn ${currentGroup === group ? 'active' : ''}`}
                  onClick={() => selectGroup(group)}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* اختيار الامتحان */}
        {currentGroup && (
          <div className="card">
            <h2 className="card-title">اختر الامتحان</h2>
            <select value={currentExam} onChange={(e) => handleExamChange(e.target.value)}>
              <option value="">-- اختر الامتحان --</option>
              {exams.map((exam) => (
                <option key={exam} value={exam}>
                  {exam}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* أزرار التصفية */}
        {currentExam && (
          <div className="card">
            <h2 className="card-title">تصفية النتائج</h2>
            <div className="button-group">
              <button
                className={`btn filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
                onClick={() => filterStudents('all')}
              >
                جميع الطلاب
              </button>
              <button
                className={`btn filter-btn ${currentFilter === 'passed' ? 'active' : ''}`}
                onClick={() => filterStudents('passed')}
              >
                ناجحون (≥60%)
              </button>
              <button
                className={`btn filter-btn ${currentFilter === 'failed' ? 'active' : ''}`}
                onClick={() => filterStudents('failed')}
              >
                راسبون (&lt;60%)
              </button>
              <button
                className={`btn filter-btn ${currentFilter === 'high' ? 'active' : ''}`}
                onClick={() => filterStudents('high')}
              >
                ممتازون (≥80%)
              </button>
            </div>
          </div>
        )}

        {/* جدول التقرير */}
        {displayedStudents.length > 0 && (
          <div className="card" id="reportTable">
            <div className="report-header">
              <h2 className="card-title">تقرير النتائج التفصيلي</h2>
              <button onClick={printReport} className="btn">
                🖨️ طباعة التقرير
              </button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>اسم الطالب</th>
                    <th>ID</th>
                    <th>المجموعة</th>
                    <th>الامتحان</th>
                    <th>التاريخ</th>
                    <th>النتيجة</th>
                    <th>التقييم</th>
                    <th>المحاولات</th>
                    <th>النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={index}>
                      <td className="student-name">{student.name}</td>
                      <td>{student.id}</td>
                      <td>{student.group}</td>
                      <td>{student.exam}</td>
                      <td>{student.date}</td>
                      <td className={student.status === 'passed' ? 'status-passed' : 'status-failed'}>
                        {student.result}
                      </td>
                      <td>{student.rating}</td>
                      <td>{student.attempts}/{student.maxAttempts}</td>
                      <td>
                        <div className="progress-bar">
                          <div
                            className={`progress-fill ${
                              student.score >= 80
                                ? 'progress-high'
                                : student.score >= 60
                                ? 'progress-medium'
                                : 'progress-low'
                            }`}
                            style={{ width: `${student.score}%` }}
                          ></div>
                        </div>
                        <span className="percentage-text">{student.score}/{student.maxScore}</span>
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
