import React, { useState, useEffect, useMemo } from 'react'
import { listStudents, updateStudentStatus } from '@backend/profilesApi'
import { createNotification } from '@backend/notificationsApi'
import { initials, GRADE_LABEL } from './shared'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../../utils/cache'
import { useAuth } from '../../contexts/AuthContext'

const fmtDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return ''
  }
}

export default function AccountsPanel({ onBack, flash }) {
  const { user: currentUser } = useAuth()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  
  // Search and filters
  const [query, setQuery] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [statusTab, setStatusTab] = useState('pending')

  // QR Report States
  const [showQrModal, setShowQrModal] = useState(false)
  const [selectedQrStudent, setSelectedQrStudent] = useState(null)

  const fetchStudents = async () => {
    try {
      setLoading(true)
      const data = await cached('students', LIST_TTL, listStudents)
      setStudents(data || [])
    } catch (e) {
      setError(e.message || 'تعذّر تحميل قائمة الطلاب')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudents()
  }, [])

  const refreshList = async () => {
    invalidateCache('students')
    try {
      const data = await listStudents()
      setStudents(data || [])
    } catch (e) {
      flash(e.message || 'تعذّر تحديث البيانات', 'warning')
    }
  }

  const handleUpdateStatus = async (student, is_approved, is_active) => {
    if (busyId) return
    setBusyId(student.id)
    try {
      await updateStudentStatus(student.id, { is_approved, is_active })
      
      // Dispatch database notifications
      if (is_approved && is_active) {
        try {
          await createNotification({
            title: 'تم تفعيل حسابك بنجاح!',
            message: 'مرحباً بك! لقد قام المسؤول بالموافقة على حسابك وتفعيله. يمكنك الآن مشاهدة المحتوى وحل الواجبات والامتحانات بحرية.',
            scope: 'student',
            targetStudent: student.id,
            level: 'success',
            createdBy: currentUser?.id
          })
        } catch (err) {
          console.error(err)
        }
      } else if (is_approved && !is_active) {
        try {
          await createNotification({
            title: 'تمت الموافقة على حسابك',
            message: 'لقد تمت الموافقة على حسابك من قِبَل الإدارة. للدخول لمشاهدة المحتوى التفاعلي يرجى إتمام عملية الاشتراك.',
            scope: 'student',
            targetStudent: student.id,
            level: 'info',
            createdBy: currentUser?.id
          })
        } catch (err) {
          console.error(err)
        }
      }
      
      // Update local state
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, is_approved, is_active } : s))
      flash(`تم تحديث حالة الطالب: ${student.name}`, 'success')
    } catch (e) {
      flash(e.message || 'تعذّر تحديث حالة الطالب', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handleApproveAllPending = async () => {
    const pendingList = students.filter(s => s.is_approved === false)
    if (pendingList.length === 0) return
    if (!window.confirm(`هل أنت متأكد من الموافقة على جميع الطلاب المعلقين (${pendingList.length} طالب)؟`)) return
    
    setBusyId('bulk')
    let successCount = 0
    try {
      for (const student of pendingList) {
        await updateStudentStatus(student.id, { is_approved: true, is_active: false })
        try {
          await createNotification({
            title: 'تمت الموافقة على حسابك',
            message: 'لقد تمت الموافقة على حسابك من قِبَل الإدارة. للدخول لمشاهدة المحتوى التفاعلي يرجى إتمام عملية الاشتراك.',
            scope: 'student',
            targetStudent: student.id,
            level: 'info',
            createdBy: currentUser?.id
          })
        } catch (err) {
          console.error(err)
        }
        successCount++
      }
      invalidateCache('students')
      const data = await listStudents()
      setStudents(data || [])
      flash(`تمت الموافقة بنجاح على ${successCount} طالب (قيد الانتظار للاشتراك)`, 'success')
    } catch (e) {
      flash(e.message || 'حدث خطأ أثناء الموافقة الجماعية', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handlePrint = () => {
    if (!selectedQrStudent) return
    const printWindow = window.open('', '_blank')
    const origin = window.location.origin
    const qrUrl = `${origin}/public-report?id=${selectedQrStudent.id}&token=${selectedQrStudent.qr_token || ''}`
    const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`
    const gradeText = GRADE_LABEL[selectedQrStudent.grade] || selectedQrStudent.grade || ''
    
    printWindow.document.write(`
      <html>
        <head>
          <title>بطاقة QR - ${selectedQrStudent.name}</title>
          <style>
            body {
              font-family: 'Tajawal', sans-serif;
              text-align: center;
              padding: 40px;
              direction: rtl;
              background: #fff;
              color: #000;
            }
            .card {
              border: 2px dashed #ccc;
              border-radius: 16px;
              padding: 30px;
              max-width: 400px;
              margin: 0 auto;
              box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            }
            h2 {
              margin: 0 0 10px;
              font-size: 1.6rem;
            }
            p {
              margin: 5px 0;
              color: #555;
              font-size: 1.1rem;
            }
            .qr-container {
              margin: 25px 0;
            }
            .qr-image {
              width: 260px;
              height: 260px;
            }
            .logo {
              font-weight: bold;
              font-size: 1.4rem;
              color: #6366f1;
              margin-bottom: 20px;
            }
            .instructions {
              font-size: 0.9rem;
              color: #666;
              margin-top: 15px;
              line-height: 1.5;
            }
            @media print {
              body { padding: 0; }
              .card { border: none; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">منصة مسار التعليمية</div>
            <h2>كود QR لتقرير الطالب</h2>
            <p><strong>الاسم:</strong> ${selectedQrStudent.name}</p>
            <p><strong>المرحلة:</strong> ${gradeText}</p>
            ${selectedQrStudent.group ? `<p><strong>المجموعة:</strong> ${selectedQrStudent.group}</p>` : ''}
            <div class="qr-container">
              <img src="${qrCodeApiUrl}" class="qr-image" alt="QR Code" />
            </div>
            <div class="instructions">
              قم بمسح الكود باستخدام كاميرا الهاتف للوصول للتقرير الدراسي الشامل للطالب. يرجى إدخال رقم الهاتف المسجل لتأكيد الهوية.
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const stats = useMemo(() => {
    return {
      pending: students.filter(s => s.is_approved === false).length,
      active: students.filter(s => s.is_approved === true && s.is_active === true).length,
      inactive: students.filter(s => s.is_approved === true && s.is_active === false).length,
      total: students.length
    }
  }, [students])

  const filteredStudents = useMemo(() => {
    let result = students

    if (statusTab === 'pending') {
      result = result.filter(s => s.is_approved === false)
    } else if (statusTab === 'active') {
      result = result.filter(s => s.is_approved === true && s.is_active === true)
    } else if (statusTab === 'inactive') {
      result = result.filter(s => s.is_approved === true && s.is_active === false)
    }

    if (selectedGrade !== 'all') {
      result = result.filter(s => s.grade === selectedGrade)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(s => 
        [s.name, s.phone].filter(Boolean).join(' ').toLowerCase().includes(q)
      )
    }

    return result
  }, [students, statusTab, selectedGrade, query])

  return (
    <section className="cp-panel" style={{ direction: 'rtl' }}>
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header">
        <h2><i className="fas fa-user-check" style={{ color: '#10b981' }}></i> حسابات الطلاب والتفعيل</h2>
        <p>تفعيل ومراجعة حسابات الطلاب المسجلين ذاتياً، وتنشيط أو إيقاف اشتراكاتهم بضغطة زر.</p>
      </div>

      {/* Stats row */}
      <div className="cp-stats-row" style={{ marginBottom: 24 }}>
        <div className="cp-stat cp-stat-bad" style={{ cursor: 'pointer' }} onClick={() => setStatusTab('pending')}>
          <i className="fas fa-user-plus"></i>
          <div>
            <div className="cp-stat-val">{stats.pending}</div>
            <div className="cp-stat-lbl">بانتظار الموافقة</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-good" style={{ cursor: 'pointer' }} onClick={() => setStatusTab('active')}>
          <i className="fas fa-user-check"></i>
          <div>
            <div className="cp-stat-val">{stats.active}</div>
            <div className="cp-stat-lbl">نشطين (مشتركين)</div>
          </div>
        </div>
        <div className="cp-stat cp-stat-info" style={{ cursor: 'pointer', background: 'rgba(56, 189, 248, 0.08)', borderColor: 'rgba(56, 189, 248, 0.2)' }} onClick={() => setStatusTab('inactive')}>
          <i className="fas fa-user-slash" style={{ color: '#38bdf8' }}></i>
          <div>
            <div className="cp-stat-val" style={{ color: '#38bdf8' }}>{stats.inactive}</div>
            <div className="cp-stat-lbl">غير مشتركين</div>
          </div>
        </div>
      </div>

      {/* Tabs and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="cp-subtabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: 0 }}>
          <button
            className={`cp-btn ${statusTab === 'pending' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setStatusTab('pending')}
          >
            <i className="fas fa-hourglass-half"></i> طلبات معلقة ({stats.pending})
          </button>
          <button
            className={`cp-btn ${statusTab === 'active' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setStatusTab('active')}
          >
            <i className="fas fa-check-circle"></i> طلاب نشطين ({stats.active})
          </button>
          <button
            className={`cp-btn ${statusTab === 'inactive' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setStatusTab('inactive')}
          >
            <i className="fas fa-times-circle"></i> طلاب غير مشتركين ({stats.inactive})
          </button>
          <button
            className={`cp-btn ${statusTab === 'all' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setStatusTab('all')}
          >
            <i className="fas fa-users"></i> الكل ({stats.total})
          </button>
        </div>

        {statusTab === 'pending' && stats.pending > 0 && (
          <button className="cp-btn cp-btn-success" onClick={handleApproveAllPending} disabled={busyId === 'bulk'}>
            <i className="fas fa-check-double"></i> موافقة على كل المعلقين
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cp-search" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="ابحث باسم الطالب أو رقم الهاتف..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="cp-search-clear" type="button" onClick={() => setQuery('')}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 'bold', color: 'var(--text-color)' }}>تصفية بالمرحلة:</label>
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1.5px solid rgba(99, 102, 241, 0.18)',
              background: 'var(--card-bg, #fff)',
              color: 'var(--text-color)',
              fontFamily: 'inherit',
              cursor: 'pointer'
            }}
          >
            <option value="all">جميع المراحل</option>
            <option value="first-prep">الصف الأول الإعدادي</option>
            <option value="second-prep">الصف الثاني الإعدادي</option>
            <option value="third-prep">الصف الثالث الإعدادي</option>
            <option value="first-sec">الصف الأول الثانوي</option>
            <option value="second-sec">الصف الثاني الثانوي</option>
            <option value="third-sec">الصف الثالث الثانوي</option>
          </select>
        </div>

        <button className="cp-icon-btn" onClick={refreshList} title="تحديث القائمة" style={{ height: 42, width: 42 }}>
          <i className="fas fa-rotate"></i>
        </button>
      </div>

      {/* Data presentation */}
      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل قائمة الطلاب...</p>
        </div>
      ) : error ? (
        <div className="cp-empty" style={{ color: '#c53030' }}>
          <i className="fas fa-circle-exclamation"></i>
          <p>{error}</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-user-slash"></i>
          <p>لا يوجد طلاب يطابقون خيارات البحث والتصفية حالياً.</p>
        </div>
      ) : (
        <div className="sync-tech-table-wrapper" style={{ borderRadius: 16, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--card-bg, #fff)', overflowX: 'auto' }}>
          <table className="sync-tech-table" style={{ width: '100%', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'rgba(99, 102, 241, 0.05)' }}>
                <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem' }}>الطالب</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem' }}>رقم الهاتف</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem' }}>المرحلة</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem' }}>المجموعة</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem' }}>تاريخ التسجيل</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem' }}>الحالة</th>
                <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => {
                const isBusy = busyId === student.id
                const gradeText = GRADE_LABEL[student.grade] || student.grade || 'غير محدد'
                
                let statusBadge = null
                if (student.is_approved === false) {
                  statusBadge = <span className="sync-badge sync-badge-delete"><i className="fas fa-clock" style={{ marginInlineEnd: 4 }}></i>معلق للموافقة</span>
                } else if (student.is_active === true) {
                  statusBadge = <span className="sync-badge sync-badge-upsert"><i className="fas fa-check-circle" style={{ marginInlineEnd: 4 }}></i>نشط (مشترك)</span>
                } else {
                  statusBadge = <span className="sync-badge sync-badge-info"><i className="fas fa-info-circle" style={{ marginInlineEnd: 4 }}></i>غير نشط</span>
                }

                return (
                  <tr key={student.id}>
                    <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="cp-avatar cp-avatar-purple" style={{ fontSize: '0.8rem', width: 34, height: 34 }}>{initials(student.name)}</div>
                      <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>{student.name}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-color)' }}>
                      <a href={`https://wa.me/${student.phone}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <i className="fab fa-whatsapp" style={{ color: '#25d366' }}></i>
                        {student.phone}
                      </a>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-color)' }}>{gradeText}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-color)' }}>{student.group || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{fmtDate(student.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}>{statusBadge}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          className="cp-btn cp-btn-info cp-btn-sm"
                          onClick={() => {
                            setSelectedQrStudent(student)
                            setShowQrModal(true)
                          }}
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            background: 'rgba(99, 102, 241, 0.1)',
                            borderColor: 'rgba(99, 102, 241, 0.2)',
                            color: 'var(--primary, #6366f1)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                          title="كود QR للتقرير"
                        >
                          <i className="fas fa-qrcode"></i> QR للتقرير
                        </button>
                        {student.is_approved === false && (
                          <>
                            <button
                              className="cp-btn cp-btn-success cp-btn-sm"
                              onClick={() => handleUpdateStatus(student, true, true)}
                              disabled={isBusy}
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            >
                              {isBusy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>} تفعيل وتنشيط
                            </button>
                            <button
                              className="cp-btn cp-btn-ghost cp-btn-sm"
                              onClick={() => handleUpdateStatus(student, true, false)}
                              disabled={isBusy}
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            >
                              {isBusy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-thumbs-up"></i>} موافقة فقط
                            </button>
                          </>
                        )}
                        {student.is_approved === true && student.is_active === true && (
                          <button
                            className="cp-btn cp-btn-danger cp-btn-sm"
                            onClick={() => handleUpdateStatus(student, true, false)}
                            disabled={isBusy}
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            {isBusy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-ban"></i>} إيقاف الاشتراك
                          </button>
                        )}
                        {student.is_approved === true && student.is_active === false && (
                          <>
                            <button
                              className="cp-btn cp-btn-success cp-btn-sm"
                              onClick={() => handleUpdateStatus(student, true, true)}
                              disabled={isBusy}
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            >
                              {isBusy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>} تفعيل الاشتراك
                            </button>
                            <button
                              className="cp-btn cp-btn-danger cp-btn-sm"
                              onClick={() => handleUpdateStatus(student, false, false)}
                              disabled={isBusy}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#cbd5e0', borderColor: '#cbd5e0', color: '#4a5568' }}
                            >
                              {isBusy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-rotate-left"></i>} إلغاء الموافقة
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showQrModal && selectedQrStudent && (() => {
        const origin = window.location.origin;
        const qrUrl = `${origin}/public-report?id=${selectedQrStudent.id}&token=${selectedQrStudent.qr_token || ''}`;
        const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrUrl)}`;
        const gradeText = GRADE_LABEL[selectedQrStudent.grade] || selectedQrStudent.grade || 'غير محدد';
        
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20
          }}>
            <div style={{
              background: 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 24,
              padding: 32,
              maxWidth: 460,
              width: '100%',
              color: '#fff',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
              textAlign: 'center',
              position: 'relative',
              direction: 'rtl',
              fontFamily: 'Tajawal, sans-serif'
            }}>
              <button 
                onClick={() => {
                  setShowQrModal(false)
                  setSelectedQrStudent(null)
                }}
                style={{
                  position: 'absolute',
                  top: 20,
                  left: 20,
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
                title="إغلاق"
              >
                <i className="fas fa-times"></i>
              </button>

              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 12 }}>كود QR للتقرير الشامل</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: 24 }}>مسح هذا الرمز يتيح الوصول المباشر لنتائج الطالب وتقارير الحضور.</p>

              <div style={{
                background: '#fff',
                padding: 16,
                borderRadius: 16,
                display: 'inline-block',
                marginBottom: 24,
                boxShadow: '0 8px 16px rgba(0,0,0,0.15)'
              }}>
                <img src={qrCodeApiUrl} alt="QR Code" style={{ width: 200, height: 200, display: 'block' }} />
              </div>

              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 16,
                padding: 16,
                marginBottom: 28,
                textAlign: 'right'
              }}>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#94a3b8' }}>اسم الطالب: </span><span style={{ fontWeight: 600 }}>{selectedQrStudent.name}</span></div>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#94a3b8' }}>المرحلة الدراسية: </span><span>{gradeText}</span></div>
                {selectedQrStudent.group && <div><span style={{ color: '#94a3b8' }}>المجموعة: </span><span>{selectedQrStudent.group}</span></div>}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handlePrint}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <i className="fas fa-print"></i> طباعة الكود
                </button>
                <button
                  onClick={() => {
                    setShowQrModal(false)
                    setSelectedQrStudent(null)
                  }}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'transparent',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  )
}
