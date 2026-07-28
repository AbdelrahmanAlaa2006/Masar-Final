import React from 'react'
import './SharedTextBlocksEditor.css'

/**
 * Teacher-side editor for Shared Text Blocks (reading passages).
 *
 * Shared by ExamAdd (create) and the EditExamModal in Exams.jsx (edit) so the
 * two builders cannot drift — the same reason the pre-video assessment editor
 * is a shared component.
 *
 * It edits a plain array and leaves persistence to the caller. That matters:
 * on a NEW exam the blocks have to be written after the exam row exists, and
 * on an edit they have to be written in the SAME save as the questions, so
 * that reordering or deleting a question can't leave a passage pointing at the
 * wrong one.
 *
 * The DATABASE keys mappings on the question's array index. This editor
 * deliberately does NOT: it holds each builder's local question `id`, and
 * converts to an index only at the load/save boundary.
 *
 * That conversion is the whole point. Local ids survive edits; indices do not.
 * If the teacher deletes question 2, every later question shifts down one — so
 * a stored index would silently start pointing at its neighbour, and a passage
 * would attach to the wrong question. Local ids are unaffected, and
 * `editorBlocksToPayload` recomputes the indices from the final question order
 * at save time.
 *
 * Block shape: { localKey, id?, title, content, question_ids: (number|string)[] }
 */

