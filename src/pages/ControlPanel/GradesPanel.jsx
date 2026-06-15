import React, { useState, useEffect } from 'react'
import { listStudents } from '@backend/profilesApi'
import { saveGradesBatch } from '@backend/gradesApi'
import { useAuth } from '../../contexts/AuthContext'

export default function GradesPanel({ onBack, flash }) {
  const { user: currentUser } = useAuth()

  const [grade, setGrade] = useState('first-sec')
  const [group, setGroup] = useState('')
  
  // Evaluation settings
  const [evalType, setEvalType] = useState('homework')
  const [evalTitle, setEvalTitle] = useState('')
  const [evalSubject, setEvalSubject] = useState('')
  const [maxScore, setMaxScore] = useState(10)

  // Students list
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Scores sheet states: studentId -> { score: num, notes: string }
  const [sheetData, setSheetData] = useState({})

  // Map DB grade enum → Arabic label
  const GRADE_LABEL = {
    'first-prep':  'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep':  'الصف الثالث الإعدادي',
    'first-sec':   'الصف الأول الثانوي',
    'second-sec':  'الصف الثاني الثانوي',
    'third-sec':   'الصف الثالث الثانوي',
  }

  // Load students for selected grade
  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      try {
        const allStudents = await listStudents()
        if (!active) return

        const filtered = allStudents.filter(s => s.grade === grade && s.is_approved)
        setStudents(filtered)
        
        // Reset sheet data
        const initialSheet = {}
        filtered.forEach(s => {
          initialSheet[s.id] = { score: '', notes: '' }
        })
        setSheetData(initialSheet)
      } catch (err) {
        console.error(err)
        flash('فشل تحميل قائمة الطلاب', 'error')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [grade])

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
    if (!evalTitle.trim()) {
      flash('يرجى كتابة عنوان التقييم أولاً (مثال: واجب الدرس الأول)', 'warning')
      return
    }

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
          type: evalType,
          title: evalTitle.trim(),
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

  const filteredStudents = group 
    ? students.filter(s => s.group === group)
    : students

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
      </div>

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
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>عنوان التقييم *</label>
          <input 
            type="text" 
            value={evalTitle} 
            onChange={(e) => setEvalTitle(e.target.value)} 
            placeholder="مثال: واجب الحصة 3" 
            className="cp-input" 
            style={{ width: '100%' }}
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
          />
        </div>
      </div>

      {/* Spreadsheet sheet utilities */}
      {students.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--cp-text-muted)', marginInlineEnd: '8px' }}>أدوات التعبئة التلقائية للدرجة:</span>
          <button onClick={() => handleBulkFill(maxScore)} className="cp-btn cp-btn-info" style={{ padding: '5px 12px', fontSize: '0.82rem' }}>الدرجة النهائية للكل</button>
          <button onClick={() => handleBulkFill('0')} className="cp-btn cp-btn-danger" style={{ padding: '5px 12px', fontSize: '0.82rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>تصفير الكل</button>
          <button onClick={() => handleBulkFill('')} className="cp-btn cp-btn-secondary" style={{ padding: '5px 12px', fontSize: '0.82rem' }}>مسح الدرجات</button>
        </div>
      )}

      {/* Student List Sheet Table */}
      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل الطلاب لرصد الدرجات...</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-users-slash"></i>
          <p>لا يوجد طلاب مسجلين في هذه المرحلة أو المجموعة</p>
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
                {filteredStudents.map((student) => {
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

      {/* Table hover keyframes styling inline */}
      <style>{`
        .table-row-hover:hover {
          background: var(--cp-hover-bg) !important;
        }
      `}</style>
    </div>
  )
}
