import React, { useEffect, useMemo, useState } from 'react'
import './PreAssessmentEditor.css'
import {
  listAssessmentTypes,
  listSelectableAssessments,
} from '@backend/videoAssessmentsApi'
import { getExam } from '@backend/examsApi'

/**
 * Teacher-facing editor for a video's Pre-Video Assessments.
 *
 * Shared by VideoAdd (create) and the Videos edit modal, so the two can never
 * drift. It edits a plain array — the caller owns persistence via
 * syncVideoAssessments() — which is what lets it work before the video (and
 * therefore its part ids) exists.
 *
 * Scope is carried as `part_index`, not `part_id`: on a brand-new video the
 * parts have no database ids yet. The caller maps index -> id at save time,
 * once the parts have been written.
 *
 * Gate shape:
 *   { id?, assessment_type, assessment_id, part_index ('' = whole video),
 *     allowed_attempts (0 = unlimited), passing_score, trigger_type,
 *     timestamp_seconds, is_enabled, title_override }
 */

export const ATTEMPT_CHOICES = [
  { value: 1, label: 'محاولة واحدة' },
  { value: 2, label: 'محاولتان' },
  { value: 3, label: '3 محاولات' },
  { value: 5, label: '5 محاولات' },
  { value: 0, label: 'غير محدود' },
]

export const PASSING_CHOICES = [50, 60, 70, 80, 90, 100]

