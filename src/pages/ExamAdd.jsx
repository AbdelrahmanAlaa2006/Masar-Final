import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './ExamAdd.css'
import { notify } from '../utils/notify'
import { createExam, uiToDbGrade } from '../services/examsApi'

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
      options: ['', ''],
      answers: [0],
      points: 1,
      isMultiple: false
    }))

    setQuestions(newQuestions)
    setShowCopySection(true)
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

  const parseCopiedQuestions = () => {
    const text = questionsCopy.trim()
    if (!text) {
      notify('يرجى إدخال الأسئلة بالتنسيق المطلوب', { type: 'warning' })
      return
    }

    const questionTexts = text.split('@').filter(q => q.trim() !== '')
    if (questionTexts.length === 0) {
      notify('لم يتم العثور على أسئلة', { type: 'warning' })
      return
    }

    setNumQuestions(questionTexts.length.toString())

    const parsedQuestions = questionTexts.map((q, i) => {
      const lines = q.trim().split('\n').filter(line => line.trim() !== '')
      let points = 1
      const lastLine = lines[lines.length - 1]
      
      if (lastLine.startsWith('!')) {
        points = parseInt(lastLine.substring(1)) || 1
        lines.pop()
      }

      const options = []
      const correctAnswers = []

      for (let j = 1; j < lines.length; j++) {
        const line = lines[j].trim()
        if (line.startsWith('##')) {
          const optionText = line.replace(/^##\s*/, '').trim()
          options.push(optionText)
          correctAnswers.push(options.length - 1)
        } else if (line.startsWith('#')) {
          const optionText = line.replace(/^#\s*/, '').trim()
          options.push(optionText)
        }
      }

      return {
        id: i,
        question: lines[0]?.trim() || '',
        options: options.length > 0 ? options : ['', ''],
        answers: correctAnswers.length > 0 ? correctAnswers : [0],
        points,
        isMultiple: correctAnswers.length > 1
      }
    })

    setQuestions(parsedQuestions)
  }

  const saveExam = async () => {
    if (saving) return
    if (!examTitle.trim() || !duration || questions.length === 0) {
      notify('يرجى ملء جميع البيانات المطلوبة', { type: 'warning' })
      return
    }

    const dbGrade = uiToDbGrade(examGrade)
    if (!dbGrade) {
      notify('يرجى اختيار الصف الدراسي', { type: 'warning' })
      return
    }

    let isValid = true
    questions.forEach(q => {
      if (!q.question.trim() || q.options.some(opt => !opt.trim()) || q.answers.length === 0) {
        isValid = false
      }
    })

    if (!isValid) {
      notify('يرجى التأكد من ملء جميع الأسئلة والاختيارات وتحديد الإجابات الصحيحة', { type: 'warning' })
      return
    }

    const cleanQuestions = questions.map(q => ({
      question: q.question,
      options: q.options,
      answers: q.answers,
      points: q.points,
      isMultiple: q.isMultiple,
    }))
    const total_points = cleanQuestions.reduce((sum, q) => sum + (q.points || 1), 0)

    let createdBy = null
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      createdBy = u?.id || null
    } catch { /* ignore */ }

    setSaving(true)
    try {
      await createExam({
        number: examNumber.trim() || null,
        title: examTitle.trim(),
        grade: dbGrade,
        duration_minutes: parseInt(duration),
        max_attempts: parseInt(maxAttempts),
        available_hours: parseInt(examDurationHours),
        questions: cleanQuestions,
        total_points,
        created_by: createdBy,
      })

      setPreviewData({
        number: examNumber,
        title: examTitle,
        duration: parseInt(duration),
        maxAttempts: parseInt(maxAttempts),
        examDurationHours: parseInt(examDurationHours),
        questions: cleanQuestions,
        totalPoints: total_points,
      })
      setShowPreview(true)
      setShowSuccess(true)

      setTimeout(() => { navigate('/exams') }, 2000)
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
          <input 
            type="number" 
            id="numQuestions"
            value={numQuestions}
            onChange={(e) => setNumQuestions(e.target.value)}
            placeholder="مثلاً 3"
          />
          <button className="btn" onClick={generateQuestions}>✨ إنشاء الأسئلة</button>
        </div>

        {showCopySection && (
          <div className="form-group copy-questions">
            <label htmlFor="questionsCopy">📋 نسخ الأسئلة:</label>
            <textarea 
              id="questionsCopy"
              value={questionsCopy}
              onChange={(e) => setQuestionsCopy(e.target.value)}
              placeholder="@what is the total of 3+2&#10;#2&#10;#3&#10;##5&#10;#4&#10;!2"
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
                <span>النقاط:</span>
                <input 
                  type="number" 
                  min="1"
                  value={q.points}
                  onChange={(e) => updateQuestion(q.id, 'points', parseInt(e.target.value))}
                  className="points-input"
                />
              </div>

              <label>❓ السؤال {i + 1}:</label>
              <textarea 
                value={q.question}
                onChange={(e) => updateQuestion(q.id, 'question', e.target.value)}
                placeholder="اكتب السؤال هنا..."
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
          <button className="btn btn-save" onClick={saveExam} disabled={saving}>
            {saving ? '⏳ جاري الحفظ...' : '💾 حفظ ومعاينة الامتحان'}
          </button>
        )}

        {showSuccess && (
          <div className="success-message">
            🎉 تم حفظ الامتحان بنجاح! سيتم توجيهك إلى صفحة الامتحانات...
          </div>
        )}

        {showPreview && previewData && (
          <div className="preview">
            <h2>🧪 المعاينة:</h2>
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
