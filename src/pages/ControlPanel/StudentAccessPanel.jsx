import React, { useState, useEffect, useMemo } from 'react'
import { searchStudents } from '@backend/profilesApi'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listHomeworks } from '@backend/homeworksApi'
import { listPackages, listStudentContentAccess, grantManualAccess, revokeManualAccess } from '@backend/packagesApi'
import { notify } from '../../utils/notify'
import { useAuth } from '../../contexts/AuthContext'
import { useTenant } from '../../contexts/TenantContext'

import { GRADE_LABEL } from './shared'

const fmtDate = (iso) => {
  if (!iso) return 'دائم مدى الحياة'
  try {
    const d = new Date(iso)
    if (isNaN(d)) return 'دائم مدى الحياة'
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return 'دائم مدى الحياة'
  }
}

export default function StudentAccessPanel({ onBack, flash }) {
  const { user } = useAuth()
  const { tenantId } = useTenant()
  const adminId = user?.id || null

  const [students, setStudents] = useState([])
  const [videos, setVideos] = useState([])
  const [exams, setExams] = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [packages, setPackages] = useState([])
  
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [accessGrants, setAccessGrants] = useState([])
  const [loadingGrants, setLoadingGrants] = useState(false)
  const [busy, setBusy] = useState(false)

  // Form state for new grant
  const [grantType, setGrantType] = useState('video') // 'video' | 'exam' | 'homework'
  const [grantItemId, setGrantItemId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [itemSearchQuery, setItemSearchQuery] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      // Students are no longer bulk-loaded — they're searched on demand below.
      const [v, e, h, pkgs] = await Promise.all([
        listVideos(),
        listExams({ lean: true }),
        listHomeworks(),
        listPackages(tenantId)
      ])
      setVideos(v)
      setExams(e)
      setHomeworks(h)
      setPackages(pkgs)
    } catch (err) {
      console.error(err)
      notify('فشل تحميل فهارس الطلاب والمحتوى', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [tenantId])

  const loadGrants = async (studentId) => {
    if (!studentId) return
    setLoadingGrants(true)
    try {
      const data = await listStudentContentAccess(studentId)
      setAccessGrants(data)
    } catch (err) {
      console.error(err)
      notify('فشل تحميل صلاحيات المحتوى للطالب', 'danger')
    } finally {
      setLoadingGrants(false)
    }
  }

  useEffect(() => {
    if (selectedStudent) {
      loadGrants(selectedStudent.id)
    }
  }, [selectedStudent])

  const handleGrantAccess = async (e) => {
    e.preventDefault()
    if (!selectedStudent || !grantItemId) {
      notify('يرجى اختيار المحتوى أولاً', 'warning')
      return
    }

    setBusy(true)
    try {
      await grantManualAccess({
        studentId: selectedStudent.id,
        contentType: grantType,
        contentId: grantItemId,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        adminId
      })
      notify('تم منح الصلاحية بنجاح! 🎉', 'success')
      setGrantItemId('')
      setExpiresAt('')
      setItemSearchQuery('')
      loadGrants(selectedStudent.id)
    } catch (err) {
      console.error(err)
      notify('فشل منح الصلاحية: ' + err.message, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const handleRevokeAccess = async (accessId) => {
    if (!selectedStudent) return
    if (!window.confirm('هل أنت متأكد من سحب صلاحية هذا المحتوى عن الطالب؟')) return

    try {
      await revokeManualAccess(accessId, selectedStudent.id)
      notify('تم سحب الصلاحية بنجاح.', 'success')
      loadGrants(selectedStudent.id)
    } catch (err) {
      console.error(err)
      notify('فشل سحب الصلاحية: ' + err.message, 'danger')
    }
  }

  // Debounced server-side student search — only matches are fetched, never the
  // whole roster. Empty query shows no results (the picker prompts to search).
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setStudents([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const rows = await searchStudents(q, 15)
        if (!cancelled) setStudents(rows)
      } catch (err) {
        if (!cancelled) console.error('student search failed:', err)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [searchQuery])

  // Results to render (already server-filtered).
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return []
    return students.slice(0, 15)
  }, [students, searchQuery])

  // Filter items in catalog for form selection
  const filteredCatalogItems = useMemo(() => {
    const q = itemSearchQuery.toLowerCase().trim()
    let list = []
    if (grantType === 'video') {
      list = videos
    } else if (grantType === 'exam') {
      list = exams
    } else if (grantType === 'homework') {
      list = homeworks
    }

    // Filter by student's grade if they are selected to avoid clutter
    if (selectedStudent?.grade) {
      list = list.filter(item => item.grade === selectedStudent.grade)
    }

    if (q) {
      list = list.filter(item => item.title.toLowerCase().includes(q))
    }
    return list
  }, [grantType, videos, exams, homeworks, itemSearchQuery, selectedStudent])

  // Resolve content items details
  const resolveContentDetails = (grant) => {
    let title = 'محتوى غير معروف'
    let grade = '—'
    
    if (grant.content_type === 'video') {
      const match = videos.find(v => v.id === grant.content_id)
      if (match) {
        title = `🎬 ${match.title}`
        grade = GRADE_LABEL[match.grade] || match.grade
      }
    } else if (grant.content_type === 'exam') {
      const match = exams.find(e => e.id === grant.content_id)
      if (match) {
        title = `📝 ${match.title}`
        grade = GRADE_LABEL[match.grade] || match.grade
      }
    } else if (grant.content_type === 'homework') {
      const match = homeworks.find(h => h.id === grant.content_id)
      if (match) {
        title = `📚 ${match.title}`
        grade = GRADE_LABEL[match.grade] || match.grade
      }
    }

    return { title, grade }
  }

  // Resolve source type display name
  const resolveSourceDisplay = (grant) => {
    if (grant.source_type === 'package') {
      const pkg = packages.find(p => p.id === grant.source_id)
      return `📦 باقة: ${pkg?.title || 'باقة غير معروفة'}`
    } else if (grant.source_type === 'admin') {
      return '👤 إشراف يدوي'
    } else {
      return '🔑 يدوي'
    }
  }

  return (
    <section className="cp-panel">
      {onBack && !selectedStudent && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      {selectedStudent && (
        <button className="cp-back" type="button" onClick={() => { setSelectedStudent(null); setAccessGrants([]); }}>
          <i className="fas fa-arrow-right"></i> اختيار طالب آخر
        </button>
      )}

      <div className="cp-panel-header">
        <h2>
          <i className="fas fa-user-lock" style={{ color: '#14b8a6', marginInlineEnd: 8 }}></i>
          <span>صلاحيات محتوى الطلاب</span>
        </h2>
        <p>قم بمنح أو إلغاء صلاحيات الوصول المباشر إلى الفيديوهات والامتحانات والواجبات لطلاب محددين خارج نظام الباقات المشتركة.</p>
      </div>

      <div className="cp-header-divider" />

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل فهارس النظام والطلاب...</p>
        </div>
      ) : !selectedStudent ? (
        // Search and Select Student View
        <div style={{ maxWidth: 600, margin: '20px auto' }}>
          <label style={{ display: 'block', fontSize: '1rem', fontWeight: 'bold', marginBottom: 12, color: 'var(--text-color)' }}>
            ابحث عن الطالب بالاسم أو رقم الهاتف للتحكم بصلاحياته:
          </label>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <i className="fas fa-search" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}></i>
            <input 
              type="text" 
              placeholder="اكتب اسم الطالب أو رقم الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cp-input"
              style={{ width: '100%', padding: '12px 42px 12px 16px', fontSize: '1rem' }}
            />
          </div>

          {searchQuery && filteredStudents.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>لا يوجد طالب مطابق للبحث.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredStudents.map(student => (
              <div
                key={student.id}
                onClick={() => setSelectedStudent(student)}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'var(--cp-card-bg, #fff)',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s'
                }}
                className="cp-card-hover"
              >
                <div>
                  <strong style={{ display: 'block', fontSize: '1.05rem', color: 'var(--text-color)' }}>{student.name}</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)' }}>الهاتف: {student.phone || '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: '0.8rem',
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: 'rgba(20, 184, 166, 0.1)',
                    color: '#14b8a6',
                    fontWeight: 'bold'
                  }}>
                    {GRADE_LABEL[student.grade] || student.grade}
                  </span>
                  <i className="fas fa-chevron-left" style={{ color: '#64748b' }}></i>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Selected Student Access Management View
        <div>
          {/* Student Profile Card */}
          <div style={{
            background: 'rgba(20, 184, 166, 0.03)',
            border: '1px solid rgba(20, 184, 166, 0.1)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 28,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16
          }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)' }}>صلاحيات الطالب:</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '4px 0 8px 0', color: 'var(--text-color)' }}>{selectedStudent.name}</h3>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.88rem', color: 'var(--cp-text-muted)' }}>
                <span><i className="fas fa-phone"></i> {selectedStudent.phone || '—'}</span>
                <span><i className="fas fa-graduation-cap"></i> {GRADE_LABEL[selectedStudent.grade] || selectedStudent.grade}</span>
                {selectedStudent.group && <span><i className="fas fa-users"></i> مجموعة: {selectedStudent.group}</span>}
              </div>
            </div>
            
            <button
              onClick={() => { setSelectedStudent(null); setAccessGrants([]); }}
              className="cp-btn cp-btn-secondary"
              style={{ padding: '8px 16px', borderRadius: 10 }}
            >
              تغيير الطالب
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 28 }}>
            
            {/* 1. Grant Access Form */}
            <div style={{ background: 'var(--cp-card-bg, #fff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-plus-circle" style={{ color: '#10b981' }}></i>
                <span>منح صلاحية محتوى جديدة</span>
              </h3>

              <form onSubmit={handleGrantAccess} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  
                  {/* Select Type */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: 6 }}>نوع المحتوى *</label>
                    <select
                      value={grantType}
                      onChange={(e) => { setGrantType(e.target.value); setGrantItemId(''); setItemSearchQuery(''); }}
                      className="cp-input"
                      style={{ width: '100%', padding: '10px', background: 'var(--card-bg)' }}
                    >
                      <option value="video">🎬 فيديو (فيديو مسجل)</option>
                      <option value="exam">📝 امتحان</option>
                      <option value="homework">📚 واجب</option>
                    </select>
                  </div>

                  {/* Expiration Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: 6 }}>تاريخ وساعة انتهاء الصلاحية (اختياري)</label>
                    <input
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="cp-input"
                      style={{ width: '100%', padding: '10px', background: 'var(--card-bg)' }}
                    />
                    <small style={{ color: 'var(--cp-text-muted)', display: 'block', marginTop: 4 }}>
                      اتركه فارغاً لمنح وصول دائم بلا تاريخ انتهاء.
                    </small>
                  </div>
                </div>

                {/* Filter and Select Content Item */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: 6 }}>اختر العنصر الدراسي المحدد *</label>
                  <input
                    type="text"
                    placeholder="ابحث باسم الفيديو/الامتحان/الواجب..."
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '10px', marginBottom: 10, background: 'var(--card-bg)' }}
                  />

                  <div style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1.5px solid var(--border-color, #e2e8f0)',
                    borderRadius: 10,
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}>
                    {filteredCatalogItems.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: '0.88rem' }}>
                        لا توجد عناصر مطابقة في مرحلة الطالب ({GRADE_LABEL[selectedStudent.grade] || selectedStudent.grade})
                      </div>
                    ) : (
                      filteredCatalogItems.map(item => {
                        const isSelected = grantItemId === item.id
                        return (
                          <div
                            key={item.id}
                            onClick={() => setGrantItemId(item.id)}
                            style={{
                              padding: 10,
                              borderRadius: 8,
                              background: isSelected ? 'rgba(20, 184, 166, 0.08)' : 'transparent',
                              border: isSelected ? '1px solid #14b8a6' : '1px solid transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'all 0.15s'
                            }}
                          >
                            <span style={{ fontSize: '0.9rem', fontWeight: isSelected ? 'bold' : 'normal', color: 'var(--text-color)' }}>
                              {item.title}
                            </span>
                            {isSelected && <i className="fas fa-circle-check" style={{ color: '#14b8a6' }}></i>}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    type="submit"
                    disabled={busy || !grantItemId}
                    className="cp-btn cp-btn-primary"
                    style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, background: '#14b8a6', borderColor: '#14b8a6' }}
                  >
                    {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
                    <span>تأكيد منح الصلاحية للطالب</span>
                  </button>
                </div>
              </form>
            </div>

            {/* 2. Active Access Grants Table */}
            <div style={{ background: 'var(--cp-card-bg, #fff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 16px 0' }}>
                الصلاحيات المفعّلة حالياً للطالب ({accessGrants.length} صلاحية)
              </h3>

              {loadingGrants ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', color: '#14b8a6', marginBottom: 8 }}></i>
                  <p>جاري تحميل قائمة صلاحيات الطالب...</p>
                </div>
              ) : accessGrants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', border: '1px dashed var(--border-light)', borderRadius: 12 }}>
                  <i className="fas fa-lock" style={{ fontSize: '2.5rem', color: '#cbd5e1', marginBottom: 12 }}></i>
                  <p>لا يملك هذا الطالب أي صلاحيات وصول خاصة للمحتوى حالياً.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border-light)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-light)' }}>
                        <th style={thStyle}>اسم المحتوى</th>
                        <th style={thStyle}>نوعه</th>
                        <th style={thStyle}>المرحلة</th>
                        <th style={thStyle}>مصدر الصلاحية</th>
                        <th style={thStyle}>تاريخ الانتهاء</th>
                        <th style={thStyle}>سحب الصلاحية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accessGrants.map((grant) => {
                        const { title, grade } = resolveContentDetails(grant)
                        const isManual = grant.source_type !== 'package'
                        return (
                          <tr key={grant.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={tdStyle}>
                              <strong style={{ color: 'var(--text-color)' }}>{title}</strong>
                            </td>
                            <td style={tdStyle}>
                              <span style={{
                                fontSize: '0.78rem',
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: grant.content_type === 'video' ? 'rgba(99, 102, 241, 0.08)' : grant.content_type === 'exam' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                                color: grant.content_type === 'video' ? '#6366f1' : grant.content_type === 'exam' ? '#f59e0b' : '#10b981',
                                fontWeight: 'bold'
                              }}>
                                {grant.content_type === 'video' ? 'فيديو' : grant.content_type === 'exam' ? 'امتحان' : 'واجب'}
                              </span>
                            </td>
                            <td style={tdStyle}>{grade}</td>
                            <td style={tdStyle}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: !isManual ? '#7c3aed' : 'var(--text-color)' }}>
                                {resolveSourceDisplay(grant)}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <span style={{ fontSize: '0.82rem', color: grant.expires_at ? '#ef4444' : 'var(--cp-text-muted)', fontWeight: grant.expires_at ? 600 : 'normal' }}>
                                {fmtDate(grant.expires_at)}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              {isManual ? (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeAccess(grant.id)}
                                  style={{
                                    border: 'none',
                                    background: 'rgba(239, 68, 68, 0.06)',
                                    color: '#ef4444',
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseOver={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.12)'}
                                  onMouseOut={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.06)'}
                                >
                                  <i className="fas fa-trash-can"></i> سحب
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', fontStyle: 'italic' }}>
                                  تدار عبر الباقة
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </section>
  )
}

const thStyle = {
  padding: '12px 14px',
  fontWeight: 700,
  fontSize: '0.85rem',
  color: 'var(--text-color)',
  fontFamily: 'Tajawal',
}

const tdStyle = {
  padding: '12px 14px',
  fontFamily: 'Tajawal',
  verticalAlign: 'middle',
}
