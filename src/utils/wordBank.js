/* Word-bank questions («اختر الكلمة المناسبة»).

   The teacher writes one paragraph with each correct word in [brackets]:
     "Every morning, I [check] the weather. At school we read a/an [e-book]."
   plus optional extra (trap) words.

   Each blank is stored as an ORDINARY multiple-choice question, so server
   grading (submit_exam_attempt), attempt limits, prerequisites and reports
   work unchanged. The blanks of one paragraph share a `wordBank` tag:
     {
       ...mcqFields,             // question, options (the bank), answers, points
       wordBank: {
         group,                  // same id for every blank of the paragraph
         paragraph,              // text with {{1}}, {{2}}… where the blanks are
         blank,                  // this question's blank number (1-based)
         total,                  // number of blanks in the paragraph
         reuse,                  // true = a word may fill more than one blank
       },
     }
   Screens that don't know the tag simply show each blank as an MCQ whose
   question is the sentence around it. */

const BRACKET_RE = /\[([^\[\]]+)\]/g

const newGroupId = () => `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

const clean = (w) => String(w ?? '').replace(/\s+/g, ' ').trim()

/* The sentence that holds blank `n`, with every blank written as "(k)……". */
function sentenceFor(template, n) {
  const marker = `{{${n}}}`
  const sentences = template.split(/(?<=[.!?؟])\s+/)
  const hit = sentences.find((s) => s.includes(marker)) || template
  return hit.replace(/\{\{(\d+)\}\}/g, (_, k) => `(${k})................`).trim()
}

/* Paragraph + extra words -> { questions, error }.
   `points` is per blank. Returns an Arabic error for the editor when the
   input can't make a question. */
export function buildWordBank(paragraph, extraWords = [], { points = 1, reuse = false, group = null } = {}) {
  const text = String(paragraph || '').trim()
  const answers = []
  const template = text.replace(BRACKET_RE, (_, word) => {
    answers.push(clean(word))
    return `{{${answers.length}}}`
  })

  if (answers.length === 0) {
    return { questions: [], error: 'ضع الكلمة الصحيحة لكل فراغ بين قوسين [ ]، مثل: I [check] the weather' }
  }
  if (answers.some((a) => !a)) {
    return { questions: [], error: 'يوجد قوسان [ ] فارغان. اكتب الكلمة الصحيحة بداخلهما.' }
  }

  // One chip per distinct word (case-insensitive), answers first then extras.
  const bank = []
  const seen = new Map()
  for (const w of [...answers, ...extraWords.map(clean)]) {
    if (!w) continue
    const key = w.toLowerCase()
    if (!seen.has(key)) {
      seen.set(key, bank.length)
      bank.push(w)
    }
  }
  if (bank.length < 2) {
    return { questions: [], error: 'بنك الكلمات يحتاج كلمتين على الأقل. أضف كلمة إضافية للتمويه.' }
  }

  // Alphabetical, so the bank's order never gives the answers away.
  const ordered = [...bank].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const indexOf = (w) => ordered.findIndex((o) => o.toLowerCase() === w.toLowerCase())

  // The same word answering two blanks only works if words can be reused.
  const repeats = new Set(answers.map((a) => a.toLowerCase())).size < answers.length
  const tag = { group: group || newGroupId(), paragraph: template, total: answers.length, reuse: reuse || repeats }
  const pts = Math.max(1, parseInt(points, 10) || 1)

  const questions = answers.map((word, i) => ({
    question: sentenceFor(template, i + 1),
    image: '',
    options: ordered,
    answers: [indexOf(word)],
    points: pts,
    isMultiple: false,
    wordBank: { ...tag, blank: i + 1 },
  }))
  return { questions, error: null }
}

/* The questions of one word bank -> { paragraph (with [answers]), extraWords, points, reuse }
   so the editor can reopen it. */
export function readWordBank(groupQuestions) {
  const qs = [...(groupQuestions || [])].sort((a, b) => (a.wordBank?.blank || 0) - (b.wordBank?.blank || 0))
  const first = qs[0]
  if (!first?.wordBank) return null
  const bank = first.options || []
  const used = new Set()
  const paragraph = first.wordBank.paragraph.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const q = qs.find((x) => x.wordBank?.blank === Number(n))
    const word = q ? bank[q.answers?.[0]] : ''
    if (word) used.add(word.toLowerCase())
    return `[${word || ''}]`
  })
  return {
    paragraph,
    extraWords: bank.filter((w) => !used.has(w.toLowerCase())),
    points: first.points || 1,
    reuse: !!first.wordBank.reuse,
  }
}

/* Indices of the questions in the same word bank as `idx` (in order), or
   null when question `idx` is not part of one. Blanks are always stored next
   to each other, but match on the group id to be safe. */
export function wordBankGroupIndices(questions, idx) {
  const group = questions?.[idx]?.wordBank?.group
  if (!group) return null
  const out = []
  questions.forEach((q, i) => { if (q?.wordBank?.group === group) out.push(i) })
  return out.length ? out : null
}

/* ── Editor helpers ────────────────────────────────────────────────
   Editors keep questions in an array (each with a local `id`). A word bank
   is a run of questions sharing one wordBank.group. */

/* The questions of `group`, in blank order. */
export function groupQuestions(questions, group) {
  return (questions || [])
    .filter((q) => q?.wordBank?.group === group)
    .sort((a, b) => (a.wordBank.blank || 0) - (b.wordBank.blank || 0))
}

/* Replace the questions of `group` with `next`, at the same position (or
   append when the group is new). `withIds(list)` gives new rows editor ids. */
export function replaceGroup(questions, group, next, withIds = (l) => l) {
  const list = questions || []
  const at = list.findIndex((q) => q?.wordBank?.group === group)
  const rest = list.filter((q) => q?.wordBank?.group !== group)
  const rows = withIds(next)
  if (at === -1) return [...rest, ...rows]
  const before = list.slice(0, at).filter((q) => q?.wordBank?.group !== group)
  return [...before, ...rows, ...rest.slice(before.length)]
}

/* For rendering an editor list: true for the first question of each word
   bank (render the group card there) and for every normal question; false
   for the other blanks of a group (skip them). */
export function isListHead(questions, idx) {
  const g = questions?.[idx]?.wordBank?.group
  if (!g) return true
  return questions.findIndex((q) => q?.wordBank?.group === g) === idx
}

/* Keep the tag when an editor rebuilds question objects for saving. */
export const keepWordBank = (q) => (q?.wordBank ? { wordBank: q.wordBank } : {})

/* Split a stored paragraph into text pieces and blank numbers for rendering. */
export function paragraphParts(template) {
  const parts = []
  let last = 0
  String(template || '').replace(/\{\{(\d+)\}\}/g, (m, n, offset) => {
    if (offset > last) parts.push({ text: template.slice(last, offset) })
    parts.push({ blank: Number(n) })
    last = offset + m.length
    return m
  })
  if (last < String(template || '').length) parts.push({ text: template.slice(last) })
  return parts
}
