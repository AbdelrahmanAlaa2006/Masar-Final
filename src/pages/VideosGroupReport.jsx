import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './VideosGroupReport.css'

export default function VideosGroupReport() {
  const navigate = useNavigate()
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
    if (video) loadReport(video)
  }

  const loadReport = (video) => {
    const students = studentsByGroup[currentGroup] || []
    const newData = students.map((student) => {
      const watchPercentage = Math.floor(Math.random() * 101)
      const totalDuration = 45
      const watchedTime = Math.floor((watchPercentage / 100) * totalDuration)
      const videoDate = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)

      return {
        name: student.name,
        id: student.id,
        group: currentGroup,
        video,
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
      case 'complete': filteredData = allStudentsData.filter((s) => s.percentage >= 75); break
      case 'partial': filteredData = allStudentsData.filter((s) => s.percentage > 0 && s.percentage <= 50); break
      case 'none': filteredData = allStudentsData.filter((s) => s.percentage === 0); break
      default: filteredData = allStudentsData
    }
    setDisplayedStudents(filteredData)
  }

  // Summary stats
  const totalStudents = allStudentsData.length
  const completeCount = allStudentsData.filter((s) => s.percentage >= 75).length
  const partialCount = allStudentsData.filter((s) => s.percentage > 0 && s.percentage < 75).length
  const noneCount = allStudentsData.filter((s) => s.percentage === 0).length
  const avgProgress = totalStudents > 0
    ? Math.round(allStudentsData.reduce((s, x) => s + x.percentage, 0) / totalStudents)
    : 0
  const completeRate = totalStudents > 0 ? Math.round((completeCount / totalStudents) * 100) : 0

  return (
    <main className="vgr-page">
      <div className="vgr-container">

        {/* Back */}
        <button className="vgr-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Header */}
        <div className="vgr-header">
          <div className="vgr-header-icon">
            <i className="fas fa-chart-line"></i>
          </div>
          <h1>التقرير الجماعي للفيديوهات</h1>
          <p>متابعة مشاهدات الطلاب وتحليل نشاط المجموعات</p>
        </div>

        {/* Stepper */}
        <div className="vgr-stepper">
          <div className={`vgr-step ${currentGrade ? 'done' : 'active'}`}>
            <div className="vgr-step-num">
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span>الصف</span>
          </div>
          <div className="vgr-step-line"></div>
          <div className={`vgr-step ${currentGroup ? 'done' : currentGrade ? 'active' : ''}`}>
            <div className="vgr-step-num">
              {currentGroup ? <i className="fas fa-check"></i> : 2}
            </div>
            <span>المجموعة</span>
          </div>
          <div className="vgr-step-line"></div>
          <div className={`vgr-step ${currentVideo ? 'done' : currentGroup ? 'active' : ''}`}>
            <div className="vgr-step-num">
              {currentVideo ? <i className="fas fa-check"></i> : 3}
            </div>
            <span>الفيديو</span>
          </div>
        </div>

        {/* Grade */}
        <div className="vgr-section">
          <h2 className="vgr-section-title">
            <i className="fas fa-school"></i>
            اختر الصف الدراسي
          </h2>
          <div className="vgr-chips">
            {Object.keys(groupsByGrade).map((grade) => (
              <button
                key={grade}
                className={`vgr-chip ${currentGrade === grade ? 'active' : ''}`}
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
          <div className="vgr-section">
            <h2 className="vgr-section-title">
              <i className="fas fa-users"></i>
              اختر المجموعة
            </h2>
            <div className="vgr-chips">
              {groupsByGrade[currentGrade].map((group) => (
                <button
                  key={group}
                  className={`vgr-chip ${currentGroup === group ? 'active' : ''}`}
                  onClick={() => selectGroup(group)}
                >
                  <i className="fas fa-layer-group"></i>
                  {group}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Video */}
        {currentGroup && (
          <div className="vgr-section">
            <h2 className="vgr-section-title">
              <i className="fas fa-play-circle"></i>
              اختر الفيديو
            </h2>
            <div className="vgr-select-wrap">
              <i className="fas fa-film vgr-select-icon"></i>
              <select
                className="vgr-select"
                value={currentVideo}
                onChange={(e) => handleVideoChange(e.target.value)}
              >
                <option value="">-- اختر الفيديو --</option>
                {videos.map((video) => (
                  <option key={video} value={video}>{video}</option>
                ))}
              </select>
              <i className="fas fa-chevron-down vgr-select-arrow"></i>
            </div>
          </div>
        )}

        {/* Summary */}
        {displayedStudents.length > 0 && (
          <div className="vgr-summary">
            <div className="vgr-sum-card">
              <i className="fas fa-users vgr-sum-icon" style={{color:'var(--primary)'}}></i>
              <span className="vgr-sum-val" style={{color:'var(--primary)'}}>{totalStudents}</span>
              <span className="vgr-sum-lbl">إجمالي الطلاب</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-check-circle vgr-sum-icon" style={{color:'#48bb78'}}></i>
              <span className="vgr-sum-val" style={{color:'#48bb78'}}>{completeCount}</span>
              <span className="vgr-sum-lbl">شاهدوا كامل</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-adjust vgr-sum-icon" style={{color:'#ed8936'}}></i>
              <span className="vgr-sum-val" style={{color:'#ed8936'}}>{partialCount}</span>
              <span className="vgr-sum-lbl">جزئياً</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-times-circle vgr-sum-icon" style={{color:'#ef4444'}}></i>
              <span className="vgr-sum-val" style={{color:'#ef4444'}}>{noneCount}</span>
              <span className="vgr-sum-lbl">لم يشاهدوا</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-percentage vgr-sum-icon" style={{color:'var(--secondary)'}}></i>
              <span className="vgr-sum-val" style={{color:'var(--secondary)'}}>{avgProgress}%</span>
              <span className="vgr-sum-lbl">متوسط التقدم</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-trophy vgr-sum-icon" style={{color:'#f59e0b'}}></i>
              <span className="vgr-sum-val" style={{color:'#f59e0b'}}>{completeRate}%</span>
              <span className="vgr-sum-lbl">نسبة الإكمال</span>
            </div>
          </div>
        )}

        {/* Filters */}
        {currentVideo && allStudentsData.length > 0 && (
          <div className="vgr-section">
            <h2 className="vgr-section-title">
              <i className="fas fa-filter"></i>
              تصفية النتائج
            </h2>
            <div className="vgr-chips">
              {[
                { key: 'all', label: 'الجميع', icon: 'fa-th-list' },
                { key: 'complete', label: 'شاهدوا كامل (≥75%)', icon: 'fa-check' },
                { key: 'partial', label: 'نصف أو أقل (≤50%)', icon: 'fa-adjust' },
                { key: 'none', label: 'لم يشاهدوا', icon: 'fa-times' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  className={`vgr-chip vgr-filter-chip ${currentFilter === key ? 'active' : ''}`}
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
          <div className="vgr-card" id="vgr-reportTable">
            <div className="vgr-card-header">
              <h2 className="vgr-card-title">
                <i className="fas fa-clipboard-list"></i>
                تقرير المشاهدة التفصيلي
                <span className="vgr-count-badge">{displayedStudents.length}</span>
              </h2>
              <button onClick={() => window.print()} className="vgr-print-btn">
                <i className="fas fa-print"></i>
                طباعة التقرير
              </button>
            </div>

            <div className="vgr-table-container">
              <table className="vgr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الطالب</th>
                    <th>رقم الطالب</th>
                    <th>المجموعة</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                    <th>نسبة المشاهدة</th>
                    <th>الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={student.id} className="vgr-tr">
                      <td className="vgr-td-num">{index + 1}</td>
                      <td className="vgr-td-name">
                        <div className="vgr-name-cell">
                          <div className="vgr-mini-avatar">
                            <i className="fas fa-user"></i>
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      <td><span className="vgr-id-pill">{student.id}</span></td>
                      <td>{student.group}</td>
                      <td>{student.date}</td>
                      <td>
                        <span className={`vgr-badge ${student.percentage >= 75 ? 'vgr-badge-complete' : 'vgr-badge-incomplete'}`}>
                          <i className={`fas ${student.percentage >= 75 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {student.status}
                        </span>
                      </td>
                      <td>
                        <div className="vgr-score-cell">
                          <div className="vgr-progress-bar">
                            <div
                              className={`vgr-progress-fill ${
                                student.percentage >= 75 ? 'vgr-prog-high' :
                                student.percentage >= 50 ? 'vgr-prog-medium' : 'vgr-prog-low'
                              }`}
                              style={{ width: `${student.percentage}%` }}
                            ></div>
                          </div>
                          <span className="vgr-pct-text">{student.percentage}%</span>
                        </div>
                      </td>
                      <td className="vgr-time-cell">{student.watchedTime} / {student.totalTime}</td>
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