export const makeSharedBlock = () => ({
  localKey: `sb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  content: '',
  question_ids: [],
})

/* DB rows -> editor model. Indices are resolved against the question list as
   it was loaded, where position === local id. */
export function blocksToEditorModel(rows, questions) {
  const qs = questions || []
  return (rows || []).map((r, i) => ({
    localKey: `sb_${r.id || i}`,
    id: r.id || null,
    title: r.title || '',
    content: r.content || '',
    question_ids: (r.question_indexes || [])
      .map(idx => qs[idx]?.id)
      .filter(id => id !== undefined),
  }))
}

/* Editor model -> API payload. Local ids become the CURRENT array positions,
   so a question that was moved or deleted resolves correctly (or drops out). */
export function editorBlocksToPayload(blocks, questions) {
  const qs = questions || []
  return (blocks || []).map(b => ({
    title: b.title,
    content: b.content,
    question_indexes: (b.question_ids || [])
      .map(qid => qs.findIndex(q => q.id === qid))
      .filter(idx => idx >= 0)
      .sort((a, c) => a - c),
  }))
}

/* Validate against the editor model, before the index conversion. */
export function validateEditorBlocks(blocks) {
  const seen = new Map()
  for (let i = 0; i < (blocks || []).length; i++) {
    const b = blocks[i]
    if (!(b.content || '').trim()) {
      return `النص المشترك رقم ${i + 1}: لا يمكن حفظ نص مشترك فارغ.`
    }
    for (const qid of b.question_ids || []) {
      if (seen.has(qid)) {
        return 'لا يمكن ربط السؤال الواحد بأكثر من نص مشترك.'
      }
      seen.set(qid, i)
    }
  }
  return null
}

export default function SharedTextBlocksEditor({ blocks, onChange, questions }) {
  const questionCount = (questions || []).length

  const update = (localKey, patch) =>
    onChange(blocks.map(b => (b.localKey === localKey ? { ...b, ...patch } : b)))

  const add = () => onChange([...(blocks || []), makeSharedBlock()])

  const remove = (localKey) =>
    onChange(blocks.filter(b => b.localKey !== localKey))

  /* A question belongs to at most one block, so ticking it here unticks it
     everywhere else. Enforcing that in the UI means the teacher never has to
     decipher a database uniqueness error. */
  const toggleQuestion = (localKey, qid) => {
    onChange(blocks.map(b => {
      if (b.localKey === localKey) {
        const has = b.question_ids.includes(qid)
        return {
          ...b,
          question_ids: has
            ? b.question_ids.filter(n => n !== qid)
            : [...b.question_ids, qid],
        }
      }
      // Claimed by another block — release it there.
      if (b.question_ids.includes(qid)) {
        return { ...b, question_ids: b.question_ids.filter(n => n !== qid) }
      }
      return b
    }))
  }

  const ownerOf = (qid) =>
    (blocks || []).findIndex(b => b.question_ids.includes(qid))

  return (
    <div className="stb">
      <div className="stb-head">
        <div>
          <h3><i className="fas fa-book-open-reader"></i> النصوص المشتركة</h3>
          <p className="stb-hint">
            اكتب قطعة قراءة أو نصاً أو حالة دراسية مرة واحدة، ثم اختر الأسئلة التي
            ستظهر فوقها. سيرى الطالب النص أعلى كل سؤال مرتبط به، دون الحاجة للرجوع.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary stb-add"
          onClick={add}
          disabled={questionCount === 0}
          title={questionCount === 0 ? 'أضف أسئلة الامتحان أولاً' : 'إضافة نص مشترك'}
        >
          <i className="fas fa-plus"></i> إضافة نص مشترك
        </button>
      </div>

      {questionCount === 0 && (
        <div className="stb-empty">
          <i className="fas fa-circle-info"></i>
          <p>أضف أسئلة الامتحان أولاً، ثم يمكنك ربط النصوص المشتركة بها.</p>
        </div>
      )}

      {questionCount > 0 && (blocks || []).length === 0 && (
        <div className="stb-empty">
          <i className="fas fa-align-left"></i>
          <p>لا توجد نصوص مشتركة — ستظهر كل الأسئلة بشكلها المعتاد.</p>
        </div>
      )}

      {(blocks || []).map((b, bi) => {
        const charCount = (b.content || '').trim().length
        return (
          <div className="stb-card" key={b.localKey}>
            <div className="stb-card-head">
              <span className="stb-card-num">نص {bi + 1}</span>
              <span className="stb-card-meta">
                {b.question_ids.length > 0
                  ? `${b.question_ids.length} سؤال مرتبط`
                  : 'لا يوجد سؤال مرتبط'}
              </span>
              <button
                type="button"
                className="stb-remove"
                onClick={() => remove(b.localKey)}
                title="حذف النص المشترك (لن يُحذف أي سؤال)"
              >
                <i className="fas fa-trash"></i>
              </button>
            </div>

            <div className="stb-field">
              <label>العنوان <span className="stb-opt">(اختياري)</span></label>
              <input
                type="text"
                placeholder="مثال: قطعة القراءة"
                value={b.title}
                onChange={(e) => update(b.localKey, { title: e.target.value })}
              />
            </div>

            <div className="stb-field">
              <label>
                النص <span className="stb-req">*</span>
                {charCount > 0 && <span className="stb-count">{charCount} حرف</span>}
              </label>
              <textarea
                rows={7}
                placeholder="اكتب هنا القطعة أو النص الذي سيقرأه الطالب قبل الإجابة..."
                value={b.content}
                onChange={(e) => update(b.localKey, { content: e.target.value })}
              />
              <small className="stb-note">
                تُحفظ فواصل الأسطر والفقرات كما تكتبها تماماً.
              </small>
            </div>

            <div className="stb-field">
              <label>الأسئلة التي سيظهر فوقها هذا النص</label>
              <div className="stb-qgrid">
                {(questions || []).map((q, idx) => {
                  const checked = b.question_ids.includes(q.id)
                  const owner = ownerOf(q.id)
                  const takenByOther = owner !== -1 && owner !== bi
                  return (
                    <label
                      key={q.id ?? idx}
                      className={`stb-qchip ${checked ? 'is-on' : ''} ${takenByOther ? 'is-taken' : ''}`}
                      title={
                        takenByOther
                          ? `مرتبط حالياً بالنص ${owner + 1} — اختياره هنا سينقله`
                          : (q.question || '').slice(0, 120)
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleQuestion(b.localKey, q.id)}
                      />
                      <span className="stb-qnum">{idx + 1}</span>
                      <span className="stb-qtext">
                        {(q.question || '').trim() || 'سؤال بدون نص'}
                      </span>
                      {takenByOther && <i className="fas fa-link stb-qflag"></i>}
                    </label>
                  )
                })}
              </div>
              {b.question_ids.length === 0 && (
                <small className="stb-warn">
                  لن يظهر هذا النص لأي طالب حتى تختار سؤالاً واحداً على الأقل.
                </small>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
