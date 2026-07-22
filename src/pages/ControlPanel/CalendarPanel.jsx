import React, { useState, useEffect, useMemo } from 'react'
import { listScheduledEvents, createScheduledEvent, updateScheduledEvent, deleteScheduledEvent } from '@backend/calendarApi'
import { listPackages } from '@backend/packagesApi'
import { supabase } from '@backend/supabase'
import { useTenant } from '../../contexts/TenantContext'



const EVENT_TYPE_INFO = {
  video: { label: 'فيديو محاضرة', icon: 'fa-play-circle', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  homework: { label: 'تسليم واجب', icon: 'fa-book-open', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
  exam: { label: 'امتحان مجدول', icon: 'fa-file-signature', color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
  payment: { label: 'تذكير بالدفع', icon: 'fa-credit-card', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
  announcement: { label: 'تنبيه عام', icon: 'fa-bullhorn', color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)' },
  custom: { label: 'فعالية أخرى', icon: 'fa-calendar-days', color: 'var(--cp-text-muted)', bg: 'rgba(100, 116, 139, 0.1)' },
}

export default function CalendarPanel({ onBack, flash }) {
  const { tenantId, gradesList } = useTenant()
  const [events, setEvents] = useState([])
  const [packages, setPackages] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [gradeFilter, setGradeFilter] = useState('all')

  // Calendar navigation state
  const [currentDate, setCurrentDate] = useState(new Date())

  // Event modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  
  // Form fields
  const [formTitle, setFormTitle] = useState('')
  const [formType, setFormType] = useState('custom')
  const [formStartsAt, setFormStartsAt] = useState('')
  const [formGrade, setFormGrade] = useState(() => gradesList?.[0]?.id || 'first-prep')
  const [formGroupId, setFormGroupId] = useState('')
  const [formPackageId, setFormPackageId] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      // Load events
      const evs = await listScheduledEvents({ grade: gradeFilter === 'all' ? undefined : gradeFilter })
      setEvents(evs || [])

      // Load packages & groups for dropdowns
      const pkgs = await listPackages(tenantId)
      setPackages(pkgs || [])

      const { data: grps } = await supabase.from('groups').select('id, name')
      setGroups(grps || [])
    } catch (err) {
      if (flash) flash(err.message || 'تعذر تحميل بيانات التقويم والفعاليات ❌', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [gradeFilter, tenantId])

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDayIndex = new Date(year, month, 1).getDay() // 0 = Sunday, etc.
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate()
    const totalDaysInPrevMonth = new Date(year, month, 0).getDate()

    const days = []

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, totalDaysInPrevMonth - i)
      days.push({ date: prevDate, isCurrentMonth: false })
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const date = new Date(year, month, i)
      days.push({ date, isCurrentMonth: true })
    }

    // Next month filler days (to make complete grid of 6 weeks = 42 cells)
    const remainingCells = 42 - days.length
    for (let i = 1; i <= remainingCells; i++) {
      const nextDate = new Date(year, month + 1, i)
      days.push({ date: nextDate, isCurrentMonth: false })
    }

    return days
  }, [currentDate])

  const openAddModal = (date) => {
    setEditingEvent(null)
    setFormTitle('')
    setFormType('custom')
    setFormGrade(gradeFilter !== 'all' ? gradeFilter : (gradesList?.[0]?.id || 'first-prep'))
    setFormGroupId('')
    setFormPackageId('')
    
    if (date) {
      try {
        const offset = date.getTimezoneOffset() * 60000
        const localString = new Date(date.getTime() - offset)
          .toISOString()
          .slice(0, 16)
        setFormStartsAt(localString)
      } catch (err) {
        setFormStartsAt('')
      }
    } else {
      setFormStartsAt('')
    }
    setModalOpen(true)
  }

  const openEditModal = (event) => {
    if (!event) return
    setEditingEvent(event)
    setFormTitle(event.title || '')
    setFormType(event.event_type || 'custom')
    setFormGrade(event.grade || 'first-prep')
    setFormGroupId(event.group_id || '')
    setFormPackageId(event.package_id || '')
    
    if (event.starts_at) {
      try {
        const d = new Date(event.starts_at)
        const offset = d.getTimezoneOffset() * 60000
        const localString = new Date(d.getTime() - offset)
          .toISOString()
          .slice(0, 16)
        setFormStartsAt(localString)
      } catch (err) {
        setFormStartsAt('')
      }
    } else {
      setFormStartsAt('')
    }
    
    setModalOpen(true)
  }

  const handleSaveEvent = async (e) => {
    e.preventDefault()
    if (!formTitle || !formStartsAt) {
      if (flash) flash('يرجى ملء جميع الحقول المطلوبة ⚠️', 'warning')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: formTitle.trim(),
        event_type: formType,
        starts_at: new Date(formStartsAt).toISOString(),
        grade: formGrade,
        group_id: formGroupId ? formGroupId : null,
        package_id: formPackageId ? formPackageId : null,
        ends_at: null,
        related_type: null,
        related_id: null,
      }

      if (editingEvent) {
        const updated = await updateScheduledEvent(editingEvent.id, payload)
        setEvents((prev) => prev.map((ev) => (ev.id === updated.id ? updated : ev)))
        if (flash) flash('تم تحديث الفعالية في التقويم بنجاح ✅', 'success')
      } else {
        const created = await createScheduledEvent(payload)
        setEvents((prev) => [...prev, created])
        if (flash) flash('تم إضافة الفعالية للتقويم بنجاح ✅', 'success')
      }
      setModalOpen(false)
    } catch (err) {
      if (err.message && err.message.includes('scheduled_events_package_id_fkey')) {
        if (flash) flash('تعذر حفظ الفعالية: القيد المرجعي للباقة مرتبط بجدول قديم. يرجى تطبيق ملف الهجرة SQL لتحديث قاعدة البيانات ❌', 'error')
      } else {
        if (flash) flash(err.message || 'تعذر حفظ الفعالية ❌', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEvent = async () => {
    if (!editingEvent) return
    if (!window.confirm('هل أنت متأكد من حذف هذه الفعالية نهائياً؟')) return
    setSaving(true)
    try {
      await deleteScheduledEvent(editingEvent.id)
      setEvents((prev) => prev.filter((ev) => ev.id !== editingEvent.id))
      setModalOpen(false)
      if (flash) flash('تم حذف الفعالية من التقويم بنجاح ✅', 'success')
    } catch (err) {
      if (flash) flash(err.message || 'تعذر حذف الفعالية ❌', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Crash-proof month-year string formatter
  const formattedMonthYear = useMemo(() => {
    try {
      return currentDate.toLocaleString('ar-EG', { month: 'long', year: 'numeric' })
    } catch (e) {
      const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
      return `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    }
  }, [currentDate])

  return (
    <div className="cp-panel-container" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--cp-text-main)' }}>
            جدول المحتوى والفعاليات المجدولة 📅
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--cp-text-muted)', fontSize: '0.95rem' }}>
            تنظيم مواعيد الفيديوهات، الامتحانات، الواجبات والأنشطة الأكاديمية على مدار الشهر
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => openAddModal()} className="cp-btn cp-btn-success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-plus"></i>
            <span>إضافة فعالية</span>
          </button>
          <button onClick={onBack} className="cp-btn cp-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-arrow-left"></i>
            <span>الرجوع</span>
          </button>
        </div>
      </div>

      {/* Grade filter */}
      <div style={{
        background: 'var(--cp-card-bg)',
        borderRadius: 16,
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        border: '1px solid var(--cp-divider)',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--cp-text-muted)', fontSize: '0.9rem' }}>تصفية المرحلة:</span>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            style={{
              background: 'var(--cp-bg)',
              color: 'var(--cp-text-main)',
              border: '1px solid var(--cp-card-border)',
              borderRadius: 12,
              padding: '8px 16px',
              fontFamily: 'Tajawal',
            }}
          >
            <option value="all">كل المراحل</option>
            {gradesList.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Month Selector Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={handlePrevMonth} className="cp-btn cp-btn-secondary" style={{ borderRadius: 10, padding: '6px 12px' }}>
            <i className="fas fa-chevron-right"></i> الشهر السابق
          </button>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--cp-text-main)', minWidth: 150, textAlign: 'center' }}>
            {formattedMonthYear}
          </span>
          <button onClick={handleNextMonth} className="cp-btn cp-btn-secondary" style={{ borderRadius: 10, padding: '6px 12px' }}>
            الشهر التالي <i className="fas fa-chevron-left"></i>
          </button>
        </div>
      </div>

      {/* Main Grid Calendar */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 0', gap: 12 }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2.5rem', color: '#10b981' }}></i>
          <span style={{ color: 'var(--cp-text-muted)' }}>جاري تحميل التقويم...</span>
        </div>
      ) : (
        <div style={{
          background: 'var(--cp-card-bg)',
          border: '1px solid var(--cp-divider)',
          borderRadius: 20,
          overflow: 'hidden'
        }}>
          {/* Weekday headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--cp-bg)',
            borderBottom: '1px solid var(--cp-divider)',
            textAlign: 'center',
            fontWeight: 'bold',
            color: 'var(--cp-text-muted)',
            fontSize: '0.85rem'
          }}>
            {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => (
              <div key={day} style={{ padding: '12px 6px' }}>{day}</div>
            ))}
          </div>

          {/* Day Grid cells */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gridAutoRows: 'minmax(120px, auto)',
            background: 'var(--cp-bg)',
            gap: '1px'
          }}>
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const dateString = date ? date.toDateString() : ''
              const isToday = date ? new Date().toDateString() === dateString : false

              // Filter events that fall on this day
              const dayEvents = (events || []).filter((ev) => {
                if (!ev || !ev.starts_at) return false
                try {
                  const evDate = new Date(ev.starts_at)
                  return evDate.toDateString() === dateString
                } catch (e) {
                  return false
                }
              })

              return (
                <div
                  key={idx}
                  onClick={() => date && openAddModal(date)}
                  style={{
                    background: isCurrentMonth ? 'var(--cp-card-bg)' : 'var(--cp-bg)',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: isCurrentMonth ? 1 : 0.4,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    border: isToday ? '2px solid #10b981' : 'none'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--cp-card-hover-bg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isCurrentMonth ? 'var(--cp-card-bg)' : 'var(--cp-bg)' }}
                >
                  {/* Day number */}
                  <span style={{
                    fontSize: '0.9rem',
                    fontWeight: isToday ? 'bold' : 'normal',
                    color: isToday ? '#10b981' : 'var(--cp-text-main)',
                    marginBottom: 6,
                    display: 'inline-block'
                  }}>
                    {date ? date.getDate() : ''}
                  </span>

                  {/* List of event chips */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto' }}>
                    {dayEvents.map((ev) => {
                      if (!ev) return null
                      const info = EVENT_TYPE_INFO[ev.event_type] || EVENT_TYPE_INFO.custom || {
                        label: 'فعالية',
                        icon: 'fa-calendar',
                        color: 'var(--cp-text-muted)',
                        bg: 'rgba(100, 116, 139, 0.1)'
                      }
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation() // Block parent div click
                            openEditModal(ev)
                          }}
                          style={{
                            background: info.bg,
                            borderLeft: `3px solid ${info.color}`,
                            padding: '4px 6px',
                            borderRadius: 4,
                            fontSize: '0.75rem',
                            color: 'var(--cp-text-main)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                          }}
                          title={`${info.label}: ${ev.title}`}
                        >
                          <i className={`fas ${info.icon}`} style={{ color: info.color }}></i>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Event Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--cp-overlay, rgba(15, 23, 42, 0.8))',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: 16,
          backdropFilter: 'blur(4px)'
        }}>
          <form onSubmit={handleSaveEvent} style={{
            background: 'var(--cp-card-bg)',
            border: '1px solid var(--cp-divider)',
            borderRadius: 20,
            maxWidth: 500,
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Head */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--cp-divider)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--cp-bg)'
            }}>
              <h3 style={{ margin: 0, color: 'var(--cp-text-main)', fontSize: '1.15rem', fontWeight: 'bold' }}>
                {editingEvent ? 'تعديل الفعالية المجدولة 📅' : 'إضافة فعالية جديدة للتقويم 📅'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--cp-text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Event Title */}
              <div>
                <label style={{ display: 'block', color: 'var(--cp-text-main)', fontSize: '0.85rem', marginBottom: 6 }}>عنوان الفعالية: *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="مثال: اختبار الشهر الأول، موعد المحاضرة..."
                  style={{
                    width: '100%',
                    background: 'var(--cp-bg)',
                    color: 'var(--cp-text-main)',
                    border: '1px solid var(--cp-card-border)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontFamily: 'Tajawal'
                  }}
                />
              </div>

              {/* Event Type */}
              <div>
                <label style={{ display: 'block', color: 'var(--cp-text-main)', fontSize: '0.85rem', marginBottom: 6 }}>نوع الفعالية:</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--cp-bg)',
                    color: 'var(--cp-text-main)',
                    border: '1px solid var(--cp-card-border)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontFamily: 'Tajawal'
                  }}
                >
                  {Object.entries(EVENT_TYPE_INFO).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              {/* Starts At */}
              <div>
                <label style={{ display: 'block', color: 'var(--cp-text-main)', fontSize: '0.85rem', marginBottom: 6 }}>وقت وموعد الفعالية: *</label>
                <input
                  type="datetime-local"
                  required
                  value={formStartsAt}
                  onChange={(e) => setFormStartsAt(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--cp-bg)',
                    color: 'var(--cp-text-main)',
                    border: '1px solid var(--cp-card-border)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontFamily: 'Tajawal'
                  }}
                />
              </div>

              {/* Grade */}
              <div>
                <label style={{ display: 'block', color: 'var(--cp-text-main)', fontSize: '0.85rem', marginBottom: 6 }}>المرحلة الدراسية المستهدفة:</label>
                <select
                  value={formGrade}
                  onChange={(e) => setFormGrade(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--cp-bg)',
                    color: 'var(--cp-text-main)',
                    border: '1px solid var(--cp-card-border)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontFamily: 'Tajawal'
                  }}
                >
                  {gradesList.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Target Group */}
              <div>
                <label style={{ display: 'block', color: 'var(--cp-text-main)', fontSize: '0.85rem', marginBottom: 6 }}>مجموعة مخصصة (اختياري):</label>
                <select
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--cp-bg)',
                    color: 'var(--cp-text-main)',
                    border: '1px solid var(--cp-card-border)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontFamily: 'Tajawal'
                  }}
                >
                  <option value="">كل المجموعات</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Bound Package */}
              <div>
                <label style={{ display: 'block', color: 'var(--cp-text-main)', fontSize: '0.85rem', marginBottom: 6 }}>ربط بباقة محددة (اختياري):</label>
                <select
                  value={formPackageId}
                  onChange={(e) => setFormPackageId(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--cp-bg)',
                    color: 'var(--cp-text-main)',
                    border: '1px solid var(--cp-card-border)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontFamily: 'Tajawal'
                  }}
                >
                  <option value="">لا توجد باقة محددة (مفتوح للجميع)</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Foot */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--cp-divider)',
              background: 'var(--cp-bg)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12
            }}>
              <div>
                {editingEvent && (
                  <button
                    type="button"
                    onClick={handleDeleteEvent}
                    className="cp-btn cp-btn-danger"
                    disabled={saving}
                    style={{ borderRadius: 10 }}
                  >
                    حذف الفعالية 🗑
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  style={{
                    borderRadius: 10,
                    padding: '0.55rem 1.4rem',
                    background: 'var(--cp-card-bg)',
                    color: 'var(--cp-text-main)',
                    border: '1px solid var(--cp-card-border)',
                    fontFamily: 'Tajawal, sans-serif',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="cp-btn cp-btn-success"
                  disabled={saving}
                  style={{ borderRadius: 10 }}
                >
                  {saving ? (
                    <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</>
                  ) : (
                    'حفظ الفعالية'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
