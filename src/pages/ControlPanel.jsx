import { useState } from 'react'
import './ControlPanel.css'

export default function ControlPanel() {
  const [view, setView] = useState('main')
  const [selectedGrade, setSelectedGrade] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Mock data for grades, students, videos, and exams
  const gradesData = {
    grade1: {
      id: 'grade1',
      name: 'الصف الأول',
      students: [
        { id: 's1', name: 'أحمد عبدالله' },
        { id: 's2', name: 'فاطمة محمد' },
        { id: 's3', name: 'علي حسن' },
      ],
      videos: [
        { id: 'v1', title: 'مقدمة الرياضيات' },
        { id: 'v2', title: 'الجبر الأساسي' },
        { id: 'v3', title: 'الهندسة' },
      ],
      exams: [
        { id: 'e1', title: 'امتحان الرياضيات' },
        { id: 'e2', title: 'امتحان العلوم' },
      ],
    },
    grade2: {
      id: 'grade2',
      name: 'الصف الثاني',
      students: [
        { id: 's4', name: 'محمود سالم' },
        { id: 's5', name: 'نور علي' },
        { id: 's6', name: 'ليلى إبراهيم' },
      ],
      videos: [
        { id: 'v4', title: 'الكسور العشرية' },
        { id: 'v5', title: 'النسب والنسبة' },
      ],
      exams: [
        { id: 'e3', title: 'امتحان نهائي' },
      ],
    },
  }

  const handleSelectGrade = (mode, grade) => {
    setSelectedGrade(grade)
    if (mode === 'videos') {
      setView('studentSearch')
    } else {
      setView('exams')
    }
  }

  const filteredStudents = selectedGrade
    ? gradesData[selectedGrade].students.filter(s =>
        s.name.includes(searchTerm)
      )
    : []

  return (
    <div className="control-panel">
      {/* Main View */}
      {view === 'main' && (
        <div className="main-view">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-white mb-4">لوحة التحكم التعليمية</h1>
            <p className="text-xl text-white/80">إدارة الفيديوهات والنتائج للمنصة التعليمية</p>
          </div>

          <div className="control-cards-grid">
            {/* Video Control Card */}
            <div
              className="control-card"
              onClick={() => handleSelectGrade('videos', 'grade1')}
            >
              <div className="card-icon">
                <i className="fas fa-video"></i>
              </div>
              <h3>إدارة الفيديوهات</h3>
              <p>إضافة وتعديل وإدارة فيديوهات الدروس</p>
              <button className="btn-primary">اختر صف</button>
            </div>

            {/* Results Card */}
            <div
              className="control-card"
              onClick={() => handleSelectGrade('results', 'grade1')}
            >
              <div className="card-icon">
                <i className="fas fa-chart-bar"></i>
              </div>
              <h3>نتائج الامتحانات</h3>
              <p>عرض وإدارة نتائج الطلاب</p>
              <button className="btn-primary">اختر صف</button>
            </div>
          </div>
        </div>
      )}

      {/* Grade Selection View */}
      {view === 'gradeSelection' && (
        <div className="grade-selection-view">
          <button
            className="back-btn"
            onClick={() => {
              setView('main')
              setSelectedGrade(null)
            }}
          >
            <i className="fas fa-arrow-right"></i> رجوع
          </button>
          <h2 className="section-title">اختر الصف</h2>
          <div className="grades-grid">
            {Object.values(gradesData).map(grade => (
              <div
                key={grade.id}
                className="grade-card"
                onClick={() => handleSelectGrade('videos', grade.id)}
              >
                <h3>{grade.name}</h3>
                <p>{grade.students.length} طالب</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student Search View */}
      {view === 'studentSearch' && (
        <div className="student-search-view">
          <button
            className="back-btn"
            onClick={() => {
              setView('main')
              setSelectedGrade(null)
              setSearchTerm('')
            }}
          >
            <i className="fas fa-arrow-right"></i> رجوع
          </button>
          <h2 className="section-title">
            {selectedGrade ? gradesData[selectedGrade].name : ''} - البحث عن الطلاب
          </h2>

          <div className="search-container">
            <input
              type="text"
              placeholder="ابحث عن اسم الطالب..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="students-grid">
            {filteredStudents.map(student => (
              <div
                key={student.id}
                className="student-card"
                onClick={() => setView('videoManagement')}
              >
                <i className="fas fa-user-circle"></i>
                <h3>{student.name}</h3>
                <button className="btn-primary">إدارة</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Management View */}
      {view === 'videoManagement' && (
        <div className="video-management-view">
          <button
            className="back-btn"
            onClick={() => {
              setView('studentSearch')
            }}
          >
            <i className="fas fa-arrow-right"></i> رجوع
          </button>
          <h2 className="section-title">إدارة الفيديوهات</h2>

          <div className="videos-list">
            {selectedGrade &&
              gradesData[selectedGrade].videos.map(video => (
                <div key={video.id} className="video-item">
                  <div className="video-info">
                    <i className="fas fa-video"></i>
                    <div>
                      <h4>{video.title}</h4>
                      <p>المحاولات المتاحة: 3</p>
                    </div>
                  </div>
                  <div className="video-controls">
                    <button className="btn-small btn-success">
                      <i className="fas fa-check"></i> السماح
                    </button>
                    <button className="btn-small btn-danger">
                      <i className="fas fa-ban"></i> منع
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Exams View */}
      {view === 'exams' && (
        <div className="exams-view">
          <button
            className="back-btn"
            onClick={() => {
              setView('main')
              setSelectedGrade(null)
            }}
          >
            <i className="fas fa-arrow-right"></i> رجوع
          </button>
          <h2 className="section-title">
            {selectedGrade ? gradesData[selectedGrade].name : ''} - الامتحانات
          </h2>

          <div className="exams-list">
            {selectedGrade &&
              gradesData[selectedGrade].exams.map(exam => (
                <div key={exam.id} className="exam-item">
                  <div className="exam-info">
                    <i className="fas fa-file-pdf"></i>
                    <h3>{exam.title}</h3>
                  </div>
                  <button className="btn-primary">عرض النتائج</button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
