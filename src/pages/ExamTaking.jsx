import { authStore } from '@backend/authStorage'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import './ExamTaking.css'
import { getExam, startAttempt, submitAttempt, countSubmittedAttempts } from '@backend/examsApi'
import { supabase } from '@backend/supabase'
import { getExamAccess, checkContentUnlockedAnyContext } from '@backend/courseLecturesApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'
import { listExamSharedBlocks, buildQuestionBlockMap } from '@backend/examSharedBlocksApi'
import SharedTextCard from '../components/SharedTextCard'
import WordBankQuestion from '../components/WordBankQuestion'
import { wordBankGroupIndices } from '../utils/wordBank'
import ScreenGuard from '../components/ScreenGuard'
import useExitGuard from '../hooks/useExitGuard'
import ConfirmExitDialog from '../components/ConfirmExitDialog'
import { detectTextDir, copyQuestionToClipboard } from '../utils/questionUtils'
import { emitPrerequisiteUnlocked } from '../utils/unlockEvents'

// Arabic text for the refusals start_or_get_exam_attempt() raises, or null
// when the error is something else.
function serverRefusalMessage(err) {
  const msg = String(err?.message || '')
  if (msg.includes('no_attempts_left')) return 'لقد استنفذت جميع المحاولات المسموح بها لهذا الامتحان.'
  if (msg.includes('exam_blocked') || msg.includes('forbidden: not authorized')) return 'تم تقييد هذا الامتحان من قِبَل الإدارة.'
  if (msg.includes('content_locked')) return '🔒 هذا الامتحان مقفل بمتطلب سابق ولا يمكن بدؤه الآن.'
  if (msg.includes('exam has no questions')) return 'هذا الامتحان لا يحتوي على أسئلة بعد.'
  return null
}

