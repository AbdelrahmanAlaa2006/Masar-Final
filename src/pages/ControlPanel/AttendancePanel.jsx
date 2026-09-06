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
  deleteAttendanceSession,
  rebuildAndSendAttendanceNotifications
} from '@backend/attendanceApi'
import { useTenant } from '../../contexts/TenantContext'
import { useAuth } from '../../contexts/AuthContext'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
// html5-qrcode (~200 kB) is loaded on demand when the camera scanner opens,
// so it stays out of the panel's initial bundle.
import { cached, LIST_TTL, invalidate as invalidateCache } from '../../utils/cache'
import StudentDetailsModal from '../../components/StudentDetailsModal'
import { GRADE_LABEL } from './shared'
import DatePicker from '../../components/DatePicker'
import { supabase } from '@backend/supabase'
import { uiToDbGrade, dbToUiGrade } from '@backend/examsApi'

const mapArabicKeysToEnglish = (str) => {
  if (!str) return '';
  const ligatures = {
    'لآ}': 'bc',
    'لا': 'b',
    'لأ': 't',
    'لإ': 'y',
    'لآ': 'b',
    'LA': 'b',
    'La': 'b',
    'ﻻ': 'b',
    'ﻷ': 't',
    'ﻹ': 'y',
    'ﻵ': 'b'
  };
  const singleKeys = {
    'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'د': ']',
    'ش': 'a', 'س': 's', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ك': ';', 'ط': '\'',
    'ئ': 'z', 'ء': 'x', 'ؤ': 'c', 'ر': 'v', 'ى': 'n', 'ة': 'm',
    'أ': 'h', 'إ': 'y', 'آ': 'n',
    'و': ',', 'ز': '.', 'ظ': '/', 'ذ': '`',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  
  let s = str;
  for (const [lig, eng] of Object.entries(ligatures)) {
    s = s.replaceAll(lig, eng);
  }
  
  return s.split('').map(c => {
    const lowerC = c.toLowerCase();
    return singleKeys[c] || singleKeys[lowerC] || c;
  }).join('');
};

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
  const [savingStudents, setSavingStudents] = useState({})
  const [deletingSession, setDeletingSession] = useState(false)
  const [showSessionDeleteConfirm, setShowSessionDeleteConfirm] = useState(false)
  const [rebuildingNotifications, setRebuildingNotifications] = useState(false)
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

  // Physical-key buffer for the barcode scanner.
  // USB barcode scanners are keyboard wedges: they send physical keystrokes.
  // When the OS keyboard layout is Arabic the *characters* differ, but the
  // KeyboardEvent.code (physical key position) is always the same. We
  // capture codes in a ref buffer and translate them to ASCII ourselves,
  // making the scanner layout-independent.
  const scannerKeyBuffer = useRef('')
  const lastScanKeyTimeRef = useRef(0)
  const isManualPasteRef = useRef(false)

  // Tabs and History States
  const [activeSubTab, setActiveSubTab] = useState('record') // 'record' | 'history'
  const [historyRecords, setHistoryRecords] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState('')

  const html5QrcodeRef = useRef(null)
  // Scans are processed strictly one at a time: a fast cashier (or a scanner
  // configured to re-send) can fire a second barcode while the first lookup is
  // still in flight. Chaining on this promise keeps lookups ordered so two
  // scans can never interleave or be read as one concatenated string.
  const scanChainRef = useRef(Promise.resolve())



  const getAudioContext = () => {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext
      if (!AudioCtxClass) return null
      const ctx = new AudioCtxClass()
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      return ctx
    } catch {
      return null
    }
  }

  // Play a soft, pleasant harmonic tone (avoids harsh raw buzzers)
  const playTone = (ctx, freq, startTime, duration = 0.2, gainLevel = 0.25, type = 'sine') => {
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, startTime)
      gain.gain.setValueAtTime(0.001, startTime)
      gain.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime)
      osc.stop(startTime + duration)
    } catch (e) {
      console.error(e)
    }
  }

  // Classic Two-Tone "Ding-Dong" Resonant Chime (🔔 Ding-Dong!)
  const playBellSound = () => {
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const t = ctx.currentTime

      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.setValueAtTime(-14, t)
      compressor.knee.setValueAtTime(8, t)
      compressor.ratio.setValueAtTime(4, t)
      compressor.attack.setValueAtTime(0.003, t)
      compressor.release.setValueAtTime(0.25, t)

      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0.85, t)

      compressor.connect(masterGain)
      masterGain.connect(ctx.destination)

      const playChimeNote = (freq, startTime, duration, peakGain) => {
        // Fundamental + 2 acoustic partials for rich physical chime resonance
        const partials = [
          { f: freq, g: peakGain, d: duration },
          { f: freq * 1.5, g: peakGain * 0.35, d: duration * 0.7 },
          { f: freq * 2.0, g: peakGain * 0.20, d: duration * 0.5 }
        ]

        partials.forEach(({ f, g, d }) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(f, startTime)

          gain.gain.setValueAtTime(0.001, startTime)
          gain.gain.exponentialRampToValueAtTime(g, startTime + 0.008)
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + d)

          osc.connect(gain)
          gain.connect(compressor)
          osc.start(startTime)
          osc.stop(startTime + d + 0.05)
        })
      }

      // First note: High Ding (784Hz / G5)
      playChimeNote(784.0, t, 0.75, 0.7)
      // Second note: Warm Dong (587.3Hz / D5) with rich sustain
      playChimeNote(587.33, t + 0.28, 1.4, 0.85)
    } catch (e) {
      console.error(e)
    }
  }

  // Apple-Pay style clean ascending check-in chime
  const playSuccessBeep = () => {
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const t = ctx.currentTime
      playTone(ctx, 659.25, t, 0.12, 0.2, 'sine')       // E5
      playTone(ctx, 987.77, t + 0.08, 0.22, 0.25, 'sine') // B5
    } catch (e) {
      console.error(e)
    }
  }

  // Unified crisp bell chime for missing exams, payment due, and general warnings
  const playMissingExamAlert = () => playBellSound()
  const playPaymentDueBell = () => playBellSound()
  const playWarningBeep = () => playBellSound()

  // Check if student has missing / uncompleted exams or quizzes for their grade (both online & center-based)
  // Exams and evaluations from today (or the last 20 hours) are excluded from the buzzer alert to allow grading time.
  const checkStudentMissingExams = async (studentId, studentGrade) => {
    if (!studentId) return []
    const missing = []

    try {
      // Build all potential grade aliases
      const gradeKeys = Array.from(new Set([
        studentGrade,
        grade,
        uiToDbGrade(studentGrade),
        dbToUiGrade(studentGrade),
        uiToDbGrade(grade),
        dbToUiGrade(grade)
      ].filter(Boolean)))

      // 1. Check Platform Online Exams/Quizzes (exams table) - Cached per tenant & grade for 2 min
      const gradeCacheKey = `recent-exams-grade:${tenantId || 'default'}:${gradeKeys.slice().sort().join('_')}`
      const recentExams = await cached(gradeCacheKey, 2 * 60 * 1000, async () => {
        const { data, error } = await supabase
          .from('exams')
          .select('id, title, exam_type, created_at, grade, origin')
          .in('grade', gradeKeys)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(10)
        if (error) {
          console.warn('Error fetching recent exams:', error)
          return []
        }
        return data || []
      })

      if (recentExams && recentExams.length > 0) {
        // Filter out video pre-assessments if any
        const mainExams = recentExams.filter(e => e.origin !== 'video_quiz')
        
        // Filter out exams created TODAY (or in the last 20 hours) so they don't falsely alert during active session
        const now = Date.now()
        const pastMainExams = mainExams.filter(e => {
          if (!e.created_at) return true
          const examTime = new Date(e.created_at).getTime()
          const isToday = new Date(e.created_at).toDateString() === new Date().toDateString()
          const hoursAgo = (now - examTime) / (1000 * 60 * 60)
          return !isToday && hoursAgo >= 20
        })

        const examIds = pastMainExams.map(e => e.id)

        if (examIds.length > 0) {
          // Fresh student-specific attempt check (NEVER cached across students)
          const { data: attempts } = await supabase
            .from('exam_attempts')
            .select('exam_id, score, submitted_at')
            .eq('student_id', studentId)
            .in('exam_id', examIds)

          const attemptedIds = new Set((attempts || []).map(a => a.exam_id))
          pastMainExams.forEach(e => {
            if (!attemptedIds.has(e.id)) {
              missing.push({
                id: e.id,
                title: e.title || 'امتحان إلكتروني',
                type: e.exam_type || 'exam',
                created_at: e.created_at
              })
            }
          })
        }
      }

      // 2. Check In-Center Quizzes / Evaluations (grades table) - Cached per tenant & grade for 2 min
      const centerCacheKey = `recent-center-evals:${tenantId || 'default'}:${gradeKeys.slice().sort().join('_')}`
      const recentCenterGrades = await cached(centerCacheKey, 2 * 60 * 1000, async () => {
        const { data, error } = await supabase
          .from('grades')
          .select(`
            type,
            title,
            created_at,
            profiles!student_id (
              grade
            )
          `)
          .in('type', ['quiz', 'exam'])
          .order('created_at', { ascending: false })
          .limit(30)
        if (error) {
          console.warn('Error fetching recent center evaluations:', error)
          return []
        }
        return data || []
      })

      const relevantCenterEvals = (recentCenterGrades || [])
        .filter(g => gradeKeys.includes(g.profiles?.grade))

      // Deduplicate recent evaluation titles
      const seenEvals = new Set()
      const uniqueCenterEvals = []
      const now = Date.now()

      relevantCenterEvals.forEach(g => {
        const key = `${g.type}:${(g.title || '').trim()}`
        if (!seenEvals.has(key)) {
          seenEvals.add(key)
          // Exclude evaluations created TODAY or in the last 20 hours
          const evalDate = g.created_at ? new Date(g.created_at) : null
          const isToday = evalDate ? evalDate.toDateString() === new Date().toDateString() : false
          const hoursAgo = evalDate ? (now - evalDate.getTime()) / (1000 * 60 * 60) : 999

          if (!isToday && hoursAgo >= 20) {
            uniqueCenterEvals.push(g)
          }
        }
      })

      // Take up to the 3 most recent unique center evaluations from previous sessions
      const latestCenterEvals = uniqueCenterEvals.slice(0, 3)

      if (latestCenterEvals.length > 0) {
        const { data: studentCenterGrades } = await supabase
          .from('grades')
          .select('type, title, score')
          .eq('student_id', studentId)
          .in('type', ['quiz', 'exam'])

        const studentGradedKeys = new Set(
          (studentCenterGrades || []).map(g => `${g.type}:${(g.title || '').trim()}`)
        )

        latestCenterEvals.forEach(evalItem => {
          const key = `${evalItem.type}:${(evalItem.title || '').trim()}`
          if (!studentGradedKeys.has(key)) {
            // Check that we haven't already included this by title
            const evalTitle = (evalItem.title || '').trim()
            if (!missing.some(m => m.title === evalTitle)) {
              missing.push({
                id: key,
                title: evalTitle || 'تسميع الحصة السابقة',
                type: evalItem.type,
                created_at: evalItem.created_at
              })
            }
          }
        })
      }

    } catch (err) {
      console.error('Error checking missing exams:', err)
    }

    return missing
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

        // Only populate attendanceRecords with students who ACTUALLY have a
        // saved DB record. Students not in the mapping have never been saved
        // for this session — leaving them out of attendanceRecords lets the
        // save button distinguish "never saved" from "explicitly absent".
        setAttendanceRecords(mapping)
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

  // Filter student list strictly by Group and Search Query (name, phone, parent_phone),
  // sorted with attendees (present > late > excused) at the top, absent at the bottom,
  // and alphabetically by name within each status group.
  const filteredStudentsList = useMemo(() => {
    let list = students
    
    // 1. Group Filter (strict group isolation)
    if (selectedGroupId) {
      const targetGroup = groups.find(g => g.id === selectedGroupId)
      if (targetGroup) {
        list = list.filter(s => {
          if (s.group === targetGroup.name) return true
          if (s.student_groups && s.student_groups.some(sg => sg.group_id === selectedGroupId)) return true
          return false
        })
      }
    }
    
    // 2. Search Query Filter (name, phone, parent_phone, student code/qr)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(s => {
        const nameMatch = s.name ? s.name.toLowerCase().includes(q) : false
        const phoneMatch = s.phone ? s.phone.includes(q) : false
        const parentPhoneMatch = s.parent_phone ? s.parent_phone.includes(q) : false
        const codeMatch = s.barcode_token ? s.barcode_token.toLowerCase().includes(q) : false
        const qrMatch = s.qr_token ? s.qr_token.toLowerCase().includes(q) : false
        return nameMatch || phoneMatch || parentPhoneMatch || codeMatch || qrMatch
      })
    }

    // 3. Status order: Present (1) -> Late (2) -> Excused (3) -> Absent (4)
    const statusRank = {
      present: 1,
      late: 2,
      excused: 3,
      absent: 4
    }

    return [...list].sort((a, b) => {
      const statusA = attendanceRecords[a.id] || 'absent'
      const statusB = attendanceRecords[b.id] || 'absent'
      const rankA = statusRank[statusA] ?? 4
      const rankB = statusRank[statusB] ?? 4

      if (rankA !== rankB) {
        return rankA - rankB
      }

      return (a.name || '').localeCompare(b.name || '', 'ar', { sensitivity: 'base' })
    })
  }, [students, selectedGroupId, groups, searchQuery, attendanceRecords])

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
    const statusRank = {
      present: 1,
      late: 2,
      excused: 3,
      absent: 4
    }

    const filtered = mergedHistoryRecords.filter(r => {
      if (!historySearchQuery.trim()) return true
      const q = historySearchQuery.trim().toLowerCase()
      const name = r.profiles?.name || ''
      const phone = r.profiles?.phone || ''
      const parentPhone = r.profiles?.parent_phone || ''
      return name.toLowerCase().includes(q) || phone.includes(q) || parentPhone.includes(q)
    })

    return [...filtered].sort((a, b) => {
      const rankA = statusRank[a.status] ?? 4
      const rankB = statusRank[b.status] ?? 4
      if (rankA !== rankB) {
        return rankA - rankB
      }
      const nameA = a.profiles?.name || ''
      const nameB = b.profiles?.name || ''
      return nameA.localeCompare(nameB, 'ar', { sensitivity: 'base' })
    })
  }, [mergedHistoryRecords, historySearchQuery])

  // Sessions for active stage & academic year (reusable across groups of the same stage)
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (selectedAcademicYearId && s.academic_year_id && s.academic_year_id !== selectedAcademicYearId) {
        return false
      }
      return true
    })
  }, [sessions, selectedAcademicYearId])

  // Automatically keep selectedSessionId valid within filteredSessions
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
  // Bulk status change (saves immediately to the database)
  const setAllStatus = async (status) => {
    if (!selectedSessionId || selectedSessionId === 'new') {
      flash('يرجى إنشاء حصة أو اختيار حصة مسجلة لتعديل الحضور للكل', 'warning')
      return
    }
    if (filteredStudentsList.length === 0) return

    // Include students that either have a different status OR have no record
    // yet (so clicking "absent all" actually saves them for the first time).
    const changedStudents = filteredStudentsList.filter(s => {
      const hasRecord = Object.prototype.hasOwnProperty.call(attendanceRecords, s.id)
      return !hasRecord || attendanceRecords[s.id] !== status
    })
    if (changedStudents.length === 0) {
      flash('لا يوجد تغيير - جميع الطلاب محفوظ لهم نفس الحالة بالفعل', 'info')
      return
    }

    // Set saving for changed students
    const savingMap = {}
    changedStudents.forEach(s => {
      savingMap[s.id] = true
    })
    setSavingStudents(prev => ({ ...prev, ...savingMap }))

    // Update local records state immediately
    const nextRecords = { ...attendanceRecords }
    changedStudents.forEach(s => {
      nextRecords[s.id] = status
    })
    setAttendanceRecords(nextRecords)

    try {
      const currentSession = sessions.find(s => s.id === selectedSessionId)
      const sessionTitle = currentSession ? currentSession.title : 'حصة دراسية'

      const payload = changedStudents.map(s => ({
        student_id: s.id,
        student_name: s.name,
        parent_phone: s.parent_phone,
        session_id: selectedSessionId,
        status: status,
        notes: '',
        created_by: currentUser?.id
      }))

      await saveAttendanceBatch(payload, sessionTitle)
      flash('تم حفظ الحضور لجميع طلاب المجموعة بنجاح.', 'success')
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء حفظ الحضور الجماعي: ' + err.message, 'error')
    } finally {
      // Clear saving for changed students
      const clearedMap = {}
      changedStudents.forEach(s => {
        clearedMap[s.id] = false
      })
      setSavingStudents(prev => ({ ...prev, ...clearedMap }))
    }
  }

  const openStudentDetailsForStudent = async (student, sessionStatus = null) => {
    if (!student) return
    try {
      const token = student.barcode_token || student.qr_token || student.id
      let studentData = await getStudentIdentityByQr(token, tenantId).catch(() => null)
      if (!studentData) {
        studentData = {
          student_id: student.id,
          name: student.name,
          phone: student.phone,
          grade: student.grade,
          group_name: student.group || student.group_name || '',
          enrollment_type: student.enrollment_type || 'CENTER',
          status: student.status || 'active',
          flags: student.flags || [],
          warnings: []
        }
      }

      const activeStatus = sessionStatus || attendanceRecords[student.id] || null
      studentData.session_status = activeStatus

      // Ensure historical attendance counts are loaded for complete insights
      if (typeof studentData.total_sessions !== 'number' || studentData.total_sessions === 0) {
        try {
          const { data: attHistory } = await supabase
            .from('attendance_records')
            .select('status')
            .eq('student_id', studentData.student_id || student.id)
          
          if (attHistory && attHistory.length > 0) {
            studentData.total_sessions = attHistory.length
            studentData.present_count = attHistory.filter(a => a.status === 'present').length
            studentData.late_count = attHistory.filter(a => a.status === 'late').length
            studentData.absent_count = attHistory.filter(a => a.status === 'absent').length
            studentData.attended_sessions = studentData.present_count + studentData.late_count
            studentData.attendance_percentage = Math.round((studentData.attended_sessions / studentData.total_sessions) * 100)
          }
        } catch (e) {
          console.error(e)
        }
      }

      const ARABIC_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
      const lastPayIso = studentData.last_payment?.created_at
      const lastPayDesc = studentData.last_payment?.description || ''
      const currentMonthName = ARABIC_MONTHS[new Date().getMonth()]
      const paidThisMonth = (() => {
        if (lastPayDesc.includes(currentMonthName)) return true
        if (!lastPayIso) return false
        const d = new Date(lastPayIso), now = new Date()
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })()
      const monthlyFee = Number(feesByGrade[studentData.grade || student.grade]) || 0
      const targetStudentId = studentData.student_id || student.id
      let discount = null

      // Check if discount is already explicitly present in studentData
      if (studentData?.subscription_discount !== undefined && studentData?.subscription_discount !== null) {
        discount = Number(studentData.subscription_discount)
      }
      // Check if discount is already in the preloaded students list in memory
      if (discount === null && Array.isArray(students)) {
        const preloaded = students.find(s => s.id === targetStudentId)
        if (preloaded && preloaded.subscription_discount !== undefined && preloaded.subscription_discount !== null) {
          discount = Number(preloaded.subscription_discount)
        }
      }
      // Fallback: only query network if the field was genuinely missing/unresolved
      if (discount === null || isNaN(discount)) {
        try { discount = Number(await getStudentDiscount(targetStudentId)) || 0 } catch { discount = 0 }
      }

      studentData.monthly_fee = monthlyFee
      studentData.discount = discount || 0
      studentData.paid_this_month = paidThisMonth
      studentData.amount_due = paidThisMonth ? 0 : Math.max(0, monthlyFee - discount)

      // Check missing exams
      const missingExams = await checkStudentMissingExams(studentData.student_id || student.id, studentData.grade || student.grade)
      studentData.missing_exams = missingExams

      // Audio notification hierarchy:
      // 1. Late student -> Ding-Dong bell alert
      // 2. Missing exam -> Ding-Dong bell alert
      // 3. Unpaid subscription -> Ding-Dong bell alert
      // 4. Normal / Paid / On-time Present -> Pleasant success chime
      if (activeStatus === 'late' || missingExams.length > 0 || !paidThisMonth) {
        playBellSound()
      } else {
        playSuccessBeep()
      }

      setScannedStudent(studentData)
    } catch (err) {
      console.error('Failed to load student info popup:', err)
    }
  }

  // Single status change (saves immediately to the database)
  const handleStatusChange = async (studentId, status) => {
    if (!selectedSessionId || selectedSessionId === 'new') {
      flash('يرجى إنشاء حصة أو اختيار حصة مسجلة لتسجيل الحضور', 'warning')
      return
    }

    const student = students.find(s => s.id === studentId)
    if (!student) return

    const hasExistingRecord = Object.prototype.hasOwnProperty.call(attendanceRecords, studentId)
    if (hasExistingRecord && attendanceRecords[studentId] === status) {
      flash('لا يوجد تغيير - حالة الحضور محفوظة بالفعل', 'info')
      if (status === 'present' || status === 'late') {
        openStudentDetailsForStudent(student, status)
      }
      return
    }

    setSavingStudents(prev => ({ ...prev, [studentId]: true }))
    
    // Update local state immediately
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: status
    }))

    try {
      const currentSession = sessions.find(s => s.id === selectedSessionId)
      const sessionTitle = currentSession ? currentSession.title : 'حصة دراسية'
      
      await saveAttendanceBatch([{
        student_id: studentId,
        student_name: student.name,
        parent_phone: student.parent_phone,
        session_id: selectedSessionId,
        status: status,
        notes: '',
        created_by: currentUser?.id
      }], sessionTitle)
      
      if (status === 'present' || status === 'late') {
        openStudentDetailsForStudent(student, status)
      }
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء حفظ التحضير: ' + err.message, 'error')
    } finally {
      setSavingStudents(prev => ({ ...prev, [studentId]: false }))
    }
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

  // Rebuild and send notifications for the selected attendance session
  const handleRebuildSendNotifications = async () => {
    if (!selectedSessionId || selectedSessionId === 'new') return

    const session = sessions.find(s => s.id === selectedSessionId)
    const title = session?.title || 'الحصة'

    const confirmMsg = `هل أنت متأكد من إعادة بناء وإرسال الإشعارات لحصة "${title}" بالكامل؟\nسيؤدي ذلك إلى حذف الإشعارات المعلقة (قيد الانتظار) فقط وإعادة توليدها وإرسالها بالصياغة والقوالب الحالية دون المساس بالإشعارات المرسلة أو الفاشلة سابقاً.`
    if (!window.confirm(confirmMsg)) return

    setRebuildingNotifications(true)
    try {
      const count = await rebuildAndSendAttendanceNotifications(selectedSessionId, tenantId, currentUser?.id)
      flash(`تم إعادة بناء وجدولة عدد ${count} إشعارات حضور بنجاح!`, 'success')
    } catch (err) {
      console.error(err)
      flash('فشل إعادة بناء وإرسال الإشعارات: ' + err.message, 'error')
    } finally {
      setRebuildingNotifications(false)
    }
  }

  // Save current attendance sheet — marks all UN-SAVED students as absent.
  // Students who were already individually saved (via barcode scan or manual
  // click) already have their attendance_record + notification in the DB, so
  // we skip them here to avoid duplicate WhatsApp messages.  The backend RPC
  // (save_attendance_batch_v2) does an UPSERT, and the notification queue
  // checks for existing notifications per attendance_record_id, so even if a
  // student somehow slips through, the backend won't duplicate.
  const handleSaveAttendance = async () => {
    if (!selectedSessionId || selectedSessionId === 'new') {
      flash('يرجى إنشاء حصة أو اختيار حصة مسجلة لحفظ التحضير', 'warning')
      return
    }

    const currentSession = sessions.find(s => s.id === selectedSessionId)
    const sessionTitle = currentSession ? currentSession.title : 'حصة دراسية'

    // Only include students that have NOT been individually saved yet.
    // Those already in attendanceRecords were saved by auto-check-in or
    // manual per-student clicks and already have their notifications queued.
    const unsavedStudents = filteredStudentsList.filter(
      s => !Object.prototype.hasOwnProperty.call(attendanceRecords, s.id)
    )

    if (unsavedStudents.length === 0) {
      flash('جميع الطلاب محفوظ لهم حالة حضور بالفعل — لا يوجد طلاب بدون تسجيل', 'info')
      return
    }

    const payload = unsavedStudents.map(s => ({
      student_id: s.id,
      student_name: s.name,
      parent_phone: s.parent_phone,
      session_id: selectedSessionId,
      status: 'absent',
      notes: '',
      created_by: currentUser?.id
    }))

    setSaving(true)
    try {
      await saveAttendanceBatch(payload, sessionTitle)

      // Update local state so the UI reflects the newly saved absent records
      const nextRecords = { ...attendanceRecords }
      unsavedStudents.forEach(s => { nextRecords[s.id] = 'absent' })
      setAttendanceRecords(nextRecords)

      flash(`تم حفظ التحضير بنجاح — ${unsavedStudents.length} طالب تم تسجيلهم غائبين وجاري إرسال الإشعارات`, 'success')
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
      // Translate Arabic layout keystrokes first (the wedge scanner types
      // through the OS layout), then strip everything that cannot be part of
      // a token: control chars, NBSP/zero-width chars, spaces and Code39 '*'
      // wrappers. Tokens are printable ASCII, so a whitelist is bulletproof;
      // the server normalizes the same way (normalize_scan_code).
      const rawText = String(text).trim()
      let scannedToken = mapArabicKeysToEnglish(rawText)
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/\s+/g, '')
        .replace(/^\*+|\*+$/g, '')
      if (scannedToken.includes(',')) {
        const parts = scannedToken.split(',')
        if (parts.length >= 3) {
          scannedToken = parts[2].trim()
        }
      }

      // Fetch student details from the DB (RPC with multi-candidate and profile fallback)
      let studentData = await getStudentIdentityByQr(scannedToken, tenantId)
      if (!studentData && rawText && rawText !== scannedToken) {
        studentData = await getStudentIdentityByQr(rawText, tenantId)
      }
      if (!studentData) {
        throw new Error('لم يتم العثور على طالب مطابق لهذا الباركود أو البطاقة')
      }

      // 1. Fetch student's approved payments from ledger to calculate exact unpaid months
      const { data: studentPayments } = await supabase
        .from('student_ledger')
        .select('id, amount, description, billing_period, created_at, status')
        .eq('student_id', studentData.student_id)
        .eq('type', 'payment')
        .eq('status', 'approved')

      const ORDERED_ACAD_MONTHS = ['أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو']
      const getAcadMonthIdx = (d = new Date()) => {
        const date = new Date(d)
        const m = isNaN(date.getTime()) ? new Date().getMonth() : date.getMonth()
        return m >= 7 ? m - 7 : m + 5
      }

      const monthlyFee = Number(feesByGrade[studentData.grade]) || 0
      const studentId = studentData.student_id
      let discount = null

      // Check if discount is already explicitly present in studentData
      if (studentData?.subscription_discount !== undefined && studentData?.subscription_discount !== null) {
        discount = Number(studentData.subscription_discount)
      }
      // Check if discount is already in the preloaded students list in memory
      if (discount === null && Array.isArray(students)) {
        const preloaded = students.find(s => s.id === studentId)
        if (preloaded && preloaded.subscription_discount !== undefined && preloaded.subscription_discount !== null) {
          discount = Number(preloaded.subscription_discount)
        }
      }
      // Fallback: query network if missing
      if (discount === null || isNaN(discount)) {
        try { discount = Number(await getStudentDiscount(studentId)) || 0 } catch { discount = 0 }
      }

      const effectiveDiscount = discount || 0
      const monthlyDue = Math.max(0, monthlyFee - effectiveDiscount)

      // 2. Identify all paid months and determine start month
      const paidMonthsSet = new Set()
      const paidMonthIndices = []
      ;(studentPayments || []).forEach(p => {
        const desc = (p.description || p.billing_period || '').trim()
        ORDERED_ACAD_MONTHS.forEach((mName, idx) => {
          if (desc.includes(mName)) {
            paidMonthsSet.add(mName)
            paidMonthIndices.push(idx)
          }
        })
      })

      const studentRegMonthIdx = (() => {
        if (!studentData.created_at) return 0
        const d = new Date(studentData.created_at)
        if (isNaN(d.getTime())) return 0
        return getAcadMonthIdx(d)
      })()

      // Effective subscription start month:
      // If student has previous payments, start from the earliest paid month (any prior month was waived/pre-enrollment)
      // If student never paid yet, start from the current academic month (so we never demand historical trial months like August before official enrollment)
      let startAcadIdx = paidMonthIndices.length > 0
        ? Math.min(...paidMonthIndices)
        : currentAcadIdx

      // Check all months from startAcadIdx up to currentAcadIdx
      const unpaidMonths = []
      let totalAmountDue = 0

      for (let i = startAcadIdx; i <= currentAcadIdx; i++) {
        const mName = ORDERED_ACAD_MONTHS[i]
        if (!paidMonthsSet.has(mName)) {
          unpaidMonths.push({
            month: mName,
            packageName: `اشتراك شهر ${mName}`,
            monthlyDue: monthlyDue,
            remaining: monthlyDue
          })
          totalAmountDue += monthlyDue
        }
      }

      const isCurrentMonthPaid = paidMonthsSet.has(ORDERED_ACAD_MONTHS[currentAcadIdx])
      const hasUnpaidDebt = unpaidMonths.length > 0

      studentData.monthly_fee = monthlyFee
      studentData.discount = effectiveDiscount
      studentData.unpaid_months = unpaidMonths
      studentData.amount_due = totalAmountDue
      studentData.paid_this_month = isCurrentMonthPaid && !hasUnpaidDebt
      studentData.student_payments = studentPayments || []

      // Check missing required exams / quizzes (excluding today's in-progress evaluations)
      const missingExams = await checkStudentMissingExams(studentData.student_id, studentData.grade)
      studentData.missing_exams = missingExams

      // Audio notification hierarchy:
      // 1. Missing exam -> Urgent missing exam alert
      // 2. Unpaid subscription -> Triple bell
      // 3. Normal / Paid -> Pleasant success chime
      if (missingExams.length > 0) {
        playMissingExamAlert()
      } else if (hasUnpaidDebt) {
        playPaymentDueBell()
      } else {
        playSuccessBeep()
      }

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
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; direction: ltr;">${r.profiles?.parent_phone || '—'}</td>
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
                <th style="width: 130px;">رقم الهاتف</th>
                <th style="width: 130px;">هاتف ولي الأمر</th>
                <th style="width: 110px;">حالة الحضور</th>
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
            <option value="">جميع الفروع / الفرع الرئيسي</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>العام الدراسي</label>
          <select value={selectedAcademicYearId} onChange={(e) => setSelectedAcademicYearId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            <option value="">جميع الأعوام / العام الحالي</option>
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
            {groups
              .filter(g => !grade || !g.grade || g.grade === grade)
              .map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))
            }
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
              <option key={s.id} value={s.id}>
                {s.title} ({s.date}){s.groups?.name ? ` [${s.groups.name}]` : ''}
              </option>
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
              <DatePicker 
                value={newSessionDate} 
                onChange={setNewSessionDate} 
                style={{ width: '100%' }}
                placeholder="اختر تاريخاً"
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
                onPaste={() => {
                  // Explicit manual paste (Ctrl+V, context menu, etc.):
                  // Discard any hardware keystroke buffer and mark manual paste active.
                  scannerKeyBuffer.current = ''
                  lastScanKeyTimeRef.current = 0
                  isManualPasteRef.current = true
                }}
                onKeyDown={(e) => {
                  // Never intercept modifier shortcut keys (Ctrl+V, Ctrl+C, Ctrl+A, Meta+V, Alt, etc.)
                  if (e.ctrlKey || e.metaKey || e.altKey) {
                    return
                  }

                  const code = e.code

                  // If user edits manually (Backspace/Delete/Escape), clear hardware buffer
                  if (code === 'Backspace' || code === 'Delete' || code === 'Escape') {
                    scannerKeyBuffer.current = ''
                    lastScanKeyTimeRef.current = 0
                    isManualPasteRef.current = false
                    return
                  }

                  // Terminator: Enter or Tab → submit whatever is buffered.
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    const physicalToken = (scannerKeyBuffer.current || '').trim()
                    const domToken = (e.target.value || '').trim()

                    // Selection logic:
                    // 1. If manual paste occurred, use the pasted DOM token.
                    // 2. Otherwise, if physical hardware buffer has content, use it (layout-independent).
                    // 3. Fall back to DOM token (e.g. manual typing).
                    let lookupValue = domToken
                    if (!isManualPasteRef.current && physicalToken) {
                      lookupValue = physicalToken
                    } else if (domToken) {
                      lookupValue = domToken
                    } else if (physicalToken) {
                      lookupValue = physicalToken
                    }

                    // Reset both buffers immediately.
                    scannerKeyBuffer.current = ''
                    lastScanKeyTimeRef.current = 0
                    isManualPasteRef.current = false
                    e.target.value = ''
                    setScannerText('')
                    if (!lookupValue || !lookupValue.trim()) return

                    // Serialize lookups so overlapping scans process in order.
                    scanChainRef.current = scanChainRef.current
                      .then(() => handleQrScanned(lookupValue, true))
                      .catch(() => {})
                    return
                  }

                  // Active keystroke -> reset paste flag
                  isManualPasteRef.current = false

                  const now = Date.now()
                  // Inter-keystroke timeout: USB scanners type the entire token in <100ms.
                  // If >500ms elapsed since the previous keystroke, any previous partial
                  // buffer is discarded so stale aborted scans don't contaminate new input.
                  if (now - lastScanKeyTimeRef.current > 500) {
                    scannerKeyBuffer.current = ''
                  }
                  lastScanKeyTimeRef.current = now

                  // Map physical key code → ASCII character.
                  let ch = null
                  if (code.startsWith('Key')) {
                    // KeyA-KeyZ → 'a'-'z' (or 'A'-'Z' with shift)
                    ch = e.shiftKey ? code.charAt(3) : code.charAt(3).toLowerCase()
                  } else if (code.startsWith('Digit')) {
                    // Digit0-Digit9 → '0'-'9'
                    ch = code.charAt(5)
                  } else if (code.startsWith('Numpad') && code.length === 7) {
                    // Numpad0-Numpad9 → '0'-'9'
                    ch = code.charAt(6)
                  } else if (code === 'NumpadSubtract' || code === 'Minus') {
                    ch = e.shiftKey ? '_' : '-'
                  } else if (code === 'NumpadDecimal' || code === 'Period') {
                    ch = e.shiftKey ? '>' : '.'
                  } else if (code === 'NumpadDivide' || code === 'Slash') {
                    ch = e.shiftKey ? '?' : '/'
                  } else if (code === 'NumpadMultiply') {
                    ch = '*'
                  } else if (code === 'NumpadAdd' || code === 'Equal') {
                    ch = e.shiftKey ? '+' : '='
                  } else if (code === 'Comma') {
                    ch = e.shiftKey ? '<' : ','
                  } else if (code === 'Semicolon') {
                    ch = e.shiftKey ? ':' : ';'
                  } else if (code === 'Quote') {
                    ch = e.shiftKey ? '"' : '\''
                  } else if (code === 'BracketLeft') {
                    ch = e.shiftKey ? '{' : '['
                  } else if (code === 'BracketRight') {
                    ch = e.shiftKey ? '}' : ']'
                  } else if (code === 'Space') {
                    ch = ' '
                  }

                  if (ch !== null) {
                    scannerKeyBuffer.current += ch
                  }
                }}
                onFocus={() => {
                  setScannerFocused(true)
                  isManualPasteRef.current = false
                }}
                onBlur={() => {
                  setScannerFocused(false)
                  // Clear the physical buffer on blur to prevent stale data
                  scannerKeyBuffer.current = ''
                  lastScanKeyTimeRef.current = 0
                  isManualPasteRef.current = false
                }}
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

          {/* Bulk Action Controls & Live Search Bar */}
          {students.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>الحضور والغياب للمجموعة:</span>
                <button onClick={() => setAllStatus('present')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>حاضر للكل</button>
                <button onClick={() => setAllStatus('absent')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>غائب للكل</button>
                <button onClick={() => setAllStatus('late')} className="cp-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>متأخر للكل</button>

                {/* Save button — marks all unsaved students as absent */}
                {selectedSessionId && selectedSessionId !== 'new' && (() => {
                  const unsavedCount = filteredStudentsList.filter(
                    s => !Object.prototype.hasOwnProperty.call(attendanceRecords, s.id)
                  ).length
                  return (
                    <button
                      onClick={handleSaveAttendance}
                      disabled={saving || unsavedCount === 0}
                      className="cp-btn"
                      style={{
                        padding: '6px 16px',
                        fontSize: '0.82rem',
                        fontWeight: 'bold',
                        background: unsavedCount > 0 ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'rgba(100,100,100,0.15)',
                        color: unsavedCount > 0 ? '#fff' : 'var(--cp-text-muted)',
                        border: 'none',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: unsavedCount > 0 ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none',
                        cursor: unsavedCount > 0 ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                      {saving
                        ? 'جاري الحفظ...'
                        : unsavedCount > 0
                          ? `حفظ التحضير (${unsavedCount} غائب)`
                          : 'تم حفظ الكل ✓'
                      }
                    </button>
                  )
                })()}
              </div>

              {/* Live Search Input for Student Name, Phone, or Code */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 1 320px', minWidth: '240px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <i className="fas fa-search" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', fontSize: '0.85rem' }} />
                  <input 
                    type="text"
                    placeholder="ابحث باسم الطالب أو هاتفه أو الكود..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', paddingRight: '34px', paddingLeft: searchQuery ? '30px' : '12px', height: '36px', fontSize: '0.84rem', borderRadius: '8px' }}
                  />
                  {searchQuery && (
                    <button 
                      type="button" 
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--cp-text-muted)', cursor: 'pointer', padding: 0 }}
                    >
                      <i className="fas fa-times-circle" />
                    </button>
                  )}
                </div>
              </div>

              {selectedStudentIds.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', animation: 'cpFadeUp 0.2s ease', width: '100%', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
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
          {loading && filteredStudentsList.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin" />
              <p>جاري تحميل قائمة الطلاب...</p>
            </div>
          ) : filteredStudentsList.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-users-slash" />
              <p>{searchQuery ? `لا توجد نتائج مطابقة لبحثك عن "${searchQuery}"` : 'لا يوجد طلاب مسجلين في هذا الفرع أو المرحلة حالياً'}</p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="cp-btn cp-btn-ghost" style={{ marginTop: '10px' }}>
                  مسح البحث
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)', marginBottom: '24px', opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s ease' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '16px 20px', width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedStudentIds.length === filteredStudentsList.length && filteredStudentsList.length > 0} 
                          onChange={toggleAllStudentsSelection} 
                        />
                      </th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>اسم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold' }}>رقم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold' }}>هاتف ولي الأمر</th>
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
                          <td style={{ padding: '14px 20px', fontWeight: 'bold' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {student.name}
                              {savingStudents[student.id] && (
                                <i className="fas fa-spinner fa-spin" style={{ color: 'var(--primary)', fontSize: '0.82rem' }} />
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{student.phone || '—'}</td>
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{student.parent_phone || '—'}</td>
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
                                    disabled={savingStudents[student.id]}
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
                  onClick={handleRebuildSendNotifications} 
                  disabled={rebuildingNotifications} 
                  className="cp-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', background: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.2)' }}
                >
                  {rebuildingNotifications ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                  إعادة بناء وإرسال الإشعارات
                </button>
              )}

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
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '140px' }}>رقم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '140px' }}>هاتف ولي الأمر</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '150px', textAlign: 'center' }}>حالة الحضور</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '100px', textAlign: 'center' }}>الإجراءات</th>
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
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{record.profiles?.parent_phone || '—'}</td>
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
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button
                              onClick={() => setActiveSubTab('record')}
                              className="cp-btn cp-btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <i className="fas fa-edit" />
                              تعديل
                            </button>
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
          onClose={() => {
            setScannedStudent(null)
            // Return focus to the barcode input so the next student can be
            // scanned immediately with no mouse (record tab only). The small
            // delay lets the modal unmount before we refocus.
            setTimeout(() => {
              if (activeSubTab === 'record' && scannerInputRef.current) {
                scannerInputRef.current.focus()
              }
            }, 60)
          }}
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

            const targetStatus = stud.session_status === 'late' ? 'late' : 'present'
            const statusArabic = targetStatus === 'late' ? 'تأخير' : 'حضور'

            // 2. Set status locally
            handleStatusChange(stud.student_id, targetStatus)
            
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
                  status: targetStatus,
                  notes: 'عن طريق مسح الكارت الذكي',
                  created_by: currentUser?.id
                }], sessionTitle)
              } catch (e) {
                console.error('Failed to auto-save attendance:', e)
              }
            }

            flash(`تم تسجيل ${statusArabic}: ${stud.name}`, 'success')
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
