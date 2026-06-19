import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { listStudents, updateStudentStatus, updateStudentProfile } from '@backend/profilesApi'
import { listBranches } from '@backend/branchesApi'
import { listAcademicYears } from '@backend/academicYearsApi'
import { createNotification } from '@backend/notificationsApi'
import { initials, GRADE_LABEL } from './shared'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../../utils/cache'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '@backend/supabase'

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
  const [branches, setBranches] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  
  // Search and filters
  const [query, setQuery] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [statusTab, setStatusTab] = useState('pending')

  // Modals
  const [showQrModal, setShowQrModal] = useState(false)
  const [selectedQrStudent, setSelectedQrStudent] = useState(null)
  
  const [showEditModal, setShowEditModal] = useState(false)
  const [editStudent, setEditStudent] = useState(null)

  const fetchStudentsAndMeta = async () => {
    try {
      setLoading(true)
      const [studentsData, branchesData, yearsData] = await Promise.all([
        cached('students', LIST_TTL, listStudents),
        listBranches(),
        listAcademicYears()
      ])
      setStudents(studentsData || [])
      setBranches(branchesData || [])
      setAcademicYears(yearsData || [])
    } catch (e) {
      setError(e.message || 'تعذّر تحميل قائمة الطلاب أو الفروع')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudentsAndMeta()
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
      }
      
      // Update local state
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, is_approved, is_active, status: is_approved && is_active ? 'active' : 'inactive' } : s))
      flash(`تم تحديث حالة الطالب: ${student.name}`, 'success')
    } catch (e) {
      flash(e.message || 'تعذّر تحديث حالة الطالب', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteStudent = async (student) => {
    if (busyId) return
    if (!window.confirm(`⚠️ تحذير: هل أنت متأكد من رغبتك في حذف الطالب "${student.name}" نهائياً؟`)) {
      return
    }
    
    setBusyId(student.id)
    try {
      const { error: rpcError } = await supabase.rpc('delete_student_account', {
        p_student_id: student.id
      })
      if (rpcError) throw rpcError
      
      setStudents(prev => prev.filter(s => s.id !== student.id))
      invalidateCache('students')
      flash(`تم حذف حساب الطالب "${student.name}" بنجاح.`, 'success')
    } catch (e) {
      flash(e.message || 'تعذّر حذف حساب الطالب', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editStudent) return
    setBusyId(editStudent.id)
    try {
      const updated = await updateStudentProfile(editStudent.id, editStudent)
      setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...s, ...updated } : s))
      flash('تم تحديث بيانات الطالب وحفظ التغييرات بنجاح', 'success')
      setShowEditModal(false)
      setEditStudent(null)
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء تعديل بيانات الطالب: ' + err.message, 'error')
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
    
    printWindow.document.write(`
      <html>
        <head>
          <title>بطاقة QR - ${selectedQrStudent.name}</title>
          <style>
            body { font-family: 'Tajawal', sans-serif; text-align: center; padding: 40px; direction: ltr; background: #fff; color: #000; }
            .card { border: 2px dashed #ccc; border-radius: 16px; padding: 30px; max-width: 400px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            h2 { margin: 0 0 10px; font-size: 1.6rem; }
            p { margin: 5px 0; color: #555; font-size: 1.1rem; }
            .qr-container { margin: 25px 0; }
            .qr-image { width: 260px; height: 260px; }
            .logo { font-weight: bold; font-size: 1.4rem; color: #6366f1; margin-bottom: 20px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="card">
            <div class="logo">منصة مسار التعليمية</div>
            <h2>كود QR لتقرير الطالب</h2>
            <p><strong>الاسم:</strong> ${selectedQrStudent.name}</p>
            <p><strong>المرحلة:</strong> ${GRADE_LABEL[selectedQrStudent.grade] || selectedQrStudent.grade}</p>
            <div class="qr-container">
              <img src="${qrCodeApiUrl}" class="qr-image" alt="QR Code" />
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const stats = useMemo(() => {
    return {
      pending: students.filter(s => s.is_approved === false).length,
      active: students.filter(s => s.status === 'active').length,
      inactive: students.filter(s => s.status === 'inactive' && s.is_approved === true).length,
      suspended: students.filter(s => s.status === 'suspended').length,
      total: students.length
    }
  }, [students])

  const filteredStudents = useMemo(() => {
    let result = students

    if (statusTab === 'pending') {
      result = result.filter(s => s.is_approved === false)
    } else if (statusTab === 'active') {
      result = result.filter(s => s.status === 'active')
    } else if (statusTab === 'inactive') {
      result = result.filter(s => s.status === 'inactive' && s.is_approved === true)
    } else if (statusTab === 'suspended') {
      result = result.filter(s => s.status === 'suspended')
    }

    if (selectedGrade !== 'all') {
      result = result.filter(s => s.grade === selectedGrade)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(s => 
        [s.name, s.phone, s.parent_phone].filter(Boolean).join(' ').toLowerCase().includes(q)
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
        <p>مراجعة وتعديل بيانات الطلاب، تفاصيل أولياء الأمور، الفروع والأعوام الدراسية.</p>
      </div>

      {/* Tabs Row */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '24px' }}>
        <button className={`cp-btn ${statusTab === 'pending' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('pending')}>
          <i className="fas fa-hourglass-half"></i> معلقين ({stats.pending})
        </button>
        <button className={`cp-btn ${statusTab === 'active' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('active')}>
          <i className="fas fa-check-circle"></i> نشطين ({stats.active})
        </button>
        <button className={`cp-btn ${statusTab === 'inactive' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('inactive')}>
          <i className="fas fa-user-slash"></i> غير مشتركين ({stats.inactive})
        </button>
        <button className={`cp-btn ${statusTab === 'suspended' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('suspended')}>
          <i className="fas fa-ban"></i> موقوفين ({stats.suspended})
        </button>
        <button className={`cp-btn ${statusTab === 'all' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('all')}>
          <i className="fas fa-users"></i> الكل ({stats.total})
        </button>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cp-search" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="ابحث باسم الطالب أو رقم الهاتف..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div>
          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            <option value="all">جميع المراحل</option>
            {Object.entries(GRADE_LABEL).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </div>

        <button className="cp-icon-btn" onClick={refreshList} title="تحديث القائمة" style={{ height: 42, width: 42 }}>
          <i className="fas fa-rotate"></i>
        </button>
      </div>

      {/* Grid Table */}
      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل قائمة الطلاب...</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-user-slash"></i>
          <p>لا يوجد نتائج مطابقة</p>
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--card-bg, #fff)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
            <thead>
              <tr style={{ background: 'rgba(99, 102, 241, 0.05)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '14px 16px' }}>اسم الطالب</th>
                <th style={{ padding: '14px 16px' }}>أرقام الهواتف</th>
                <th style={{ padding: '14px 16px' }}>المرحلة</th>
                <th style={{ padding: '14px 16px' }}>الفرع</th>
                <th style={{ padding: '14px 16px' }}>النوع والوضع</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => {
                const isBusy = busyId === student.id
                const branchName = branches.find(b => b.id === student.branch_id)?.name || 'الفرع الرئيسي'
                const academicYearName = academicYears.find(y => y.id === student.academic_year_id)?.name || ''
                const statusColors = {
                  active: '#10b981',
                  inactive: '#64748b',
                  suspended: '#ef4444',
                  graduated: '#3b82f6',
                  archived: '#a855f7'
                }
                const currentStatus = student.status || 'inactive'
                
                return (
                  <tr key={student.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                      {student.name}
                      {student.flags && student.flags.map(flag => (
                        <span key={flag} style={{ marginInlineStart: '6px', padding: '2px 6px', fontSize: '0.7rem', borderRadius: '4px', background: '#ef444420', color: '#ef4444', fontWeight: 'bold' }}>
                          {flag}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.82rem' }}>
                        <span>الطالب: {student.phone}</span>
                        {student.parent_phone && <span>ولي الأمر: {student.parent_phone}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{GRADE_LABEL[student.grade] || student.grade}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{branchName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{academicYearName}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', background: `${statusColors[currentStatus]}20`, color: statusColors[currentStatus], fontWeight: 'bold' }}>
                        {currentStatus.toUpperCase()}
                      </span>
                      <span style={{ marginInlineStart: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                        {student.enrollment_type || 'CENTER'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="cp-btn cp-btn-info cp-btn-sm"
                          onClick={() => {
                            setEditStudent({ ...student })
                            setShowEditModal(true)
                          }}
                        >
                          <i className="fas fa-edit" /> تعديل
                        </button>
                        <button
                          className="cp-btn cp-btn-sm"
                          onClick={() => {
                            setSelectedQrStudent(student)
                            setShowQrModal(true)
                          }}
                          style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}
                        >
                          <i className="fas fa-qrcode" /> كارت
                        </button>
                        <button
                          className="cp-btn cp-btn-danger cp-btn-sm"
                          onClick={() => handleDeleteStudent(student)}
                          disabled={isBusy}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Student Modal */}
      {showEditModal && editStudent && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form onSubmit={handleEditSubmit} style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>تعديل الملف الشخصي للطالب: {editStudent.name}</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>الاسم بالكامل</label>
                <input type="text" value={editStudent.name} onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>رقم هاتف الطالب</label>
                <input type="text" value={editStudent.phone} onChange={(e) => setEditStudent({ ...editStudent, phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>حالة الطالب</label>
                <select value={editStudent.status || 'inactive'} onChange={(e) => setEditStudent({ ...editStudent, status: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="active">نشط (مفعل)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="inactive">غير نشط (غير مشترك)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="suspended">موقوف</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="graduated">خريج</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="archived">مؤرشف</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>نوع التسجيل والاشتراك</label>
                <select value={editStudent.enrollment_type || 'CENTER'} onChange={(e) => setEditStudent({ ...editStudent, enrollment_type: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="CENTER">CENTER (حضور سنتر)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="ONLINE">ONLINE (منصة الكترونية)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="HYBRID">HYBRID (مدمج سنتر + اونلاين)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>الفرع الدراسي</label>
                <select value={editStudent.branch_id || ''} onChange={(e) => setEditStudent({ ...editStudent, branch_id: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر الفرع...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ background: '#0f172a', color: '#fff' }}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>العام الدراسي</label>
                <select value={editStudent.academic_year_id || ''} onChange={(e) => setEditStudent({ ...editStudent, academic_year_id: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر العام...</option>
                  {academicYears.map(y => (
                    <option key={y.id} value={y.id} style={{ background: '#0f172a', color: '#fff' }}>{y.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Parent contacts Section */}
            <h4 style={{ fontSize: '0.98rem', fontWeight: 'bold', marginBottom: '12px', color: '#38bdf8', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>جهات اتصال أولياء الأمور</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>اسم الأب</label>
                <input type="text" value={editStudent.father_name || ''} onChange={(e) => setEditStudent({ ...editStudent, father_name: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>رقم هاتف الأب</label>
                <input type="text" value={editStudent.father_phone || ''} onChange={(e) => setEditStudent({ ...editStudent, father_phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>اسم الأم</label>
                <input type="text" value={editStudent.mother_name || ''} onChange={(e) => setEditStudent({ ...editStudent, mother_name: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>رقم هاتف الأم</label>
                <input type="text" value={editStudent.mother_phone || ''} onChange={(e) => setEditStudent({ ...editStudent, mother_phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>اسم الوصي البديل</label>
                  <input type="text" value={editStudent.guardian_name || ''} onChange={(e) => setEditStudent({ ...editStudent, guardian_name: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>رقم هاتف الوصي</label>
                  <input type="text" value={editStudent.guardian_phone || ''} onChange={(e) => setEditStudent({ ...editStudent, guardian_phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>صلة القرابة</label>
                  <input type="text" value={editStudent.guardian_relation || ''} onChange={(e) => setEditStudent({ ...editStudent, guardian_relation: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} placeholder="مثال: جد، خال، عم..." />
                </div>
              </div>
            </div>

            {/* Warning Flags */}
            <h4 style={{ fontSize: '0.98rem', fontWeight: 'bold', marginBottom: '12px', color: '#ef4444', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>العلامات والتحذيرات الذكية (Smart Flags)</h4>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '28px' }}>
              {['debt', 'excessive_absences', 'blocked', 'scholarship', 'VIP'].map(flag => {
                const currentFlags = editStudent.flags || []
                const hasFlag = currentFlags.includes(flag)
                const flagLabels = { debt: 'مديونية مالية', excessive_absences: 'غياب متكرر', blocked: 'حساب محظور', scholarship: 'طالب منحة', VIP: 'طالب VIP' }
                return (
                  <label key={flag} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <input 
                      type="checkbox" 
                      checked={hasFlag} 
                      onChange={(e) => {
                        const nextFlags = e.target.checked
                          ? [...currentFlags, flag]
                          : currentFlags.filter(f => f !== flag)
                        setEditStudent({ ...editStudent, flags: nextFlags })
                      }}
                      style={{ accentColor: '#ef4444' }}
                    />
                    <span>{flagLabels[flag]}</span>
                  </label>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" disabled={busyId === editStudent.id} className="cp-btn cp-btn-success" style={{ flex: 1, padding: '12px', fontWeight: 'bold' }}>
                {busyId === editStudent.id ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
              <button type="button" onClick={() => { setShowEditModal(false); setEditStudent(null); }} className="cp-btn cp-btn-secondary" style={{ padding: '12px 24px' }}>
                إلغاء
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* QR Lightbox */}
      {showQrModal && selectedQrStudent && (() => {
        const origin = window.location.origin;
        const qrUrl = `${origin}/public-report?id=${selectedQrStudent.id}&token=${selectedQrStudent.qr_token || ''}`;
        const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrUrl)}`;
        const gradeText = GRADE_LABEL[selectedQrStudent.grade] || selectedQrStudent.grade || 'غير محدد';
        
        return createPortal(
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20 }}>
            <div style={{ background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 24, padding: 32, maxWidth: 460, width: '100%', color: '#fff', textAlign: 'center', position: 'relative', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
              <button onClick={() => { setShowQrModal(false); setSelectedQrStudent(null); }} style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }} title="إغلاق">
                <i className="fas fa-times"></i>
              </button>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 12 }}>كود QR للتقرير الشامل</h3>
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, display: 'inline-block', marginBottom: 24 }}>
                <img src={qrCodeApiUrl} alt="QR Code" style={{ width: 200, height: 200, display: 'block' }} />
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 16, padding: 16, marginBottom: 28, textAlign: 'right' }}>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#94a3b8' }}>اسم الطالب: </span><span style={{ fontWeight: 600 }}>{selectedQrStudent.name}</span></div>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#94a3b8' }}>المرحلة الدراسية: </span><span>{gradeText}</span></div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handlePrint} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><i className="fas fa-print"></i> طباعة الكود</button>
                <button onClick={() => { setShowQrModal(false); setSelectedQrStudent(null); }} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.15)', background: 'transparent', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>إغلاق</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </section>
  )
}