export const makeGate = () => ({
  localKey: `ng_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  id: null,
  assessment_type: 'exam',
  assessment_id: '',
  part_index: '',           // '' = the whole video
  allowed_attempts: 2,      // the spec's default
  passing_score: 50,
  trigger_type: 'before',
  timestamp_seconds: null,
  is_enabled: true,
  title_override: '',
})

/* Seconds <-> mm:ss for the timestamp checkpoints carried over from the
   legacy inline-quiz feature. */
const toClock = (secs) => {
  if (secs == null || secs === '') return ''
  const s = Math.max(0, parseInt(secs, 10) || 0)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const fromClock = (txt) => {
  const m = String(txt || '').trim().match(/^(\d{1,3}):([0-5]?\d)$/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

export default function PreAssessmentEditor({ gates, onChange, parts = [], grade = null }) {
  const [types, setTypes] = useState([])
  const [catalog, setCatalog] = useState({})     // typeCode -> assessment[]
  const [loadErr, setLoadErr] = useState('')
  const [previewFor, setPreviewFor] = useState(null)   // localKey being previewed
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = await listAssessmentTypes()
        if (cancelled) return
        setTypes(t)
        // Load every type's catalogue up front — there are only a handful of
        // types, and it makes switching the radio instant.
        const entries = await Promise.all(
          t.map(async (ty) => [ty.code, await listSelectableAssessments(ty.code, { grade })])
        )
        if (!cancelled) setCatalog(Object.fromEntries(entries))
      } catch (err) {
        if (!cancelled) setLoadErr(err.message || 'تعذر تحميل قائمة التقييمات')
      }
    })()
    return () => { cancelled = true }
  }, [grade])

  const update = (localKey, patch) =>
    onChange(gates.map(g => (g.localKey === localKey ? { ...g, ...patch } : g)))

  const remove = (localKey) => onChange(gates.filter(g => g.localKey !== localKey))
  const add = () => onChange([...gates, makeGate()])

  const openPreview = async (gate) => {
    if (previewFor === gate.localKey) { setPreviewFor(null); setPreviewData(null); return }
    if (!gate.assessment_id) return
    setPreviewFor(gate.localKey)
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      // Staff read the exam directly — they are allowed to see the answer key.
      const exam = await getExam(gate.assessment_id)
      setPreviewData(exam)
    } catch (err) {
      setPreviewData({ error: err.message || 'تعذر تحميل المعاينة' })
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="pae">
      <div className="pae-head">
        <div>
          <h3><i className="fas fa-clipboard-check"></i> التقييم قبل الفيديو</h3>
          <p className="pae-hint">
            اربط <strong>امتحاناً</strong> أو <strong>تسميعاً</strong> من مكتبة التقييمات بهذا الفيديو.
            لن يُفتح الفيديو للطالب إلا بعد تحقيق نسبة النجاح المطلوبة.
            النتيجة لا تظهر للطالب إلا بعد النجاح أو انتهاء كل المحاولات.
          </p>
          {/* Not a warning about a bug — this is the deliberate consequence of
              the RLS rule that stops students reading the gate's answer key
              straight from /rest/v1/exams. */}
          <p className="pae-hint pae-hint-warn">
            <i className="fas fa-circle-info"></i>{' '}
            التقييم الذي تربطه هنا يختفي من صفحة الامتحانات لدى الطلاب، حتى لا يتمكنوا
            من حلّه هناك ومعرفة إجاباته قبل فتح الفيديو. يُفضَّل تخصيص تقييم مستقل للربط.
          </p>
        </div>
        <button type="button" className="btn btn-secondary pae-add" onClick={add}>
          <i className="fas fa-plus"></i> إضافة تقييم
        </button>
      </div>

      {loadErr && (
        <div className="pae-error"><i className="fas fa-triangle-exclamation"></i> {loadErr}</div>
      )}

      {gates.length === 0 && (
        <div className="pae-empty">
          <i className="fas fa-unlock"></i>
          <p>لا يوجد تقييم مطلوب — سيُفتح الفيديو للطالب مباشرة.</p>
        </div>
      )}

      {gates.map((g, gi) => {
        const options = catalog[g.assessment_type] || []
        const selected = options.find(o => o.id === g.assessment_id)
        const typeMeta = types.find(t => t.code === g.assessment_type)
        const isPreviewOpen = previewFor === g.localKey

        return (
          <div className={`pae-card ${g.is_enabled ? '' : 'is-off'}`} key={g.localKey || g.id || gi}>
            <div className="pae-card-head">
              <span className="pae-card-num">تقييم {gi + 1}</span>
              {selected && <span className="pae-card-meta">{selected.questions_count || 0} سؤال</span>}
              <label className="pae-toggle" title="تفعيل / إيقاف">
                <input
                  type="checkbox"
                  checked={g.is_enabled !== false}
                  onChange={(e) => update(g.localKey, { is_enabled: e.target.checked })}
                />
                <span>{g.is_enabled !== false ? 'مُفعّل' : 'موقوف'}</span>
              </label>
              <button type="button" className="pae-remove" onClick={() => remove(g.localKey)} title="حذف">
                <i className="fas fa-trash"></i>
              </button>
            </div>

            {/* ── Assessment type ── */}
            <div className="pae-field">
              <label>نوع التقييم</label>
              <div className="pae-types">
                {types.map(t => (
                  <label
                    key={t.code}
                    className={`pae-type-opt ${g.assessment_type === t.code ? 'is-on' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`patype_${g.localKey}`}
                      checked={g.assessment_type === t.code}
                      onChange={() => update(g.localKey, { assessment_type: t.code, assessment_id: '' })}
                    />
                    <i className={`fas ${t.icon || 'fa-file-pen'}`}></i>
                    {t.label_ar}
                  </label>
                ))}
              </div>
            </div>

            {/* ── Which assessment ── */}
            <div className="pae-field">
              <label>
                {typeMeta?.label_ar || 'التقييم'}
                <span className="pae-req"> *</span>
              </label>
              <select
                value={g.assessment_id || ''}
                onChange={(e) => update(g.localKey, { assessment_id: e.target.value })}
              >
                <option value="">— اختر من المكتبة —</option>
                {options.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                    {o.questions_count ? ` (${o.questions_count} سؤال)` : ''}
                    {o.grade ? ` — ${o.grade}` : ''}
                    {/* Auto-created by the migration from an old inline quiz;
                        flagged so the teacher knows it isn't a library exam. */}
                    {o.origin === 'video_quiz' ? ' — (مُرحَّل من اختبار قديم)' : ''}
                  </option>
                ))}
              </select>
              {options.length === 0 && !loadErr && (
                <small className="pae-warn">
                  لا توجد {typeMeta?.label_ar || 'تقييمات'} متاحة لهذه المرحلة — أنشئها أولاً من صفحة الامتحانات.
                </small>
              )}
            </div>

            <div className="pae-row">
              {/* ── Attempts ── */}
              <div className="pae-field">
                <label>عدد المحاولات المسموح بها</label>
                <select
                  value={String(g.allowed_attempts ?? 2)}
                  onChange={(e) => update(g.localKey, { allowed_attempts: parseInt(e.target.value, 10) })}
                >
                  {ATTEMPT_CHOICES.map(c => (
                    <option key={c.value} value={String(c.value)}>{c.label}</option>
                  ))}
                </select>
                <small className="pae-note">الافتراضي محاولتان.</small>
              </div>

              {/* ── Passing score ── */}
              <div className="pae-field">
                <label>نسبة النجاح المطلوبة</label>
                <select
                  value={String(g.passing_score ?? 50)}
                  onChange={(e) => update(g.localKey, { passing_score: Number(e.target.value) })}
                >
                  {PASSING_CHOICES.map(p => (
                    <option key={p} value={String(p)}>{p}%</option>
                  ))}
                </select>
                <small className="pae-note">يُفتح الفيديو عند تحقيق هذه النسبة أو أعلى.</small>
              </div>
            </div>

            <div className="pae-row">
              {/* ── Scope ── */}
              <div className="pae-field">
                <label>يُطبَّق على</label>
                <select
                  value={g.part_index === '' || g.part_index == null ? '' : String(g.part_index)}
                  onChange={(e) => update(g.localKey, {
                    part_index: e.target.value === '' ? '' : parseInt(e.target.value, 10),
                  })}
                >
                  <option value="">الفيديو بالكامل</option>
                  {parts.map((p, i) => (
                    <option key={p.id || i} value={String(i)}>
                      الجزء {i + 1}{p.title ? `: ${p.title}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Trigger ── */}
              <div className="pae-field">
                <label>وقت الظهور</label>
                <select
                  value={g.trigger_type || 'before'}
                  onChange={(e) => update(g.localKey, {
                    trigger_type: e.target.value,
                    timestamp_seconds: e.target.value === 'before' ? null : (g.timestamp_seconds ?? 0),
                  })}
                >
                  <option value="before">قبل المشاهدة</option>
                  <option value="timestamp">عند لحظة محددة داخل الفيديو</option>
                </select>
              </div>
            </div>

            {g.trigger_type === 'timestamp' && (
              <div className="pae-field">
                <label>اللحظة (دقيقة:ثانية)</label>
                <input
                  type="text"
                  placeholder="05:30"
                  defaultValue={toClock(g.timestamp_seconds)}
                  onBlur={(e) => {
                    const secs = fromClock(e.target.value)
                    update(g.localKey, { timestamp_seconds: secs })
                    e.target.value = toClock(secs)
                  }}
                />
                <small className="pae-note">
                  سيتوقف الفيديو عند هذه اللحظة حتى يجتاز الطالب التقييم.
                </small>
              </div>
            )}

            <div className="pae-field">
              <label>عنوان مخصص <span className="pae-opt">(اختياري)</span></label>
              <input
                type="text"
                placeholder={selected?.title || 'يُستخدم عنوان التقييم الأصلي'}
                value={g.title_override || ''}
                onChange={(e) => update(g.localKey, { title_override: e.target.value })}
              />
            </div>

            {/* ── Preview ── */}
            <div className="pae-preview-bar">
              <button
                type="button"
                className="pae-preview-btn"
                onClick={() => openPreview(g)}
                disabled={!g.assessment_id}
              >
                <i className={`fas ${isPreviewOpen ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                {' '}{isPreviewOpen ? 'إخفاء المعاينة' : 'معاينة التقييم'}
              </button>
              {g.assessment_id && (
                <span className="pae-summary">
                  {g.allowed_attempts === 0 ? 'محاولات غير محدودة' : `${g.allowed_attempts} محاولة`}
                  {' · '}النجاح {g.passing_score}%
                  {' · '}{g.part_index === '' || g.part_index == null
                    ? 'الفيديو بالكامل'
                    : `الجزء ${Number(g.part_index) + 1}`}
                </span>
              )}
            </div>

            {isPreviewOpen && (
              <div className="pae-preview">
                {previewLoading && <p><i className="fas fa-spinner fa-spin"></i> جاري التحميل...</p>}
                {previewData?.error && <p className="pae-warn">{previewData.error}</p>}
                {previewData && !previewData.error && (
                  <>
                    <div className="pae-preview-head">
                      <strong>{previewData.title}</strong>
                      <span>
                        {(previewData.questions || []).length} سؤال · {previewData.total_points || 0} نقطة
                        {previewData.duration_minutes ? ` · ${previewData.duration_minutes} دقيقة` : ''}
                      </span>
                    </div>
                    <ol className="pae-preview-qs">
                      {(previewData.questions || []).map((q, qi) => (
                        <li key={qi}>
                          <div className="pae-preview-q">{q.question}</div>
                          <ul>
                            {(q.options || []).map((opt, oi) => (
                              <li key={oi} className={(q.answers || []).includes(oi) ? 'is-correct' : ''}>
                                {opt}
                                {(q.answers || []).includes(oi) && <i className="fas fa-check"></i>}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* Shared save-path helpers, so VideoAdd and the edit modal agree on how the
   editor model becomes database rows. */

// Editor rows -> API payloads. `part_index` is resolved against the parts as
// they were actually written, because a new video's parts get their ids only
// after insert.
export function gatesToPayload(gates, savedParts) {
  return (gates || [])
    .filter(g => g.assessment_id)
    .map(g => {
      const idx = g.part_index === '' || g.part_index == null ? null : Number(g.part_index)
      const part = idx == null ? null : (savedParts || [])[idx]
      return {
        id: g.id || undefined,
        assessment_type: g.assessment_type || 'exam',
        assessment_id: g.assessment_id,
        part_id: part?.id || null,
        allowed_attempts: g.allowed_attempts ?? 2,
        passing_score: g.passing_score ?? 50,
        trigger_type: g.trigger_type || 'before',
        timestamp_seconds: g.trigger_type === 'timestamp' ? (g.timestamp_seconds ?? 0) : null,
        is_enabled: g.is_enabled !== false,
        title_override: g.title_override || null,
      }
    })
}

// Database rows -> editor model.
export function payloadToGates(rows, savedParts) {
  return (rows || []).map(r => {
    const idx = r.part_id
      ? (savedParts || []).findIndex(p => p.id === r.part_id)
      : -1
    return {
      localKey: `eg_${r.id}`,
      id: r.id,
      assessment_type: r.assessment_type || 'exam',
      assessment_id: r.assessment_id || '',
      part_index: idx >= 0 ? idx : '',
      allowed_attempts: r.allowed_attempts ?? 2,
      passing_score: Number(r.passing_score ?? 50),
      trigger_type: r.trigger_type || 'before',
      timestamp_seconds: r.timestamp_seconds ?? null,
      is_enabled: r.is_enabled !== false,
      title_override: r.title_override || '',
    }
  })
}

// One place to say what makes a gate invalid, so both callers report the same
// message before hitting the database CHECK constraints.
export function validateGates(gates) {
  for (let i = 0; i < (gates || []).length; i++) {
    const g = gates[i]
    if (!g.assessment_id) return `التقييم رقم ${i + 1}: يجب اختيار امتحان أو تسميع.`
    const pass = Number(g.passing_score)
    if (!Number.isFinite(pass) || pass < 0 || pass > 100) {
      return `التقييم رقم ${i + 1}: نسبة النجاح يجب أن تكون بين 0 و 100.`
    }
    const att = Number(g.allowed_attempts)
    if (!Number.isFinite(att) || att < 0 || att > 99) {
      return `التقييم رقم ${i + 1}: عدد المحاولات غير صالح.`
    }
    if (g.trigger_type === 'timestamp' && (g.timestamp_seconds == null || g.timestamp_seconds < 0)) {
      return `التقييم رقم ${i + 1}: أدخل لحظة صحيحة بصيغة دقيقة:ثانية.`
    }
  }
  return null
}
