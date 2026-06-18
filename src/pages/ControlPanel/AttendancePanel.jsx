import React, { useState, useEffect, useRef, useMemo } from 'react'
import { listStudents } from '@backend/profilesApi'
import { listHomeworks } from '@backend/homeworksApi'
import { listAttendanceForSession, saveAttendanceBatch, listCustomAttendanceDates } from '@backend/attendanceApi'
import { useTenant } from '../../contexts/TenantContext'
import { useAuth } from '../../contexts/AuthContext'
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode'
import { cached, LIST_TTL } from '../../utils/cache'

export default function AttendancePanel({ onBack, flash }) {
  const { tenantId } = useTenant()
  const { user: currentUser } = useAuth()
  
  const [grade, setGrade] = useState('first-sec')
  const [group, setGroup] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  
  // Data loading states
  const [students, setStudents] = useState([])
  const [homeworksList, setHomeworksList] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState({})
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // QR scanner states
  const [showScanner, setShowScanner] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [recentScanName, setRecentScanName] = useState('')
  
  const scannerRef = useRef(null)
  const html5QrcodeRef = useRef(null)
  
  const [alwaysFocus, setAlwaysFocus] = useState(true)
  const scannerInputRef = useRef(null)
  const [scannerText, setScannerText] = useState('')
  const [cashierError, setCashierError] = useState('')
  const [cashierSuccess, setCashierSuccess] = useState('')
  const [scannerFocused, setScannerFocused] = useState(false)

  // Tabs and History States
  const [activeSubTab, setActiveSubTab] = useState('record') // 'record' | 'history'
  const [historyRecords, setHistoryRecords] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [customDatesList, setCustomDatesList] = useState([])

  // Format YYYY-MM-DD to include Arabic day name
  const formatCustomDateLabel = (dateStr) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
      const dayName = dayNames[d.getDay()]
      return `تاريخ ${dateStr} (${dayName})`
    } catch (e) {
      return dateStr
    }
  }

  // Map DB grade enum → Arabic label
  const GRADE_LABEL = {
    'first-prep':  'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep':  'الصف الثالث الإعدادي',
    'first-sec':   'الصف الأول الثانوي',
    'second-sec':  'الصف الثاني الثانوي',
    'third-sec':   'الصف الثالث الثانوي',
  }

  // Load students, sessions (homeworks), and custom saved dates for selected grade
  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      try {
        const [allStudents, allHomeworks, customDates] = await Promise.all([
          cached('students', LIST_TTL, listStudents),
          cached('homeworks', LIST_TTL, listHomeworks),
          listCustomAttendanceDates(grade)
        ])
        if (!active) return

        // Filter students by grade
        const filteredStudents = allStudents.filter(s => s.grade === grade && s.is_approved)
        setStudents(filteredStudents)

        // Filter homeworks by grade to use as sessions
        const filteredHomeworks = allHomeworks.filter(h => h.grade === grade)
        setHomeworksList(filteredHomeworks)
        
        // Set custom dates list
        setCustomDatesList(customDates)
        
        if (filteredHomeworks.length > 0) {
          setSessionId(filteredHomeworks[0].id)
        } else if (customDates.length > 0) {
          setSessionId(`custom-date:${customDates[0]}`)
        } else {
          setSessionId('custom')
        }
      } catch (err) {
        console.error(err)
        flash('فشل تحميل قائمة الطلاب أو الحصص', 'error')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [grade])

  // Load existing attendance for selected date/session
  useEffect(() => {
    if (students.length === 0) return
    let active = true
    ;(async () => {
      try {
        let activeSessionId = sessionId
        let activeDate = date
        
        if (sessionId.startsWith('custom-date:')) {
          activeSessionId = null
          activeDate = sessionId.split(':')[1]
        } else if (sessionId === 'custom') {
          activeSessionId = null
          activeDate = date
        }

        const records = await listAttendanceForSession(
          activeSessionId,
          activeSessionId ? null : activeDate
        )
        if (!active) return

        // Map existing attendance to student_id key
        const mapping = {}
        records.forEach(r => {
          mapping[r.student_id] = r.status
        })

        // Fill missing students with 'present' default
        const newRecords = {}
        students.forEach(s => {
          newRecords[s.id] = mapping[s.id] || 'present'
        })

        setAttendanceRecords(newRecords)
      } catch (err) {
        console.error(err)
      }
    })()
    return () => { active = false }
  }, [sessionId, date, students])

  // Load history records automatically when filters or active subtab changes
  useEffect(() => {
    if (activeSubTab !== 'history') return
    
    let active = true
    setHistoryLoading(true)
    ;(async () => {
      try {
        let activeSessionId = sessionId
        let activeDate = date
        
        if (sessionId.startsWith('custom-date:')) {
          activeSessionId = null
          activeDate = sessionId.split(':')[1]
        } else if (sessionId === 'custom') {
          activeSessionId = null
          activeDate = date
        }

        const records = await listAttendanceForSession(
          activeSessionId,
          activeSessionId ? null : activeDate
        )
        if (!active) return

        // Filter records by student grade and group
        const filtered = records.filter(r => {
          if (!r.profiles) return false
          const matchesGrade = r.profiles.grade === grade
          const matchesGroup = group ? r.profiles.group === group : true
          return matchesGrade && matchesGroup
        })

        setHistoryRecords(filtered)
      } catch (err) {
        console.error(err)
        flash('فشل تحميل سجلات الحضور السابقة', 'error')
      } finally {
        if (active) setHistoryLoading(false)
      }
    })()

    return () => { active = false }
  }, [activeSubTab, grade, group, sessionId, date])

  // Calculate history stats
  const historyStats = useMemo(() => {
    const total = historyRecords.length
    const present = historyRecords.filter(r => r.status === 'present').length
    const absent = historyRecords.filter(r => r.status === 'absent').length
    const late = historyRecords.filter(r => r.status === 'late').length
    const excused = historyRecords.filter(r => r.status === 'excused').length
    
    // total marked = present + absent + late
    const totalMarked = present + absent + late
    const rate = totalMarked > 0 ? Math.round(((present + late) / totalMarked) * 100) : 100
    
    return { total, present, absent, late, excused, rate }
  }, [historyRecords])

  // Filter history records by search query
  const searchedHistoryRecords = useMemo(() => {
    return historyRecords.filter(r => {
      if (!historySearchQuery.trim()) return true
      const name = r.profiles?.name || ''
      return name.toLowerCase().includes(historySearchQuery.toLowerCase())
    })
  }, [historyRecords, historySearchQuery])

  // Print history function
  const handlePrintHistory = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    let sessionTitle = ''
    if (sessionId.startsWith('custom-date:')) {
      const targetDate = sessionId.split(':')[1]
      sessionTitle = formatCustomDateLabel(targetDate)
    } else if (sessionId === 'custom') {
      sessionTitle = `حصة تاريخ ${date}`
    } else {
      const activeSession = homeworksList.find(h => h.id === sessionId)
      sessionTitle = activeSession ? activeSession.title : ''
    }

    const gradeText = GRADE_LABEL[grade] || grade
    const groupText = group ? `المجموعة ${group}` : 'جميع المجموعات'

    const statusText = {
      'present': 'حاضر',
      'absent': 'غائب',
      'late': 'متأخر',
      'excused': 'مُعذر'
    }

    const rowsHtml = searchedHistoryRecords.map((r, idx) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${r.profiles?.name || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${r.profiles?.group || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; direction: ltr;">${r.profiles?.phone || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${
          r.status === 'present' ? '#10b981' : r.status === 'absent' ? '#ef4444' : r.status === 'late' ? '#f59e0b' : '#7c3aed'
        }">${statusText[r.status] || r.status}</td>
      </tr>
    `).join('')

    const htmlContent = `
      <html dir="rtl">
        <head>
          <title>كشف الحضور - ${sessionTitle}</title>
          <style>
            body { font-family: 'Tajawal', Arial, sans-serif; padding: 20px; color: #333; }
            h1 { text-align: center; font-size: 20px; margin-bottom: 5px; }
            h2 { text-align: center; font-size: 14px; color: #666; margin-top: 0; margin-bottom: 25px; }
            .stats-container { display: flex; justify-content: space-around; margin-bottom: 25px; padding: 15px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
            .stat-box { text-align: center; }
            .stat-val { font-size: 16px; font-weight: bold; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #f1f5f9; padding: 12px 10px; border: 1px solid #ddd; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <h1>كشف حضور الطلاب - منصة مسار</h1>
          <h2>${gradeText} | ${sessionTitle} | ${groupText}</h2>
          
          <div class="stats-container">
            <div class="stat-box">إجمالي الطلاب<div class="stat-val">${historyStats.total}</div></div>
            <div class="stat-box" style="color: #10b981;">حاضر<div class="stat-val">${historyStats.present}</div></div>
            <div class="stat-box" style="color: #ef4444;">غائب<div class="stat-val">${historyStats.absent}</div></div>
            <div class="stat-box" style="color: #f59e0b;">متأخر<div class="stat-val">${historyStats.late}</div></div>
            <div class="stat-box" style="color: #8b5cf6;">معذر<div class="stat-val">${historyStats.excused}</div></div>
            <div class="stat-box">نسبة الحضور<div class="stat-val">${historyStats.rate}%</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>اسم الطالب</th>
                <th style="width: 100px;">المجموعة</th>
                <th style="width: 150px;">رقم الهاتف</th>
                <th style="width: 120px;">حالة الحضور</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `

    printWindow.document.write(htmlContent)
    printWindow.document.close()
  }

  // Bulk status triggers
  const setAllStatus = (status) => {
    const next = {}
    students.forEach(s => {
      if (!group || s.group === group) {
        next[s.id] = status
      } else {
        next[s.id] = attendanceRecords[s.id] || 'present'
      }
    })
    setAttendanceRecords(next)
  }

  const handleStatusChange = (studentId, status) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: status
    }))
  }

  // Play a premium self-contained success beep sound
  const playSuccessBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      
      osc.frequency.setValueAtTime(600, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(850, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
      
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } catch (e) {
      console.error(e)
    }
  }

  // Submit attendance records
  const handleSaveAttendance = async () => {
    setSaving(false)
    
    // Find active session title
    let sessionTitle = ''
    let activeSessionId = sessionId
    let activeDate = date
    
    if (sessionId.startsWith('custom-date:')) {
      activeSessionId = null
      activeDate = sessionId.split(':')[1]
      sessionTitle = formatCustomDateLabel(activeDate)
    } else if (sessionId === 'custom') {
      activeSessionId = null
      activeDate = date
      sessionTitle = `حصة تاريخ ${date}`
    } else {
      const activeSession = homeworksList.find(h => h.id === sessionId)
      sessionTitle = activeSession ? activeSession.title : ''
    }

    const payload = students.map(s => ({
      student_id: s.id,
      student_name: s.name,
      parent_phone: s.parent_phone,
      session_id: activeSessionId,
      date: activeSessionId ? new Date().toISOString().split('T')[0] : activeDate,
      status: attendanceRecords[s.id] || 'present',
      created_by: currentUser?.id
    }))

    setSaving(true)
    try {
      await saveAttendanceBatch(payload, sessionTitle)
      flash('تم حفظ الحضور وقائمة الغياب بنجاح، وجاري إرسال إشعارات أولياء الأمور.', 'success')
      
      // Refresh custom dates
      if (sessionId === 'custom' || sessionId.startsWith('custom-date:')) {
        const customDates = await listCustomAttendanceDates(grade)
        setCustomDatesList(customDates)
      }
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء حفظ التحضير: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Play warning beep sound
  const playWarningBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(150, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.25)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25)
      
      osc.start()
      osc.stop(ctx.currentTime + 0.25)
    } catch (e) {
      console.error(e)
    }
  }

  // QR scanning logic
  const handleQrScanned = async (text, isCashier = false) => {
    if (!text) return
    
    try {
      // Expected QR Format: student_id,tenant_id,qr_token
      const parts = text.split(',')
      if (parts.length < 3) {
        throw new Error('الرمز الممسوح غير صالح لتسجيل الحضور')
      }

      const [scannedStudentId, scannedTenantId, scannedToken] = parts

      if (scannedTenantId !== tenantId) {
        throw new Error('هذا الطالب مسجل في منصة تعليمية أخرى')
      }

      // Check if student belongs in currently loaded list
      const targetStudent = students.find(s => s.id === scannedStudentId)
      if (!targetStudent) {
        throw new Error('الطالب الممسوح غير مدرج في هذه المرحلة الدراسية أو غير مفعل')
      }

      if (targetStudent.qr_token !== scannedToken) {
        throw new Error('رمز التحقق الخاص بالبطاقة غير صالح أو منتهي الصلاحية')
      }

      // Play sound indicator
      playSuccessBeep()

      // Mark student as present in local state
      handleStatusChange(scannedStudentId, 'present')
      
      if (isCashier) {
        setCashierSuccess(`تم تسجيل حضور: ${targetStudent.name}`)
        setTimeout(() => setCashierSuccess(''), 4000)
      } else {
        setRecentScanName(targetStudent.name)
        setTimeout(() => setRecentScanName(''), 4000)
      }

      // Instantly save this student's attendance in backend to prevent data loss
      let activeSessionId = sessionId
      let activeDate = date
      let sessionTitle = ''
      
      if (sessionId.startsWith('custom-date:')) {
        activeSessionId = null
        activeDate = sessionId.split(':')[1]
        sessionTitle = formatCustomDateLabel(activeDate)
      } else if (sessionId === 'custom') {
        activeSessionId = null
        activeDate = date
        sessionTitle = `حصة تاريخ ${date}`
      } else {
        const activeSession = homeworksList.find(h => h.id === sessionId)
        sessionTitle = activeSession ? activeSession.title : ''
      }

      await saveAttendanceBatch([{
        student_id: targetStudent.id,
        student_name: targetStudent.name,
        parent_phone: targetStudent.parent_phone,
        session_id: activeSessionId,
        date: activeSessionId ? new Date().toISOString().split('T')[0] : activeDate,
        status: 'present',
        created_by: currentUser?.id
      }], sessionTitle)

    } catch (err) {
      playWarningBeep()
      if (isCashier) {
        setCashierError(err.message || 'فشل قراءة الرمز')
        setTimeout(() => setCashierError(''), 5000)
      } else {
        setScannerError(err.message || 'فشل قراءة الرمز')
        setTimeout(() => setScannerError(''), 4000)
      }
    }
  }

  // Manual code entry check-in (simulates barcode scan)
  const handleManualCheckIn = () => {
    if (!manualCode.trim()) return
    handleQrScanned(manualCode.trim(), false)
    setManualCode('')
  }

  // Autofocus listener for Cashier Scanner
  useEffect(() => {
    if (!alwaysFocus) return

    // Auto-focus immediately
    if (scannerInputRef.current) {
      scannerInputRef.current.focus()
    }

    const handleGlobalClick = (e) => {
      // Don't hijack focus if clicking another input, select, textarea, button or elements inside buttons
      const target = e.target
      const tagName = target.tagName.toLowerCase()
      if (
        (tagName === 'input' && target !== scannerInputRef.current) ||
        tagName === 'select' ||
        tagName === 'textarea' ||
        tagName === 'button' ||
        target.closest('button') ||
        target.closest('select') ||
        target.closest('input')
      ) {
        return
      }

      if (scannerInputRef.current) {
        scannerInputRef.current.focus()
      }
    }

    document.addEventListener('click', handleGlobalClick)
    return () => {
      document.removeEventListener('click', handleGlobalClick)
    }
  }, [alwaysFocus])

  // Camera start / stop hook
  useEffect(() => {
    if (showScanner) {
      setScannerError('')
      
      const startScanner = async () => {
        try {
          const html5Qrcode = new Html5Qrcode("qr-camera-feed")
          html5QrcodeRef.current = html5Qrcode
          
          await html5Qrcode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: (width, height) => {
                const size = Math.min(width, height) * 0.7
                return { width: size, height: size }
              }
            },
            (decodedText) => {
              handleQrScanned(decodedText, false)
            },
            (errorMessage) => {
              // Silent camera scan frame failures (normal behavior)
            }
          )
        } catch (err) {
          console.error(err)
          setScannerError('فشل تشغيل كاميرا الهاتف. يرجى تفعيل الصلاحية أو استخدام الإدخال اليدوي.')
        }
      }
      
      startScanner()
    }
    
    return () => {
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current.stop()
          .then(() => {
            html5QrcodeRef.current = null
          })
          .catch(err => {
            console.error('Error stopping scanner:', err)
            html5QrcodeRef.current = null
          })
      }
    }
  }, [showScanner])

  const filteredStudentsList = group
    ? students.filter(s => s.group === group)
    : students

  return (
    <div className="cp-panel-container">
      
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>تسجيل حضور الطلاب والغياب</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>قم بتحضير الطلاب يدوياً أو باستخدام الباركود والـ QR</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {activeSubTab === 'record' && (
            <button 
              onClick={() => setShowScanner(true)}
              className="cp-btn cp-btn-info"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
            >
              <i className="fas fa-qrcode" />
              تسجيل حضور بالـ QR
            </button>
          )}
          <button onClick={onBack} className="cp-btn cp-btn-secondary">
            رجوع للوحة التحكم
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, margin: '0 0 24px 0', borderBottom: '1px solid var(--cp-divider)', paddingBottom: '12px' }}>
        <button
          className={`cp-btn ${activeSubTab === 'record' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          onClick={() => setActiveSubTab('record')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
        >
          <i className="fas fa-user-edit" />
          تسجيل حضور جديد
        </button>
        <button
          className={`cp-btn ${activeSubTab === 'history' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          onClick={() => setActiveSubTab('history')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
        >
          <i className="fas fa-clock-rotate-left" />
          سجلات الحضور السابقة
        </button>
      </div>

      {/* Class and Session Selectors */}
      <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>المرحلة الدراسية</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {Object.entries(GRADE_LABEL).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>تصفية بالمجموعة</label>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            <option value="">جميع المجموعات</option>
            <option value="A">المجموعة A</option>
            <option value="B">المجموعة B</option>
            <option value="C">المجموعة C</option>
            <option value="D">المجموعة D</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الحصة / الدرس</label>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {homeworksList.map(h => (
              <option key={h.id} value={h.id}>{h.title} ({h.week || 'درس'})</option>
            ))}
            {customDatesList.map(d => (
              <option key={d} value={`custom-date:${d}`}>{formatCustomDateLabel(d)}</option>
            ))}
            <option value="custom">تاريخ مخصص يدوياً (جديد)</option>
          </select>
        </div>

        {sessionId === 'custom' && (
          <div style={{ animation: 'cpFadeUp 0.3s ease' }}>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>تاريخ اليوم</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="cp-input" style={{ width: '100%' }} />
          </div>
        )}
      </div>

      {activeSubTab === 'record' ? (
        <>
          {/* Physical Cashier Scanner Control Panel */}
          <div 
            className={`cp-scanner-card ${scannerFocused ? 'is-focused' : ''} ${cashierError ? 'has-error' : ''} ${cashierSuccess ? 'has-success' : ''}`}
            style={{
              background: 'var(--cp-card-bg)',
              border: '1px solid var(--cp-card-border)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: 'var(--cp-card-shadow)',
              position: 'relative',
              transition: 'all 0.3s ease',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div 
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}
                >
                  <i className="fas fa-barcode" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    قارئ الباركود المكتبي (كاشير)
                    <span 
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: scannerFocused ? '#10b981' : '#64748b',
                        boxShadow: scannerFocused ? '0 0 8px #10b981' : 'none',
                        display: 'inline-block',
                        transition: 'all 0.3s ease'
                      }} 
                      title={scannerFocused ? "القارئ نشط وجاهز للمسح" : "القارئ غير نشط"}
                    />
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '2px 0 0' }}>
                    قم بتوصيل جهاز القارئ بالـ USB، وسيقوم بتسجيل الحضور تلقائياً بمجرد مسح بطاقة الطالب.
                  </p>
                </div>
              </div>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', color: 'var(--cp-text-muted)' }}>
                <input 
                  type="checkbox" 
                  checked={alwaysFocus} 
                  onChange={(e) => setAlwaysFocus(e.target.checked)} 
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    border: '1px solid var(--cp-input-border)',
                    accentColor: '#10b981',
                    cursor: 'pointer'
                  }}
                />
                التركيز التلقائي المستمر للقارئ
              </label>
            </div>

            <div style={{ position: 'relative' }}>
              <input 
                ref={scannerInputRef}
                type="text" 
                value={scannerText}
                onChange={(e) => setScannerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQrScanned(scannerText.trim(), true)
                    setScannerText('')
                  }
                }}
                onFocus={() => setScannerFocused(true)}
                onBlur={() => setScannerFocused(false)}
                placeholder="انقر هنا أو ابدأ المسح بالقارئ مباشرة..."
                className="cp-input"
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 44px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  borderRadius: '10px',
                  background: 'var(--cp-bg)',
                  color: 'var(--cp-text-main)',
                  border: '1px solid ' + (scannerFocused ? '#10b981' : 'var(--cp-input-border)'),
                  boxShadow: scannerFocused ? '0 0 0 3px rgba(16, 185, 129, 0.15)' : 'none',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                  direction: 'ltr'
                }}
              />
              <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: scannerFocused ? '#10b981' : '#64748b', transition: 'color 0.2s' }}>
                {scannerFocused ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-keyboard" />}
              </div>
            </div>

            {/* Scan Status Alerts */}
            {cashierSuccess && (
              <div 
                className="cp-scanner-success-alert"
                style={{
                  marginTop: '12px',
                  padding: '12px 16px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  animation: 'cpFadeUp 0.25s ease'
                }}
              >
                <i className="fas fa-check-circle" />
                <span>{cashierSuccess}</span>
              </div>
            )}

            {cashierError && (
              <div 
                className="cp-scanner-error-alert"
                style={{
                  marginTop: '12px',
                  padding: '12px 16px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  animation: 'cpFadeUp 0.25s ease'
                }}
              >
                <i className="fas fa-exclamation-triangle" />
                <span>{cashierError}</span>
              </div>
            )}
          </div>

          {/* Bulk status controls */}
          {students.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--cp-text-muted)', marginInlineEnd: '8px' }}>إجراءات جماعية للمرحلة:</span>
              <button onClick={() => setAllStatus('present')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.82rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981' }}>حاضر للكل</button>
              <button onClick={() => setAllStatus('absent')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.82rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>غائب للكل</button>
              <button onClick={() => setAllStatus('late')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.82rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>متأخر للكل</button>
            </div>
          )}

          {/* Students List Table */}
          {loading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تحميل قائمة طلاب المرحلة الدراسية...</p>
            </div>
          ) : filteredStudentsList.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-users-slash"></i>
              <p>لا يوجد طلاب مسجلين أو مفعلين في هذه المرحلة أو المجموعة</p>
            </div>
          ) : (
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)', marginBottom: '24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>اسم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold' }}>رقم الهاتف</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '90px' }}>المجموعة</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '380px', textAlign: 'center' }}>تسجيل حالة الحضور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudentsList.map((student) => {
                      const currentStatus = attendanceRecords[student.id] || 'present'
                      return (
                        <tr key={student.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)', transition: 'background 0.2s' }} className="table-row-hover">
                          <td style={{ padding: '14px 20px', fontWeight: 'bold' }}>{student.name}</td>
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{student.phone}</td>
                          <td style={{ padding: '14px' }}>
                            <span className="cp-id-pill">{student.group || '—'}</span>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            {/* Radio buttons group styled as pills */}
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleStatusChange(student.id, 'present')}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  border: '1px solid ' + (currentStatus === 'present' ? 'rgba(16, 185, 129, 0.3)' : 'var(--cp-card-border)'),
                                  background: currentStatus === 'present' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                                  color: currentStatus === 'present' ? '#10b981' : 'var(--cp-text-muted)'
                                }}
                              >
                                حاضر
                              </button>
                              
                              <button
                                onClick={() => handleStatusChange(student.id, 'absent')}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  border: '1px solid ' + (currentStatus === 'absent' ? 'rgba(239, 68, 68, 0.3)' : 'var(--cp-card-border)'),
                                  background: currentStatus === 'absent' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                  color: currentStatus === 'absent' ? '#ef4444' : 'var(--cp-text-muted)'
                                }}
                              >
                                غائب
                              </button>
                              
                              <button
                                onClick={() => handleStatusChange(student.id, 'late')}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  border: '1px solid ' + (currentStatus === 'late' ? 'rgba(245, 158, 11, 0.3)' : 'var(--cp-card-border)'),
                                  background: currentStatus === 'late' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                                  color: currentStatus === 'late' ? '#f59e0b' : 'var(--cp-text-muted)'
                                }}
                              >
                                متأخر
                              </button>
                              
                              <button
                                onClick={() => handleStatusChange(student.id, 'excused')}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  border: '1px solid ' + (currentStatus === 'excused' ? 'rgba(99, 102, 241, 0.3)' : 'var(--cp-card-border)'),
                                  background: currentStatus === 'excused' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                  color: currentStatus === 'excused' ? '#a78bfa' : 'var(--cp-text-muted)'
                                }}
                              >
                                مُعذر
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', borderTop: '1px solid var(--cp-divider)', background: 'var(--cp-list-header-bg)' }}>
                <button 
                  onClick={handleSaveAttendance} 
                  disabled={saving} 
                  className="cp-btn cp-btn-success"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontWeight: 'bold' }}
                >
                  {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                  <span>حفظ كشف التحضير وإرسال الإشعارات</span>
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* History Tab Content */
        <div style={{ animation: 'cpFadeUp 0.3s ease' }}>
          {/* Stats Row */}
          <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>الطلاب المسجلون</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: 'var(--cp-text-main)' }}>{historyStats.total}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #10b981', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 'bold' }}><i className="fas fa-circle-check" style={{ marginInlineEnd: '4px' }} />حاضر</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#10b981' }}>{historyStats.present}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #ef4444', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: 'bold' }}><i className="fas fa-circle-xmark" style={{ marginInlineEnd: '4px' }} />غائب</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#ef4444' }}>{historyStats.absent}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #f59e0b', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: 'bold' }}><i className="fas fa-clock" style={{ marginInlineEnd: '4px' }} />متأخر</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#f59e0b' }}>{historyStats.late}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #8b5cf6', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#8b5cf6', fontWeight: 'bold' }}><i className="fas fa-circle-minus" style={{ marginInlineEnd: '4px' }} />معذر</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#8b5cf6' }}>{historyStats.excused}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #06b6d4', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#06b6d4', fontWeight: 'bold' }}><i className="fas fa-chart-pie" style={{ marginInlineEnd: '4px' }} />نسبة الحضور</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#06b6d4' }}>{historyStats.rate}%</div>
            </div>
          </div>

          {/* Action and Search Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
              <input 
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="البحث باسم الطالب في الكشف..."
                className="cp-input"
                style={{ width: '100%', padding: '10px 16px 10px 40px', fontSize: '0.9rem' }}
              />
              <i className="fas fa-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)' }} />
            </div>

            {searchedHistoryRecords.length > 0 && (
              <button 
                onClick={handlePrintHistory}
                className="cp-btn cp-btn-info"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                <i className="fas fa-print" />
                طباعة الكشف الحالي
              </button>
            )}
          </div>

          {/* History Records Table */}
          {historyLoading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تحميل الكشف المحفوظ...</p>
            </div>
          ) : searchedHistoryRecords.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-clipboard-question"></i>
              <p>لا توجد سجلات حضور محفوظة مطابقة لخيارات التصفية</p>
            </div>
          ) : (
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)', marginBottom: '24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '60px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>اسم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '120px' }}>المجموعة</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '160px' }}>رقم الهاتف</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '150px', textAlign: 'center' }}>التاريخ</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '150px', textAlign: 'center' }}>حالة الحضور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchedHistoryRecords.map((record, index) => {
                      const status = record.status
                      const statusLabels = {
                        'present': 'حاضر',
                        'absent': 'غائب',
                        'late': 'متأخر',
                        'excused': 'مُعذر'
                      }
                      const statusColors = {
                        'present': { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)', color: '#10b981' },
                        'absent': { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)', color: '#ef4444' },
                        'late': { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b' },
                        'excused': { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.25)', color: '#8b5cf6' }
                      }
                      const colors = statusColors[status] || { bg: 'rgba(100, 116, 139, 0.1)', border: 'rgba(100, 116, 139, 0.2)', color: 'var(--cp-text-muted)' }
                      
                      return (
                        <tr key={record.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                          <td style={{ padding: '14px 20px', color: 'var(--cp-text-muted)', textAlign: 'center' }}>{index + 1}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 'bold' }}>{record.profiles?.name || '—'}</td>
                          <td style={{ padding: '14px' }}>
                            <span className="cp-id-pill">{record.profiles?.group || '—'}</span>
                          </td>
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{record.profiles?.phone || '—'}</td>
                          <td style={{ padding: '14px', textAlign: 'center', color: 'var(--cp-text-muted)' }}>{record.date}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 12px',
                              borderRadius: '999px',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              color: colors.color
                            }}>
                              {statusLabels[status] || status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QR scanner lightbox modal overlay */}
      {showScanner && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(12px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
          onClick={() => setShowScanner(false)}
        >
          <div 
            style={{
              maxWidth: '420px',
              width: '100%',
              background: 'var(--cp-card-bg)',
              border: '1px solid var(--cp-card-border)',
              borderRadius: '24px',
              padding: '28px',
              boxShadow: 'var(--cp-card-shadow)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button 
              onClick={() => setShowScanner(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'var(--cp-hover-bg)', border: 'none', color: 'var(--cp-text-muted)', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <i className="fas fa-times" />
            </button>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px', textAlign: 'center' }}>مسح بطاقات الطلاب (QR)</h3>

            {/* Scanner Feed Element */}
            <div 
              id="qr-camera-feed" 
              style={{ 
                width: '100%', 
                aspectRatio: '1', 
                borderRadius: '16px', 
                overflow: 'hidden', 
                background: '#090d16',
                border: '2px dashed var(--cp-card-border)',
                marginBottom: '16px',
                position: 'relative'
              }}
            >
              {/* Laser scanner guide beam */}
              <div 
                style={{ 
                  position: 'absolute', 
                  top: '10%', 
                  left: '10%', 
                  right: '10%', 
                  height: '2px', 
                  background: '#ef4444', 
                  boxShadow: '0 0 8px #ef4444', 
                  animation: 'scannerBeam 2.5s infinite linear',
                  zIndex: 10
                }} 
              />
            </div>

            {/* Visual scan indicators */}
            {recentScanName && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                padding: '10px 16px',
                borderRadius: '10px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '0.92rem',
                marginBottom: '16px',
                animation: 'cpFadeUp 0.2s ease'
              }}>
                <i className="fas fa-circle-check" style={{ marginInlineEnd: '6px' }}></i>
                تم تسجيل حضور الطالب: {recentScanName}
              </div>
            )}

            {scannerError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '10px 16px',
                borderRadius: '10px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '0.88rem',
                marginBottom: '16px',
                animation: 'cpFadeUp 0.2s ease'
              }}>
                <i className="fas fa-triangle-exclamation" style={{ marginInlineEnd: '6px' }}></i>
                {scannerError}
              </div>
            )}

            {/* Manual Check-in Backup */}
            <div style={{ borderTop: '1px solid var(--cp-divider)', paddingTop: '16px', marginTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>التحضير اليدوي البديل (أدخل رمز الباركود)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="معرّف الطالب أو الرمز الممسوح" 
                  className="cp-input" 
                  style={{ flex: 1 }}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualCheckIn()}
                />
                <button onClick={handleManualCheckIn} className="cp-btn cp-btn-info" style={{ padding: '8px 16px' }}>تحضير</button>
              </div>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--cp-text-muted)', textAlign: 'center', marginTop: '16px', margin: '16px 0 0', lineHeight: '1.4' }}>
              ضع رمز الاستجابة السريعة (QR) الخاص ببطاقة الطالب أمام الكاميرا للتسجيل الفوري.
            </p>
          </div>
        </div>
      )}

      {/* Scanner beam keyframes styling inline */}
      <style>{`
        @keyframes scannerBeam {
          0% { top: 10%; }
          50% { top: 90%; }
          100% { top: 10%; }
        }
        .table-row-hover:hover {
          background: var(--cp-hover-bg) !important;
        }
      `}</style>
    </div>
  )
}
