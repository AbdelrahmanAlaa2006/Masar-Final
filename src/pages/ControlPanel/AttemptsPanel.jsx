import React, { useState, useEffect, useMemo } from 'react'
import {
  listOverridesForTarget,
  upsertOverride,
  deleteOverride,
} from '@backend/overridesApi'
import {
  resetStudentVideoAttempts,
  resetGradeVideoAttempts,
} from '@backend/progressApi'
import { listVideoAssessmentsForVideos, invalidateGateCache } from '@backend/videoAssessmentsApi'
import {
  ScopePicker,
  TargetPicker,
  ItemsManager,
  initials,
  GRADE_LABEL,
  GRADE_ORDER,
} from './shared'

const DEFAULT_VIDEO_ATTEMPTS = 0
const DEFAULT_EXAM_ATTEMPTS = 0

const fmtDate = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('ar-EG') } catch { return '' }
}

export default function AttemptsPanel({
  section,
  students,
  videos,
  exams,
  loading,
  flash,
  onBack,
}) {
  const [scope, setScope] = useState(null) // 'prep' | 'student'
  const [target, setTarget] = useState(null) // { kind, id, name, prep?, ... }
  const [pickerQuery, setPickerQuery] = useState('')
  const [overrides, setOverrides] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  // Map<videoId, gate[]> — the pre-video assessments attached to each video,
  // so the videos panel can also grant bonus attempts on the gate.
  const [gatesByVideo, setGatesByVideo] = useState(new Map())

  const GATE_TYPE_LABEL = { exam: 'امتحان قبل الفيديو', tasmee3: 'تسميع قبل الفيديو' }
  const GATE_TYPE_ICON  = { exam: 'fa-file-pen', tasmee3: 'fa-microphone-lines' }

  // ───── derived data for picker lists ─────
  const allStudents = useMemo(
    () => students.map((s) => ({
      id: s.id,
      displayId: s.phone || s.id.slice(0, 8),
      name: s.name,
      grade: s.grade,
      prep: GRADE_LABEL[s.grade] || '—',
    })),
    [students]
  )

  const allPreps = useMemo(() => {
    const counts = {}
    students.forEach((s) => {
      if (!s.grade) return
      counts[s.grade] = (counts[s.grade] || 0) + 1
    })
    return GRADE_ORDER
      .filter((g) => counts[g] !== undefined)
      .map((g) => ({
        id: g,              // DB enum value
        name: GRADE_LABEL[g],
        studentCount: counts[g],
      }))
  }, [students])

  const targetGrade = useMemo(() => {
    if (!target) return null
    if (target.kind === 'prep') return target.id      // already DB enum
    if (target.kind === 'student') return target.grade
    return null
  }, [target])

  const items = useMemo(() => {
    if (!targetGrade) return []
    if (section === 'videos') {
      const out = []
      for (const v of videos.filter((v) => v.grade === targetGrade)) {
        out.push({
          id: v.id,
          itemType: 'video',
          title: v.title,
          subject: v.description || '',
          date: fmtDate(v.created_at),
        })
        // Interleave each video's pre-video gate(s) right under it.
        for (const g of (gatesByVideo.get(v.id) || [])) {
          out.push({
            id: g.id,                       // video_assessments.id
            itemType: 'video_assessment',
            attemptsOnly: true,
            icon: GATE_TYPE_ICON[g.assessment_type] || 'fa-clipboard-check',
            title: `${GATE_TYPE_LABEL[g.assessment_type] || 'تقييم قبل الفيديو'}: ${v.title}`,
            subject: g.assessment?.title || '',
          })
        }
      }
      return out
    }
    if (section === 'exams') {
      return exams
        .filter((e) => e.grade === targetGrade)
        .map((e) => ({
          id: e.id,
          title: e.title,
          subject: e.number ? `رقم ${e.number}` : '',
          date: fmtDate(e.created_at),
        }))
    }
    return []
  }, [section, targetGrade, videos, exams, gatesByVideo])

  /* ── Load the gates for this grade's videos (videos section only) ── */
  useEffect(() => {
    if (section !== 'videos' || !targetGrade) { setGatesByVideo(new Map()); return }
    let cancelled = false
    ;(async () => {
      try {
        const ids = videos.filter((v) => v.grade === targetGrade).map((v) => v.id)
        const map = await listVideoAssessmentsForVideos(ids)
        if (!cancelled) setGatesByVideo(map)
      } catch (e) {
        if (!cancelled) setGatesByVideo(new Map())
      }
    })()
    return () => { cancelled = true }
  }, [section, targetGrade, videos])

  /* ── Load existing overrides for the chosen target+section ── */
  useEffect(() => {
    if (!target || (section !== 'videos' && section !== 'exams')) return
    let cancelled = false
    ;(async () => {
      try {
        // The videos panel now manages TWO item types: the video itself and
        // its pre-video gate. Load both so the steppers show granted bonuses.
        const itemTypes = section === 'videos' ? ['video', 'video_assessment'] : ['exam']
        const maps = await Promise.all(
          itemTypes.map((it) => listOverridesForTarget(target.kind, target.id, it))
        )
        if (cancelled) return
        const next = {}
        for (const rows of maps) {
          for (const [, r] of rows) {
            next[`${target.kind}:${target.id}:${r.item_type}:${r.item_id}`] = {
              allowed: r.allowed !== false,
              attempts: r.attempts ?? null,
            }
          }
        }
        setOverrides(next)
      } catch (e) {
        if (!cancelled) flash(e.message || 'تعذر تحميل الإعدادات', 'warning')
      }
    })()
    return () => { cancelled = true }
  }, [target, section]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ───── override helpers ───── */
  // Item type: 'video' | 'exam' | 'video_assessment'. Gate rows carry their
  // own itemType; plain video/exam rows fall back to the section default.
  const itemTypeOf = (item) =>
    item.itemType || (section === 'videos' ? 'video' : 'exam')

  const keyFor = (item) =>
    target ? `${target.kind}:${target.id}:${itemTypeOf(item)}:${item.id}` : ''

  const defaultAttemptsFor = () =>
    section === 'videos' ? DEFAULT_VIDEO_ATTEMPTS : DEFAULT_EXAM_ATTEMPTS

  const stateFor = (item) => {
    const o = overrides[keyFor(item)]
    return {
      allowed: o?.allowed ?? true,
      attempts: (o?.attempts ?? null) ?? defaultAttemptsFor(),
      hasOverride: !!o,
    }
  }

  /* Persist + optimistic UI update. `patch` is a partial of {allowed, attempts}. */
  const persistItem = async (item, patch) => {
    const key = keyFor(item)
    const prev = overrides[key] || { allowed: true, attempts: null }
    const next = { ...prev, ...patch }
    setOverrides((p) => ({ ...p, [key]: next }))
    setSavingKey(key)
    try {
      await upsertOverride({
        scope: target.kind,
        targetId: target.id,
        itemType: itemTypeOf(item),
        itemId: item.id,
        ...(patch.allowed  !== undefined ? { allowed:  patch.allowed }  : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
      })
      // Gate bonus changes what get_video_gate_status returns for the student.
      if (itemTypeOf(item) === 'video_assessment') invalidateGateCache()
    } catch (e) {
      // rollback
      setOverrides((p) => ({ ...p, [key]: prev }))
      flash(e.message || 'تعذر حفظ التعديل', 'warning')
    } finally {
      setSavingKey(null)
    }
  }

  const setAttempts = (item, value) => {
    const v = Math.max(0, Math.min(99, parseInt(value, 10) || 0))
    return persistItem(item, { attempts: v })
  }

  const bumpAttempts = (item, delta) => {
    const cur = stateFor(item).attempts
    const v = Math.max(0, Math.min(99, cur + delta))
    persistItem(item, { attempts: v })
  }

  const toggleAllowed = (item) => {
    const cur = stateFor(item).allowed
    persistItem(item, { allowed: !cur })
  }

  const resetItem = async (item) => {
    const itemType = itemTypeOf(item)
    const isVideoView = itemType === 'video'   // the video itself, not its gate
    const key = keyFor(item)
    const prev = overrides[key]
    // Only the video-view row has a counter to zero even without an override.
    if (!prev && !isVideoView) return
    if (prev) {
      setOverrides((p) => { const n = { ...p }; delete n[key]; return n })
    }
    try {
      if (prev) {
        await deleteOverride({
          scope: target.kind,
          targetId: target.id,
          itemType,
          itemId: item.id,
        })
      }
      // For the video itself, also zero out the per-student view counter.
      // Gate rows just drop their bonus override (the exam-style reset).
      if (isVideoView) {
        if (target.kind === 'student') {
          await resetStudentVideoAttempts({ student_id: target.id, video_id: item.id })
        } else if (target.kind === 'prep') {
          await resetGradeVideoAttempts({ grade: target.id, video_id: item.id })
        }
      }
      if (itemType === 'video_assessment') invalidateGateCache()
      flash(isVideoView
        ? 'تم تصفير المحاولات وإعادة الإعدادات الافتراضية'
        : 'تم استرجاع الإعدادات الافتراضية')
    } catch (e) {
      if (prev) setOverrides((p) => ({ ...p, [key]: prev }))
      flash(e.message || 'تعذر الاسترجاع', 'warning')
    }
  }

  const bulkSet = async (allowed) => {
    try {
      // Allow/block is only meaningful for real videos/exams, not gate rows.
      await Promise.all(items.filter((it) => !it.attemptsOnly).map((item) =>
        persistItem(item, { allowed })
      ))
      flash(allowed ? 'تم السماح بكل العناصر' : 'تم منع كل العناصر')
    } catch (e) { /* individual errors already flashed */ }
  }

  const bulkAddAttempt = async () => {
    try {
      // Adds a bonus attempt to every row — videos AND their gates.
      await Promise.all(items.map((item) => {
        const cur = stateFor(item).attempts
        return persistItem(item, { attempts: Math.min(99, cur + 1) })
      }))
      flash('تم إضافة محاولة لكل العناصر')
    } catch (e) { /* ignore */ }
  }

  /* ───── picker filtering ───── */
  const pickerList = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    let list = []
    if (scope === 'student') list = allStudents
    else if (scope === 'prep') list = allPreps
    if (!q) return list
    return list.filter((r) =>
      [r.name, r.displayId, r.prep].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [scope, allStudents, allPreps, pickerQuery])

  const stats = useMemo(() => {
    // Count real videos/exams only — gate rows are attempt-only add-ons.
    const list = items.filter((it) => !it.attemptsOnly).map((it) => stateFor(it))
    return {
      total: list.length,
      allowed: list.filter((s) => s.allowed).length,
      blocked: list.filter((s) => !s.allowed).length,
    }
  }, [items, overrides]) // eslint-disable-line react-hooks/exhaustive-deps

  const chooseScope = (s) => {
    setScope(s)
    setTarget(null)
    setPickerQuery('')
  }

  const chooseTarget = (kind, entity) => {
    setTarget({ kind, ...entity })
  }

  const backFromTarget = () => setTarget(null)
  const backFromScope = () => setScope(null)

  if (loading) {
    return (
      <div className="cp-empty">
        <i className="fas fa-spinner fa-spin"></i>
        <p>جارٍ التحميل...</p>
      </div>
    )
  }

  if (!scope) {
    return <ScopePicker section={section} onPick={chooseScope} onBack={onBack} />
  }

  if (!target) {
    return (
      <TargetPicker
        scope={scope}
        list={pickerList}
        query={pickerQuery}
        onQuery={setPickerQuery}
        onPick={(kind, entity) => chooseTarget(kind, entity)}
        onBack={backFromScope}
      />
    )
  }

  return (
    <ItemsManager
      section={section}
      scope={scope}
      target={target}
      items={items}
      stats={stats}
      stateFor={stateFor}
      onToggle={toggleAllowed}
      onAttempts={(item, val) => setAttempts(item, val)}
      onBump={bumpAttempts}
      onReset={resetItem}
      onBulkAllow={() => bulkSet(true)}
      onBulkBlock={() => bulkSet(false)}
      onBulkAddAttempt={bulkAddAttempt}
      onBack={backFromTarget}
    />
  )
}
