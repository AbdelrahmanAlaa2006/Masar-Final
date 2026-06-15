import React, { useState, useEffect, useMemo } from 'react'
import { listStudents } from '@backend/profilesApi'
import { listHomeworks } from '@backend/homeworksApi'
import { saveGradesBatch, listUniqueEvaluations, listGradesForEvaluation } from '@backend/gradesApi'
import { useAuth } from '../../contexts/AuthContext'

export default function GradesPanel({ onBack, flash }) {
  const { user: currentUser } = useAuth()

  const [grade, setGrade] = useState('first-sec')
  const [group, setGroup] = useState('')
  
  // Evaluation settings
  const [evalType, setEvalType] = useState('homework')
  const [evalSubject, setEvalSubject] = useState('')
  const [maxScore, setMaxScore] = useState(10)

  // Students list
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Scores sheet states: studentId -> { score: num, notes: string }
  const [sheetData, setSheetData] = useState({})

  const [activeSubTab, setActiveSubTab] = useState('grade') // 'grade' | 'history'
  const [searchQuery, setSearchQuery] = useState('') // active student name search
  
  // History states
  const [historyEvaluations, setHistoryEvaluations] = useState([])
  const [selectedEvaluation, setSelectedEvaluation] = useState('')
  const [historyGrades, setHistoryGrades] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState('')

  // Linked session/date states
  const [homeworksList, setHomeworksList] = useState([])
  const [sessionId, setSessionId] = useState('custom')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // Map DB grade enum → Arabic label
  const GRADE_LABEL = {
    'first-prep':  'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep':  'الصف الثالث الإعدادي',
    'first-sec':   'الصف الأول الثانوي',
    'second-sec':  'الصف الثاني الثانوي',
    'third-sec':   'الصف الثالث الثانوي',
  }

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

  // Load students, homeworks (lessons), and evaluations list
  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      try {
        const [allStudents, allHomeworks] = await Promise.all([
          listStudents(),
          listHomeworks()
        ])
        if (!active) return

        const filtered = allStudents.filter(s => s.grade === grade && s.is_approved)
        setStudents(filtered)
        
        const mappedGrade = grade === 'first-prep' ? 'first' : grade === 'second-prep' ? 'second' : grade === 'third-prep' ? 'third' : grade
        const filteredHomeworks = allHomeworks.filter(h => h.grade === mappedGrade)
        setHomeworksList(filteredHomeworks)

        if (filteredHomeworks.length > 0) {
          setSessionId(filteredHomeworks[0].id)
        } else {
          setSessionId('custom')
        }

        // Reset sheet data
        const initialSheet = {}
        filtered.forEach(s => {
          initialSheet[s.id] = { score: '', notes: '' }
        })
        setSheetData(initialSheet)

        await loadUniqueEvaluationsList(grade)
      } catch (err) {
        console.error(err)
        flash('فشل تحميل قائمة الطلاب والحصص', 'error')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [grade])

  // Helper to auto-generate default title based on selected type, lesson, and date
  const getAutoTitle = (type, sId, dateVal) => {
    const typeLabels = {
      'homework': 'واجب',
      'exam': 'امتحان',
      'participation': 'مشاركة وتفاعل',
      'behavior': 'سلوك'
    }
    const typeLabel = typeLabels[type] || type

    const getDayName = (dateStr) => {
      if (!dateStr) return ''
      try {
        const d = new Date(dateStr)
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
        return dayNames[d.getDay()]
      } catch (e) {
        return ''
      }
    }

    const dateSuffix = dateVal ? ` - ${dateVal} (${getDayName(dateVal)})` : ''

    if (sId && sId !== 'custom') {
      const lesson = homeworksList.find(h => h.id === sId)
      if (lesson) {
        return `${typeLabel}: ${lesson.title}${dateSuffix}`
      }
    }
    return `${typeLabel}${dateSuffix}`
  }

  // Bulk fill utility
  const handleBulkFill = (fillValue) => {
    const next = { ...sheetData }
    students.forEach(s => {
      if (!group || s.group === group) {
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
    const finalTitle = getAutoTitle(evalType, sessionId, date)

    const records = []
    let scoreValidationError = false

    students.forEach(s => {
      if (group && s.group !== group) return // Skip if filtered out

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

  // Filter active student list by search query and group
  const searchedActiveStudents = useMemo(() => {
    return students.filter(s => {
      const matchesGroup = group ? s.group === group : true
      const matchesSearch = searchQuery.trim() 
        ? s.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true
      return matchesGroup && matchesSearch
    })
  }, [students, group, searchQuery])

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
          const matchesGroup = group ? r.profiles.group === group : true
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
  }, [activeSubTab, selectedEvaluation, grade, group])

  // Calculate history stats
  const historyStats = useMemo(() => {
    if (historyGrades.length === 0) return { total: 0, max: 0, min: 0, avg: 0, passRate: 0 }

    const scores = historyGrades.map(r => parseFloat(r.score)).filter(s => !isNaN(s))
    const total = historyGrades.length
    if (scores.length === 0) return { total, max: 0, min: 0, avg: 0, passRate: 0 }

    const max = Math.max(...scores)
    const min = Math.min(...scores)
    const sum = scores.reduce((a, b) => a + b, 0)
    const avg = Math.round((sum / scores.length) * 10) / 10

    const maxScoreLimit = historyGrades[0]?.max_score || 10
    const passCount = scores.filter(s => s >= maxScoreLimit * 0.5).length
    const passRate = Math.round((passCount / total) * 100)

    return { total, max, min, avg, passRate }
  }, [historyGrades])

  // Filter history records by search query
  const searchedHistoryGrades = useMemo(() => {
    return historyGrades.filter(r => {
      if (!historySearchQuery.trim()) return true
      const name = r.profiles?.name || ''
      return name.toLowerCase().includes(historySearchQuery.toLowerCase())
    })
  }, [historyGrades, historySearchQuery])

  // Print history function
  const handlePrintGrades = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const [type, title] = selectedEvaluation.split(':')
    const typeLabels = {
      'homework': 'واجب منزلي',
      'exam': 'امتحان / اختبار',
      'participation': 'مشاركة وتفاعل',
      'behavior': 'ملاحظة سلوكية'
    }

    const typeText = typeLabels[type] || type
    const gradeText = GRADE_LABEL[grade] || grade
    const groupText = group ? `المجموعة ${group}` : 'جميع المجموعات'

    const rowsHtml = searchedHistoryGrades.map((r, idx) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${r.profiles?.name || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${r.profiles?.group || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; direction: ltr;">${r.profiles?.phone || '—'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #7c3aed;">
          ${r.score} / ${r.max_score}
        </td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-size: 0.9em; color: #555;">${r.notes || '—'}</td>
      </tr>
    `).join('')

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

        {activeSubTab === 'history' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>التقييم السابق</label>
            {historyEvaluations.length === 0 ? (
              <select className="cp-input" style={{ width: '100%' }} disabled>
                <option>لا توجد تقييمات محفوظة</option>
              </select>
            ) : (
              <select value={selectedEvaluation} onChange={(e) => setSelectedEvaluation(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                {historyEvaluations.map(item => {
                  const typeLabels = {
                    'homework': 'واجب منزلي',
                    'exam': 'امتحان',
                    'participation': 'مشاركة',
                    'behavior': 'سلوك'
                  }
                  return (
                    <option key={`${item.type}:${item.title}`} value={`${item.type}:${item.title}`}>
                      {item.title} ({typeLabels[item.type] || item.type})
                    </option>
                  )
                })}
              </select>
            )}
          </div>
        )}
      </div>

      {activeSubTab === 'grade' ? (
        <>
          {/* Evaluation Configuration */}
          <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>نوع التقييم</label>
              <select value={evalType} onChange={(e) => setEvalType(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="homework">واجب منزلي</option>
                <option value="exam">امتحان / اختبار</option>
                <option value="participation">مشاركة وتفاعل</option>
                <option value="behavior">ملاحظة سلوكية</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الحصة / الدرس المرتبط</label>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                {homeworksList.map(h => (
                  <option key={h.id} value={h.id}>{h.title} ({h.week || 'درس'})</option>
                ))}
                <option value="custom">تاريخ مخصص يدوياً (جديد)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="cp-input" style={{ width: '100%' }} />
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
              />
            </div>
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

            {searchedHistoryGrades.length > 0 && (
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

          {/* History Grades Table */}
          {historyLoading ? (
            <div className="cp-empty">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تحميل درجات التقييم المحفوظ...</p>
            </div>
          ) : searchedHistoryGrades.length === 0 ? (
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
                    </tr>
                  </thead>
                  <tbody>
                    {searchedHistoryGrades.map((record, index) => {
                      return (
                        <tr key={record.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                          <td style={{ padding: '14px 20px', color: 'var(--cp-text-muted)', textAlign: 'center' }}>{index + 1}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 'bold' }}>{record.profiles?.name || '—'}</td>
                          <td style={{ padding: '14px' }}>
                            <span className="cp-id-pill">{record.profiles?.group || '—'}</span>
                          </td>
                          <td style={{ padding: '14px', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{record.profiles?.phone || '—'}</td>
                          <td style={{ padding: '14px', textAlign: 'center', fontWeight: 'bold', color: '#7c3aed' }}>
                            {record.score} / {record.max_score}
                          </td>
                          <td style={{ padding: '14px 20px', color: 'var(--cp-text-muted)' }}>{record.notes || '—'}</td>
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
