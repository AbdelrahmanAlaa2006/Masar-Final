import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import './ExamTaking.css'
import { getExam, startAttempt, submitAttempt, countSubmittedAttempts } from '@backend/examsApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'
import { listExamSharedBlocks, buildQuestionBlockMap } from '@backend/examSharedBlocksApi'
import SharedTextCard from '../components/SharedTextCard'
import ScreenGuard from '../components/ScreenGuard'
import useExitGuard from '../hooks/useExitGuard'
import ConfirmExitDialog from '../components/ConfirmExitDialog'

export default function ExamTaking() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const examId = params.get('id')

  const [exam, setExam] = useState(null)
  // questionIndex -> shared text block. Built ONCE on load from a single
  // query, so paging through questions never hits the database.
  const [sharedBlockMap, setSharedBlockMap] = useState(() => new Map())
  const [loadError, setLoadError] = useState(null)
  const [attemptId, setAttemptId] = useState(null)
  const [userId, setUserId] = useState(null)

  const [currentQuestion, setCurrentQuestion] = useState(0)
  // answers: { [qIdx]: Set<optIdx> } — works for both single and multi
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  // Storage key for resuming after a refresh. Scoped to exam + browser
  // session — same exam in different tabs share state, which is fine
  // since the server attempt row is the source of truth on submit.
  const storageKey = examId ? `masar-exam-progress:${examId}` : null
  const [examFinished, setExamFinished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [finalScore, setFinalScore] = useState(null)
  const [unansweredAlert, setUnansweredAlert] = useState(null)
  const submittedRef = useRef(false)
  // Guard against StrictMode's mount→unmount→mount cycle (dev-only) so
  // we don't create two attempt rows for the same load. In production
  // this just no-ops on the second pass.
  const startedRef = useRef(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // Extract user parameters and role once per component lifecycle
  const { guardLabel, isAdmin } = useMemo(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      return {
        guardLabel: u ? `${u.name || ''} · ${u.phone || ''}` : '',
        isAdmin: u?.role === 'admin' || u?.role === 'assistant',
      }
    } catch { return { guardLabel: '', isAdmin: false } }
  }, [])

  // ── Load the exam + start an attempt ──────────────────────────
  useEffect(() => {
    // Run-once guard: in React StrictMode (dev), this effect mounts
    // twice. Without this guard we'd insert two attempt rows and the
    // exam-lock would flicker on/off, causing the visible "refreshing"
    // behaviour students were seeing.
    if (startedRef.current) return
    startedRef.current = true

    const run = async () => {
      if (!examId) { setLoadError('لم يتم تحديد الامتحان'); return }
      try {
        const u = JSON.parse(sessionStorage.getItem('masar-user'))
        const sid = u?.id
        if (!sid) { setLoadError('يجب تسجيل الدخول'); return }
        setUserId(sid)

        const e = await getExam(examId)

        // Safety Check for Students: verify remaining attempts on refresh or direct URL access
        const role = u?.role || 'student'
        if (role !== 'admin' && role !== 'assistant' && role !== 'super_admin') {
          // Fetch overrides first to get any bonus attempts or update reset point
          let maxAttempts = e.max_attempts || 1
          let sinceIso = null
          try {
            const overrides = await listEffectiveOverrides({
              studentId: sid,
              grade: u.grade,
              group: u.group || null,
              itemType: 'exam',
            })
            const overridesMap = reduceEffective(overrides)
            const o = overridesMap.get(examId)
            
            // Check if blocked by admin
            if (o && o.allowed === false) {
              setLoadError('تم تقييد هذا الامتحان من قِبَل الإدارة.')
              return
            }
            
            const extra = o && typeof o.attempts === 'number' ? o.attempts : 0
            maxAttempts = maxAttempts + extra
            if (o?.updated_at) sinceIso = o.updated_at
          } catch (oErr) {
            console.error('Failed to load overrides', oErr)
          }

          // Fast lightweight exact head count (0 payload rows transferred)
          const submittedCount = await countSubmittedAttempts(examId, sid, sinceIso)
          if (submittedCount >= maxAttempts) {
            setLoadError('لقد استنفذت جميع المحاولات المسموح بها لهذا الامتحان.')
            return
          }
        }

        // Shared reading passages: ONE query for the whole exam, folded into an index -> block Map.
        try {
          const blocks = await listExamSharedBlocks(e.id)
          setSharedBlockMap(buildQuestionBlockMap(blocks))
        } catch (blockErr) {
          console.error('shared text blocks load failed', blockErr)
        }

        // Restore prior in-flight progress (attemptId, answers, current question, remaining time)
        let resumedTime = null
        let restoredAttemptId = null
        if (storageKey && !isAdmin) {
          try {
            const saved = JSON.parse(localStorage.getItem(storageKey))
            if (saved && Number.isFinite(saved.deadline)) {
              const remaining = Math.floor((saved.deadline - Date.now()) / 1000)
              if (remaining > 5) {
                resumedTime = remaining
                if (saved.attemptId) {
                  restoredAttemptId = saved.attemptId
                  setAttemptId(saved.attemptId)
                }
                if (saved.answers) {
                  const restored = {}
                  for (const [k, v] of Object.entries(saved.answers)) {
                    restored[k] = new Set(v)
                  }
                  setAnswers(restored)
                }
                if (Number.isInteger(saved.currentQuestion)) {
                  setCurrentQuestion(saved.currentQuestion)
                }
              } else {
                // Stale progress from an old/finished session — clear it so it doesn't auto-submit a fresh exam!
                localStorage.removeItem(storageKey)
              }
            }
          } catch {}
        }
        
        const initialTime = (resumedTime != null && resumedTime > 0) ? resumedTime : (e.duration_minutes || 10) * 60
        setTimeLeft(initialTime)
        setExam(e)

        if (!isAdmin) {
          try {
            const att = await startAttempt({ exam_id: e.id })
            if (att?.id) {
              setAttemptId(att.id)
            }
          } catch (attErr) {
            console.error('startAttempt failed', attErr)
            if (!restoredAttemptId) {
              console.warn('Exam attempt could not be initialized.')
            }
          }
        }
      } catch (err) {
        console.error('ExamTaking load failed', err)
        setLoadError(err.message || 'تعذر تحميل الامتحان')
        startedRef.current = false
      }
    }
    run()
  }, [examId])

  const questions = exam?.questions || []

  // Block accidental navigation while the exam is in progress. Disabled
  // for admins (so they can preview/leave freely) and once the exam is
  // finished (so the "العودة إلى الامتحانات" button works without prompt).
  const guardActive = !!exam && !examFinished && !isAdmin
  const exitGuard = useExitGuard({
    active: guardActive,
    message: 'الامتحان ما زال جارياً. الخروج الآن قد يضيع إجاباتك. هل أنت متأكد؟',
    onExitAttempt: () => setShowExitConfirm(true),
  })

  // ── Persist progress on answer/question change so a refresh resumes mid-exam.
  // We store attemptId and absolute deadline so the clock keeps ticking even while the page is closed.
  useEffect(() => {
    if (!storageKey || !exam || examFinished || isAdmin || timeLeft <= 0) return
    try {
      const serialAnswers = {}
      for (const [k, v] of Object.entries(answers)) {
        serialAnswers[k] = Array.from(v || [])
      }
      const deadline = Date.now() + timeLeft * 1000
      localStorage.setItem(storageKey, JSON.stringify({
        attemptId,
        answers: serialAnswers,
        currentQuestion,
        deadline,
      }))
    } catch {}
  }, [answers, currentQuestion, storageKey, exam, examFinished, isAdmin, attemptId])

  // Flush progress immediately when student switches tabs or closes the page
  useEffect(() => {
    const handleSave = () => {
      if (!storageKey || !exam || examFinished || isAdmin || timeLeft <= 0) return
      try {
        const serialAnswers = {}
        for (const [k, v] of Object.entries(answers)) {
          serialAnswers[k] = Array.from(v || [])
        }
        const deadline = Date.now() + timeLeft * 1000
        localStorage.setItem(storageKey, JSON.stringify({
          attemptId,
          answers: serialAnswers,
          currentQuestion,
          deadline,
        }))
      } catch {}
    }
    window.addEventListener('beforeunload', handleSave)
    document.addEventListener('visibilitychange', handleSave)
    return () => {
      window.removeEventListener('beforeunload', handleSave)
      document.removeEventListener('visibilitychange', handleSave)
    }
  }, [answers, currentQuestion, storageKey, exam, examFinished, isAdmin, timeLeft, attemptId])

  // ── Timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (examFinished || !exam) return
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          if (isAdmin) {
            setExamFinished(true)
          } else {
            handleFinishExam(true) // auto
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [examFinished, exam, isAdmin])



  const formatTime = seconds => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const answeredCount = useMemo(
    () => Object.values(answers).filter(s => s && s.size > 0).length,
    [answers]
  )
  const remainingCount = questions.length - answeredCount

  const toggleOption = (qIdx, optIdx) => {
    if (examFinished) return
    const q = questions[qIdx]
    setAnswers(prev => {
      const cur = new Set(prev[qIdx] || [])
      if (q.isMultiple) {
        cur.has(optIdx) ? cur.delete(optIdx) : cur.add(optIdx)
      } else {
        cur.clear()
        cur.add(optIdx)
      }
      return { ...prev, [qIdx]: cur }
    })
  }

  const isSelected = (qIdx, optIdx) =>
    (answers[qIdx] && answers[qIdx].has(optIdx)) || false

  // NOTE: scoring is computed SERVER-SIDE by submit_exam_attempt(). The
  // client only sends raw responses. We never trust a score that came
  // from this browser.

  const unansweredIndices = useMemo(
    () => questions.map((_, i) => i).filter(i => !answers[i] || answers[i].size === 0),
    [questions, answers]
  )

  const handleFinishExam = async (auto = false) => {
    if (submitting) return
    // Manual submit requires answering every question. Auto-submit on
    // timeout still goes through with whatever the student has.
    if (!auto && unansweredIndices.length > 0) {
      setUnansweredAlert(unansweredIndices)
      return
    }
    setSubmitting(true)
    setSubmitError(null)

    if (isAdmin) {
      // Admin preview: finish without writing to database
      setFinalScore(0)
      setExamFinished(true)
      setSubmitting(false)
      return
    }

    const responses = questions.map((q, qIdx) => ({
      questionId: qIdx,
      selected: Array.from(answers[qIdx] || []),
    }))

    try {
      let currentAttId = attemptId
      if (!currentAttId && exam?.id) {
        const att = await startAttempt({ exam_id: exam.id })
        currentAttId = att.id
        setAttemptId(currentAttId)
      }

      if (!currentAttId) {
        throw new Error('تعذر العثور على محاولة الامتحان المفتوحة.')
      }

      const res = await submitAttempt(currentAttId, { responses })
      const serverScore = res?.score ?? 0

      submittedRef.current = true
      setFinalScore(serverScore)
      setExamFinished(true)
      setSubmitting(false)

      // Only delete localStorage after confirmed server-side submission!
      if (storageKey) {
        try { localStorage.removeItem(storageKey) } catch {}
      }
    } catch (err) {
      console.error('submitAttempt failed', err)
      setSubmitting(false)
      // DO NOT clear localStorage! Answers are safely preserved on the device.
      setSubmitError(
        'تعذر إرسال الإجابات إلى الخادم بسبب بطء أو انقطاع في الاتصال. تم حفظ جميع إجاباتك بأمان على جهازك. يرجى الضغط على زر "إعادة محاولة التسليم الآن".'
      )
    }
  }

  const handleAbandonExam = () => {
    if (submittedRef.current) return
    submittedRef.current = true

    // Synchronously disable exit guard warnings to prevent native browser alerts
    exitGuard.disable()

    // Clear the progress from localStorage immediately so it is not restored
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch {}
    }

    if (attemptId) {
      // Submit empty responses in the background to avoid blocking transition
      submitAttempt(attemptId, { responses: [] }).catch(err => {
        console.error('Failed to submit blank attempt on exit', err)
      })
    }

    setExamFinished(true)
    
    if (exitGuard.isPopState()) {
      exitGuard.clearPopState()
      window.history.go(-2) // Go back past sentinel and ExamTaking page to Exams page
    } else {
      navigate('/exams', { replace: true }) // Replace the sentinel with /exams route
    }
  }

  if (loadError) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>خطأ</h2>
          <p>{loadError}</p>
          <button className="et-btn et-btn-prev" onClick={() => navigate('/exams')}>
            العودة إلى الامتحانات
          </button>
        </div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
          <p>جاري تحميل الامتحان...</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>لا توجد أسئلة في هذا الامتحان</h2>
          <button className="et-btn et-btn-prev" onClick={() => navigate('/exams')}>العودة</button>
        </div>
      </div>
    )
  }

  const currentQ = questions[currentQuestion]
  const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح']
  const progress = ((currentQuestion + 1) / questions.length) * 100

  // Watermark text parameters (guardLabel/isAdmin extracted at top-level)

  return (
    <div className="et-wrapper">
      {/* Anti-screenshot guard: active for the whole exam-taking flow,
          including the post-submit results screen so a student can't
          easily capture the answer key after seeing it. Admins skipped. */}
      <ScreenGuard active={!isAdmin} label={guardLabel} />

      {examFinished && (
        <div className="et-back-row">
          <button className="et-back-btn" onClick={() => navigate('/exams')}>
            العودة إلى الامتحانات
          </button>
        </div>
      )}
      <div className={`et-layout ${examFinished ? 'is-finished' : ''}`}>
      {!examFinished && (
        <aside className="et-sidepanel" aria-label="قائمة الأسئلة">
          <div className="et-sidepanel-head">
            <h3>الأسئلة</h3>
            <span className="et-sidepanel-count">
              {answeredCount} / {questions.length}
            </span>
          </div>
          <div className="et-sidepanel-grid">
            {questions.map((_, idx) => {
              const answered = answers[idx] && answers[idx].size > 0
              const active = idx === currentQuestion
              return (
                <button
                  key={idx}
                  className={`et-side-num ${answered ? 'is-answered' : 'is-pending'} ${active ? 'is-active' : ''}`}
                  onClick={() => setCurrentQuestion(idx)}
                  aria-label={`السؤال ${idx + 1}${answered ? ' - تمت الإجابة' : ' - لم يُجَب بعد'}`}
                  title={answered ? 'تمت الإجابة' : 'لم يُجَب بعد'}
                >
                  {idx + 1}
                  {answered && <i className="fas fa-check et-side-num-tick" aria-hidden="true"></i>}
                </button>
              )
            })}
          </div>
          <div className="et-sidepanel-legend">
            <span><span className="et-legend-swatch is-answered"></span> أجبت</span>
            <span><span className="et-legend-swatch is-pending"></span> متبقي</span>
          </div>
        </aside>
      )}
      <div className="et-card">
        {!examFinished ? (
          <>
            <div className="et-topbar">
              <div className="et-topbar-stat">
                <span>✅</span>
                <span>أجبت: <strong>{answeredCount}</strong></span>
              </div>
              <div className="et-topbar-center">
                السؤال {currentQuestion + 1} من {questions.length}
              </div>
              <div className={`et-timer ${timeLeft <= 60 ? 'et-timer-critical' : ''}`}>
                <span>⏱</span>
                <span>{formatTime(timeLeft)}</span>
              </div>
            </div>

            <div className="et-progress-track">
              <div className="et-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            {/* Shared reading passage, re-shown above every linked question so
                the student never has to navigate back to re-read it. */}
            <SharedTextCard block={sharedBlockMap.get(currentQuestion)} />

            <div className="et-question-area">
              <div className="et-question-meta">
                <span className="et-q-badge et-q-num">س {currentQuestion + 1}</span>
                <span className="et-q-badge et-q-pts">{currentQ.points || 1} درجات</span>
                <span className="et-q-badge et-q-rem">متبقي: {remainingCount}</span>
                {currentQ.isMultiple && (
                  <span className="et-q-badge et-q-rem">اختيارات متعددة</span>
                )}
              </div>
              <p className="et-question-text">{currentQ.question}</p>
              {currentQ.image && (
                <div className="et-question-image">
                  <img src={currentQ.image} alt="صورة السؤال" />
                </div>
              )}
            </div>

            <div className="et-options">
              {currentQ.options.map((opt, idx) => (
                <div
                  key={idx}
                  className={`et-option ${isSelected(currentQuestion, idx) ? 'et-option-selected' : ''}`}
                  onClick={() => toggleOption(currentQuestion, idx)}
                >
                  <span className="et-option-letter">{letters[idx] || String.fromCharCode(65 + idx)}</span>
                  <span className="et-option-text">{opt}</span>
                </div>
              ))}
            </div>

            <div className="et-footer">
              <button
                className="et-btn et-btn-prev"
                onClick={() => setCurrentQuestion(q => q - 1)}
                disabled={currentQuestion === 0}
              >
                ← السابق
              </button>
              {currentQuestion === questions.length - 1 ? (
                <button
                  className="et-btn et-btn-finish"
                  onClick={() => handleFinishExam(false)}
                  disabled={submitting}
                  title={unansweredIndices.length > 0 ? `متبقي ${unansweredIndices.length} سؤال` : ''}
                >
                  {submitting ? '⏳ جاري الإرسال...' : 'إنهاء الامتحان ✓'}
                </button>
              ) : (
                <button
                  className="et-btn et-btn-next"
                  onClick={() => setCurrentQuestion(q => q + 1)}
                >
                  التالي →
                </button>
              )}
            </div>
          </>
        ) : exam.reveal_grades === false ? (
          /* Admin hasn't released results yet — don't leak the score. */
          <div className="et-finished">
            <div className="et-finished-icon">🔒</div>
            <h2 className="et-finished-title">تم تسليم الامتحان بنجاح!</h2>
            <p className="et-finished-sub">
              إجاباتك تم حفظها. ستظهر درجتك عند إعلان المدرس النتائج في تقرير الامتحانات.
            </p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{answeredCount}/{questions.length}</span>
                <span className="et-score-lbl">أجبت</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">—</span>
                <span className="et-score-lbl">النتيجة قيد المراجعة</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="et-finished">
            <div className="et-finished-icon">🎉</div>
            <h2 className="et-finished-title">تم إنهاء الامتحان بنجاح!</h2>
            <p className="et-finished-sub">شكراً لك على إكمال الاختبار</p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{finalScore ?? 0}</span>
                <span className="et-score-lbl">درجتك</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{exam.total_points}</span>
                <span className="et-score-lbl">من</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{answeredCount}/{questions.length}</span>
                <span className="et-score-lbl">أجبت</span>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {unansweredAlert && (
        <div className="et-modal-backdrop" onClick={() => setUnansweredAlert(null)}>
          <div className="et-modal" onClick={(e) => e.stopPropagation()}>
            <div className="et-modal-icon">⚠️</div>
            <h3 className="et-modal-title">يجب الإجابة على جميع الأسئلة</h3>
            <p className="et-modal-sub">
              لم تُجب بعد على {unansweredAlert.length} سؤال. يجب إكمال جميع الأسئلة قبل إنهاء الامتحان.
            </p>
            <div className="et-modal-list">
              {unansweredAlert.map((idx) => (
                <button
                  key={idx}
                  className="et-modal-chip"
                  onClick={() => {
                    setCurrentQuestion(idx)
                    setUnansweredAlert(null)
                  }}
                >
                  السؤال {idx + 1}
                </button>
              ))}
            </div>
            <button className="et-btn et-btn-prev" onClick={() => setUnansweredAlert(null)}>
              العودة للإجابة
            </button>
          </div>
        </div>
      )}
      {showExitConfirm && (
        <ConfirmExitDialog
          title="هل تريد الخروج من الامتحان؟"
          message="الامتحان ما زال جارياً. خروجك الآن قد يؤدي لضياع إجاباتك أو تسجيل محاولتك كمنتهية. هل أنت متأكد؟"
          confirmText="نعم، خروج"
          cancelText="إلغاء"
          onConfirm={() => {
            setShowExitConfirm(false)
            handleAbandonExam()
          }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

      {submitError && (
        <div className="et-modal-backdrop">
          <div className="et-modal" onClick={(e) => e.stopPropagation()}>
            <div className="et-modal-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>⚠️</div>
            <h3 className="et-modal-title">تعذر إرسال الإجابات</h3>
            <p className="et-modal-sub" style={{ color: '#dc2626', fontWeight: 600 }}>
              {submitError}
            </p>
            <p className="et-modal-sub" style={{ fontSize: '0.88rem', color: '#64748b' }}>
              لا تقلق، جميع إجاباتك محفوظة بأمان على جهازك ولن تضيع. يمكنك الضغط على زر إعادة المحاولة فوراً.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', width: '100%' }}>
              <button
                className="et-btn et-btn-finish"
                style={{ flex: 1, padding: '14px', fontSize: '1rem', fontWeight: 700 }}
                disabled={submitting}
                onClick={() => handleFinishExam(true)}
              >
                {submitting ? 'جاري محاولة الإرسال...' : 'إعادة محاولة التسليم الآن 🔄'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
