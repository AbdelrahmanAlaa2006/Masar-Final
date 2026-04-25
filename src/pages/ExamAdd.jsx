import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './ExamAdd.css'
import { notify } from '../utils/notify'
import { createExam, uiToDbGrade } from '@backend/examsApi'
import { useI18n } from '../i18n'

export default function ExamAdd() {
  const { t, lang } = useI18n()
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
      notify(t('examAdd.errNumQuestions'), { type: 'warning' })
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
      notify(t('examAdd.errNumQuestions') || 'Please enter questions in the correct format', { type: 'warning' })
      return
    }

    const questionTexts = text.split('@').filter(q => q.trim() !== '')
    if (questionTexts.length === 0) {
      notify(t('examAdd.errNoQuestions'), { type: 'warning' })
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
      notify(t('examAdd.errFillDetails'), { type: 'warning' })
      return
    }

    const dbGrade = uiToDbGrade(examGrade)
    if (!dbGrade) {
      notify(t('common.error') || 'Please select a grade', { type: 'warning' })
      return
    }

    let isValid = true
    questions.forEach(q => {
      if (!q.question.trim() || q.options.some(opt => !opt.trim()) || q.answers.length === 0) {
        isValid = false
      }
    })

    if (!isValid) {
      notify(t('examAdd.errEmptyQuestion').replace('{index}', '') || 'Please ensure all questions and choices are filled and correct answers are selected', { type: 'warning' })
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
      notify(err.message || t('examAdd.errSave'), { type: 'warning' })
      setSaving(false)
    }
  }

  return (
    <div className="exam-add-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="exam-add-container">
        <h1>{t('examAdd.title')}</h1>

        <div className="form-group">
          <label htmlFor="examNumber">🔢 {t('examAdd.examNumberLabel')}:</label>
          <input 
            type="number" 
            id="examNumber"
            value={examNumber}
            onChange={(e) => setExamNumber(e.target.value)}
            placeholder="5"
          />
        </div>

        <div className="form-group">
          <label htmlFor="examTitle">📝 {t('examAdd.examTitleLabel')}:</label>
          <input
            type="text"
            id="examTitle"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            placeholder="Advanced Calculus"
          />
        </div>

        <div className="form-group">
          <label htmlFor="examGrade">🎓 {t('profile.grade')}:</label>
          <select
            id="examGrade"
            value={examGrade}
            onChange={(e) => setExamGrade(e.target.value)}
          >
            <option value="first">{t('grades.first')}</option>
            <option value="second">{t('grades.second')}</option>
            <option value="third">{t('grades.third')}</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="duration">⏰ {t('examAdd.durationLabel')}:</label>
          <input 
            type="number" 
            id="duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="60"
          />
          
          <div className="exam-settings">
            <div>
              <label htmlFor="maxAttempts">🔁 {t('examAdd.maxAttemptsLabel')}:</label>
              <input 
                type="number" 
                id="maxAttempts"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(parseInt(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="examDurationHours">⏳ {t('examAdd.availableHoursLabel')}:</label>
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
          <label htmlFor="numQuestions">❓ {t('examAdd.numQuestionsLabel')}:</label>
          <input 
            type="number" 
            id="numQuestions"
            value={numQuestions}
            onChange={(e) => setNumQuestions(e.target.value)}
            placeholder="3"
          />
          <button className="btn" onClick={generateQuestions}>✨ {t('examAdd.generateQuestions')}</button>
        </div>

        {showCopySection && (
          <div className="form-group copy-questions">
            <label htmlFor="questionsCopy">📋 {t('examAdd.pasteFormatLabel')}:</label>
            <textarea 
              id="questionsCopy"
              value={questionsCopy}
              onChange={(e) => setQuestionsCopy(e.target.value)}
              placeholder="@what is the total of 3+2&#10;#2&#10;#3&#10;##5&#10;#4&#10;!2"
            />
            <button className="btn" onClick={parseCopiedQuestions}>📥 {t('examAdd.processText')}</button>
          </div>
        )}

        <div className="questions-container">
          {questions.map((q, i) => (
            <div key={q.id} className="question-block">
              <div className="question-controls">
                <button className="btn-icon" onClick={() => addOption(q.id)}>
                  <i className="fas fa-plus"></i> {t('examAdd.addOption')}
                </button>
                <button className="btn-icon" onClick={() => removeOption(q.id)}>
                  <i className="fas fa-minus"></i> {t('examAdd.removeOption')}
                </button>
                <button 
                  className={`btn-icon ${q.isMultiple ? 'active' : ''}`}
                  onClick={() => toggleMultipleAnswers(q.id)}
                >
                  <i className="fas fa-check-double"></i> {q.isMultiple ? (lang === 'ar' ? 'إجابة واحدة' : 'Single Answer') : t('examAdd.multipleAnswersLabel')}
                </button>
                <span>{t('examAdd.pointsLabel')}</span>
                <input 
                  type="number" 
                  min="1"
                  value={q.points}
                  onChange={(e) => updateQuestion(q.id, 'points', parseInt(e.target.value))}
                  className="points-input"
                />
              </div>

              <label>❓ {t('examAdd.questionLabel')} {i + 1}:</label>
              <textarea 
                value={q.question}
                onChange={(e) => updateQuestion(q.id, 'question', e.target.value)}
                placeholder="..."
              />

              <label>📋 {t('examAdd.optionsLabel')}:</label>
              <div className="options-wrapper">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="option-container">
                    <input 
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                      placeholder={`${t('examAdd.syntaxOption')} ${optIdx + 1}`}
                      className="option-input"
                    />
                  </div>
                ))}
              </div>

              <label>✅ {t('examAdd.syntaxCorrect')}:</label>
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
            {saving ? `⏳ ${t('common.loading')}...` : t('examAdd.saveExam')}
          </button>
        )}

        {showSuccess && (
          <div className="success-message">
            🎉 {t('examAdd.saveSuccess')}
          </div>
        )}

        {showPreview && previewData && (
          <div className="preview">
            <h2>🧪 {t('examAdd.previewModalTitle')}:</h2>
            <h3>📝 {t('examAdd.title')} #{previewData.number}</h3>
            <p><strong>{t('examAdd.examTitleLabel')}:</strong> {previewData.title}</p>
            <p><strong>{t('examAdd.previewDuration')}:</strong> {previewData.duration}</p>
            <p><strong>{t('examAdd.previewMaxAttempts')}:</strong> {previewData.maxAttempts}</p>
            <p><strong>{t('examAdd.previewAvailable')}:</strong> {previewData.examDurationHours}</p>
            <p><strong>{t('examAdd.pointsLabel')}:</strong> {previewData.totalPoints}</p>
            <hr />
            {previewData.questions.map((q, idx) => (
              <div key={idx} className="question-block preview-question">
                <strong>{t('common.question')} {idx + 1} ({q.points} {t('common.point')}): {q.question}</strong>
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
