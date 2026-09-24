import React, { useMemo, useRef, useState } from 'react'
import { buildWordBank, readWordBank } from '../utils/wordBank'
import WordBankQuestion from './WordBankQuestion'
import './WordBankEditor.css'

/* Teacher editor for one word bank («اختر الكلمة المناسبة»).

   The teacher writes the whole paragraph and marks each answer with
   [brackets] — or selects a word and presses «اجعلها فراغاً». Trap words are
   added as chips. A live preview works exactly like the student screen.

   Props:
     initialQuestions — the questions of an existing word bank (edit), or null
     onSave(questions) — the built questions (all blanks of the paragraph)
     onCancel()
*/
export default function WordBankEditor({ initialQuestions = null, onSave, onCancel }) {
  const initial = useMemo(() => (initialQuestions?.length ? readWordBank(initialQuestions) : null), [initialQuestions])
  const group = initialQuestions?.[0]?.wordBank?.group || null

  const [paragraph, setParagraph] = useState(initial?.paragraph || '')
  const [extras, setExtras] = useState(initial?.extraWords || [])
  const [extraInput, setExtraInput] = useState('')
  const [points, setPoints] = useState(initial?.points || 1)
  const [reuse, setReuse] = useState(!!initial?.reuse)
  const [triedSave, setTriedSave] = useState(false)
  const [previewAnswers, setPreviewAnswers] = useState({})
  const textRef = useRef(null)

  const built = useMemo(
    () => buildWordBank(paragraph, extras, { points, reuse, group }),
    [paragraph, extras, points, reuse, group]
  )
  const blanks = built.questions.length

  const markSelection = () => {
    const el = textRef.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const picked = paragraph.slice(s, e).trim()
    if (!picked) return
    // Keep the spaces around the selection outside the brackets.
    const lead = paragraph.slice(s, e).match(/^\s*/)[0]
    const trail = paragraph.slice(s, e).match(/\s*$/)[0]
    const next = `${paragraph.slice(0, s)}${lead}[${picked}]${trail}${paragraph.slice(e)}`
    setParagraph(next)
    setPreviewAnswers({})
    requestAnimationFrame(() => el.focus())
  }

  const addExtra = () => {
    const words = extraInput.split(/[,،]/).map((w) => w.trim()).filter(Boolean)
    if (!words.length) return
    setExtras((prev) => {
      const seen = new Set(prev.map((w) => w.toLowerCase()))
      return [...prev, ...words.filter((w) => !seen.has(w.toLowerCase()))]
    })
    setExtraInput('')
    setPreviewAnswers({})
  }

  const save = () => {
    setTriedSave(true)
    if (built.error) return
    onSave(built.questions)
  }

  // Preview: blanks are indices 0..n-1 of the built questions.
  const previewIndices = built.questions.map((_, i) => i)

  return (
    <div className="wbe-card" dir="rtl">
      <div className="wbe-head">
        <h4><i className="fas fa-spell-check"></i> {group ? 'تعديل: اختر الكلمة المناسبة' : 'سؤال جديد: اختر الكلمة المناسبة'}</h4>
        <span className="wbe-sub">اكتب الفقرة كاملة، وضع الكلمة الصحيحة لكل فراغ بين قوسين [ ]</span>
      </div>

      <textarea
        ref={textRef}
        className="wbe-text"
        dir="auto"
        rows={5}
        value={paragraph}
        onChange={(e) => { setParagraph(e.target.value); setPreviewAnswers({}) }}
        placeholder={'مثال:\nEvery morning, I [check] the weather. At school, we read a/an [e-book].'}
      />
      <div className="wbe-row">
        <button type="button" className="wbe-btn" onClick={markSelection} title="حدّد كلمة في الفقرة ثم اضغط هنا">
          <i className="fas fa-highlighter"></i> اجعل الكلمة المحددة فراغاً
        </button>
        <span className="wbe-note">
          {blanks > 0 ? `✓ ${blanks} فراغ` : 'حدّد كلمة في الفقرة ثم اضغط الزر، أو اكتبها بين [ ]'}
        </span>
      </div>

      <div className="wbe-field">
        <label>كلمات إضافية للتمويه (اختياري)</label>
        <div className="wbe-chips">
          {extras.map((w) => (
            <span className="wbe-chip" key={w} dir="auto">
              {w}
              <button type="button" aria-label={`حذف ${w}`} onClick={() => { setExtras((p) => p.filter((x) => x !== w)); setPreviewAnswers({}) }}>×</button>
            </span>
          ))}
          <input
            className="wbe-chip-input"
            dir="auto"
            value={extraInput}
            onChange={(e) => setExtraInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra() } }}
            placeholder="اكتب كلمة ثم Enter"
          />
          <button type="button" className="wbe-btn wbe-btn-sm" onClick={addExtra}>+ إضافة</button>
        </div>
      </div>

      <div className="wbe-settings">
        <label className="wbe-setting">
          <span>الدرجة لكل فراغ</span>
          <select value={points} onChange={(e) => setPoints(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {blanks > 0 && <em>= {blanks * points} درجة</em>}
        </label>
        <label className="wbe-setting">
          <input type="checkbox" checked={reuse} onChange={(e) => setReuse(e.target.checked)} />
          <span>يمكن استخدام الكلمة أكثر من مرة</span>
        </label>
      </div>

      {triedSave && built.error && <p className="wbe-error">{built.error}</p>}

      {!built.error && (
        <div className="wbe-preview">
          <div className="wbe-preview-title">معاينة كما يراها الطالب (جرّبها)</div>
          <WordBankQuestion
            questions={built.questions}
            indices={previewIndices}
            answers={previewAnswers}
            onSet={(qIdx, opt) => setPreviewAnswers((p) => ({ ...p, [qIdx]: opt === null ? new Set() : new Set([opt]) }))}
          />
        </div>
      )}

      <div className="wbe-actions">
        <button type="button" className="wbe-save" onClick={save}>
          <i className="fas fa-check"></i> {group ? 'حفظ التعديل' : 'إضافة السؤال'}
        </button>
        <button type="button" className="wbe-cancel" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  )
}

/* One word bank in an editor's question list: a summary card instead of one
   MCQ editor per blank. */
export function WordBankCard({ questions, number, onEdit, onDelete }) {
  const info = readWordBank(questions)
  if (!info) return null
  const pts = questions.reduce((s, q) => s + (q.points || 1), 0)
  return (
    <div className="wbe-summary" dir="rtl">
      <div className="wbe-summary-head">
        <span className="wbe-summary-badge"><i className="fas fa-spell-check"></i> اختر الكلمة المناسبة</span>
        {number && <span className="wbe-summary-num">الأسئلة {number}</span>}
        <span className="wbe-summary-meta">{questions.length} فراغ • {pts} درجة</span>
      </div>
      <p className="wbe-summary-text" dir="auto">{info.paragraph}</p>
      {info.extraWords.length > 0 && (
        <p className="wbe-summary-extra">كلمات التمويه: <span dir="auto">{info.extraWords.join('، ')}</span></p>
      )}
      <div className="wbe-summary-actions">
        <button type="button" className="wbe-btn" onClick={onEdit}><i className="fas fa-pen"></i> تعديل</button>
        <button type="button" className="wbe-btn wbe-btn-danger" onClick={onDelete}><i className="fas fa-trash"></i> حذف</button>
      </div>
    </div>
  )
}
