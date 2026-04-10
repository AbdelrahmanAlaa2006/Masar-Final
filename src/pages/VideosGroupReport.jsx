import React, { useState, useEffect } from 'react'
import './VideosGroupReport.css'

export default function VideosGroupReport() {
  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('')
  const [currentVideo, setCurrentVideo] = useState('')
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

  const videos = [
    'الدرس 1: الكسور',
    'الدرس 2: النسبة والتناسب',
    'الدرس 3: الجبر',
    'الدرس 4: الهندسة'
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
    setCurrentVideo('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    setCurrentVideo('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const handleVideoChange = (video) => {
    setCurrentVideo(video)
    if (video) {
      loadReport(video)
    }
  }

  const loadReport = (video) => {
    const students = studentsByGroup[currentGroup] || []
    const newData = students.map((student) => {
      const watchPercentage = Math.floor(Math.random() * 101)
      const totalDuration = 45
      const watchedTime = Math.floor((watchPercentage / 100) * totalDuration)
      const videoDate = new Date(
        2024,
        Math.floor(Math.random() * 12),
        Math.floor(Math.random() * 28) + 1
      )

      return {
        name: student.name,
        id: student.id,
        group: currentGroup,
        video: video,
        date: videoDate.toLocaleDateString('ar-EG'),
        percentage: watchPercentage,
        status: watchPercentage >= 75 ? 'مكتمل' : 'غير مكتمل',
        watchedTime: `${watchedTime} دقيقة`,
        totalTime: `${totalDuration} دقيقة`
      }
    })

    setAllStudentsData(newData)
    setDisplayedStudents(newData)
  }

  const filterStudents = (filter) => {
    setCurrentFilter(filter)

    let filteredData = allStudentsData

    switch (filter) {
      case 'complete':
        filteredData = allStudentsData.filter((student) => student.percentage >= 75)
        break
      case 'partial':
        filteredData = allStudentsData.filter((student) => student.percentage > 0 && student.percentage <= 50)
        break
      case 'none':
        filteredData = allStudentsData.filter((student) => student.percentage === 0)
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
    <main className="videos-group-report-page">
      <div className="container">
        <h1 className="page-title">📊 نظام التقرير الجماعي للفيديوهات</h1>

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

        {/* اختيار الفيديو */}
        {currentGroup && (
          <div className="card">
            <h2 className="card-title">اختر الفيديو</h2>
            <select value={currentVideo} onChange={(e) => handleVideoChange(e.target.value)}>
              <option value="">-- اختر الفيديو --</option>
              {videos.map((video) => (
                <option key={video} value={video}>
                  {video}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* أزرار التصفية */}
        {currentVideo && (
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
                className={`btn filter-btn ${currentFilter === 'complete' ? 'active' : ''}`}
                onClick={() => filterStudents('complete')}
              >
                شاهدوا كامل (+75%)
              </button>
              <button
                className={`btn filter-btn ${currentFilter === 'partial' ? 'active' : ''}`}
                onClick={() => filterStudents('partial')}
              >
                شاهدوا نصف أو أقل (≤50%)
              </button>
              <button
                className={`btn filter-btn ${currentFilter === 'none' ? 'active' : ''}`}
                onClick={() => filterStudents('none')}
              >
                لم يشاهدوا (0%)
              </button>
            </div>
          </div>
        )}

        {/* جدول التقرير */}
        {displayedStudents.length > 0 && (
          <div className="card" id="reportTable">
            <div className="report-header">
              <h2 className="card-title">تقرير المشاهدة التفصيلي</h2>
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
                    <th>الفيديو</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                    <th>النسبة</th>
                    <th>وقت المشاهدة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={index}>
                      <td className="student-name">{student.name}</td>
                      <td>{student.id}</td>
                      <td>{student.group}</td>
                      <td>{student.video}</td>
                      <td>{student.date}</td>
                      <td className={student.percentage >= 75 ? 'status-complete' : 'status-incomplete'}>
                        {student.status}
                      </td>
                      <td>
                        <div className="progress-bar">
                          <div
                            className={`progress-fill ${
                              student.percentage >= 75
                                ? 'progress-high'
                                : student.percentage >= 50
                                ? 'progress-medium'
                                : 'progress-low'
                            }`}
                            style={{ width: `${student.percentage}%` }}
                          ></div>
                        </div>
                        <span className="percentage-text">{student.percentage}%</span>
                      </td>
                      <td>{student.watchedTime} / {student.totalTime}</td>
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
