import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import './VideosReport.css'

export default function VideosReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')
  const [viewMode, setViewMode] = useState('table') // 'table' or 'cards'
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [showModal, setShowModal] = useState(false)

  // Mock student video data — replace with real API call
  const videosData = [
    {
      id: 1,
      title: 'مقدمة في البرمجة',
      icon: '🎬',
      subject: 'علوم الحاسب',
      date: '10/4/2024',
      status: 'completed',
      statusText: 'تم المشاهدة بالكامل',
      progress: 100,
      watchedTime: '45 دقيقة',
      totalTime: '45 دقيقة',
    },
    {
      id: 2,
      title: 'الدرس الثاني: المتغيرات',
      icon: '📚',
      subject: 'علوم الحاسب',
      date: '12/4/2024',
      status: 'partial',
      statusText: 'تم مشاهدة النصف',
      progress: 50,
      watchedTime: '22 دقيقة',
      totalTime: '44 دقيقة',
    },
    {
      id: 3,
      title: 'الدرس الثالث: الدوال والطرق',
      icon: '🔧',
      subject: 'علوم الحاسب',
      date: '14/4/2024',
      status: 'completed',
      statusText: 'تم المشاهدة بالكامل',
      progress: 100,
      watchedTime: '50 دقيقة',
      totalTime: '50 دقيقة',
    },
    {
      id: 4,
      title: 'الدرس الرابع: التطبيق العملي',
      icon: '🎯',
      subject: 'علوم الحاسب',
      date: '15/4/2024',
      status: 'partial',
      statusText: 'تم مشاهدة 75%',
      progress: 75,
      watchedTime: '34 دقيقة',
      totalTime: '45 دقيقة',
    },
    {
      id: 5,
      title: 'الدرس الخامس: المصفوفات',
      icon: '📊',
      subject: 'علوم الحاسب',
      date: '—',
      status: 'none',
      statusText: 'لم تتم المشاهدة',
      progress: 0,
      watchedTime: '0 دقيقة',
      totalTime: '40 دقيقة',
    },
  ]

  const filteredVideos =
    currentFilter === 'all'
      ? videosData
      : currentFilter === 'completed'
      ? videosData.filter((v) => v.progress >= 75)
      : currentFilter === 'partial'
      ? videosData.filter((v) => v.progress > 0 && v.progress < 75)
      : videosData.filter((v) => v.progress === 0)

  useEffect(() => {
    const student = searchParams.get('student')
    if (student) setStudentName(student)
    else {
      // Try to get from logged-in user
      try {
        const stored = localStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          if (u?.name) setStudentName(u.name)
        }
      } catch {}
    }
  }, [searchParams])

  const getStatusClass = (status) => {
    if (status === 'completed') return 'status-complete'
    if (status === 'partial') return 'status-partial'
    return 'status-none'
  }

  const getProgressClass = (progress) => {
    if (progress >= 75) return 'progress-high'
    if (progress > 0) return 'progress-medium'
    return 'progress-low'
  }

  const openVideoDetail = (video) => {
    setSelectedVideo(video)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedVideo(null)
  }

  // Summary stats
  const total = videosData.length
  const completed = videosData.filter((v) => v.progress >= 75).length
  const partial = videosData.filter((v) => v.progress > 0 && v.progress < 75).length
  const notWatched = videosData.filter((v) => v.progress === 0).length
  const avgProgress =
    total > 0
      ? Math.round(videosData.reduce((sum, v) => sum + v.progress, 0) / total)
      : 0

  return (
    <main className="vr-page">
      <div className="vr-container">

        {/* ── Page Header ── */}
        <div className="vr-header">
          <div className="vr-header-text">
            <h1 className="vr-title">
              <span className="vr-title-icon">🎬</span>
              تقرير الفيديوهات
            </h1>
            <p className="vr-subtitle">
              مرحباً، <span className="vr-student-name">{studentName || 'الطالب'}</span> — إليك ملخص مشاهداتك
            </p>
          </div>
          <button className="vr-back-btn" onClick={() => navigate(-1)}>
            ← رجوع
          </button>
        </div>

        {/* ── Stats Strip ── */}
        <div className="vr-stats">
          <div className="vr-stat-card vr-stat-total">
            <span className="vr-stat-value">{total}</span>
            <span className="vr-stat-label">إجمالي الفيديوهات</span>
          </div>
          <div className="vr-stat-card vr-stat-done">
            <span className="vr-stat-value">{completed}</span>
            <span className="vr-stat-label">مكتملة</span>
          </div>
          <div className="vr-stat-card vr-stat-partial">
            <span className="vr-stat-value">{partial}</span>
            <span className="vr-stat-label">جزئية</span>
          </div>
          <div className="vr-stat-card vr-stat-none">
            <span className="vr-stat-value">{notWatched}</span>
            <span className="vr-stat-label">لم تُشاهَد</span>
          </div>
          <div className="vr-stat-card vr-stat-avg">
            <span className="vr-stat-value">{avgProgress}%</span>
            <span className="vr-stat-label">متوسط التقدم</span>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="vr-controls">
          <div className="vr-filter-group">
            {[
              { key: 'all', label: 'الكل', icon: '📋' },
              { key: 'completed', label: 'مكتمل (+75%)', icon: '✅' },
              { key: 'partial', label: 'جزئي', icon: '⚠️' },
              { key: 'none', label: 'لم يُشاهَد', icon: '❌' },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                className={`vr-filter-btn ${currentFilter === key ? 'active' : ''}`}
                onClick={() => setCurrentFilter(key)}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="vr-view-toggle">
            <button
              className={`vr-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="عرض جدول"
            >
              ☰ جدول
            </button>
            <button
              className={`vr-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="عرض بطاقات"
            >
              ⊞ بطاقات
            </button>
          </div>
        </div>

        {/* ── Results Count ── */}
        <div className="vr-results-count">
          عرض <strong>{filteredVideos.length}</strong> فيديو من أصل {total}
        </div>

        {/* ══════════════ TABLE VIEW ══════════════ */}
        {viewMode === 'table' && (
          <div className="vr-card" id="vr-reportTable">
            <div className="vr-table-header">
              <h2 className="vr-card-title">تقرير المشاهدة التفصيلي</h2>
              <button className="vr-print-btn" onClick={() => window.print()}>
                🖨️ طباعة
              </button>
            </div>

            <div className="vr-table-container">
              <table className="vr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الفيديو</th>
                    <th>المادة</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                    <th>نسبة المشاهدة</th>
                    <th>الوقت المشاهَد</th>
                    <th>التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVideos.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="vr-empty-row">
                        لا توجد فيديوهات تطابق هذا الفلتر
                      </td>
                    </tr>
                  ) : (
                    filteredVideos.map((video, index) => (
                      <tr key={video.id} className="vr-tr">
                        <td className="vr-td-num">{index + 1}</td>
                        <td className="vr-td-title">
                          <span className="vr-row-icon">{video.icon}</span>
                          {video.title}
                        </td>
                        <td>{video.subject}</td>
                        <td>{video.date}</td>
                        <td>
                          <span className={`vr-badge ${getStatusClass(video.status)}`}>
                            {video.status === 'completed' && '✅ مكتمل'}
                            {video.status === 'partial' && '⚠️ جزئي'}
                            {video.status === 'none' && '❌ لم يُشاهَد'}
                          </span>
                        </td>
                        <td className="vr-td-progress">
                          <div className="vr-progress-wrap">
                            <div className="vr-progress-bar">
                              <div
                                className={`vr-progress-fill ${getProgressClass(video.progress)}`}
                                style={{ width: `${video.progress}%` }}
                              />
                            </div>
                            <span className="vr-pct">{video.progress}%</span>
                          </div>
                        </td>
                        <td>{video.watchedTime} / {video.totalTime}</td>
                        <td>
                          <button
                            className="vr-detail-btn"
                            onClick={() => openVideoDetail(video)}
                          >
                            عرض
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ CARDS VIEW ══════════════ */}
        {viewMode === 'cards' && (
          <div className="vr-cards-grid">
            {filteredVideos.length === 0 ? (
              <div className="vr-no-results">لا توجد فيديوهات تطابق هذا الفلتر</div>
            ) : (
              filteredVideos.map((video, i) => (
                <div
                  key={video.id}
                  className={`vr-video-card vr-card-${video.status}`}
                  style={{ animationDelay: `${i * 0.07}s` }}
                  onClick={() => openVideoDetail(video)}
                >
                  <div className="vr-card-top">
                    <span className="vr-card-icon">{video.icon}</span>
                    <span className={`vr-badge ${getStatusClass(video.status)}`}>
                      {video.status === 'completed' && '✅ مكتمل'}
                      {video.status === 'partial' && '⚠️ جزئي'}
                      {video.status === 'none' && '❌ لم يُشاهَد'}
                    </span>
                  </div>
                  <h3 className="vr-card-name">{video.title}</h3>
                  <p className="vr-card-subject">{video.subject}</p>

                  <div className="vr-card-progress">
                    <div className="vr-progress-bar">
                      <div
                        className={`vr-progress-fill ${getProgressClass(video.progress)}`}
                        style={{ width: `${video.progress}%` }}
                      />
                    </div>
                    <span className="vr-pct">{video.progress}%</span>
                  </div>

                  <div className="vr-card-meta">
                    <span>🕐 {video.watchedTime} / {video.totalTime}</span>
                    <span>📅 {video.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ══════════════ DETAIL MODAL ══════════════ */}
      {showModal && selectedVideo && (
        <div className="vr-modal-overlay" onClick={closeModal}>
          <div className="vr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="vr-modal-close" onClick={closeModal}>✕</button>

            <div className="vr-modal-icon">{selectedVideo.icon}</div>
            <h2 className="vr-modal-title">{selectedVideo.title}</h2>
            <p className="vr-modal-subject">{selectedVideo.subject}</p>

            <div className="vr-modal-progress-ring">
              <svg viewBox="0 0 120 120" className="vr-ring-svg">
                <circle cx="60" cy="60" r="50" className="vr-ring-bg" />
                <circle
                  cx="60" cy="60" r="50"
                  className="vr-ring-fill"
                  style={{
                    strokeDasharray: `${(selectedVideo.progress / 100) * 314} 314`,
                    stroke:
                      selectedVideo.progress >= 75
                        ? '#48bb78'
                        : selectedVideo.progress > 0
                        ? '#ed8936'
                        : '#ef4444',
                  }}
                />
              </svg>
              <span className="vr-ring-pct">{selectedVideo.progress}%</span>
            </div>

            <div className="vr-modal-details">
              <div className="vr-modal-row">
                <span className="vr-modal-label">الحالة</span>
                <span className={`vr-badge ${getStatusClass(selectedVideo.status)}`}>
                  {selectedVideo.statusText}
                </span>
              </div>
              <div className="vr-modal-row">
                <span className="vr-modal-label">وقت المشاهدة</span>
                <span className="vr-modal-val">{selectedVideo.watchedTime}</span>
              </div>
              <div className="vr-modal-row">
                <span className="vr-modal-label">المدة الكاملة</span>
                <span className="vr-modal-val">{selectedVideo.totalTime}</span>
              </div>
              <div className="vr-modal-row">
                <span className="vr-modal-label">التاريخ</span>
                <span className="vr-modal-val">{selectedVideo.date}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
