import { supabase } from './supabase'
import { invalidatePrefix } from '../src/utils/cache'

/**
 * Shared Text Blocks — reading passages attached to specific exam questions.
 *
 * A block's text is stored ONCE in `exam_shared_blocks`; which questions show
 * it lives in `exam_shared_block_questions`. Nothing is copied into the
 * question itself, so editing a passage updates every question showing it.
 *
 * Questions are identified by their INDEX in `exams.questions` — that array is
 * the only place questions exist, and both builders strip the local id before
 * saving. See the migration header for why, and for the invariant that keeps
 * indices from drifting (questions and mappings always save together).
 *
 * See backend/migrations/2026_07_28_exam_shared_text_blocks.sql.
 */

/* Blocks + their question indices for one exam, in ONE round trip.
 *
 * The embed works because `exam_shared_block_questions.shared_block_id` is a
 * real foreign key, so PostgREST can traverse it — no second query and no
 * per-question lookup. Callers turn the result into a Map with
 * `buildQuestionBlockMap` and read it in O(1) per question. */
export async function listExamSharedBlocks(examId) {
  if (!examId) return []
  const { data, error } = await supabase
    .from('exam_shared_blocks')
    .select(`
      id, exam_id, title, content, image_url, display_order, created_at, updated_at,
      exam_shared_block_questions ( question_index )
    `)
    .eq('exam_id', examId)
    .order('display_order')
  if (error) throw error

  return (data || []).map(b => ({
    id: b.id,
    title: b.title || '',
    content: b.content || '',
    image_url: b.image_url || '',
    display_order: b.display_order ?? 0,
    question_indexes: (b.exam_shared_block_questions || [])
      .map(m => m.question_index)
      .sort((a, b2) => a - b2),
  }))
}

/* questionIndex -> block, built once per exam load.
 *
 * This is what keeps the player free of per-question queries: the renderer
 * asks the Map, never the database. A question with no passage is simply
 * absent from the Map. */
export function buildQuestionBlockMap(blocks) {
  const map = new Map()
  for (const b of blocks || []) {
    for (const idx of b.question_indexes || []) {
      // The DB enforces one block per question; if a legacy row ever
      // violated that, first-wins keeps rendering deterministic.
      if (!map.has(idx)) map.set(idx, b)
    }
  }
  return map
}

/* Replace the exam's whole block set in one transaction.
 *
 * Always called in the SAME save as the questions themselves — that is what
 * guarantees a reordered or deleted question can't leave a passage pointing
 * at the wrong one. The RPC re-validates every index against the exam's
 * current question count and rejects the whole payload if any is out of
 * range, so a stale client fails loudly rather than silently mis-attaching. */
export async function saveExamSharedBlocks(examId, blocks) {
  if (!examId) throw new Error('لا يمكن حفظ النصوص المشتركة قبل حفظ الامتحان')

  const payload = (blocks || [])
    // A block is worth saving if it carries text OR an image.
    .filter(b => (b.content || '').trim() || (b.image_url || '').trim())
    .map((b, i) => ({
      title: (b.title || '').trim() || null,
      content: (b.content || '').trim(),
      image_url: (b.image_url || '').trim() || null,
      display_order: i,
      question_indexes: [...new Set(
        (b.question_indexes || [])
          .map(n => parseInt(n, 10))
          .filter(n => Number.isInteger(n) && n >= 0)
      )].sort((a, c) => a - c),
    }))

  const { data, error } = await supabase.rpc('save_exam_shared_blocks', {
    p_exam_id: examId,
    p_blocks: payload,
  })
  if (error) throw new Error(translateBlockError(error.message))

  invalidatePrefix('exam-shared-blocks:')
  return Array.isArray(data) ? data : []
}

/* Client-side mirror of the RPC's rules, so the teacher gets an Arabic error
   before the round trip. The database remains the authority — this only
   shortens the feedback loop. */
export function validateSharedBlocks(blocks, questionCount) {
  const seen = new Map()
  for (let i = 0; i < (blocks || []).length; i++) {
    const b = blocks[i]
    const label = `النص المشترك رقم ${i + 1}`

    if (!(b.content || '').trim() && !(b.image_url || '').trim()) {
      return `${label}: أضف نصاً أو صورة قبل الحفظ.`
    }
    for (const raw of b.question_indexes || []) {
      const idx = parseInt(raw, 10)
      if (!Number.isInteger(idx) || idx < 0 || idx >= questionCount) {
        return `${label}: السؤال المحدد غير موجود في هذا الامتحان.`
      }
      if (seen.has(idx)) {
        return `السؤال ${idx + 1} مرتبط بأكثر من نص مشترك — اختر نصاً واحداً فقط لكل سؤال.`
      }
      seen.set(idx, i)
    }
  }
  return null
}

/* The RPC raises plain-text errors; map the ones a teacher can hit to Arabic
   so the builder never surfaces a raw Postgres string. */
function translateBlockError(raw) {
  const m = String(raw || '')
  if (m.includes('empty content'))        return 'لا يمكن حفظ نص مشترك فارغ — أضف نصاً أو صورة.'
  if (m.includes('more than one shared')) return 'لا يمكن ربط السؤال الواحد بأكثر من نص مشترك.'
  if (m.includes('but this exam has'))    return 'أحد النصوص المشتركة مرتبط بسؤال غير موجود. أعد اختيار الأسئلة ثم احفظ.'
  if (m.includes('invalid question'))     return 'تحديد الأسئلة غير صالح.'
  if (m.includes('exam not found'))       return 'الامتحان غير موجود.'
  if (m.includes('forbidden'))            return 'غير مصرح لك بتعديل الامتحانات.'
  if (m.includes('esbq_one_block_per_question')) {
    return 'لا يمكن ربط السؤال الواحد بأكثر من نص مشترك.'
  }
  return m || 'تعذر حفظ النصوص المشتركة.'
}