export default function ExamTaking() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const examId = params.get('id')
  const contextLectureId = params.get('lecture') || params.get('contextLectureId') || null
  // Leave the exam for its lecture (or the exams list) by URL, not history:
  // navigate(-1) landed on the exit guard's extra history entry, so the
  // button needed two clicks, and left the site when the exam was opened
  // from a link.
  const leaveExam = () => {
    if (contextLectureId) navigate(`/lectures?lecture=${encodeURIComponent(contextLectureId)}`, { replace: true })
    else navigate('/exams', { replace: true })
  }

  // Prerequisite context forwarded from Phase 7 Step 1
  const prereqTargetType = params.get('prereqTargetType') || null
  const prereqTargetId = params.get('prereqTargetId') || null
  const prereqTargetTitle = params.get('prereqTargetTitle') || null
  const returnLectureId = params.get('returnLecture') || null
  const rawRequiredScore = params.get('requiredScore')
  const requiredScore = (rawRequiredScore !== null && rawRequiredScore !== undefined && rawRequiredScore !== '')
    ? parseFloat(rawRequiredScore)
    : null
  const requiredExamTitle = params.get('requiredExamTitle') || null
  const contextLectureTitle = params.get('contextLectureTitle') || null

  const isPrereqExam = !!(prereqTargetId || prereqTargetType || requiredScore !== null)
  const [isLectureAttached, setIsLectureAttached] = useState(false)

  const [exam, setExam] = useState(null)
  const isLectureExam = !!(
    contextLectureId ||
    exam?.lecture_id ||
    exam?.origin === 'lecture' ||
    exam?.exam_type === 'lecture' ||
    isLectureAttached
  )
  const questions = exam?.questions || []
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
  const [mobileMapOpen, setMobileMapOpen] = useState(false)
  const [copiedQ, setCopiedQ] = useState(false)
  const quickNavRef = useRef(null)

  // Extract user parameters and role once per component lifecycle
  const { guardLabel, isAdmin } = useMemo(() => {
    try {
      const u = JSON.parse(authStore.getItem('masar-user'))
      return {
        guardLabel: u ? `${u.name || ''} · ${u.phone || ''}` : '',
        isAdmin: u?.role === 'admin' || u?.role === 'assistant',
      }
    } catch { return { guardLabel: '', isAdmin: false } }
  }, [])

  // Prerequisite post-submission score calculations & evaluations
  const targetTypeLabel = useMemo(() => {
    switch (prereqTargetType) {
      case 'video': return 'شرح الفيديو'
      case 'lecture': return 'المحاضرة'
      case 'exam': return 'الامتحان'
      case 'file': return 'الملف'
      default: return 'المحتوى'
    }
  }, [prereqTargetType])

  const maxPoints = useMemo(() => {
    if (exam?.total_points && exam.total_points > 0) return exam.total_points
    if (questions.length > 0) return questions.length
    return 1
  }, [exam?.total_points, questions.length])

  const achievedPct = useMemo(() => {
    const score = finalScore ?? 0
    return Math.round(((score / maxPoints) * 100) * 10) / 10
  }, [finalScore, maxPoints])

  const isPrereqSatisfied = useMemo(() => {
    if (requiredScore === null) return true
    return achievedPct >= requiredScore
  }, [achievedPct, requiredScore])

  const handleContinueToTarget = useCallback(() => {
    if (prereqTargetType === 'video' && prereqTargetId) {
      // The unlocked video inside its lecture (course-lecture system), not
      // the old /videos page.
      navigate(`/lectures?video=${encodeURIComponent(prereqTargetId)}`, { replace: true })
    } else if (returnLectureId) {
      // The lecture holding the item that was unlocked (the required exam
      // may live in a different lecture).
      navigate(`/lectures?lecture=${encodeURIComponent(returnLectureId)}`, { replace: true })
    } else if (contextLectureId) {
      leaveExam()
    } else {
      navigate('/packages')
    }
  }, [prereqTargetType, prereqTargetId, returnLectureId, contextLectureId, navigate])

  const handleRetryExam = useCallback(async () => {
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch {}
    }
    setAnswers({})
    setCurrentQuestion(0)
    setFinalScore(null)
    setExamFinished(false)
    setSubmitting(false)
    setSubmitError(null)
    submittedRef.current = false
    try {
      const att = await startAttempt({ exam_id: examId })
      if (att?.id) {
        setAttemptId(att.id)
      }
    } catch (err) {
      console.error('Failed to start retry attempt:', err)
      // No attempts left / blocked / locked: say so now, not after the
      // student has answered everything.
      const refusal = serverRefusalMessage(err)
      if (refusal) {
        setExam(null)
        setLoadError(refusal)
        return
      }
    }
    const initialTime = (exam?.duration_minutes || 10) * 60
    setTimeLeft(initialTime)
  }, [storageKey, examId, exam])

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
        const u = JSON.parse(authStore.getItem('masar-user'))
        const sid = u?.id
        if (!sid) { setLoadError('يجب تسجيل الدخول'); return }
        setUserId(sid)

        const role = u?.role || 'student'
        let e = null
        let attemptFromAccess = null

        // Attempts-left check for students. Runs BEFORE getExamAccess(), which
        // creates the attempt row, so a student with no attempts left doesn't
        // leave an empty attempt behind.
        if (role !== 'admin' && role !== 'assistant' && role !== 'super_admin') {
          const { data: meta } = await supabase
            .from('exams')
            .select('max_attempts')
            .eq('id', examId)
            .maybeSingle()
          let maxAttempts = meta?.max_attempts || 1
          let sinceIso = null
          try {
            const overrides = await listEffectiveOverrides({
              studentId: sid,
              grade: u.grade,
              group: u.group || null,
              itemType: 'exam',
            })
            const o = reduceEffective(overrides).get(examId)
            if (o && o.allowed === false) {
              setLoadError('تم تقييد هذا الامتحان من قِبَل الإدارة.')
              return
            }
            if (o && typeof o.attempts === 'number') maxAttempts += o.attempts
            // reduceEffective() exposes the reset point as `updatedAt`.
            if (o?.updatedAt) sinceIso = o.updatedAt
          } catch (oErr) {
            console.error('Failed to load overrides', oErr)
          }
          const submittedCount = await countSubmittedAttempts(examId, sid, sinceIso)
          if (submittedCount >= maxAttempts) {
            setLoadError('لقد استنفذت جميع المحاولات المسموح بها لهذا الامتحان.')
            return
          }
        }

        // 1. Authoritative Educational Unlock & Access Gate via getExamAccess
        if (contextLectureId && role !== 'admin' && role !== 'assistant' && role !== 'super_admin') {
          try {
            const accessRes = await getExamAccess({
              examId,
              contextLectureId
            })
            if (!accessRes?.authorized) {
              setLoadError('غير مصرح لك بالوصول إلى هذا الامتحان.')
              return
            }
            e = accessRes.exam
            attemptFromAccess = accessRes.attempt
          } catch (err) {
            if (err.status === 423 || err.unlockStatus) {
              const reqTitle = err.unlockStatus?.required_exam_title || 'الامتحان المشروط'
              const reqScore = err.unlockStatus?.required_score || 70
              setLoadError(
                `🔒 هذا الامتحان مقفل بمتطلب سابق: يتطلب أولاً اجتياز "${reqTitle}" بنسبة ${reqScore}% فأكثر.`
              )
              return
            }
            console.error('getExamAccess error:', err)
            setLoadError(serverRefusalMessage(err) || err.message || 'تعذر الوصول إلى هذا الامتحان')
            return
          }
        }

        // 2. Standalone or Direct Prerequisite Evaluation / Legacy fallback
        if (!e) {
          if (role !== 'admin' && role !== 'assistant' && role !== 'super_admin') {
            try {
              const accessRes = await getExamAccess({ examId, contextLectureId: null })
              if (accessRes?.authorized) {
                e = accessRes.exam
                attemptFromAccess = accessRes.attempt
              }
            } catch (err) {
              if (err.status === 423 || err.unlockStatus) {
                const reqTitle = err.unlockStatus?.required_exam_title || 'الامتحان المشروط'
                const reqScore = err.unlockStatus?.required_score || 70
                setLoadError(
                  `🔒 هذا الامتحان مقفل بمتطلب سابق: يتطلب أولاً اجتياز "${reqTitle}" بنسبة ${reqScore}% فأكثر.`
                )
                return
              }
              // Exam belongs to a lecture but was opened without one in the
              // URL: it may open only if it is unlocked in one of its lectures.
              if (String(err.message || '').startsWith('missing_context')) {
                const lock = await checkContentUnlockedAnyContext({ targetType: 'exam', targetId: examId })
                if (lock?.unlocked === false) {
                  setLoadError(
                    `🔒 هذا الامتحان مقفل بمتطلب سابق: يتطلب أولاً اجتياز "${lock.required_exam_title || 'الامتحان المشروط'}" بنسبة ${lock.required_score || 70}% فأكثر.`
                  )
                  return
                }
              }
            }
          }

          if (!e) {
            e = await getExam(examId)
          }
        }

        // getExamAccess() only authorizes and returns the exam's metadata,
        // without `questions`. Load the full exam (getExam also enforces
        // package and group targeting for students).
        if (!Array.isArray(e?.questions)) {
          e = await getExam(examId)
        }

        // Shared reading passages: ONE query for the whole exam, folded into an index -> block Map.
        try {
          const blocks = await listExamSharedBlocks(e.id)
          setSharedBlockMap(buildQuestionBlockMap(blocks))
        } catch (blockErr) {
          console.error('shared text blocks load failed', blockErr)
        }

        // Check if exam is attached to a course lecture
        try {
          const { data: lecEx } = await supabase
            .from('lecture_exams')
            .select('lecture_id')
            .eq('exam_id', e.id)
            .limit(1)
          if (lecEx && lecEx.length > 0) {
            setIsLectureAttached(true)
          }
        } catch (leErr) {
          console.warn('Failed to check lecture association:', leErr)
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
          if (attemptFromAccess?.id) {
            setAttemptId(attemptFromAccess.id)
          } else {
            try {
              const att = await startAttempt({ exam_id: e.id })
              if (att?.id) {
                setAttemptId(att.id)
              }
            } catch (attErr) {
              console.error('startAttempt failed', attErr)
              // The database refuses locked, blocked or used-up exams.
              const refusal = serverRefusalMessage(attErr)
              if (refusal) {
                setExam(null)
                setLoadError(refusal)
                return
              }
              if (!restoredAttemptId) {
                console.warn('Exam attempt could not be initialized.')
              }
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
  }, [examId, contextLectureId])

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

  // Auto-scroll active quick-nav pill into view smoothly
  useEffect(() => {
    if (quickNavRef.current) {
      const activeBtn = quickNavRef.current.querySelector('.is-active')
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }
    }
  }, [currentQuestion])



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

  // Word-bank blanks: set one answer, or clear it with null.
  const setSingleAnswer = (qIdx, optIdx) => {
    if (examFinished) return
    setAnswers(prev => ({ ...prev, [qIdx]: optIdx === null ? new Set() : new Set([optIdx]) }))
  }

  // NOTE: scoring is computed SERVER-SIDE by submit_exam_attempt(). The
  // client only sends raw responses. We never trust a score that came
  // from this browser.

  const unansweredIndices = useMemo(
    () => questions.map((_, i) => i).filter(i => !answers[i] || answers[i].size === 0),
    [questions, answers]
  )

  const handleFinishExam = async (auto = false) => {
    if (submitting || submittedRef.current) return
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

      // Phase 7 Step 3: Emit reactive unlock event ONLY if this was a prerequisite exam
      // AND prerequisite qualifying score was confirmed by the server!
      if (isPrereqExam) {
        // Use the server's max (sum of question points), the same number the
        // unlock rule is checked against.
        const examMax = res?.max_score > 0 ? res.max_score
          : (exam?.total_points > 0 ? exam.total_points : (questions.length || 1))
        const pct = Math.round(((serverScore / examMax) * 100) * 10) / 10
        const satisfied = (requiredScore === null) ? true : (pct >= requiredScore)

        if (satisfied) {
          emitPrerequisiteUnlocked({
            unlockTargetType: prereqTargetType,
            unlockTargetId: prereqTargetId,
            contextLectureId: contextLectureId || null,
            contextLectureTitle: contextLectureTitle || null,
            requiredExamId: examId,
            achievedScore: serverScore,
            requiredScore: requiredScore
          })
        }
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
    } else if (contextLectureId) {
      navigate(-1, { replace: true })
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
          <button className="et-btn et-btn-prev" onClick={leaveExam}>
            {contextLectureId ? 'العودة للمحاضرة' : 'العودة إلى الامتحانات'}
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
          <button className="et-btn et-btn-prev" onClick={leaveExam}>
            {contextLectureId ? 'العودة للمحاضرة' : 'العودة'}
          </button>
        </div>
      </div>
    )
  }

  const currentQ = questions[currentQuestion]
  const qDir = detectTextDir(currentQ?.question)
  const isLtr = qDir === 'ltr'
  const letters = isLtr
    ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    : ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح']
  // A word bank's blanks are separate questions shown together on one
  // screen; next/previous move over the whole group.
  const wbGroup = wordBankGroupIndices(questions, currentQuestion)
  const screenStart = wbGroup ? wbGroup[0] : currentQuestion
  const screenEnd = wbGroup ? wbGroup[wbGroup.length - 1] : currentQuestion
  const goPrev = () => {
    const prev = screenStart - 1
    if (prev < 0) return
    const g = wordBankGroupIndices(questions, prev)
    setCurrentQuestion(g ? g[0] : prev)
  }
  const goNext = () => setCurrentQuestion(Math.min(questions.length - 1, screenEnd + 1))
  const progress = ((screenEnd + 1) / questions.length) * 100

  const handleCopyQuestion = async () => {
    if (!currentQ) return
    const ok = await copyQuestionToClipboard(currentQ)
    if (ok) {
      setCopiedQ(true)
      setTimeout(() => setCopiedQ(false), 2000)
    }
  }

  // Watermark text parameters (guardLabel/isAdmin extracted at top-level)

  return (
    <div className="et-wrapper">
      {/* Anti-screenshot guard: active for the whole exam-taking flow,
          including the post-submit results screen so a student can't
          easily capture the answer key after seeing it. Admins skipped. */}
      <ScreenGuard active={!isAdmin} label={guardLabel} />

      {examFinished && (
        <div className="et-back-row">
          <button className="et-back-btn" onClick={leaveExam}>
            {contextLectureId ? 'العودة للمحاضرة والمنهج' : 'العودة إلى الامتحانات'}
          </button>
        </div>
      )}
      <div className={`et-layout ${examFinished ? 'is-finished' : ''}`}>
      {!examFinished && (
        <aside className={`et-sidepanel ${mobileMapOpen ? 'is-mobile-open' : 'is-mobile-closed'}`} aria-label="قائمة الأسئلة">
          <div className="et-sidepanel-head" onClick={() => setMobileMapOpen(v => !v)} role="button" tabIndex={0}>
            <div className="et-sidepanel-title-wrap">
              <span className="et-sidepanel-icon">📋</span>
              <h3>الأسئلة</h3>
            </div>
            <div className="et-sidepanel-badges">
              <span className="et-sidepanel-count">
                {answeredCount} / {questions.length}
              </span>
              <span className="et-sidepanel-chevron" aria-hidden="true">
                {mobileMapOpen ? '▲ إخفاء' : '▼ عرض'}
              </span>
            </div>
          </div>
          <div className="et-sidepanel-body">
            <div className="et-sidepanel-grid">
              {questions.map((_, idx) => {
                const answered = answers[idx] && answers[idx].size > 0
                const active = idx >= screenStart && idx <= screenEnd
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`et-side-num ${answered ? 'is-answered' : 'is-pending'} ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      setCurrentQuestion(idx)
                      if (typeof window !== 'undefined' && window.innerWidth <= 900) {
                        setMobileMapOpen(false)
                      }
                    }}
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
              <span><span className="et-legend-swatch is-active-legend"></span> الحالي</span>
              <span><span className="et-legend-swatch is-answered"></span> أجبت</span>
              <span><span className="et-legend-swatch is-pending"></span> متبقي</span>
            </div>
          </div>
        </aside>
      )}
      <div className="et-card">
        {!examFinished ? (
          <>
            <div className="et-topbar">
              <div className="et-topbar-right">
                <span className="et-topbar-title">
                  {wbGroup
                    ? `الأسئلة ${screenStart + 1}–${screenEnd + 1} من ${questions.length}`
                    : `السؤال ${currentQuestion + 1} من ${questions.length}`}
                </span>
                <span className="et-topbar-stat">
                  <span>✅</span>
                  <span><strong>{answeredCount}</strong></span>
                </span>
              </div>
              <div className="et-topbar-left">
                <button
                  type="button"
                  className={`et-map-trigger-btn ${mobileMapOpen ? 'is-open' : ''}`}
                  onClick={() => setMobileMapOpen(v => !v)}
                  aria-label="عرض خريطة الأسئلة"
                >
                  <span>📋</span>
                  <span className="et-map-trigger-text">{mobileMapOpen ? 'إخفاء' : 'الأسئلة'}</span>
                </button>
                <div className={`et-timer ${timeLeft <= 60 ? 'et-timer-critical' : ''}`}>
                  <span>⏱</span>
                  <span>{formatTime(timeLeft)}</span>
                </div>
              </div>
            </div>

            <div className="et-progress-track">
              <div className="et-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            {/* Quick-Jump Question Strip (Mobile Friendly Horizontal Scroll) */}
            <div className="et-quick-strip" ref={quickNavRef} aria-label="شريط الأسئلة السريع">
              {questions.map((_, idx) => {
                const answered = answers[idx] && answers[idx].size > 0
                const active = idx >= screenStart && idx <= screenEnd
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`et-quick-pill ${answered ? 'is-answered' : 'is-pending'} ${active ? 'is-active' : ''}`}
                    onClick={() => setCurrentQuestion(idx)}
                    aria-label={`سؤال ${idx + 1}`}
                  >
                    <span>{idx + 1}</span>
                    {answered && <span className="et-quick-pill-dot">✓</span>}
                  </button>
                )
              })}
            </div>

            {/* Shared reading passage, re-shown above every linked question so
                the student never has to navigate back to re-read it. */}
            <SharedTextCard block={sharedBlockMap.get(screenStart)} />

            {wbGroup ? (
              <WordBankQuestion
                questions={questions}
                indices={wbGroup}
                answers={answers}
                onSet={setSingleAnswer}
              />
            ) : (<>
            <div className="et-question-area" dir={qDir}>
              <div className="et-question-meta">
                <span className="et-q-badge et-q-num">س {currentQuestion + 1}</span>
                <span className="et-q-badge et-q-pts">{currentQ.points || 1} درجات</span>
                <span className="et-q-badge et-q-rem">متبقي: {remainingCount}</span>
                {currentQ.isMultiple && (
                  <span className="et-q-badge et-q-rem">اختيارات متعددة</span>
                )}
                <button
                  type="button"
                  className={`et-copy-q-btn ${copiedQ ? 'is-copied' : ''}`}
                  onClick={handleCopyQuestion}
                  title="نسخ السؤال بالتنسيق المطلوب"
                >
                  <i className={`fas ${copiedQ ? 'fa-check' : 'fa-copy'}`}></i>
                  <span>{copiedQ ? 'تم النسخ' : 'نسخ السؤال'}</span>
                </button>
              </div>
              <p className="et-question-text" dir={qDir}>{currentQ.question}</p>
              {currentQ.image && (
                <div className="et-question-image">
                  <img src={currentQ.image} alt="صورة السؤال" />
                </div>
              )}
            </div>

            <div className="et-options" dir={qDir}>
              {currentQ.options.map((opt, idx) => {
                const optDir = detectTextDir(opt) || qDir
                return (
                  <div
                    key={idx}
                    className={`et-option ${isSelected(currentQuestion, idx) ? 'et-option-selected' : ''}`}
                    onClick={() => toggleOption(currentQuestion, idx)}
                    dir={optDir}
                  >
                    <span className="et-option-letter">{letters[idx] || String.fromCharCode(65 + idx)}</span>
                    <span className="et-option-text" dir={optDir}>{opt}</span>
                  </div>
                )
              })}
            </div>
            </>)}

            <div className="et-footer">
              <button
                className="et-btn et-btn-prev"
                onClick={goPrev}
                disabled={screenStart === 0}
              >
                ← السابق
              </button>
              {screenEnd === questions.length - 1 ? (
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
                  onClick={goNext}
                >
                  التالي →
                </button>
              )}
            </div>
          </>
        ) : (exam.reveal_grades === false && !isLectureExam && !isPrereqExam) ? (
          /* Admin hasn't released results yet — don't leak the score for standalone exams. */
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
        ) : isPrereqExam ? (
          /* Prerequisite Exam Completion Experience (Phase 7 Step 2) */
          <div className={`et-finished et-prereq-finished ${isPrereqSatisfied ? 'is-satisfied' : 'is-failed'}`}>
            <div className="et-prereq-badge-row">
              <span className={`et-prereq-status-badge ${isPrereqSatisfied ? 'badge-satisfied' : 'badge-failed'}`}>
                <i className={`fas ${isPrereqSatisfied ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
                <span>{isPrereqSatisfied ? 'تم استيفاء شرط الفتح بنجاح' : 'لم يتم استيفاء شرط الفتح بعد'}</span>
              </span>
            </div>

            <div className="et-finished-icon">
              {isPrereqSatisfied ? '🎉' : '⚠️'}
            </div>

            <h2 className="et-finished-title">
              {isPrereqSatisfied ? 'مبروك! اجتزت المتطلب السابق بنجاح' : 'لم تحقق النسبة المطلوبة لفتح المحتوى'}
            </h2>

            <p className="et-finished-sub">
              {isPrereqSatisfied
                ? `أحسنت! حققت نسبة ${achievedPct}% (المطلوب ${requiredScore}% فأكثر). أصبح بإمكانك الآن متابعة ${targetTypeLabel} "${prereqTargetTitle || 'المحتوى المطلوب'}" دون الحاجة لإعادة هذا الاختبار.`
                : `لقد حققت نسبة ${achievedPct}% بينما النسبة المشروطة لفتح ${targetTypeLabel} "${prereqTargetTitle || 'المحتوى المطلوب'}" هي ${requiredScore}% فأكثر. يلزم إعادة المحاولة لتحقيق النسبة المطلوبة.`
              }
            </p>

            {/* Prerequisite Context Cards */}
            <div className="et-prereq-context-info">
              <div className="et-prereq-context-item">
                <span className="et-prereq-context-label">الامتحان المشروط:</span>
                <span className="et-prereq-context-val">{requiredExamTitle || exam.title}</span>
              </div>
              <div className="et-prereq-context-item">
                <span className="et-prereq-context-label">المحتوى المستهدف:</span>
                <span className="et-prereq-context-val">{targetTypeLabel}: {prereqTargetTitle || 'المحتوى المحدد'}</span>
              </div>
              {(contextLectureTitle || contextLectureId) && (
                <div className="et-prereq-context-item">
                  <span className="et-prereq-context-label">المحاضرة:</span>
                  <span className="et-prereq-context-val">{contextLectureTitle || 'المحاضرة التابع لها'}</span>
                </div>
              )}
            </div>

            {/* Score Comparison Box */}
            <div className="et-score-box et-prereq-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{finalScore ?? 0} <small className="et-score-pct">({achievedPct}%)</small></span>
                <span className="et-score-lbl">درجتك المحققة</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{requiredScore}%</span>
                <span className="et-score-lbl">النسبة المطلوبة</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{maxPoints}</span>
                <span className="et-score-lbl">الدرجة الكلية</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="et-prereq-actions">
              {isPrereqSatisfied ? (
                <>
                  <button
                    type="button"
                    className="et-btn et-btn-finish et-btn-continue"
                    onClick={handleContinueToTarget}
                  >
                    <i className="fas fa-arrow-left" style={{ marginInlineEnd: '8px' }}></i>
                    <span>الانتقال إلى {targetTypeLabel} المفتوح الآن</span>
                  </button>
                  <button
                    type="button"
                    className="et-btn et-btn-prev"
                    onClick={leaveExam}
                  >
                    <span>{contextLectureId ? 'العودة للمحاضرة والمنهج' : 'العودة للامتحانات'}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="et-btn et-btn-finish et-btn-retry"
                    onClick={handleRetryExam}
                  >
                    <i className="fas fa-rotate-right" style={{ marginInlineEnd: '8px' }}></i>
                    <span>إعادة محاولة الامتحان الآن</span>
                  </button>
                  <button
                    type="button"
                    className="et-btn et-btn-prev"
                    onClick={leaveExam}
                  >
                    <span>{contextLectureId ? 'العودة للمحاضرة والمنهج' : 'العودة للامتحانات'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="et-finished">
            <div className="et-finished-icon">🎉</div>
            <h2 className="et-finished-title">تم إنهاء الامتحان بنجاح!</h2>
            <p className="et-finished-sub">شكراً لك على إكمال الاختبار</p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{finalScore ?? 0} <small className="et-score-pct">({achievedPct}%)</small></span>
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
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="et-btn et-btn-finish"
                style={{ width: 'auto', padding: '10px 24px' }}
                onClick={() => (!contextLectureId && isLectureExam ? navigate('/lectures', { replace: true }) : leaveExam())}
              >
                <i className="fas fa-arrow-right" style={{ marginInlineEnd: '8px' }}></i>
                {contextLectureId || isLectureExam ? 'العودة للمحاضرة والمنهج' : 'العودة للامتحانات'}
              </button>
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
