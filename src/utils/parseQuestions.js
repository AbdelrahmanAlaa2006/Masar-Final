/**
 * Parse questions written in the Masar exam shorthand syntax.
 *
 * Format (mirrors ExamAdd.jsx so quizzes can use the same input the
 * admin already knows):
 *
 *   @ <question text on first line>
 *   #  <option>           ← a regular option
 *   ## <option>           ← a correct option (multiple ## = multi-answer)
 *   !2                    ← optional last line: points for this question
 *   @ <next question...>
 *
 * Returns an array of: { id, question, options[], answers[], points, isMultiple }
 * where `answers` is an array of indices into `options`.
 */
export function parseQuestionsText(text) {
  const clean = (text || '').trim()
  if (!clean) return []

  const chunks = clean.split('@').filter(q => q.trim() !== '')

  return chunks.map((chunk, i) => {
    const lines = chunk.trim().split('\n').filter(l => l.trim() !== '')
    let points = 1

    const lastLine = lines[lines.length - 1]
    if (lastLine && lastLine.startsWith('!')) {
      const n = parseInt(lastLine.substring(1), 10)
      if (!Number.isNaN(n) && n > 0) points = n
      lines.pop()
    }

    const options = []
    const correctAnswers = []

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j].trim()
      if (line.startsWith('##')) {
        options.push(line.replace(/^##\s*/, '').trim())
        correctAnswers.push(options.length - 1)
      } else if (line.startsWith('#')) {
        options.push(line.replace(/^#\s*/, '').trim())
      }
    }

    return {
      id: i,
      question: lines[0]?.trim() || '',
      options,
      answers: correctAnswers,
      points,
      isMultiple: correctAnswers.length > 1
    }
  })
}

/**
 * Validate a parsed question list. Returns { valid, error }.
 */
export function validateQuestions(questions) {
  if (!questions || questions.length === 0) {
    return { valid: false, error: 'لم يتم العثور على أي أسئلة' }
  }
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!q.question.trim()) {
      return { valid: false, error: `السؤال ${i + 1} بدون نص` }
    }
    if (q.options.length < 2) {
      return { valid: false, error: `السؤال ${i + 1} يحتاج اختيارين على الأقل` }
    }
    if (q.answers.length === 0) {
      return { valid: false, error: `السؤال ${i + 1} لا يحتوي على إجابة صحيحة (استخدم ##)` }
    }
  }
  return { valid: true, error: null }
}

/**
 * Total possible points across a question list.
 */
export function totalPoints(questions) {
  return (questions || []).reduce((sum, q) => sum + (q.points || 1), 0)
}
