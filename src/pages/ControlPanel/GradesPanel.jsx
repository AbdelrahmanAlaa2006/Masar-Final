import React, { useState, useEffect, useMemo } from 'react'
import { listStudentsByGrade } from '@backend/profilesApi'
import { listHomeworks } from '@backend/homeworksApi'
import { saveGradesBatch, listUniqueEvaluations, listGradesForEvaluation, deleteEvaluation, rebuildAndSendGradeNotifications, sendUpdatedGradeNotification } from '@backend/gradesApi'
import { listGroups } from '@backend/groupsApi'
import { useAuth } from '../../contexts/AuthContext'
import { cached, LIST_TTL } from '../../utils/cache'
import { useTenant } from '../../contexts/TenantContext'
import { dbToUiGrade } from '@backend/examsApi'
import { GRADE_LABEL } from './shared'
import DatePicker from '../../components/DatePicker'
import { supabase } from '@backend/supabase'

export default function GradesPanel({ onBack, flash }) {
  const { user: currentUser } = useAuth()
  const { gradesList, tenantId } = useTenant()
  const [grade, setGrade] = useState(() => gradesList?.[0]?.id || 'first-sec')
  const [group, setGroup] = useState('')
  const [groupsList, setGroupsList] = useState([])
  
  // Evaluation settings
  const [evalType, setEvalType] = useState('homework')
  const [evalSubject, setEvalSubject] = useState('')
  const [maxScore, setMaxScore] = useState(10)
  const [customTitle, setCustomTitle] = useState('')

  // Students list
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingEvaluation, setDeletingEvaluation] = useState(false)
  const [rebuildingNotifications, setRebuildingNotifications] = useState(false)

  // Scores sheet states: studentId -> { score: num, notes: string }
  const [sheetData, setSheetData] = useState({})

  const [activeSubTab, setActiveSubTab] = useState('grade') // 'grade' | 'history'
  const [searchQuery, setSearchQuery] = useState('') // active student name search
  const [selectedActiveEvaluationKey, setSelectedActiveEvaluationKey] = useState('')
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false)
  
  // History states
  const [historyEvaluations, setHistoryEvaluations] = useState([])
  const [selectedEvaluation, setSelectedEvaluation] = useState('')
  const [historyGrades, setHistoryGrades] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [editingEvaluation, setEditingEvaluation] = useState(null)

  // Linked session/date states
  const [homeworksList, setHomeworksList] = useState([])
  const [sessionId, setSessionId] = useState('custom')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // Map DB grade enum → Arabic label


  const loadUniqueEvaluationsList = async (targetGrade) => {
    try {
      const data = await listUniqueEvaluations(targetGrade)
      setHistoryEvaluations(data)
      if (data.length > 0) {
        setSelectedEvaluation(`${data[0].type}:${data[0].title}`)
      } else {
        setSelectedEvaluation('')
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Delete the selected evaluation sheet
  const handleDeleteEvaluation = async () => {
    if (!selectedEvaluation) return

    const [type, title] = selectedEvaluation.split(':')
    const typeLabels = {
      'homework': 'واجب منزلي',
      'exam': 'امتحان / اختبار',
      'quiz': 'تسميع',
      'participation': 'مشاركة وتفاعل',
      'behavior': 'ملاحظة سلوكية'
    }
    const typeText = typeLabels[type] || type

    const confirmMsg = `هل أنت متأكد من حذف كشف الدرجات "${title}" (${typeText}) بالكامل؟\nسيؤدي ذلك إلى حذف الكشف وجميع درجات الطلاب المسجلة فيه نهائياً ولا يمكن التراجع عن هذا الإجراء.`
    if (!window.confirm(confirmMsg)) return

    setDeletingEvaluation(true)
    try {
      await deleteEvaluation(type, title)
      flash('تم حذف كشف الدرجات وجميع درجات الطلاب بنجاح', 'success')
      await loadUniqueEvaluationsList(grade)
    } catch (err) {
      console.error(err)
      flash('فشل حذف كشف الدرجات: ' + err.message, 'error')
    } finally {
      setDeletingEvaluation(false)
    }
  }

  // Rebuild and send notifications for the selected evaluation sheet
  const handleRebuildSendNotifications = async () => {
    if (!selectedEvaluation) return

    const [type, title] = selectedEvaluation.split(':')
    const typeLabels = {
      'homework': 'واجب منزلي',
      'exam': 'امتحان / اختبار',
      'quiz': 'تسميع',
      'participation': 'مشاركة وتفاعل',
      'behavior': 'ملاحظة سلوكية'
    }
    const typeText = typeLabels[type] || type

    const confirmMsg = `هل أنت متأكد من إعادة بناء وإرسال الإشعارات لكشف الدرجات "${title}" (${typeText}) بالكامل؟\nسيؤدي ذلك إلى حذف الإشعارات المعلقة (قيد الانتظار) فقط وإعادة توليدها وإرسالها بالصياغة والقوالب الحالية دون المساس بالإشعارات المرسسة أو الفاشلة سابقاً.`
    if (!window.confirm(confirmMsg)) return

    setRebuildingNotifications(true)
    try {
      const count = await rebuildAndSendGradeNotifications(type, title, tenantId, currentUser?.id)
      flash(`تم إعادة بناء وجدولة عدد ${count} إشعارات بنجاح!`, 'success')
    } catch (err) {
      console.error(err)
      flash('فشل إعادة بناء وإرسال الإشعارات: ' + err.message, 'error')
    } finally {
      setRebuildingNotifications(false)
    }
  }

  // Load students, homeworks (lessons), groups, and evaluations list
  useEffect(() => {
    let active = true
    setLoading(true)
    setGroup('') // Reset group filter when grade changes
    ;(async () => {
      try {
        const [allStudents, allHomeworks, allGroups] = await Promise.all([
          cached(`students:grade:${grade}`, LIST_TTL, () => listStudentsByGrade(grade)),
          cached('homeworks', LIST_TTL, listHomeworks),
          listGroups()
        ])
        if (!active) return

        // Already scoped to this grade server-side; keep the approval filter.
        const filtered = allStudents.filter(s => s.is_approved)
        setStudents(filtered)

        const filteredGroups = allGroups.filter(g => g.grade === grade)
        setGroupsList(filteredGroups)
        
        const mappedGrade = dbToUiGrade(grade)
        const filteredHomeworks = allHomeworks.filter(h => h.grade === mappedGrade)
        setHomeworksList(filteredHomeworks)

        if (filteredHomeworks.length > 0) {
          setSessionId(filteredHomeworks[0].id)
        } else {
          setSessionId('custom')
        }

        // Check for saved local draft
        const draftKey = `masaar_grades_draft_${tenantId}_${grade}`
        let restored = false
        try {
          const rawDraft = localStorage.getItem(draftKey)
          if (rawDraft) {
            const parsed = JSON.parse(rawDraft)
            if (parsed && parsed.sheetData && Object.keys(parsed.sheetData).length > 0) {
              const hasActualScores = Object.values(parsed.sheetData).some(v => v && (v.score !== '' || (v.notes && v.notes.trim() !== '')))
              if (hasActualScores) {
                setSheetData(parsed.sheetData)
                if (parsed.evalType) setEvalType(parsed.evalType)
                if (parsed.evalSubject) setEvalSubject(parsed.evalSubject)
                if (parsed.maxScore) setMaxScore(parsed.maxScore)
                if (parsed.customTitle) setCustomTitle(parsed.customTitle)
                if (parsed.sessionId) setSessionId(parsed.sessionId)
                if (parsed.date) setDate(parsed.date)
                setHasRestoredDraft(true)
                restored = true
              }
            }
          }
        } catch (e) {
          console.error('Error restoring draft:', e)
        }

        if (!restored) {
          // Reset sheet data
          const initialSheet = {}
          filtered.forEach(s => {
            initialSheet[s.id] = { score: '', notes: '' }
          })
          setSheetData(initialSheet)
          setHasRestoredDraft(false)
        }

        setSelectedActiveEvaluationKey('')
        setEditingEvaluation(null)
        await loadUniqueEvaluationsList(grade)
      } catch (err) {
        console.error(err)
        flash('فشل تحميل قائمة الطلاب والحصص والمجموعات', 'error')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [grade])

  // Auto-save draft on changes (when not in edit mode or when working on a draft)
  useEffect(() => {
    if (editingEvaluation || !tenantId || !grade) return

    const hasContent = Object.values(sheetData).some(v => v && (v.score !== '' || (v.notes && v.notes.trim() !== '')))
    const draftKey = `masaar_grades_draft_${tenantId}_${grade}`

    if (hasContent) {
      try {
        const draftObj = {
          evalType,
          evalSubject,
          maxScore,
          customTitle,
          sessionId,
          date,
          sheetData,
          savedAt: Date.now()
        }
        localStorage.setItem(draftKey, JSON.stringify(draftObj))
      } catch (e) {
        console.error('Failed to auto-save grades draft:', e)
      }
    }
  }, [sheetData, evalType, evalSubject, maxScore, customTitle, sessionId, date, tenantId, grade, editingEvaluation])

  const handleClearDraft = () => {
    const draftKey = `masaar_grades_draft_${tenantId}_${grade}`
    try {
      localStorage.removeItem(draftKey)
    } catch (e) {}
    const blankSheet = {}
    students.forEach(s => { blankSheet[s.id] = { score: '', notes: '' } })
    setSheetData(blankSheet)
    setCustomTitle('')
    setHasRestoredDraft(false)
    flash('تم مسح المسودة والبدء من جديد', 'info')
  }

  // Active session / evaluation changer (like Attendance session switcher)
  const handleActiveEvaluationChange = async (key) => {
    setSelectedActiveEvaluationKey(key)
    if (!key) {
      // New evaluation mode
      setEditingEvaluation(null)
      setCustomTitle('')
      setEvalSubject('')
      if (homeworksList.length > 0) {
        setSessionId(homeworksList[0].id)
      } else {
        setSessionId('custom')
      }
      setDate(new Date().toISOString().split('T')[0])

      // Check draft
      const draftKey = `masaar_grades_draft_${tenantId}_${grade}`
      try {
        const savedDraft = localStorage.getItem(draftKey)
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft)
          if (parsed && parsed.sheetData) {
            const hasActualScores = Object.values(parsed.sheetData).some(v => v && (v.score !== '' || (v.notes && v.notes.trim() !== '')))
            if (hasActualScores) {
              setSheetData(parsed.sheetData)
              if (parsed.evalType) setEvalType(parsed.evalType)
              if (parsed.evalSubject) setEvalSubject(parsed.evalSubject)
              if (parsed.maxScore) setMaxScore(parsed.maxScore)
              if (parsed.customTitle) setCustomTitle(parsed.customTitle)
              if (parsed.sessionId) setSessionId(parsed.sessionId)
              if (parsed.date) setDate(parsed.date)
              setHasRestoredDraft(true)
              return
            }
          }
        }
      } catch (e) {
        console.error(e)
      }

      const cleared = {}
      students.forEach(s => { cleared[s.id] = { score: '', notes: '' } })
      setSheetData(cleared)
      setHasRestoredDraft(false)
      return
    }

    // Picked an existing evaluation
    const [type, title] = key.split(':')
    try {
      setLoading(true)
      const data = await listGradesForEvaluation(type, title)
      setEditingEvaluation({
        type,
        title,
        originalGrades: data
      })

      setEvalType(type)
      if (data && data.length > 0) {
        setMaxScore(data[0].max_score || 10)
        setEvalSubject(data[0].subject || '')
        setSessionId(data[0].session_id || 'custom')
        if (data[0].created_at) {
          setDate(new Date(data[0].created_at).toISOString().split('T')[0])
        }
      }

      const loadedSheet = {}
      students.forEach(s => {
        const record = data.find(r => r.student_id === s.id)
        if (record) {
          loadedSheet[s.id] = {
            score: record.score !== null && record.score !== undefined ? String(record.score) : '',
            notes: record.notes || ''
          }
        } else {
          loadedSheet[s.id] = { score: '', notes: '' }
        }
      })
      setSheetData(loadedSheet)
      setHasRestoredDraft(false)
    } catch (err) {
      console.error(err)
      flash('فشل تحميل درجات الكشف المحدد', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Helper to auto-generate default title based on selected type, lesson, date, and custom title
  const getAutoTitle = (type, sId, dateVal, customTitleVal) => {
    const typeLabels = {
      'homework': 'واجب',
      'quiz': 'تسميع',
      'exam': 'امتحان',
      'attendance': 'ملاحظة سلوكية',
      'behavior': 'ملاحظة سلوكية'
    }
    const typeLabel = typeLabels[type] || type

    const getDayName = (dateStr) => {
      if (!dateStr) return ''
      try {
        const parts = dateStr.split('-')
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10)
          const month = parseInt(parts[1], 10) - 1
          const day = parseInt(parts[2], 10)
          const d = new Date(year, month, day)
          const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
          return dayNames[d.getDay()]
        }
        return ''
      } catch (e) {
        return ''
      }
    }

    const dateSuffix = dateVal ? ` - ${dateVal} (${getDayName(dateVal)})` : ''

    const baseLabel = customTitleVal?.trim()
      ? `${typeLabel} - ${customTitleVal.trim()}`
      : typeLabel

    if (sId && sId !== 'custom') {
      const lesson = homeworksList.find(h => h.id === sId)
      if (lesson) {
        return `${baseLabel}: ${lesson.title}${dateSuffix}`
      }
    }
    return `${baseLabel}${dateSuffix}`
  }

  // Bulk fill utility
  const handleBulkFill = (fillValue) => {
    const next = { ...sheetData }
    students.forEach(s => {
      if (isStudentInSelectedGroup(s)) {
        next[s.id] = {
          ...next[s.id],
          score: fillValue
        }
      }
    })
    setSheetData(next)
  }

  const handleCellChange = (studentId, key, value) => {
    setSheetData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [key]: value
      }
    }))
  }

  // Save all scores
  const handleSaveGrades = async () => {
    if (editingEvaluation) {
      const toUpdate = []
      const toInsert = []
      const toDelete = []
      let scoreValidationError = false

      students.forEach(s => {
        if (!isStudentInSelectedGroup(s)) return // Skip if filtered out

        const inputVal = sheetData[s.id]?.score
        const inputNotes = sheetData[s.id]?.notes || ''

        // Find original record in database (from originalGrades)
        const original = editingEvaluation.originalGrades.find(g => g.student_id === s.id)

        // If the user input is empty/cleared:
        if (inputVal === undefined || inputVal === '') {
          // If there was an original record in the DB, we can delete it!
          if (original) {
            toDelete.push(original.id)
          }
          return
        }

        const parsedScore = parseFloat(inputVal)
        if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > maxScore) {
          scoreValidationError = true
          return
        }

        const notesClean = inputNotes.trim() || null

        if (original) {
          // Compare to see if score or notes changed
          const scoreChanged = parseFloat(original.score) !== parsedScore
          const notesChanged = (original.notes || '') !== (notesClean || '')

          if (scoreChanged || notesChanged) {
            toUpdate.push({
              id: original.id,
              student_id: s.id,
              score: parsedScore,
              notes: notesClean,
              type: editingEvaluation.type,
              title: editingEvaluation.title,
              max_score: maxScore,
              subject: evalSubject.trim() || null,
              session_id: sessionId !== 'custom' ? sessionId : null
            })
          }
        } else {
          // Was a dummy row, now has a grade. This is a new insert!
          toInsert.push({
            student_id: s.id,
            student_name: s.name,
            parent_phone: s.parent_phone,
            session_id: sessionId !== 'custom' ? sessionId : null,
            type: editingEvaluation.type,
            title: editingEvaluation.title,
            subject: evalSubject.trim() || null,
            score: parsedScore,
            max_score: maxScore,
            notes: notesClean,
            created_by: currentUser?.id
          })
        }
      })

      if (scoreValidationError) {
        flash(`يرجى التأكد من أن الدرجات أرقام صحيحة بين 0 و ${maxScore}`, 'error')
        return
      }

      if (toUpdate.length === 0 && toInsert.length === 0 && toDelete.length === 0) {
        flash('No changes detected.', 'info')
        return
      }

      setSaving(true)
      try {
        if (toDelete.length > 0) {
          await supabase.from('grades').delete().in('id', toDelete)
        }

        if (toUpdate.length > 0) {
          for (const item of toUpdate) {
            await supabase
              .from('grades')
              .update({
                score: item.score,
                notes: item.notes,
                created_by: currentUser?.id
              })
              .eq('id', item.id)
          }
        }

        if (toInsert.length > 0) {
          await saveGradesBatch(toInsert)
        }

        if (toUpdate.length > 0) {
          for (const item of toUpdate) {
            try {
              await sendUpdatedGradeNotification(item, tenantId, currentUser?.id)
            } catch (notifErr) {
              console.error('Failed to send updated grade notification:', notifErr)
            }
          }
        }

        flash(`تم تعديل الدرجات وحفظ التغييرات بنجاح.`, 'success')
        setEditingEvaluation(null)
        setCustomTitle('')
        setSelectedActiveEvaluationKey('')

        const draftKey = `masaar_grades_draft_${tenantId}_${grade}`
        try { localStorage.removeItem(draftKey) } catch (e) {}
        setHasRestoredDraft(false)

        const cleared = {}
        students.forEach(s => { cleared[s.id] = { score: '', notes: '' } })
        setSheetData(cleared)

        await loadUniqueEvaluationsList(grade)
        setActiveSubTab('history')
      } catch (err) {
        console.error(err)
        flash('فشل حفظ التعديلات: ' + err.message, 'error')
      } finally {
        setSaving(false)
      }
      return
    }

    const finalTitle = getAutoTitle(evalType, sessionId, date, customTitle)

    const records = []
    let scoreValidationError = false

    students.forEach(s => {
      if (!isStudentInSelectedGroup(s)) return // Skip if filtered out

      const val = sheetData[s.id]?.score
      const notesVal = sheetData[s.id]?.notes || ''

      if (val !== undefined && val !== '') {
        const parsedScore = parseFloat(val)
        if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > maxScore) {
          scoreValidationError = true
          return
        }

        records.push({
          student_id: s.id,
          student_name: s.name,
          parent_phone: s.parent_phone,
          session_id: sessionId !== 'custom' ? sessionId : null,
          type: evalType,
          title: finalTitle,
          subject: evalSubject.trim() || null,
          score: parsedScore,
          max_score: maxScore,
          notes: notesVal.trim() || null,
          created_by: currentUser?.id
        })
      }
    })

    if (scoreValidationError) {
      flash(`يرجى التأكد من أن الدرجات أرقام صحيحة بين 0 و ${maxScore}`, 'error')
      return
    }

    if (records.length === 0) {
      flash('لم يتم إدخال أي درجات لحفظها', 'warning')
      return
    }

    setSaving(true)
    try {
      await saveGradesBatch(records)
      flash(`تم حفظ درجات ${records.length} طلاب بنجاح، وتجري جدولة إشعارات أولياء الأمور.`, 'success')
      
      setCustomTitle('') // Clear custom title after saving
      setSelectedActiveEvaluationKey('')

      const draftKey = `masaar_grades_draft_${tenantId}_${grade}`
      try { localStorage.removeItem(draftKey) } catch (e) {}
      setHasRestoredDraft(false)

      // Reload unique evaluations list
      await loadUniqueEvaluationsList(grade)

      // Clear entered scores
      const cleared = { ...sheetData }
      records.forEach(r => {
        cleared[r.student_id] = { score: '', notes: '' }
      })
      setSheetData(cleared)
    } catch (err) {
      console.error(err)
      flash('فشل حفظ الدرجات: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Populate form with history record for editing
  const handleEditHistoryRecord = (record) => {
    const [type, title] = selectedEvaluation.split(':')
    setSelectedActiveEvaluationKey(selectedEvaluation)
    
    // Find the original record's characteristics
    const firstGraded = historyGrades.find(g => g.score !== null && g.score !== undefined)
    const subj = firstGraded ? firstGraded.subject : ''
    const maxSc = firstGraded ? firstGraded.max_score : 10
    const sessId = firstGraded ? firstGraded.session_id : 'custom'
    const recordDate = firstGraded?.created_at ? new Date(firstGraded.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

    setEvalType(type)
    setSessionId(sessId || 'custom')
    setDate(recordDate)
    setEvalSubject(subj || '')
    setMaxScore(maxSc || 10)

    const nextSheetData = {}
    students.forEach(s => {
      const match = historyGrades.find(g => g.student_id === s.id)
      nextSheetData[s.id] = {
        score: match && match.score !== null ? String(match.score) : '',
        notes: match && match.notes ? match.notes : ''
      }
    })
    setSheetData(nextSheetData)

    setEditingEvaluation({
      type,
      title,
      originalGrades: historyGrades
    })

    setActiveSubTab('grade')
  }

  // Helper to check if a student belongs to the selected group
  const isStudentInSelectedGroup = (studentProfile) => {
    if (!group) return true
    
    // 1. Check student_groups relation (UUID match)
    if (studentProfile.student_groups && studentProfile.student_groups.some(sg => sg.group_id === group)) {
      return true
    }
    
    // 2. Fallback to legacy string matching
    const selectedGroupObj = groupsList.find(g => g.id === group)
    if (selectedGroupObj && studentProfile.group === selectedGroupObj.name) {
      return true
    }
    
    return false
  }

  // Filter active student list by search query and group
  const searchedActiveStudents = useMemo(() => {
    return students.filter(s => {
      const matchesGroup = isStudentInSelectedGroup(s)
      const matchesSearch = searchQuery.trim() 
        ? s.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true
      return matchesGroup && matchesSearch
    })
  }, [students, group, searchQuery, groupsList])

  // Load grades records for selected history evaluation
  useEffect(() => {
    if (activeSubTab !== 'history' || !selectedEvaluation) {
      setHistoryGrades([])
      return
    }

    let active = true
    setHistoryLoading(true)
    ;(async () => {
      try {
        const [type, title] = selectedEvaluation.split(':')
        const data = await listGradesForEvaluation(type, title)
        if (!active) return

        // Filter data by group
        const filtered = data.filter(r => {
          if (!r.profiles) return false
          const matchesGrade = r.profiles.grade === grade
          const selectedGroupObj = groupsList.find(g => g.id === group)
          const matchesGroup = group 
            ? (r.profiles.group === (selectedGroupObj?.name || '') || (r.profiles.student_groups && r.profiles.student_groups.some(sg => sg.group_id === group)))
            : true
          return matchesGrade && matchesGroup
        })

        setHistoryGrades(filtered)
      } catch (err) {
        console.error(err)
        flash('فشل تحميل سجلات الدرجات السابقة', 'error')
      } finally {
        if (active) setHistoryLoading(false)
      }
    })()

    return () => { active = false }
  }, [activeSubTab, selectedEvaluation, grade, group, groupsList])

  // Combine all active class students with their history grades
  const combinedHistoryRows = useMemo(() => {
    // 1. Get all active students of the current grade & group
    const activeClassStudents = students.filter(s => isStudentInSelectedGroup(s))

    // 2. Map them to their grade record if it exists
    const rows = activeClassStudents.map(student => {
      const record = historyGrades.find(r => r.student_id === student.id)
      return {
        id: record?.id || `dummy-${student.id}`,
        student_id: student.id,
        student_name: student.name,
        profile: student,
        score: record ? record.score : null,
        max_score: record ? record.max_score : null,
        notes: record ? record.notes : null,
        created_at: record ? record.created_at : null
      }
    })

    // 3. Add any records in historyGrades that are not in the active class list (to cover deleted/moved students)
    historyGrades.forEach(record => {
      if (!rows.some(row => row.student_id === record.student_id)) {
        rows.push({
          id: record.id,
          student_id: record.student_id,
          student_name: record.profiles?.name || '—',
          profile: record.profiles || { name: record.profiles?.name || '—', phone: record.profiles?.phone || '—', group: record.profiles?.group || '—' },
          score: record.score,
          max_score: record.max_score,
          notes: record.notes,
          created_at: record.created_at
        })
      }
    })

    return rows
  }, [students, historyGrades, group, groupsList])

  // Calculate history stats
  const historyStats = useMemo(() => {
    const classTotal = combinedHistoryRows.length
    if (historyGrades.length === 0) return { total: classTotal, max: 0, min: 0, avg: 0, passRate: 0 }

    const scores = historyGrades.map(r => parseFloat(r.score)).filter(s => !isNaN(s))
    if (scores.length === 0) return { total: classTotal, max: 0, min: 0, avg: 0, passRate: 0 }

    const max = Math.max(...scores)
    const min = Math.min(...scores)
    const sum = scores.reduce((a, b) => a + b, 0)
    const avg = Math.round((sum / scores.length) * 10) / 10

    const maxScoreLimit = historyGrades[0]?.max_score || 10
    const passCount = scores.filter(s => s >= maxScoreLimit * 0.5).length
    const passRate = Math.round((passCount / scores.length) * 100)

    return { total: classTotal, max, min, avg, passRate }
  }, [combinedHistoryRows, historyGrades])

  // Filter history records by search query
  const searchedHistoryRows = useMemo(() => {
    return combinedHistoryRows.filter(r => {
      if (!historySearchQuery.trim()) return true
      const name = r.student_name || ''
      return name.toLowerCase().includes(historySearchQuery.toLowerCase())
    })
  }, [combinedHistoryRows, historySearchQuery])

  // Print history function
  const handlePrintGrades = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const [type, title] = selectedEvaluation.split(':')
    const typeLabels = {
      'homework': 'واجب منزلي',
      'exam': 'امتحان / اختبار',
      'quiz': 'تسميع',
      'participation': 'مشاركة وتفاعل',
      'behavior': 'ملاحظة سلوكية'
    }

    const typeText = typeLabels[type] || type
    const gradeText = GRADE_LABEL[grade] || grade
    const selectedGroupObj = groupsList.find(g => g.id === group)
    const groupText = group ? `المجموعة ${selectedGroupObj?.name || ''}` : 'جميع المجموعات'

    const rowsHtml = searchedHistoryRows.map((r, idx) => {
      const studentGroup = r.profile?.group || (r.profile?.student_groups?.[0] ? groupsList.find(g => g.id === r.profile.student_groups[0].group_id)?.name : '') || '—'
      const scoreText = r.score !== null ? `${r.score} / ${r.max_score}` : '—'
      return `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${r.student_name || '—'}</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${studentGroup}</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center; direction: ltr;">${r.profile?.phone || '—'}</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #7c3aed;">
            ${scoreText}
          </td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-size: 0.9em; color: #555;">${r.notes || '—'}</td>
        </tr>
      `
    }).join('')

    const htmlContent = `
      <html dir="rtl">
        <head>
          <title>كشف درجات - ${title}</title>
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
          <h1>كشف درجات وتقييم الطلاب - منصة مسار</h1>
          <h2>${gradeText} | التقييم: ${title} (${typeText}) | ${groupText}</h2>
          
          <div class="stats-container">
            <div class="stat-box">إجمالي الطلاب<div class="stat-val">${historyStats.total}</div></div>
            <div class="stat-box" style="color: #10b981;">أعلى درجة<div class="stat-val">${historyStats.max}</div></div>
            <div class="stat-box" style="color: #ef4444;">أقل درجة<div class="stat-val">${historyStats.min}</div></div>
            <div class="stat-box" style="color: #7c3aed;">متوسط الدرجات<div class="stat-val">${historyStats.avg}</div></div>
            <div class="stat-box" style="color: #06b6d4;">نسبة النجاح<div class="stat-val">${historyStats.passRate}%</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>اسم الطالب</th>
                <th style="width: 100px;">المجموعة</th>
                <th style="width: 150px;">رقم الهاتف</th>
                <th style="width: 120px;">الدرجة</th>
                <th>ملاحظات المعلم</th>
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

  const formatEvaluationLabel = (item) => {
    if (!item) return ''
    const title = (item.title || '').trim()
    const typeLabels = {
      'homework': 'واجب',
      'exam': 'امتحان',
      'quiz': 'تسميع',
      'participation': 'مشاركة',
      'behavior': 'سلوك'
    }
    const typeLabel = typeLabels[item.type] || item.type
    if (title.startsWith(typeLabel) || title.startsWith(item.type)) {
      return title
    }
    return `${typeLabel}: ${title}`
  }

  return (
    <div className="cp-panel-container">
      
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>رصد درجات الطلاب والتقييمات</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>قم برصد درجات الواجبات، الاختبارات والتقييم السلوكي للطلاب دفعة واحدة</p>
        </div>
        <button onClick={onBack} className="cp-btn cp-btn-secondary">
          رجوع للوحة التحكم
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, margin: '0 0 24px 0', borderBottom: '1px solid var(--cp-divider)', paddingBottom: '12px' }}>
        <button
          className={`cp-btn ${activeSubTab === 'grade' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          onClick={() => setActiveSubTab('grade')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
        >
          <i className="fas fa-file-signature" />
          رصد درجات جديدة
        </button>
        <button
          className={`cp-btn ${activeSubTab === 'history' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          onClick={() => setActiveSubTab('history')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
        >
          <i className="fas fa-clock-rotate-left" />
          سجلات الدرجات السابقة
        </button>
      </div>

      {/* Target Class Filter */}
      <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: 'var(--cp-card-shadow)' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>المرحلة الدراسية</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {gradesList.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>تصفية بالمجموعة</label>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            <option value="">جميع المجموعات</option>
            {groupsList.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {activeSubTab === 'history' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>التقييم السابق</label>
            {historyEvaluations.length === 0 ? (
              <select className="cp-input" style={{ width: '100%' }} disabled>
                <option>لا توجد تقييمات محفوظة</option>
              </select>
            ) : (
              <select value={selectedEvaluation} onChange={(e) => setSelectedEvaluation(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                {historyEvaluations.map(item => (
                  <option key={`${item.type}:${item.title}`} value={`${item.type}:${item.title}`}>
                    {formatEvaluationLabel(item)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {activeSubTab === 'grade' ? (
        <>
          {/* Active Evaluation / Session Selection Bar */}
          <div style={{
            background: 'var(--cp-card-bg)',
            border: '1px solid var(--cp-card-border)',
            borderRadius: '16px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: 'var(--cp-card-shadow)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 320px' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                <i className="fas fa-layer-group"></i>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '4px', color: 'var(--cp-text-muted)' }}>
                  كشف التقييم (جلسة الرصد)
                </label>
                <select
                  value={selectedActiveEvaluationKey}
                  onChange={(e) => handleActiveEvaluationChange(e.target.value)}
                  className="cp-input"
                  style={{ width: '100%', fontWeight: 700, borderColor: selectedActiveEvaluationKey ? '#3b82f6' : 'var(--cp-card-border)' }}
                >
                  <option value="">+ رصد كشف تقييم جديد</option>
                  {historyEvaluations.map(item => (
                    <option key={`${item.type}:${item.title}`} value={`${item.type}:${item.title}`}>
                      متابعة كشف: {formatEvaluationLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {hasRestoredDraft && !editingEvaluation && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#10b981',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 700
              }}>
                <i className="fas fa-floppy-disk"></i>
                <span>تم استرجاع مسودة الرصد المحفوظة</span>
                <button
                  onClick={handleClearDraft}
                  className="cp-btn"
                  style={{ padding: '3px 8px', fontSize: '0.78rem', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 6 }}
                >
                  مسح المسودة
                </button>
              </div>
            )}
          </div>

          {editingEvaluation && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#f59e0b',
              animation: 'cpFadeUp 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-edit"></i>
                <span><strong>أنت الآن في وضع تعديل وإكمال الكشف: </strong> {editingEvaluation.title}</span>
              </div>
              <button
                onClick={() => {
                  setEditingEvaluation(null)
                  setSelectedActiveEvaluationKey('')
                  const cleared = {}
                  students.forEach(s => { cleared[s.id] = { score: '', notes: '' } })
                  setSheetData(cleared)
                  setCustomTitle('')
                }}
                className="cp-btn"
                style={{ padding: '4px 10px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
              >
                إلغاء التعديل
              </button>
            </div>
          )}

          {/* Evaluation Configuration */}
          <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>نوع التقييم</label>
              <select value={evalType} onChange={(e) => setEvalType(e.target.value)} disabled={!!editingEvaluation} className="cp-input" style={{ width: '100%' }}>
                <option value="homework">واجب منزلي</option>
                <option value="exam">امتحان / اختبار</option>
                <option value="quiz">تسميع</option>
                <option value="participation">مشاركة وتفاعل</option>
                <option value="behavior">ملاحظة سلوكية</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الحصة / الدرس المرتبط</label>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!!editingEvaluation} className="cp-input" style={{ width: '100%' }}>
                {homeworksList.map(h => (
                  <option key={h.id} value={h.id}>{h.title} ({h.week || 'درس'})</option>
                ))}
                <option value="custom">تاريخ مخصص يدوياً (جديد)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>التاريخ</label>
              <DatePicker 
                value={date} 
                onChange={setDate} 
                style={{ width: '100%' }}
                placeholder="اختر تاريخاً"
                disabled={!!editingEvaluation}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>اسم الاختبار / التقييم (اختياري)</label>
              <input 
                type="text" 
                value={customTitle} 
                onChange={(e) => setCustomTitle(e.target.value)} 
                placeholder="مثال: الباب الأول" 
                className="cp-input" 
                style={{ width: '100%' }} 
                disabled={!!editingEvaluation}
              />
            </div>



            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>المادة الدراسية (اختياري)</label>
              <input 
                type="text" 
                value={evalSubject} 
                onChange={(e) => setEvalSubject(e.target.value)} 
                placeholder="مثال: رياضيات" 
                className="cp-input" 
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الدرجة العظمى</label>
              <input 
                type="number" 
                value={maxScore} 
                onChange={(e) => setMaxScore(Math.max(1, parseInt(e.target.value) || 10))} 
                className="cp-input" 
                style={{ width: '100%' }}
                min="1"
                onWheel={(e) => e.target.blur()}
              />
            </div>
          </div>

          {/* Title Preview Alert */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '0.88rem',
            color: '#818cf8',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-info-circle" style={{ color: '#6366f1' }}></i>
            <span>
              <strong>اسم التقييم الناتج: </strong>
              <span style={{ color: '#f1f5f9', fontWeight: 'bold' }}>
                {getAutoTitle(evalType, sessionId, date, customTitle)}
              </span>
            </span>
          </div>

          {/* Spreadsheet sheet utilities & Search */}
          {students.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--cp-text-muted)', marginInlineEnd: '8px' }}>أدوات التعبئة التلقائية للدرجة:</span>
                <button onClick={() => handleBulkFill(maxScore)} className="cp-btn cp-btn-info" style={{ padding: '5px 12px', fontSize: '0.82rem' }}>الدرجة النهائية للكل</button>
                <button onClick={() => handleBulkFill('0')} className="cp-btn cp-btn-danger" style={{ padding: '5px 12px', fontSize: '0.82rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>تصفير الكل</button>
                <button onClick={() => handleBulkFill('')} className="cp-btn cp-btn-secondary" style={{ padding: '5px 12px', fontSize: '0.82rem' }}>مسح الدرجات</button>
              </div>

              <div style={{ position: 'relative', width: '300px' }}>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="البحث باسم الطالب للرصد..."
                  className="cp-input"
                  style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '0.85rem' }}
                />
                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', fontSize: '0.82rem' }} />
              </div>
            </div>
          )}

          {/* Student List Sheet Table */}
          {loading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تحميل الطلاب لرصد الدرجات...</p>
            </div>
          ) : searchedActiveStudents.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-users-slash"></i>
              <p>لا يوجد طلاب مسجلين في هذه المرحلة أو المجموعة مطابقة للبحث</p>
            </div>
          ) : (
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--cp-card-shadow)', marginBottom: '24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>اسم الطالب</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '90px' }}>المجموعة</th>
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '160px', textAlign: 'center' }}>الدرجة المستحقة (من {maxScore})</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>ملاحظات المعلم (تظهر لولي الأمر)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchedActiveStudents.map((student) => {
                      const data = sheetData[student.id] || { score: '', notes: '' }
                      return (
                        <tr key={student.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)', transition: 'background 0.2s' }} className="table-row-hover">
                          <td style={{ padding: '14px 20px', fontWeight: 'bold' }}>{student.name}</td>
                          <td style={{ padding: '14px' }}>
                            <span className="cp-id-pill">{student.group || '—'}</span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                              <input 
                                type="number" 
                                value={data.score}
                                onChange={(e) => handleCellChange(student.id, 'score', e.target.value)}
                                placeholder="—"
                                className="cp-input"
                                style={{ width: '80px', padding: '6px', textAlign: 'center', fontSize: '0.92rem', fontWeight: 'bold' }}
                                min="0"
                                max={maxScore}
                                step="0.5"
                                onWheel={(e) => e.target.blur()}
                              />
                              <span style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)' }}>/ {maxScore}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 20px' }}>
                            <input 
                              type="text" 
                              value={data.notes}
                              onChange={(e) => handleCellChange(student.id, 'notes', e.target.value)}
                              placeholder="ملاحظات سلوكية، نقاط ضعف، تشجيع..."
                              className="cp-input"
                              style={{ width: '100%', padding: '6px 12px', fontSize: '0.88rem' }}
                            />
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
                  onClick={handleSaveGrades} 
                  disabled={saving} 
                  className="cp-btn cp-btn-success"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontWeight: 'bold' }}
                >
                  {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-arrow-up"></i>}
                  <span>حفظ كشف الدرجات وإرسال الإشعارات للآباء</span>
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
              <span style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>إجمالي الطلاب</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: 'var(--cp-text-main)' }}>{historyStats.total}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #10b981', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 'bold' }}><i className="fas fa-star" style={{ marginInlineEnd: '4px' }} />أعلى درجة</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#10b981' }}>{historyStats.max}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #ef4444', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: 'bold' }}><i className="fas fa-circle-chevron-down" style={{ marginInlineEnd: '4px' }} />أقل درجة</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#ef4444' }}>{historyStats.min}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #7c3aed', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#7c3aed', fontWeight: 'bold' }}><i className="fas fa-calculator" style={{ marginInlineEnd: '4px' }} />المتوسط العام</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#7c3aed' }}>{historyStats.avg}</div>
            </div>
            <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderTop: '4px solid #06b6d4', borderRadius: '16px', padding: '16px', textAlign: 'center', boxShadow: 'var(--cp-card-shadow)' }}>
              <span style={{ fontSize: '0.82rem', color: '#06b6d4', fontWeight: 'bold' }}><i className="fas fa-percentage" style={{ marginInlineEnd: '4px' }} />نسبة النجاح</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#06b6d4' }}>{historyStats.passRate}%</div>
            </div>
          </div>

          {/* Action and Search Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
              <input 
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="البحث باسم الطالب في كشف الدرجات..."
                className="cp-input"
                style={{ width: '100%', padding: '10px 16px 10px 40px', fontSize: '0.9rem' }}
              />
              <i className="fas fa-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)' }} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {selectedEvaluation && (
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

              {selectedEvaluation && (
                <button 
                  onClick={handleDeleteEvaluation} 
                  disabled={deletingEvaluation} 
                  className="cp-btn cp-btn-danger"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                >
                  {deletingEvaluation ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />}
                  حذف الكشف بالكامل
                </button>
              )}

              {searchedHistoryRows.length > 0 && (
                <button 
                  onClick={handlePrintGrades}
                  className="cp-btn cp-btn-info"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
                >
                  <i className="fas fa-print" />
                  طباعة الكشف الحالي
                </button>
              )}
            </div>
          </div>

          {/* History Grades Table */}
          {historyLoading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تحميل درجات التقييم المحفوظ...</p>
            </div>
          ) : searchedHistoryRows.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-clipboard-question"></i>
              <p>لا توجد درجات مرصودة محفوظة مطابقة لخيارات التصفية</p>
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
                      <th style={{ padding: '16px', fontWeight: 'bold', width: '150px', textAlign: 'center' }}>الدرجة المرصودة</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>ملاحظات التقييم</th>
                      <th style={{ padding: '16px 20px', fontWeight: 'bold', width: '100px', textAlign: 'center' }}>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchedHistoryRows.map((record, index) => {
                      const studentGroup = record.profile?.group || (record.profile?.student_groups?.[0] ? groupsList.find(g => g.id === record.profile.student_groups[0].group_id)?.name : '') || '—'
                      return (
                        <tr key={record.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)', opacity: record.score !== null ? 1 : 0.6 }}>
                          <td style={{ padding: '14px 20px', color: 'var(--cp-text-muted)', textAlign: 'center' }}>{index + 1}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 'bold' }}>{record.student_name}</td>
                          <td style={{ padding: '14px' }}>
                            <span className="cp-id-pill">{studentGroup}</span>
                          </td>
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{record.profile?.phone || '—'}</td>
                          <td style={{ padding: '14px', textAlign: 'center', fontWeight: 'bold', color: record.score !== null ? '#7c3aed' : 'var(--cp-text-muted)' }}>
                            {record.score !== null ? `${record.score} / ${record.max_score}` : '—'}
                          </td>
                          <td style={{ padding: '14px 20px', color: 'var(--cp-text-muted)' }}>{record.notes || '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleEditHistoryRecord(record)}
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

      {/* Table hover keyframes styling inline */}
      <style>{`
        .table-row-hover:hover {
          background: var(--cp-hover-bg) !important;
        }
      `}</style>
    </div>
  )
}
