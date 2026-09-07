/**
 * Question utilities for bidirectional text rendering, direction detection,
 * formatting, parsing, and clipboard copying.
 */

const RTL_REGEX = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
const LTR_REGEX = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/

/**
 * Detect whether text should be rendered LTR or RTL based on the first
 * strongly directional character, skipping neutral characters (like dots,
 * asterisks, numbers, spaces, and punctuation).
 *
 * Examples:
 *   "............... hard every day..." -> "ltr"
 *   "*a) Studying"                      -> "ltr"
 *   "ما عاصمة مصر؟"                     -> "rtl"
 *   "*القاهرة"                          -> "rtl"
 *   "اختر الإجابة: ..............."     -> "rtl"
 */
export function detectTextDir(text) {
  if (!text || typeof text !== 'string') return 'ltr'
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (RTL_REGEX.test(ch)) return 'rtl'
    if (LTR_REGEX.test(ch)) return 'ltr'
  }
  return 'ltr'
}

/**
 * Returns true if a question is LTR (English / Latin).
 */
export function isQuestionLtr(q) {
  if (!q) return false
  const text = typeof q === 'string' ? q : (q.question || q.text || q.title || '')
  return detectTextDir(text) === 'ltr'
}

/**
 * Format a question object into the standard stored format for clipboard copy:
 *
 * <question text>
 * *a) <correct option>
 * b) <option>
 * c) <option>
 * d) <option>
 *
 * Preserves the original logical order without reversing strings or moving markers.
 */
export function formatQuestionForCopy(q) {
  if (!q) return ''
  const qText = String(q.question || q.text || q.title || '').trim()
  const options = Array.isArray(q.options) ? q.options : (q.choices || [])
  const answers = Array.isArray(q.answers)
    ? q.answers
    : (typeof q.correct === 'number' ? [q.correct] : (Array.isArray(q.correct) ? q.correct : []))

  const isLtr = detectTextDir(qText) === 'ltr'

  const optLines = options.map((opt, idx) => {
    let rawOpt = String(opt ?? '').trim()
    const isCorrect = answers.includes(idx)

    // Strip leading correct answer markers from raw option text if present (*, ★, etc.)
    const hasLeadingMarker = /^[\*★✓✔]/.test(rawOpt)
    if (hasLeadingMarker) {
      rawOpt = rawOpt.replace(/^[\*★✓✔]\s*/, '').trim()
    }

    // Check if inline marker exists: e.g. "a) *Studying"
    const hasInlineMarker = /^[a-zA-Zء-ي0-9٠-٩][\.\)\-]\s*[\*★✓✔]\s*/.test(rawOpt)
    if (hasInlineMarker) {
      rawOpt = rawOpt.replace(/([\.\)\-]\s*)[\*★✓✔]\s*/, '$1').trim()
    }

    // Check if rawOpt already starts with an option letter/number prefix like "a) ", "A. ", "1. ", "أ) "
    const hasLetterPrefix = /^[a-zA-Zء-ي0-9٠-٩][\.\)\-]\s*/.test(rawOpt)

    let lineText = rawOpt
    if (!hasLetterPrefix) {
      const letter = isLtr
        ? String.fromCharCode(97 + idx) // 'a', 'b', 'c', 'd'
        : (['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'][idx] || String(idx + 1))
      lineText = `${letter}) ${rawOpt}`
    }

    return isCorrect ? `*${lineText}` : lineText
  })

  return [qText, ...optLines].join('\n')
}

/**
 * Formats multiple questions into a block separated by blank lines.
 */
export function formatAllQuestionsForCopy(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return ''
  return questions.map(q => formatQuestionForCopy(q)).filter(Boolean).join('\n\n')
}

/**
 * Copy text to clipboard using navigator.clipboard with fallback.
 */
export async function copyTextToClipboard(text) {
  if (!text) return false
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) {
    // Fall back to execCommand
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
    return false
  }
}

/**
 * Copy a single question object to clipboard in standard format.
 */
export async function copyQuestionToClipboard(q) {
  const text = formatQuestionForCopy(q)
  return copyTextToClipboard(text)
}

/**
 * Copy an array of question objects to clipboard in standard bulk format.
 */
export async function copyAllQuestionsToClipboard(questions) {
  const text = formatAllQuestionsForCopy(questions)
  return copyTextToClipboard(text)
}

/**
 * Natural bulk format parser for questions.
 *
 * Rules:
 *   • Blank line separates questions.
 *   • First line of each block = the question text.
 *   • Following lines = options.
 *   • A line starting with `*` (or `★ ✓ ✔`) or `a) *` marks a correct option.
 *   • Optional trailing `!N` line or `[N]` specifies points.
 *   • Preserves option letters/text in original logical order.
 */
export function parseNaturalFormat(text) {
  const blocks = String(text || '')
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  return blocks.map((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    let points = 1

    // Trailing "!2" line sets points
    if (lines.length > 1 && /^!\s*\d+/.test(lines[lines.length - 1])) {
      const m = lines.pop().match(/\d+/)
      if (m) points = Math.max(1, parseInt(m[0], 10))
    }

    // Inline "[2]" right after the question text
    let questionLine = lines[0] || ''
    const inlinePts = questionLine.match(/[\[\(](\d+)[\]\)]\s*$/)
    if (inlinePts) {
      points = Math.max(1, parseInt(inlinePts[1], 10))
      questionLine = questionLine.replace(/[\[\(](\d+)[\]\)]\s*$/, '').trim()
    }

    const options = []
    const correctAnswers = []

    for (let j = 1; j < lines.length; j++) {
      let opt = lines[j]

      // 1. Check for correct answer marker at start or after option letter
      const isStartCorrect = /^[\*★✓✔]\s*/.test(opt)
      const isInlineCorrect = /^[a-zA-Zء-ي0-9٠-٩][\.\)\-]\s*[\*★✓✔]\s*/.test(opt)
      const isCorrect = isStartCorrect || isInlineCorrect

      if (isStartCorrect) {
        opt = opt.replace(/^[\*★✓✔]\s*/, '').trim()
      } else if (isInlineCorrect) {
        opt = opt.replace(/([\.\)\-]\s*)[\*★✓✔]\s*/, '$1').trim()
      }

      // 2. Strip bullet markers like "- ", "• " but preserve option letters like "a) ", "1. "
      opt = opt.replace(/^[-•·]\s+/, '').trim()

      if (!opt) continue
      options.push(opt)
      if (isCorrect) correctAnswers.push(options.length - 1)
    }

    return {
      id: i,
      question: questionLine,
      options: options.length >= 2 ? options : (options.length ? [...options, ''] : ['', '']),
      answers: correctAnswers.length > 0 ? correctAnswers : [0],
      points,
      isMultiple: correctAnswers.length > 1,
    }
  })
}
