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
    </section>
  )
}
