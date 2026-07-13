import React, { useState, useEffect, useRef, useMemo } from 'react'
import { listStudentsByGrade, getStudentIdentityByQr } from '@backend/profilesApi'
import { listSubscriptionFees, getStudentDiscount } from '@backend/paymentsApi'
import { listBranches } from '@backend/branchesApi'
import { listAcademicYears } from '@backend/academicYearsApi'
import { listGroups, bulkTransferStudents } from '@backend/groupsApi'
import { 
  listAttendanceSessions, 
  createAttendanceSession, 
  listAttendanceForSession, 
  saveAttendanceBatch,
  deleteAttendanceSession
} from '@backend/attendanceApi'
import { useTenant } from '../../contexts/TenantContext'
import { useAuth } from '../../contexts/AuthContext'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
// html5-qrcode (~200 kB) is loaded on demand when the camera scanner opens,
// so it stays out of the panel's initial bundle.
import { cached, LIST_TTL } from '../../utils/cache'
import StudentDetailsModal from '../../components/StudentDetailsModal'
import { GRADE_LABEL } from './shared'


export default function AttendancePanel({ onBack, flash }) {
  const { tenantId, gradesList } = useTenant()
  const { user: currentUser } = useAuth()
  
  // Scopes & Filters
  const [grade, setGrade] = useState(() => gradesList?.[0]?.id || 'first-sec')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Lists
  const [branches, setBranches] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [groups, setGroups] = useState([])
  const [sessions, setSessions] = useState([])
  const [students, setStudents] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState({})
  
  // Active session status
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split('T')[0])
  
  // Bulk Selection for transfers
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [transferTargetGroupId, setTransferTargetGroupId] = useState('')
  
  // Loading & Saving States
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingSession, setDeletingSession] = useState(false)
  const [showSessionDeleteConfirm, setShowSessionDeleteConfirm] = useState(false)
  // Monthly subscription fee per grade (for the "amount due" on scan).
  const [feesByGrade, setFeesByGrade] = useState({})
  useEffect(() => {
    listSubscriptionFees()
      .then(rows => setFeesByGrade(Object.fromEntries((rows || []).map(r => [r.grade, Number(r.amount) || 0]))))
      .catch(() => {})
  }, [])
  
  // QR scanner states
  const [showScanner, setShowScanner] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [autoCheckIn, setAutoCheckIn] = useState(true)
  const [scannedStudent, setScannedStudent] = useState(null)
  
  // Barcode / cashier scanner state
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

  const html5QrcodeRef = useRef(null)



  // Play audio beeps
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

  // Distinct triple "bell" chime for a scanned student who hasn't paid this
  // month — clearly different from the single success beep (safe student) and
  // from the harsh warning buzz (errors), so the cashier hears "should pay".
  const playPaymentDueBell = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ;[0, 0.18, 0.36].forEach((t) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(1000, ctx.currentTime + t)
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t)
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15)
        osc.start(ctx.currentTime + t)
        osc.stop(ctx.currentTime + t + 0.16)
      })
    } catch (e) {
      console.error(e)
    }
  }

  // 1. Initial Load of Metadata (Branches, Years, Groups)
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [branchesList, yearsList, groupsList] = await Promise.all([
          listBranches(),
          listAcademicYears(),
          listGroups()
        ])
        if (!active) return

        setBranches(branchesList)
        setAcademicYears(yearsList)
        setGroups(groupsList)

        if (branchesList.length > 0) setSelectedBranchId(branchesList[0].id)
        
        const activeYear = yearsList.find(y => y.is_active)
        if (activeYear) {
          setSelectedAcademicYearId(activeYear.id)
        } else if (yearsList.length > 0) {
          setSelectedAcademicYearId(yearsList[0].id)
        }
      } catch (err) {
        console.error('Failed to load branches, years, or groups:', err)
        flash('فشل تحميل البيانات الأساسية', 'error')
      }
    })()
    return () => { active = false }
  }, [])

  // 2. Fetch Sessions and Students when grade or branch changes
  useEffect(() => {
    let active = true
    if (!selectedAcademicYearId) return
    setLoading(true)
    setSearchQuery('') // Reset active search query when grade/branch changes
    ;(async () => {
      try {
        const [allStudents, sessionsList] = await Promise.all([
          cached(`students:grade:${grade}`, LIST_TTL, () => listStudentsByGrade(grade)),
          listAttendanceSessions(grade, selectedBranchId || null)
        ])
        if (!active) return

        // Students are already scoped to this grade server-side; apply the
        // remaining branch / academic-year / approval filters client-side.
        const filtered = allStudents.filter(s =>
          s.is_approved &&
          (!selectedBranchId || s.branch_id === selectedBranchId) &&
          (!selectedAcademicYearId || s.academic_year_id === selectedAcademicYearId || !s.academic_year_id)
        )
        setStudents(filtered)
        setSessions(sessionsList)

        if (sessionsList.length > 0) {
          setSelectedSessionId(sessionsList[0].id)
        } else {
          setSelectedSessionId('new')
        }
      } catch (err) {
        console.error(err)
        flash('فشل تحميل قائمة الطلاب أو الحصص', 'error')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [grade, selectedBranchId, selectedAcademicYearId])

  // 3. Load existing attendance records for the selected session
  useEffect(() => {
    if (!selectedSessionId || selectedSessionId === 'new') {
      const defaults = {}
      students.forEach(s => {
        defaults[s.id] = 'absent'
      })
      setAttendanceRecords(defaults)
      return
    }
    let active = true
    ;(async () => {
      try {
        const records = await listAttendanceForSession(selectedSessionId)
        if (!active) return

        const mapping = {}
        const extraStudents = []
        records.forEach(r => {
          mapping[r.student_id] = r.status
          if (r.profiles && !students.some(s => s.id === r.student_id)) {
            extraStudents.push({
              id: r.student_id,
              name: r.profiles.name,
              phone: r.profiles.phone,
              parent_phone: r.profiles.parent_phone,
              grade: r.profiles.grade,
              group: r.profiles.group || ''
            })
          }
        })

        if (extraStudents.length > 0) {
          setStudents(prev => {
            const next = [...prev]
            extraStudents.forEach(es => {
              if (!next.some(s => s.id === es.id)) {
                next.push(es)
              }
            })
            return next
          })
        }

        const nextRecords = {}
        const allCurrentStudents = [...students, ...extraStudents]
        allCurrentStudents.forEach(s => {
          nextRecords[s.id] = mapping[s.id] || 'absent'
        })
        setAttendanceRecords(nextRecords)
      } catch (err) {
        console.error(err)
      }
    })()
    return () => { active = false }
  }, [selectedSessionId, students])

  // 4. Load history when SubTab changes to 'history'
  useEffect(() => {
    if (activeSubTab !== 'history' || !selectedSessionId || selectedSessionId === 'new') return
    let active = true
    setHistoryLoading(true)
    ;(async () => {
      try {
        const records = await listAttendanceForSession(selectedSessionId)
        if (!active) return
        setHistoryRecords(records)
      } catch (err) {
        console.error(err)
        flash('فشل تحميل سجلات الحضور السابقة', 'error')
      } finally {
        if (active) setHistoryLoading(false)
      }
    })()
    return () => { active = false }
  }, [activeSubTab, selectedSessionId])

  // Filter student list by Group and Search Query (name or phone number)
  const filteredStudentsList = useMemo(() => {
    let list = students
    
    // 1. Group Filter
    if (selectedGroupId) {
      const targetGroup = groups.find(g => g.id === selectedGroupId)
      if (targetGroup) {
        list = list.filter(s => {
          // Always show if student is explicitly marked present/late/excused in this session
          if (attendanceRecords[s.id] && attendanceRecords[s.id] !== 'absent') return true
          if (s.group === targetGroup.name) return true
          if (s.student_groups && s.student_groups.some(sg => sg.group_id === selectedGroupId)) return true
          return false
        })
      }
    }
    
    // 2. Search Query Filter (name, phone, or parent_phone)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(s => {
        const nameMatch = s.name ? s.name.toLowerCase().includes(q) : false
        const phoneMatch = s.phone ? s.phone.includes(q) : false
        const parentPhoneMatch = s.parent_phone ? s.parent_phone.includes(q) : false
        return nameMatch || phoneMatch || parentPhoneMatch
      })
    }
    
    return list
  }, [students, selectedGroupId, groups, attendanceRecords, searchQuery])

  // Merged history records: every student in the current group/class merged with their database attendance record
  const mergedHistoryRecords = useMemo(() => {
    const recordMap = {}
    historyRecords.forEach(r => {
      recordMap[r.student_id] = r
    })

    return filteredStudentsList.map(s => {
      if (recordMap[s.id]) {
        return recordMap[s.id]
      }
      return {
        id: `dummy-${s.id}`,
        student_id: s.id,
        status: 'absent',
        notes: '',
        profiles: s
      }
    })
  }, [filteredStudentsList, historyRecords])

  // Computed history stats
  const historyStats = useMemo(() => {
    const total = mergedHistoryRecords.length
    const present = mergedHistoryRecords.filter(r => r.status === 'present').length
    const absent = mergedHistoryRecords.filter(r => r.status === 'absent').length
    const late = mergedHistoryRecords.filter(r => r.status === 'late').length
    const excused = mergedHistoryRecords.filter(r => r.status === 'excused').length
    const totalMarked = present + absent + late
    const rate = totalMarked > 0 ? Math.round(((present + late) / totalMarked) * 100) : 100
    return { total, present, absent, late, excused, rate }
  }, [mergedHistoryRecords])

  const searchedHistoryRecords = useMemo(() => {
    return mergedHistoryRecords.filter(r => {
      if (!historySearchQuery.trim()) return true
      const name = r.profiles?.name || ''
      return name.toLowerCase().includes(historySearchQuery.toLowerCase())
    })
  }, [mergedHistoryRecords, historySearchQuery])

  // Filter sessions by selected group (or general sessions if no group is selected)
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (selectedGroupId) {
        return s.group_id === selectedGroupId
      } else {
        return s.group_id === null
      }
    })
  }, [sessions, selectedGroupId])

  // Automatically select the first available filtered session if current selectedSessionId is no longer in list
  useEffect(() => {
    if (selectedSessionId === 'new') return
    const exists = filteredSessions.some(s => s.id === selectedSessionId)
    if (!exists) {
      if (filteredSessions.length > 0) {
        setSelectedSessionId(filteredSessions[0].id)
      } else {
        setSelectedSessionId('new')
      }
    }
  }, [filteredSessions, selectedSessionId])

  // Bulk status change
  const setAllStatus = (status) => {
    const next = { ...attendanceRecords }
    filteredStudentsList.forEach(s => {
      next[s.id] = status
    })
    setAttendanceRecords(next)
  }

  const handleStatusChange = (studentId, status) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: status
    }))
  }

  // Create a new attendance session inline
  const handleCreateSessionSubmit = async (e) => {
    e.preventDefault()
    if (!newSessionTitle.trim()) return
    setIsCreatingSession(true)
    try {
      const session = await createAttendanceSession({
        title: newSessionTitle.trim(),
        date: newSessionDate,
        branchId: selectedBranchId,
        academicYearId: selectedAcademicYearId,
        groupId: selectedGroupId || null,
        grade,
        createdBy: currentUser?.id
      })
      flash('تم إنشاء الحصة بنجاح', 'success')
      setNewSessionTitle('')
      
      // Refresh sessions
      const sessionsList = await listAttendanceSessions(grade, selectedBranchId || null)
      setSessions(sessionsList)
      setSelectedSessionId(session.id)
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء إنشاء الحصة: ' + err.message, 'error')
    } finally {
      setIsCreatingSession(false)
    }
  }

  // Delete the selected session
  const handleDeleteSession = async () => {
    if (!selectedSessionId || selectedSessionId === 'new') return
    setShowSessionDeleteConfirm(false)

    setDeletingSession(true)
    try {
      await deleteAttendanceSession(selectedSessionId)
      flash('تم حذف الحصة وجميع سجلات الحضور المرتبطة بها بنجاح', 'success')
      
      // Refresh the sessions list
      const sessionsList = await listAttendanceSessions(grade, selectedBranchId || null)
      setSessions(sessionsList)
      
      // Reset selectedSessionId to the first session in the updated list or 'new'
      if (sessionsList.length > 0) {
        setSelectedSessionId(sessionsList[0].id)
      } else {
        setSelectedSessionId('new')
      }

      // Clear history records
      setHistoryRecords([])
    } catch (err) {
      console.error(err)
      flash('فشل حذف الحصة: ' + err.message, 'error')
    } finally {
      setDeletingSession(false)
    }
  }

  // Save current attendance sheet
  const handleSaveAttendance = async () => {
    if (!selectedSessionId || selectedSessionId === 'new') {
      flash('يرجى إنشاء حصة أو اختيار حصة مسجلة لحفظ التحضير', 'warning')
      return
    }

    const currentSession = sessions.find(s => s.id === selectedSessionId)
    const sessionTitle = currentSession ? currentSession.title : 'حصة دراسية'

    const payload = filteredStudentsList.map(s => ({
      student_id: s.id,
      student_name: s.name,
      parent_phone: s.parent_phone,
      session_id: selectedSessionId,
      status: attendanceRecords[s.id] || 'absent',
      notes: '',
      created_by: currentUser?.id
    }))

    setSaving(true)
    try {
      await saveAttendanceBatch(payload, sessionTitle)
      flash('تم حفظ الحضور بنجاح وجاري إرسال إشعارات أولياء الأمور عبر الـ queue.', 'success')
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء حفظ التحضير: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // QR card validation and display
  const handleQrScanned = async (text, isCashier = false) => {
    if (!text) return
    try {
      // Decode QR token (Format: student_id,tenant_id,qr_token OR just token)
      let scannedToken = text.trim()
      if (text.includes(',')) {
        const parts = text.split(',')
        if (parts.length >= 3) {
          scannedToken = parts[2].trim()
        }
      }

      // Fetch student details from the single DB RPC lookup
      const studentData = await getStudentIdentityByQr(scannedToken, tenantId)
      if (!studentData) {
        throw new Error('لم يتم العثور على طالب مطابق لهذا الباركود أو البطاقة')
      }

      // Compute the REAL monthly amount due: paid this calendar month -> 0,
      // otherwise max(0, grade fee - this student's exception discount).
      const lastPayIso = studentData.last_payment?.created_at
      const paidThisMonth = (() => {
        if (!lastPayIso) return false
        const d = new Date(lastPayIso), now = new Date()
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })()
      const monthlyFee = Number(feesByGrade[studentData.grade]) || 0
      let discount = 0
      try { discount = Number(await getStudentDiscount(studentData.student_id)) || 0 } catch { discount = 0 }
      studentData.monthly_fee = monthlyFee
      studentData.discount = discount
      studentData.paid_this_month = paidThisMonth
      studentData.amount_due = paidThisMonth ? 0 : Math.max(0, monthlyFee - discount)

      // Payment-aware scan chime: paid this month -> default success beep (safe);
      // otherwise the distinct triple bell so the cashier knows he should pay.
      if (paidThisMonth) playSuccessBeep()
      else playPaymentDueBell()

      const isDifferentGrade = studentData.grade !== grade
      const isOnlineStudent = studentData.enrollment_type === 'ONLINE'

      if (autoCheckIn && selectedSessionId && selectedSessionId !== 'new') {
        if (isOnlineStudent) {
          playWarningBeep()
          flash(`لا يمكن تحضير ${studentData.name} — الطالب مشترك أونلاين فقط وليس ضمن نظام حضور السنتر`, 'error')
          // Open details modal to show error
          setScannedStudent(studentData)
          return
        }
        if (isDifferentGrade) {
          playWarningBeep()
          flash(`لا يمكن تحضير ${studentData.name} تلقائياً لأنه ينتمي لصف دراسي مختلف`, 'error')
          // Open details modal to show error
          setScannedStudent(studentData)
          return
        }

        // Automatically check-in student to session
        setStudents(prev => {
          if (prev.some(s => s.id === studentData.student_id)) return prev
          return [...prev, {
            id: studentData.student_id,
            name: studentData.name,
            phone: studentData.phone,
            parent_phone: studentData.parent_phone,
            grade: studentData.grade,
            group: studentData.group_name
          }]
        })

        handleStatusChange(studentData.student_id, 'present')
        
        const currentSession = sessions.find(s => s.id === selectedSessionId)
        const sessionTitle = currentSession ? currentSession.title : 'حصة دراسية'

        await saveAttendanceBatch([{
          student_id: studentData.student_id,
          student_name: studentData.name,
          parent_phone: studentData.parent_phone,
          session_id: selectedSessionId,
          status: 'present',
          notes: 'حضر عن طريق مسح الكارت الذكي',
          created_by: currentUser?.id
        }], sessionTitle)

        if (isCashier) {
          setCashierSuccess(`تم تسجيل حضور: ${studentData.name}`)
          setTimeout(() => setCashierSuccess(''), 4000)
        }
      }

      // Open details modal
      setScannedStudent(studentData)

    } catch (err) {
      playWarningBeep()
      if (isCashier) {
        setCashierError(err.message || 'رمز البطاقة غير صالح')
        setTimeout(() => setCashierError(''), 5000)
      } else {
        setScannerError(err.message || 'رمز البطاقة غير صالح')
        setTimeout(() => setScannerError(''), 4000)
      }
    }
  }

  const handleManualCheckIn = () => {
    if (!manualCode.trim()) return
    handleQrScanned(manualCode.trim(), false)
    setManualCode('')
  }

  // Handle bulk group transfer operations
  const handleBulkTransferSubmit = async () => {
    if (selectedStudentIds.length === 0) {
      flash('يرجى تحديد طالب واحد على الأقل لإجراء النقل الجماعي', 'warning')
      return
    }
    if (!transferTargetGroupId) {
      flash('يرجى تحديد المجموعة المستهدفة للنقل', 'warning')
      return
    }

    try {
      await bulkTransferStudents(selectedStudentIds, transferTargetGroupId, tenantId)
      flash('تم إجراء النقل الجماعي لجميع الطلاب المحددين بنجاح', 'success')
      setSelectedStudentIds([])
      setTransferTargetGroupId('')
      
      // Refresh student list cache (this grade only)
      invalidateCache(`students:grade:${grade}`)
      const allStudents = await listStudentsByGrade(grade)
      const filtered = allStudents.filter(s =>
        s.is_approved &&
        (!selectedBranchId || s.branch_id === selectedBranchId) &&
        (!selectedAcademicYearId || s.academic_year_id === selectedAcademicYearId || !s.academic_year_id)
      )
      setStudents(filtered)
    } catch (err) {
      console.error(err)
      flash('فشل نقل الطلاب جماعياً: ' + err.message, 'error')
    }
  }

  // Autofocus desktop scanner
  useEffect(() => {
    if (!alwaysFocus) return
    if (scannerInputRef.current) {
      scannerInputRef.current.focus()
    }
    const handleGlobalClick = (e) => {
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
    return () => document.removeEventListener('click', handleGlobalClick)
  }, [alwaysFocus])

  // Camera QR/Barcode scanner start/stop
  useEffect(() => {
    if (showScanner) {
      setScannerError('')
      const startScanner = async () => {
        try {
          const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
          if (!showScanner) return
          const html5Qrcode = new Html5Qrcode("qr-camera-feed")
          html5QrcodeRef.current = html5Qrcode
          await html5Qrcode.start(
            { facingMode: "environment" },
            {
              fps: 15,
              qrbox: (w, h) => {
                const width = Math.min(w, h) * 0.8
                const height = Math.min(w, h) * 0.45
                return { width, height }
              },
              formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13
              ]
            },
            (decodedText) => {
              handleQrScanned(decodedText, false)
            },
            () => {}
          )
        } catch (err) {
          console.error(err)
          setScannerError('فشل فتح الكاميرا. تأكد من صلاحية الإذن.')
        }
      }
      startScanner()
    }
    return () => {
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current.stop()
          .then(() => { html5QrcodeRef.current = null })
          .catch(() => { html5QrcodeRef.current = null })
      }
    }
  }, [showScanner])

  const toggleStudentSelection = (studentId) => {
    setSelectedStudentIds(prev => 
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    )
  }

  const toggleAllStudentsSelection = () => {
    if (selectedStudentIds.length === filteredStudentsList.length) {
      setSelectedStudentIds([])
    } else {
      setSelectedStudentIds(filteredStudentsList.map(s => s.id))
    }
  }

  const handlePrintHistory = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const session = sessions.find(s => s.id === selectedSessionId)
    const sessionTitle = session ? session.title : 'حصة دراسية'
    const statusLabels = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'مُعذر' }

    const rowsHtml = searchedHistoryRecords.map((r, idx) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${r.profiles?.name || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${r.profiles?.group || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; direction: ltr;">${r.profiles?.phone || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${
          r.status === 'present' ? '#10b981' : r.status === 'absent' ? '#ef4444' : r.status === 'late' ? '#f59e0b' : '#7c3aed'
        }">${statusLabels[r.status] || r.status}</td>
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
          <h2>${GRADE_LABEL[grade] || grade} | ${sessionTitle}</h2>
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
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `
    printWindow.document.write(htmlContent)
    printWindow.document.close()
  }

  return (
    <div className="cp-panel-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>تسجيل حضور الطلاب والغياب</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>قم بتحضير الطلاب يدوياً أو باستخدام الباركود</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onBack} className="cp-btn cp-btn-secondary">
            رجوع للوحة التحكم
          </button>
        </div>
      </div>

      {/* Sub Tab Switcher */}
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

      {/* Scopes & Selectors Grid */}
      <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الفرع</label>
          <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>العام الدراسي</label>
          <select value={selectedAcademicYearId} onChange={(e) => setSelectedAcademicYearId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {academicYears.map(y => (
              <option key={y.id} value={y.id}>{y.name} {y.is_active ? '(الحالي)' : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>المرحلة الدراسية</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {gradesList.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>المجموعة</label>
          <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            <option value="">جميع المجموعات</option>
            {groups.filter(g => g.grade === grade && (!selectedBranchId || g.branch_id === selectedBranchId)).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>البحث عن طالب</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="الاسم أو الهاتف..."
            className="cp-input"
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الحصة / الدرس</label>
          <select value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {filteredSessions.map(s => (
              <option key={s.id} value={s.id}>{s.title} ({s.date})</option>
            ))}
            <option value="new">+ إنشاء حصة دراسية جديدة</option>
          </select>
        </div>
      </div>

      {/* Inline Session Creation Form */}
      {selectedSessionId === 'new' && (
        <form onSubmit={handleCreateSessionSubmit} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', marginBottom: '24px', animation: 'cpFadeUp 0.2s ease' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 'bold' }}>إنشاء حصة حضور جديدة</h4>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>اسم الحصة / المحاضرة</label>
              <input 
                type="text" 
                value={newSessionTitle} 
                onChange={(e) => setNewSessionTitle(e.target.value)} 
                placeholder="مثال: مراجعة الباب الأول، الأسبوع الثاني..." 
                className="cp-input" 
                style={{ width: '100%' }}
                required 
              />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>التاريخ</label>
              <input 
                type="date" 
                value={newSessionDate} 
                onChange={(e) => setNewSessionDate(e.target.value)} 
                className="cp-input" 
                style={{ width: '100%' }}
                required 
              />
            </div>
            <button type="submit" disabled={isCreatingSession} className="cp-btn cp-btn-success" style={{ padding: '10px 24px', fontWeight: 'bold' }}>
              {isCreatingSession ? 'جاري الإنشاء...' : 'إنشاء وتفعيل الحصة'}
            </button>
          </div>
        </form>
      )}

      {activeSubTab === 'record' ? (
        <>
          {/* Barcode Cashier Check-in */}
          <div 
            className={`cp-scanner-card ${scannerFocused ? 'is-focused' : ''} ${cashierError ? 'has-error' : ''} ${cashierSuccess ? 'has-success' : ''}`}
            style={{
              background: 'var(--cp-card-bg)',
              border: '1px solid ' + (scannerFocused ? '#10b981' : 'var(--cp-card-border)'),
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: 'var(--cp-card-shadow)',
              position: 'relative',
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                  <i className="fas fa-barcode" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    قارئ الباركود والبطاقات الذكية المكتبي
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: scannerFocused ? '#10b981' : '#64748b', boxShadow: scannerFocused ? '0 0 8px #10b981' : 'none' }} />
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '2px 0 0' }}>
                    قم بتوصيل القارئ بالـ USB ومسح بطاقة الطالب. سيتم تسجيل حضوره وعرض بياناته فوراً.
                  </p>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={autoCheckIn} onChange={(e) => setAutoCheckIn(e.target.checked)} style={{ accentColor: '#10b981' }} />
                  تسجيل حضور تلقائي عند المسح
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={alwaysFocus} onChange={(e) => setAlwaysFocus(e.target.checked)} style={{ accentColor: '#10b981' }} />
                  التركيز التلقائي المستمر
                </label>
              </div>
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
                placeholder="انقر هنا لبدء المسح بالباركود مباشرة..."
                className="cp-input"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  borderRadius: '10px',
                  background: 'var(--cp-bg)',
                  border: '1px solid ' + (scannerFocused ? '#10b981' : 'var(--cp-input-border)'),
                  textAlign: 'center',
                  direction: 'ltr'
                }}
              />
            </div>

            {cashierSuccess && (
              <div style={{ marginTop: '12px', padding: '10px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 'bold' }}>
                <i className="fas fa-check-circle" style={{ marginInlineEnd: '6px' }} />
                {cashierSuccess}
              </div>
            )}

            {cashierError && (
              <div style={{ marginTop: '12px', padding: '10px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 'bold' }}>
                <i className="fas fa-exclamation-triangle" style={{ marginInlineEnd: '6px' }} />
                {cashierError}
              </div>
            )}
          </div>

          {/* Bulk Action Controls */}
          {filteredStudentsList.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>الحضور والغياب للمجموعة:</span>
                <button onClick={() => setAllStatus('present')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>حاضر للكل</button>
                <button onClick={() => setAllStatus('absent')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>غائب للكل</button>
                <button onClick={() => setAllStatus('late')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>متأخر للكل</button>
              </div>

              {selectedStudentIds.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', animation: 'cpFadeUp 0.2s ease' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#8b5cf6' }}>نقل جماعي ({selectedStudentIds.length} طلاب):</span>
                  <select 
                    value={transferTargetGroupId} 
                    onChange={(e) => setTransferTargetGroupId(e.target.value)} 
                    className="cp-input" 
                    style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                  >
                    <option value="">اختر المجموعة المستهدفة...</option>
                    {groups.filter(g => g.grade === grade && g.id !== selectedGroupId).map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <button onClick={handleBulkTransferSubmit} className="cp-btn cp-btn-info" style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    نقل الآن
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Student List Grid / Table */}
          {loading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin" />
              <p>جاري تحميل قائمة الطلاب...</p>
            </div>
          ) : filteredStudentsList.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-users-slash" />
              <p>لا يوجد طلاب مسجلين في هذا الفرع أو المرحلة حالياً</p>
            </div>
          ) : (
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)', marginBottom: '24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '16px 20px', width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedStudentIds.length === filteredStudentsList.length} 
                          onChange={toggleAllStudentsSelection} 
                        />
                      </th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>اسم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold' }}>رقم الهاتف</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '100px' }}>المجموعة</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '380px', textAlign: 'center' }}>تسجيل حالة الحضور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudentsList.map((student) => {
                      const currentStatus = attendanceRecords[student.id] || 'absent'
                      const isSelected = selectedStudentIds.includes(student.id)
                      return (
                        <tr key={student.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)', background: isSelected ? 'rgba(139, 92, 246, 0.03)' : 'transparent' }}>
                          <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={() => toggleStudentSelection(student.id)} 
                            />
                          </td>
                          <td style={{ padding: '14px 20px', fontWeight: 'bold' }}>{student.name}</td>
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{student.phone}</td>
                          <td style={{ padding: '14px' }}>
                            <span className="cp-id-pill">{student.group || '—'}</span>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              {['present', 'absent', 'late', 'excused'].map(st => {
                                const stLabels = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'مُعذر' }
                                const stColors = {
                                  present: '#10b981',
                                  absent: '#ef4444',
                                  late: '#f59e0b',
                                  excused: '#a78bfa'
                                }
                                const isActive = currentStatus === st
                                return (
                                  <button
                                    key={st}
                                    onClick={() => handleStatusChange(student.id, st)}
                                    style={{
                                      padding: '5px 12px',
                                      borderRadius: '999px',
                                      fontSize: '0.8rem',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      border: '1px solid ' + (isActive ? stColors[st] : 'var(--cp-card-border)'),
                                      background: isActive ? `${stColors[st]}20` : 'transparent',
                                      color: isActive ? stColors[st] : 'var(--cp-text-muted)'
                                    }}
                                  >
                                    {stLabels[st]}
                                  </button>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', borderTop: '1px solid var(--cp-divider)', background: 'var(--cp-list-header-bg)' }}>
                <button 
                  onClick={handleSaveAttendance} 
                  disabled={saving} 
                  className="cp-btn cp-btn-success"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontWeight: 'bold' }}
                >
                  {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                  <span>حفظ كشف التحضير وإرسال الإشعارات</span>
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* History View */
        <div style={{ animation: 'cpFadeUp 0.3s ease' }}>
          {/* Summary Panel */}
          <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>المقيدون بالحضور</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px' }}>{historyStats.total}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #10b981', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 'bold' }}>حاضر</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#10b981' }}>{historyStats.present}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #ef4444', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: 'bold' }}>غائب</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#ef4444' }}>{historyStats.absent}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #f59e0b', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: 'bold' }}>متأخر</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#f59e0b' }}>{historyStats.late}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #8b5cf6', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#8b5cf6', fontWeight: 'bold' }}>معذر</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#8b5cf6' }}>{historyStats.excused}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #06b6d4', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#06b6d4', fontWeight: 'bold' }}>معدل الحضور</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#06b6d4' }}>{historyStats.rate}%</div>
            </div>
          </div>

          {/* Search/Print Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
              <input 
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="البحث باسم الطالب..."
                className="cp-input"
                style={{ width: '100%', padding: '10px 16px 10px 40px', fontSize: '0.9rem' }}
              />
              <i className="fas fa-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)' }} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {selectedSessionId && selectedSessionId !== 'new' && (
                <button
                  onClick={() => setShowSessionDeleteConfirm(true)}
                  disabled={deletingSession}
                  className="cp-btn cp-btn-danger"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                >
                  {deletingSession ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
                  حذف الحصة بالكامل
                </button>
              )}

              {searchedHistoryRecords.length > 0 && (
                <button onClick={handlePrintHistory} className="cp-btn cp-btn-info" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                  <i className="fas fa-print" />
                  طباعة الكشف
                </button>
              )}
            </div>
          </div>

          {/* History Records Table */}
          {historyLoading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin" />
              <p>جاري تحميل سجلات الحضور...</p>
            </div>
          ) : searchedHistoryRecords.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-clipboard-question" />
              <p>لا توجد سجلات محفوظة لهذه الحصة</p>
            </div>
          ) : (
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '16px 20px', width: '60px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>اسم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '120px' }}>المجموعة</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '160px' }}>رقم الهاتف</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '150px', textAlign: 'center' }}>حالة الحضور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchedHistoryRecords.map((record, index) => {
                      const status = record.status
                      const statusLabels = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'مُعذر' }
                      const statusColors = {
                        present: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)', color: '#10b981' },
                        absent: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)', color: '#ef4444' },
                        late: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b' },
                        excused: { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.25)', color: '#8b5cf6' }
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(12px)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={() => setShowScanner(false)}
        >
          <div 
            style={{ maxWidth: '420px', width: '100%', background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '24px', padding: '28px', boxShadow: 'var(--cp-card-shadow)', position: 'relative' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowScanner(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'var(--cp-hover-bg)', border: 'none', color: 'var(--cp-text-muted)', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <i className="fas fa-times" />
            </button>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px', textAlign: 'center' }}>مسح كارت الطالب الذكي (QR)</h3>
            <div id="qr-camera-feed" style={{ width: '100%', aspectRatio: '1', borderRadius: '16px', overflow: 'hidden', background: '#090d16', border: '2px dashed var(--cp-card-border)', marginBottom: '16px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '10%', left: '10%', right: '10%', height: '2px', background: '#ef4444', boxShadow: '0 0 8px #ef4444', animation: 'scannerBeam 2.5s infinite linear', zIndex: 10 }} />
            </div>

            {scannerError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '10px 16px', borderRadius: '10px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.88rem', marginBottom: '16px' }}>
                {scannerError}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--cp-divider)', paddingTop: '16px', marginTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>التحضير اليدوي (أدخل رمز الباركود)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="رمز بطاقة الطالب الممسوح" 
                  className="cp-input" 
                  style={{ flex: 1 }}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualCheckIn()}
                />
                <button onClick={handleManualCheckIn} className="cp-btn cp-btn-info" style={{ padding: '8px 16px' }}>تحضير</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Details Modal */}
      {scannedStudent && (
        <StudentDetailsModal 
          student={scannedStudent} 
          onClose={() => setScannedStudent(null)} 
          selectedGroupId={selectedGroupId}
          groups={groups}
          currentGrade={grade}
          onMarkAttendance={async (stud) => {
            // Guard: Reject cross-grade check-in
            if (stud.grade !== grade) {
              flash('لا يمكن تسجيل حضور طالب مسجل في صف دراسي مختلف', 'error')
              return
            }

            // 1. Ensure student is added to local students state so they show up in the table
            setStudents(prev => {
              if (prev.some(s => s.id === stud.student_id)) return prev
              return [...prev, {
                id: stud.student_id,
                name: stud.name,
                phone: stud.phone,
                parent_phone: stud.parent_phone,
                grade: stud.grade,
                group: stud.group_name
              }]
            })

            // 2. Set status to present locally
            handleStatusChange(stud.student_id, 'present')
            
            // 3. Save to database immediately
            if (selectedSessionId && selectedSessionId !== 'new') {
              const currentSession = sessions.find(s => s.id === selectedSessionId)
              const sessionTitle = currentSession ? currentSession.title : 'حصة دراسية'
              try {
                await saveAttendanceBatch([{
                  student_id: stud.student_id,
                  student_name: stud.name,
                  parent_phone: stud.parent_phone,
                  session_id: selectedSessionId,
                  status: 'present',
                  notes: 'حضر عن طريق مسح الكارت الذكي (مجموعة مختلفة)',
                  created_by: currentUser?.id
                }], sessionTitle)
              } catch (e) {
                console.error('Failed to auto-save attendance:', e)
              }
            }

            flash(`تم تسجيل حضور: ${stud.name}`, 'success')
          }}
        />
      )}

      {showSessionDeleteConfirm && (
        <ConfirmDeleteDialog
          title="تأكيد حذف الحصة"
          itemLabel={sessions.find(s => s.id === selectedSessionId)?.title || 'هذه الحصة'}
          message="سيؤدي هذا إلى حذف الحصة وجميع سجلات الحضور المرتبطة بها نهائياً، ولا يمكن التراجع."
          confirmText="نعم، احذف الحصة"
          cancelText="إلغاء"
          onConfirm={handleDeleteSession}
          onCancel={() => setShowSessionDeleteConfirm(false)}
        />
      )}

      <style>{`
        @keyframes scannerBeam {
          0% { top: 10%; }
          50% { top: 90%; }
          100% { top: 10%; }
        }
      `}</style>
    </div>
  )
}
