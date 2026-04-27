import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './ExamAdd.css'
import { notify } from '../utils/notify'
import { createExam, uiToDbGrade } from '@backend/examsApi'
import QuestionImagePicker from '../components/QuestionImagePicker'

export default function ExamAdd() {
  const navigate = useNavigate()
  const [examNumber, setExamNumber] = useState('')
  const [examTitle, setExamTitle] = useState('')
  const [examGrade, setExamGrade] = useState(
    localStorage.getItem('selectedGrade') || 'first'
  )
  const [duration, setDuration] = useState('')
  const [maxAttempts, setMaxAttempts] = useState(1)
  const [examDurationHours, setExamDurationHours] = useState(72)
  const [numQuestions, setNumQuestions] = useState('')
  const [questions, setQuestions] = useState([])
  const [questionsCopy, setQuestionsCopy] = useState('')
  const [showCopySection, setShowCopySection] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const generateQuestions = () => {
    const count = parseInt(numQuestions)
    if (!count || count <= 0) {
      notify('يرجى إدخال عدد صحيح من الأسئلة', { type: 'warning' })
      return
    }

    const newQuestions = Array(count).fill(null).map((_, i) => ({
      id: i,
      question: '',
      image: '',          // optional public URL (from `quiz-images` bucket)
      options: ['', ''],
      answers: [0],
      points: 1,
      isMultiple: false
    }))

    setQuestions(newQuestions)
    setShowCopySection(true)
  }

  // ── Friendly one-click "add another question" ──────────────────
  // For non-technical admins: no need to fiddle with the count input.
  // We append a blank question with a fresh id.
  const addSingleQuestion = () => {
    const nextId = questions.length === 0
      ? 0
      : Math.max(...questions.map(q => q.id)) + 1
    setQuestions(prev => [
      ...prev,
      { id: nextId, question: '', image: '', options: ['', ''], answers: [0], points: 1, isMultiple: false },
    ])
    setNumQuestions(String(questions.length + 1))
    setShowCopySection(true)
  }

  // Delete a single question (and renumber the displayed count).
  const removeQuestion = (id) => {
    setQuestions(prev => {
      const next = prev.filter(q => q.id !== id)
      setNumQuestions(String(next.length))
      return next
    })
  }

  const updateQuestion = (id, field, value) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q))
  }

  const addOption = (id) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, options: [...q.options, ''] } : q
    ))
  }

  const removeOption = (id) => {
    setQuestions(questions.map(q => {
      if (q.id === id && q.options.length > 2) {
        const newOptions = q.options.slice(0, -1)
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  const updateOption = (id, optionIndex, value) => {
    setQuestions(questions.map(q => {
      if (q.id === id) {
        const newOptions = [...q.options]
        newOptions[optionIndex] = value
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  const toggleMultipleAnswers = (id) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, isMultiple: !q.isMultiple, answers: q.isMultiple ? [0] : q.answers } : q
    ))
  }

  const updateAnswer = (id, answerIndex, isChecked) => {
    setQuestions(questions.map(q => {
      if (q.id === id) {
        let newAnswers
        if (q.isMultiple) {
          newAnswers = isChecked 
            ? [...q.answers, answerIndex] 
            : q.answers.filter(a => a !== answerIndex)
        } else {
          newAnswers = [answerIndex]
        }
        return { ...q, answers: newAnswers }
      }
      return q
    }))
  }

  // ── Bulk import (single, simple format) ──────────────────────
  //   • Blank line separates questions.
  //   • First line of each block = the question.
  //   • Following lines = options.
  //   • A line starting with `*` (or `★ ✓ ✔`) marks a correct option.
  //   • Optional line starting with `!N` at end of a block = points.
  const parseCopiedQuestions = () => {
    const text = questionsCopy.trim()
    if (!text) {
      notify('يرجى إدخال الأسئلة', { type: 'warning' })
      return
    }
    const parsedQuestions = parseNaturalFormat(text)
    if (parsedQuestions.length === 0) {
      notify('لم يتم العثور على أسئلة — تأكد من التنسيق', { type: 'warning' })
      return
    }
    setNumQuestions(parsedQuestions.length.toString())
    setQuestions(parsedQuestions)
    notify(`تم استيراد ${parsedQuestions.length} سؤال بنجاح`, { type: 'success' })
  }

  // Splits the input on blank lines, then turns each block into a question.
  // First line = question; subsequent lines = options. `*` (or `★`) prefix
  // marks correct. A trailing `!N` line (or `[N]` after the question) sets
  // points. Lenient whitespace and Arabic punctuation.
  const parseNaturalFormat = (text) => {
    const blocks = text
      .split(/\n\s*\n+/) // blank-line separator
      .map((b) => b.trim())
      .filter((b) => b.length > 0)
    return blocks.map((block, i) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
      let points = 1
      // Trailing "!2" line sets points
      if (lines.length > 1 && /^!\s*\d+/.test(lines[lines.length - 1])) {
        const m = lines.pop().match(/\d+/)
        if (m) points = Math.max(1, parseInt(m[0], 10))
      }
      // Inline "[2]" right after the question text
      let questionLine = lines[0] || ''
      const inlinePts = questionLine.match(/[\[\(](\d+)[\]\)]\s*$/)
      if (inlinePts) {
        points = Math.max(1, parseInt(inlinePts[1], 10))
        questionLine = questionLine.replace(/[\[\(](\d+)[\]\)]\s*$/, '').trim()
      }
      const options = []
      const correctAnswers = []
      for (let j = 1; j < lines.length; j++) {
        let opt = lines[j]
        // Strip optional bullet markers like "- ", "1. ", "أ) "
        opt = opt.replace(/^[-•·]\s+/, '')
                 .replace(/^[٠-٩\d]+[\.\)\-]\s*/, '')
                 .replace(/^[a-zA-Zء-ي][\.\)\-]\s*/, '')
        const isCorrect = /^[\*★✓✔]\s*/.test(opt)
        if (isCorrect) opt = opt.replace(/^[\*★✓✔]\s*/, '').trim()
        if (!opt) continue
        options.push(opt)
        if (isCorrect) correctAnswers.push(options.length - 1)
      }
      return {
        id: i,
        question: questionLine,
        options: options.length >= 2 ? options : (options.length ? [...options, ''] : ['', '']),
        answers: correctAnswers.length > 0 ? correctAnswers : [0],
        points,
        isMultiple: correctAnswers.length > 1,
      }
    })
  }


  // Shared validation + clean-question shaping. Returns the preview-ready
  // payload, or null when validation fails (with a notify already fired).
  const buildExamPayload = () => {
    if (!examTitle.trim() || !duration || questions.length === 0) {
      notify('يرجى ملء جميع البيانات المطلوبة', { type: 'warning' })
      return null
    }
    const dbGrade = uiToDbGrade(examGrade)
    if (!dbGrade) {
      notify('يرجى اختيار الصف الدراسي', { type: 'warning' })
      return null
    }
    const isValid = questions.every(q =>
      q.question.trim() &&
      q.options.every(opt => opt.trim()) &&
      q.answers.length > 0
    )
    if (!isValid) {
      notify('يرجى التأكد من ملء جميع الأسئلة والاختيارات وتحديد الإجابات الصحيحة', { type: 'warning' })
      return null
    }
    const cleanQuestions = questions.map(q => ({
      question: q.question,
      image: q.image || null,
      options: q.options,
      answers: q.answers,
      points: q.points,
      isMultiple: q.isMultiple,
    }))
    const total_points = cleanQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
    return { dbGrade, cleanQuestions, total_points }
  }

  // Preview-only — shows the same preview card without writing to DB.
  // Lets the admin sanity-check questions + answers before committing.
  const previewExam = () => {
    const payload = buildExamPayload()
    if (!payload) return
    setPreviewData({
      number: examNumber,
      title: examTitle,
      duration: parseInt(duration),
      maxAttempts: parseInt(maxAttempts),
      examDurationHours: parseInt(examDurationHours),
      questions: payload.cleanQuestions,
      totalPoints: payload.total_points,
    })
    setShowPreview(true)
    // Smooth-scroll to the preview block so it's obvious where to look.
    setTimeout(() => {
      document.querySelector('.preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  // Save-only — writes the exam and navigates to the exams list. Does NOT
  // flash the preview card; admins who want to verify use the preview
  // button first.
  const saveExam = async () => {
    if (saving) return
    const payload = buildExamPayload()
    if (!payload) return

    let createdBy = null
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      createdBy = u?.id || null
    } catch { /* ignore */ }

    setSaving(true)
    try {
      await createExam({
        number: examNumber.trim() || null,
        title: examTitle.trim(),
        grade: payload.dbGrade,
        duration_minutes: parseInt(duration),
        max_attempts: parseInt(maxAttempts),
        available_hours: parseInt(examDurationHours),
        questions: payload.cleanQuestions,
        total_points: payload.total_points,
        created_by: createdBy,
      })
      setShowSuccess(true)
      setTimeout(() => { navigate('/exams') }, 1200)
    } catch (err) {
      notify(err.message || 'تعذر حفظ الامتحان', { type: 'warning' })
      setSaving(false)
    }
  }

  return (
    <div className="exam-add-page">
      <div className="exam-add-container">
        <h1>إنشاء امتحان</h1>

        <div className="form-group">
          <label htmlFor="examNumber">🔢 رقم الامتحان:</label>
          <input 
            type="number" 
            id="examNumber"
            value={examNumber}
            onChange={(e) => setExamNumber(e.target.value)}
            placeholder="مثلاً 5"
          />
        </div>

        <div className="form-group">
          <label htmlFor="examTitle">📝 عنوان الامتحان:</label>
          <input
            type="text"
            id="examTitle"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            placeholder="مثلاً: حساب تفاضلي متقدم"
          />
        </div>

        <div className="form-group">
          <label htmlFor="examGrade">🎓 الصف الدراسي:</label>
          <select
            id="examGrade"
            value={examGrade}
            onChange={(e) => setExamGrade(e.target.value)}
          >
            <option value="first">الصف الأول الإعدادي</option>
            <option value="second">الصف الثاني الإعدادي</option>
            <option value="third">الصف الثالث الإعدادي</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="duration">⏰ مدة الامتحان (بالدقائق):</label>
          <input 
            type="number" 
            id="duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="مثلاً 60"
          />
          
          <div className="exam-settings">
            <div>
              <label htmlFor="maxAttempts">🔁 عدد المحاولات المسموحة:</label>
              <input 
                type="number" 
                id="maxAttempts"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(parseInt(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="examDurationHours">⏳ مدة توفر الامتحان (بالساعات):</label>
              <input 
                type="number" 
                id="examDurationHours"
                min="1"
                value={examDurationHours}
                onChange={(e) => setExamDurationHours(parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="numQuestions">❓ عدد الأسئلة:</label>
          <p style={{
            fontSize: 12.5,
            color: 'var(--text-muted, #718096)',
            margin: '4px 0 8px',
            fontWeight: 600,
          }}>
            اختر طريقة الإضافة: أدخل عدداً وأضغط «إنشاء» لتجهيز عدة أسئلة فارغة دفعة واحدة،
            أو أضف سؤالاً واحداً في كل مرة بزر «➕ سؤال جديد».
          </p>
          <input
            type="number"
            id="numQuestions"
            value={numQuestions}
            onChange={(e) => setNumQuestions(e.target.value)}
            placeholder="مثلاً 3"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button className="btn" onClick={generateQuestions}>✨ إنشاء عدة أسئلة</button>
            <button
              className="btn"
              onClick={addSingleQuestion}
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
            >
              ➕ سؤال جديد
            </button>
          </div>
        </div>

        {showCopySection && (
          <div className="form-group copy-questions">
            <label htmlFor="questionsCopy">📋 إستيراد سريع (لصق عدة أسئلة دفعة واحدة):</label>
            <details
              open
              style={{
                margin: '4px 0 8px',
                padding: '10px 12px',
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px dashed rgba(34, 197, 94, 0.4)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text-secondary, #4a5568)',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#16a34a' }}>
                <i className="fas fa-wand-magic-sparkles"></i> طريقة الكتابة
              </summary>
              <div style={{ marginTop: 8, lineHeight: 1.8 }}>
                <div>اكتب كل سؤال في فقرة منفصلة، السطر الأول هو السؤال، والأسطر التالية هي الاختيارات.</div>
                <div>ضع <strong style={{ color: '#16a34a' }}>*</strong> في بداية الإجابة الصحيحة (يمكن وضعها قبل أكثر من اختيار في حالة الإجابة المتعددة).</div>
                <div>افصل بين الأسئلة بسطر فارغ. اختياري: ضع <code>!2</code> في آخر سطر لتحديد النقاط.</div>
                <div
                  style={{
                    marginTop: 8,
                    background: '#0f172a',
                    color: '#86efac',
                    padding: 12,
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                  }}
                >
{`ما عاصمة مصر؟
*القاهرة
الإسكندرية
الجيزة

ما ناتج 3 + 2؟
2
3
*5
4
!2`}
                </div>
              </div>
            </details>

            <textarea
              id="questionsCopy"
              value={questionsCopy}
              onChange={(e) => setQuestionsCopy(e.target.value)}
              placeholder={`ما عاصمة مصر؟\n*القاهرة\nالإسكندرية\nالجيزة\n\nما ناتج 3 + 2؟\n2\n3\n*5\n4`}
            />
            <button className="btn" onClick={parseCopiedQuestions}>📥 استيراد الأسئلة</button>
          </div>
        )}

        <div className="questions-container">
          {questions.map((q, i) => (
            <div key={q.id} className="question-block">
              <div className="question-controls">
                <button className="btn-icon" onClick={() => addOption(q.id)}>
                  <i className="fas fa-plus"></i> إضافة اختيار
                </button>
                <button className="btn-icon" onClick={() => removeOption(q.id)}>
                  <i className="fas fa-minus"></i> حذف اختيار
                </button>
                <button
                  className={`btn-icon ${q.isMultiple ? 'active' : ''}`}
                  onClick={() => toggleMultipleAnswers(q.id)}
                >
                  <i className="fas fa-check-double"></i> {q.isMultiple ? 'إجابة واحدة' : 'متعدد الإجابات'}
                </button>
                <span className="points-wrap">
                  <span className="points-lbl">النقاط:</span>
                  <input
                    type="number"
                    min="1"
                    value={q.points}
                    onChange={(e) => updateQuestion(q.id, 'points', parseInt(e.target.value))}
                    className="points-input"
                  />
                </span>
                <button
                  className="btn-icon"
                  onClick={() => removeQuestion(q.id)}
                  title="حذف هذا السؤال"
                  style={{
                    marginInlineStart: 'auto',
                    color: '#dc2626',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                  }}
                >
                  <i className="fas fa-trash"></i> حذف السؤال
                </button>
              </div>

              <label>❓ السؤال {i + 1}:</label>
              <textarea
                value={q.question}
                onChange={(e) => updateQuestion(q.id, 'question', e.target.value)}
                placeholder="اكتب السؤال هنا..."
              />

              <QuestionImagePicker
                value={q.image}
                onChange={(url) => updateQuestion(q.id, 'image', url)}
              />

              <label>📋 الاختيارات:</label>
              <div className="options-wrapper">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="option-container">
                    <input 
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                      placeholder={`الخيار ${optIdx + 1}`}
                      className="option-input"
                    />
                  </div>
                ))}
              </div>

              <label>✅ الإجابة الصحيحة:</label>
              <div className="answers-wrapper">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx}>
                    {q.isMultiple ? (
                      <>
                        <input 
                          type="checkbox"
                          id={`answer-${q.id}-${optIdx}`}
                          checked={q.answers.includes(optIdx)}
                          onChange={(e) => updateAnswer(q.id, optIdx, e.target.checked)}
                        />
                        <label htmlFor={`answer-${q.id}-${optIdx}`}>{opt || `الخيار ${optIdx + 1}`}</label>
                      </>
                    ) : (
                      <>
                        <input 
                          type="radio"
                          name={`correct-answer-${q.id}`}
                          id={`answer-${q.id}-${optIdx}`}
                          checked={q.answers.includes(optIdx)}
                          onChange={(e) => {
                            if (e.target.checked) updateAnswer(q.id, optIdx, true)
                          }}
                        />
                        <label htmlFor={`answer-${q.id}-${optIdx}`}>{opt || `الخيار ${optIdx + 1}`}</label>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {questions.length > 0 && (
          <>
            <button
              type="button"
              onClick={addSingleQuestion}
              className="exam-add-q-btn"
            >
              <i className="fas fa-plus"></i>
              <span>إضافة سؤال آخر</span>
            </button>

            {/* Two distinct actions: preview-only (no DB write) and save.
                Splitting them lets the admin sanity-check before committing
                without the previous "save then bounce away" flash. */}
            <div className="exam-action-row">
              <button
                type="button"
                className="btn btn-preview"
                onClick={previewExam}
                disabled={saving}
              >
                <i className="fas fa-magnifying-glass"></i>
                <span>معاينة الامتحان</span>
              </button>
              <button
                type="button"
                className="btn btn-save"
                onClick={saveExam}
                disabled={saving}
              >
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                <span>{saving ? 'جاري الحفظ...' : 'حفظ الامتحان'}</span>
              </button>
            </div>
          </>
        )}

        {showSuccess && (
          <div className="success-message">
            🎉 تم حفظ الامتحان بنجاح! سيتم توجيهك إلى صفحة الامتحانات...
          </div>
        )}

        {showPreview && previewData && (
          <div className="preview">
            <h2><i className="fas fa-magnifying-glass" style={{ color: '#f59e0b', marginInlineEnd: 8 }}></i> المعاينة</h2>
            <h3>📝 الامتحان رقم {previewData.number}</h3>
            <p><strong>العنوان:</strong> {previewData.title}</p>
            <p><strong>المدة:</strong> {previewData.duration} دقيقة</p>
            <p><strong>عدد المحاولات:</strong> {previewData.maxAttempts}</p>
            <p><strong>الفترة المتاحة:</strong> {previewData.examDurationHours} ساعة</p>
            <p><strong>إجمالي النقاط:</strong> {previewData.totalPoints}</p>
            <hr />
            {previewData.questions.map((q, idx) => (
              <div key={idx} className="question-block preview-question">
                <strong>س{idx + 1} ({q.points} نقطة): {q.question}</strong>
                <br /><br />
                {q.options.map((opt, i) => (
                  <div 
                    key={i}
                    className={`preview-option ${q.answers.includes(i) ? 'correct' : ''}`}
                  >
                    {String.fromCharCode(65 + i)}. {opt} {q.answers.includes(i) ? '✅' : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
