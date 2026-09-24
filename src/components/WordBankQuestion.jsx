import React, { useEffect, useMemo, useState } from 'react'
import { paragraphParts } from '../utils/wordBank'
import { detectTextDir } from '../utils/questionUtils'
import './WordBankQuestion.css'

/* Student view of one word bank («اختر الكلمة المناسبة»): the paragraph with
   its blanks, and the word chips under it.

   Tap a word  -> it goes into the selected blank (or the first empty one),
                  then the next empty blank is selected.
   Tap a blank -> selects it; tapping a filled blank empties it.
   Drag a word onto a blank also works (mouse / computer).

   Each blank is its own question index in the exam, so the answer for blank
   `qIdx` is just the chosen word's option index, exactly like an MCQ.

   Props:
     questions — all exam questions
     indices   — the question indices of this word bank, in blank order
     answers   — { [qIdx]: Set<optionIndex> } from ExamTaking
     onSet     — (qIdx, optionIndex | null) => void
     readOnly  — no changes (e.g. after the exam ended)
*/
export default function WordBankQuestion({ questions, indices, answers, onSet, readOnly = false }) {
  const first = questions[indices[0]]
  const tag = first.wordBank
  const words = first.options || []
  const dir = detectTextDir(tag.paragraph) || 'ltr'

  // blank number (1-based) -> question index
  const qIdxOfBlank = useMemo(() => {
    const map = {}
    for (const i of indices) map[questions[i].wordBank.blank] = i
    return map
  }, [questions, indices])

  const chosen = (qIdx) => {
    const s = answers[qIdx]
    return s && s.size ? [...s][0] : null
  }

  const firstEmpty = () => indices.find((i) => chosen(i) === null) ?? null
  const [active, setActive] = useState(() => firstEmpty())

  // When the student comes back to this screen, select the first empty blank.
  useEffect(() => { setActive(firstEmpty()) }, [indices[0]]) // eslint-disable-line react-hooks/exhaustive-deps

  const usedBy = useMemo(() => {
    const m = new Map()
    for (const i of indices) {
      const c = chosen(i)
      if (c !== null) m.set(c, i)
    }
    return m
  }, [answers, indices]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextEmptyAfter = (qIdx, filledNow) => {
    const order = indices
    const start = order.indexOf(qIdx)
    for (let k = 1; k <= order.length; k++) {
      const i = order[(start + k) % order.length]
      if (i !== filledNow && chosen(i) === null) return i
    }
    return null
  }

  const placeWord = (optIdx, targetQIdx = null) => {
    if (readOnly) return
    // A word already used elsewhere can't be used again unless reuse is on.
    if (!tag.reuse && usedBy.has(optIdx) && usedBy.get(optIdx) !== (targetQIdx ?? active)) return
    const target = targetQIdx ?? active ?? firstEmpty()
    if (target === null || target === undefined) return
    onSet(target, optIdx)
    setActive(nextEmptyAfter(target, target))
  }

  const tapBlank = (qIdx) => {
    if (readOnly) return
    if (chosen(qIdx) !== null) onSet(qIdx, null)
    setActive(qIdx)
  }

  const filledCount = indices.filter((i) => chosen(i) !== null).length
  const activeBlankNo = active !== null && active !== undefined ? questions[active]?.wordBank?.blank : null

  return (
    <div className="wb-wrap">
      <div className="wb-head">
        <span className="wb-badge">اختر الكلمة المناسبة</span>
        <span className="wb-count">أجبت {filledCount} من {indices.length}</span>
      </div>

      <p className="wb-paragraph" dir={dir}>
        {paragraphParts(tag.paragraph).map((part, k) => {
          if (part.text !== undefined) return <span key={k}>{part.text}</span>
          const qIdx = qIdxOfBlank[part.blank]
          const c = chosen(qIdx)
          const isActive = qIdx === active
          return (
            <button
              key={k}
              type="button"
              className={`wb-blank ${c !== null ? 'is-filled' : ''} ${isActive ? 'is-active' : ''}`}
              onClick={() => tapBlank(qIdx)}
              onDragOver={(e) => { if (!readOnly) e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                const opt = Number(e.dataTransfer.getData('text/plain'))
                if (Number.isInteger(opt)) placeWord(opt, qIdx)
              }}
              aria-label={c !== null ? `الفراغ ${part.blank}: ${words[c]} — اضغط للإزالة` : `الفراغ ${part.blank} فارغ`}
            >
              {c !== null ? words[c] : `(${part.blank})`}
            </button>
          )
        })}
      </p>

      {!readOnly && (
        <p className="wb-hint">
          {activeBlankNo
            ? `الفراغ (${activeBlankNo}) محدد — اضغط على كلمة لوضعها فيه`
            : 'اضغط على فراغ لتغيير إجابته'}
        </p>
      )}

      <div className="wb-bank" dir={dir}>
        {words.map((w, optIdx) => {
          const used = !tag.reuse && usedBy.has(optIdx)
          return (
            <button
              key={optIdx}
              type="button"
              className={`wb-word ${used ? 'is-used' : ''}`}
              onClick={() => placeWord(optIdx)}
              disabled={readOnly || used}
              draggable={!readOnly && !used}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', String(optIdx))}
            >
              {w}
            </button>
          )
        })}
      </div>
    </div>
  )
}
