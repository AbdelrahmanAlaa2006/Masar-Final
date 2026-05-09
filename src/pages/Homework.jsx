import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './Homework.css'
import PrepIllustration from '../components/PrepIllustration'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import {
  listHomeworks,
  createHomework,
  updateHomework,
  deleteHomework,
  getMySubmissionsBatch,
  submitHomework,
  listSubmissionsForHomework,
  gradeSubmission,
  uiToDbGrade,
  dbToUiGrade,
} from '@backend/homeworksApi'
import { uploadHomeworkPdf, deleteR2Object } from '@backend/r2'
import QuestionImagePicker from '../components/QuestionImagePicker'

// Letters used to label MCQ options in Arabic.
const OPT_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي']
import { cached, invalidate as invalidateCache, LIST_TTL } from '../utils/cache'

/* ──────────────────────────────────────────────────────────────
   Homework page — replaces the old Lectures page.
   - Admins post homework (PDF + due date).
   - Students see status (not submitted / submitted / graded) and
     can upload an answer file with an optional note.
   - Admins can open a homework's submission list and grade each.
   ────────────────────────────────────────────────────────────── */

const PREPS = [
  { id: 'first',  nameAr: 'الصف الأول الإعدادي',  nameEn: 'First Prep',  icon: 'fa-seedling',         accent: 'green',  desc: 'بداية المرحلة الإعدادية والتأسيس' },
  { id: 'second', nameAr: 'الصف الثاني الإعدادي', nameEn: 'Second Prep', icon: 'fa-book-open-reader', accent: 'blue',   desc: 'تعميق المفاهيم وبناء المهارات' },
  { id: 'third',  nameAr: 'الصف الثالث الإعدادي',  nameEn: 'Third Prep',  icon: 'fa-trophy',           accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
]

const PLACEHOLDER_COVER =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#667eea"/>
          <stop offset="100%" stop-color="#764ba2"/>
        </linearGradient>
      </defs>
      <rect width="600" height="340" fill="url(#g)"/>
      <text x="50%" y="50%" font-family="Cairo, Arial" font-size="44" font-weight="700"
        fill="rgba(255,255,255,0.85)" text-anchor="middle" dominant-baseline="middle">واجب</text>
    </svg>`
  )

const fmtDateTime = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return '' }
}

function rowToCard(row) {
  return {
    id: row.id,
    title: row.title,
    desc: row.description || '',
    subject: row.subject || '',
    teacher: row.teacher || '',
    week: row.week || '',
    date: (row.created_at || '').slice(0, 10),
    cover: row.cover_url || PLACEHOLDER_COVER,
    pdf_url: row.pdf_url || null,
    grade: row.grade,
    due_at: row.due_at,
    max_score: row.max_score ?? 0,
    answer_key: Array.isArray(row.answer_key) ? row.answer_key : [],
  }
}

export default function Homework() {
  useEffect(() => { import('../utils/trackVisit').then(m => m.trackVisit('homeworks')) }, [])

  const [grade, setGrade] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  // Editing state: when set, the modal updates this homework instead of
  // creating a new one. null = creating new.
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    title: '', desc: '', week: '',
    cover_url: '', grade: '', due_at: '', max_score: 0,
    answer_key: [], // [{ options: 4, correct: 1 }, ...]
  })
  const [pdfFile, setPdfFile] = useState(null)
  const [uploadPct, setUploadPct] = useState(0)
  const [pdfViewer, setPdfViewer] = useState(null)

  // Per-student submission status (homeworkId -> submissionRow|undefined)
  const [submissions, setSubmissions] = useState(new Map())
  // Open submission modal (student): { homework }
  const [submitModal, setSubmitModal] = useState(null)
  // Open grading modal (admin): { homework }
  const [gradeModal, setGradeModal] = useState(null)
  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
      setUserId(u?.id || null)
      if (u?.role !== 'admin' && u?.grade) setGrade(dbToUiGrade(u.grade))
    } catch { setUserRole(null) }
  }, [])

  const refresh = async ({ force = false } = {}) => {
    setLoading(true)
    setLoadError(null)
    try {
      if (force) invalidateCache('homeworks')
      const data = await cached('homeworks', LIST_TTL, listHomeworks)
      setRows(data)
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل الواجبات')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  // Load submission status for ALL homeworks the student can see, in one shot.
  // Admins don't have submissions of their own — skip entirely.
  useEffect(() => {
    if (!userId || userRole === 'admin' || rows.length === 0) {
      setSubmissions(new Map()); return
    }
    let cancelled = false
    ;(async () => {
      try {
        const map = await getMySubmissionsBatch(rows.map(r => r.id), userId)
        if (!cancelled) setSubmissions(map)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [rows, userId, userRole])

  const homeworks = useMemo(() => {
    const grouped = { first: [], second: [], third: [] }
    for (const r of rows) {
      const ui = dbToUiGrade(r.grade)
      if (ui && grouped[ui]) grouped[ui].push(rowToCard(r))
    }
    return grouped
  }, [rows])

  const flash = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2400)
  }

  const filtered = useMemo(() => {
    if (!grade) return []
    const list = homeworks[grade] || []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((l) =>
      [l.title, l.desc, l.week, l.id]
        .join(' ').toLowerCase().includes(q)
    )
  }, [homeworks, grade, search])

  // ── Add modal lifecycle ──────────────────────────────────────
  const closeAddModal = () => {
    if (form.cover_url) deleteR2Object({ url: form.cover_url }).catch(() => {})
    setModalOpen(false)
  }
  const openAddModal = () => {
    setEditingId(null)
    setForm({
      title: '', desc: '', week: '',
      cover_url: '', grade: grade || 'first',
      due_at: '', max_score: 0,
      answer_key: [{ options: 4, correct: 0 }],   // start with one question
    })
    setPdfFile(null)
    setUploadPct(0)
    setModalOpen(true)
  }

  // Pre-fill the form with an existing homework's data for editing.
  // We don't load the PDF file (it's already on R2) — admin can replace
  // it by picking a new one if they want.
  const openEditModal = (hw) => {
    setEditingId(hw.id)
    // hw.due_at is ISO; datetime-local inputs need "YYYY-MM-DDTHH:MM"
    const due = hw.due_at ? new Date(hw.due_at).toISOString().slice(0, 16) : ''
    setForm({
      title: hw.title || '',
      desc: hw.desc || '',
      week: hw.week || '',
      cover_url: hw.cover || (hw.cover_url || ''),
      grade: dbToUiGrade(hw.grade) || 'first',
      due_at: due,
      max_score: hw.max_score ?? 0,
      answer_key: Array.isArray(hw.answer_key) ? hw.answer_key.map(q => ({ ...q })) : [],
    })
    setPdfFile(null)
    setUploadPct(0)
    setModalOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!form.title.trim()) return
    const dbGrade = uiToDbGrade(form.grade || grade)
    if (!dbGrade) { flash('يجب اختيار الصف الدراسي', 'warning'); return }

    if (!Array.isArray(form.answer_key) || form.answer_key.length === 0) {
      flash('أضف سؤالًا واحدًا على الأقل', 'warning'); return
    }
    for (let i = 0; i < form.answer_key.length; i++) {
      const q = form.answer_key[i]
      if (!q || q.options < 2 || q.correct < 0 || q.correct >= q.options) {
        flash(`السؤال ${i + 1}: تأكد من اختيار الإجابة الصحيحة`, 'warning'); return
      }
    }

    setSubmitting(true)
    let uploadedKey = null
    let uploadedUrl = null
    try {
      if (pdfFile) {
        if (pdfFile.type && pdfFile.type !== 'application/pdf') {
          throw new Error('الملف يجب أن يكون بصيغة PDF')
        }
        setUploadPct(1)
        const { key, publicUrl } = await uploadHomeworkPdf(pdfFile, {
          onProgress: (p) => setUploadPct(Math.max(1, p)),
        })
        uploadedKey = key
        uploadedUrl = publicUrl
      }

      // Convert datetime-local input (no TZ) to ISO. Empty = no due date.
      const dueIso = form.due_at ? new Date(form.due_at).toISOString() : null

      const payload = {
        title: form.title.trim(),
        description: form.desc.trim() || null,
        week: form.week.trim() || null,
        grade: dbGrade,
        cover_url: form.cover_url.trim() || null,
        due_at: dueIso,
        max_score: form.max_score || form.answer_key.length,
        answer_key: form.answer_key,
      }
      // Only attach PDF fields when a new file was uploaded — otherwise
      // leave the existing R2 reference untouched (edit case).
      if (uploadedUrl) {
        payload.pdf_url = uploadedUrl
        payload.pdf_key = uploadedKey
      }

      if (editingId) {
        await updateHomework(editingId, payload)
      } else {
        await createHomework({ ...payload, pdf_url: uploadedUrl, pdf_key: uploadedKey, created_by: userId })
      }
      uploadedKey = null
      uploadedUrl = null
      flash(editingId ? 'تم تحديث الواجب' : 'تمت إضافة الواجب بنجاح')
      setEditingId(null)
      setModalOpen(false)
      await refresh({ force: true })
    } catch (err) {
      if (uploadedKey || uploadedUrl) {
        deleteR2Object({ key: uploadedKey, url: uploadedUrl }).catch(() => {})
      }
      if (form.cover_url) deleteR2Object({ url: form.cover_url }).catch(() => {})
      flash(err.message || 'تعذر حفظ الواجب', 'warning')
    } finally {
      setSubmitting(false)
      setUploadPct(0)
    }
  }

  const requestDelete = (hw) => setConfirmDelete({ id: hw.id, title: hw.title })
  const performDelete = async () => {
    const target = confirmDelete
    if (!target) return
    try {
      await deleteHomework(target.id)
      invalidateCache('homeworks')
      setRows((prev) => prev.filter((r) => r.id !== target.id))
      flash('تم حذف الواجب', 'warning')
    } catch (err) {
      flash(err.message || 'تعذر حذف الواجب', 'warning')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <main className="hw-page" dir="rtl">
      <div className="hw-container">
        {!grade && (
          <div className="hw-prep-wrap">
            <div className="hw-prep-head">
              <div className="hw-prep-icon"><i className="fas fa-clipboard-list"></i></div>
              <div>
                <h1>الواجبات</h1>
                <p>اختر المرحلة الدراسية لاستعراض الواجبات الخاصة بها</p>
              </div>
            </div>
            <div className="prep-grid">
              {PREPS.map((p) => (
                <PrepCard
                  key={p.id}
                  prep={p}
                  count={(homeworks[p.id] || []).length}
                  onClick={() => setGrade(p.id)}
                />
              ))}
            </div>
          </div>
        )}

        {grade && (
          <>
            <div className="hw-toolbar">
              {userRole === 'admin' && (
                <button className="hw-back" onClick={() => { setGrade(null); setSearch('') }}>
                  <i className="fas fa-arrow-right"></i> العودة للمراحل
                </button>
              )}
              <div className="hw-search-wrap">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="ابحث بعنوان الواجب أو الأسبوع..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="hw-search-clear" onClick={() => setSearch('')}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
              {userRole === 'admin' && (
                <button className="hw-add-btn" onClick={openAddModal}>
                  <i className="fas fa-plus"></i> واجب جديد
                </button>
              )}
            </div>

            <div className="hw-section-head">
              <h2>
                <i className="fas fa-layer-group"></i>
                {' '}واجبات {PREPS.find((p) => p.id === grade)?.nameAr}
              </h2>
              <span className="hw-count-pill">{filtered.length} واجب</span>
            </div>

            {loading ? (
              <div className="hw-empty"><i className="fas fa-spinner fa-spin"></i><p>جاري التحميل...</p></div>
            ) : loadError ? (
              <div className="hw-empty"><i className="fas fa-triangle-exclamation"></i><p>{loadError}</p></div>
            ) : filtered.length === 0 ? (
              <div className="hw-empty"><i className="fas fa-folder-open"></i><p>لا توجد واجبات مطابقة</p></div>
            ) : (
              <div className="hw-grid">
                {filtered.map((hw) => (
                  <HomeworkCard
                    key={hw.id}
                    hw={hw}
                    isAdmin={userRole === 'admin'}
                    submission={submissions.get(hw.id) || null}
                    onOpen={() => {
                      if (hw.pdf_url) setPdfViewer({ url: hw.pdf_url, title: hw.title })
                      else flash('لا يوجد ملف PDF لهذا الواجب', 'warning')
                    }}
                    onSubmit={() => setSubmitModal({ homework: hw })}
                    onGrade={() => setGradeModal({ homework: hw })}
                    onEdit={() => openEditModal(hw)}
                    onDelete={() => requestDelete(hw)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add (admin) */}
      {modalOpen && createPortal(
        <div className="hw-modal-overlay" onClick={() => closeAddModal()}>
          <form className="hw-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="hw-modal-head">
              <div className="hw-modal-icon"><i className="fas fa-circle-plus"></i></div>
              <div>
                <h3>{editingId ? 'تعديل الواجب' : 'إضافة واجب جديد'}</h3>
                <p>{editingId
                  ? 'يمكنك تحديث الحقول. استبدال ملف الـ PDF اختياري.'
                  : 'املأ بيانات الواجب وارفع ملف الـ PDF من جهازك'}</p>
              </div>
              <button type="button" className="hw-modal-close" onClick={() => closeAddModal()}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="hw-modal-body">
              <Field label="عنوان الواجب" icon="fa-heading" required>
                <input type="text" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="مثال: تمارين الفصل الأول" required />
              </Field>

              <Field label="الصف الدراسي" icon="fa-graduation-cap" required>
                <div className="hw-grade-picker" role="radiogroup">
                  {PREPS.map((p) => {
                    const active = form.grade === p.id
                    return (
                      <button key={p.id} type="button" role="radio" aria-checked={active}
                        className={`hw-grade-opt hw-grade-${p.accent} ${active ? 'is-on' : ''}`}
                        onClick={() => setForm({ ...form, grade: p.id })}>
                        <span className="hw-grade-opt-icon"><i className={`fas ${p.icon}`}></i></span>
                        <span className="hw-grade-opt-text">
                          <span className="hw-grade-opt-name">{p.nameAr}</span>
                          <span className="hw-grade-opt-en">{p.nameEn}</span>
                        </span>
                        {active && <i className="fas fa-circle-check hw-grade-opt-tick"></i>}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div className="hw-form-row">
                <Field label="آخر موعد للتسليم" icon="fa-clock">
                  <input type="datetime-local" value={form.due_at}
                    onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
                </Field>
                <Field label="الدرجة الكاملة" icon="fa-star">
                  <input type="number" min="0" value={form.max_score}
                    onChange={(e) => setForm({ ...form, max_score: parseInt(e.target.value, 10) || 0 })} />
                </Field>
              </div>

              <Field label="الأسبوع / الترم" icon="fa-calendar-week">
                <input type="text" value={form.week}
                  onChange={(e) => setForm({ ...form, week: e.target.value })}
                  placeholder="الأسبوع الأول" />
              </Field>

              <Field label="الوصف" icon="fa-align-right">
                <textarea rows="3" value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  placeholder="نبذة عن المطلوب في الواجب..." />
              </Field>

              <Field label="صورة الغلاف (اختيارية)" icon="fa-image">
                <QuestionImagePicker value={form.cover_url}
                  onChange={(url) => setForm({ ...form, cover_url: url })}
                  label="ارفع صورة الغلاف من جهازك" />
              </Field>

              <Field label={editingId ? 'استبدال ملف الـ PDF (اختياري)' : 'ملف الـ PDF (المطلوب)'} icon="fa-file-pdf">
                <PdfPicker
                  file={pdfFile}
                  setFile={setPdfFile}
                  pct={uploadPct}
                  disabled={submitting}
                  inputId="hw-pdf-input"
                  placeholder={editingId ? 'اختر ملف جديد للاستبدال (اختياري)' : 'اختر ملف PDF من جهازك'}
                />
              </Field>

              <Field label="الأسئلة والإجابات الصحيحة" icon="fa-list-check" required>
                <AnswerKeyBuilder
                  value={form.answer_key}
                  onChange={(next) => setForm((f) => ({ ...f, answer_key: next }))}
                />
                <small style={{ display: 'block', marginTop: 6, color: '#718096', fontSize: 12 }}>
                  الأسئلة نفسها مكتوبة في ملف الـ PDF. هنا فقط حدد عدد الخيارات والإجابة الصحيحة لكل سؤال — وسيتم تصحيح إجابات الطلاب تلقائيًا.
                </small>
              </Field>
            </div>

            <div className="hw-modal-foot">
              <button type="button" className="hw-btn hw-btn-ghost" onClick={() => closeAddModal()} disabled={submitting}>إلغاء</button>
              <button type="submit" className="hw-btn hw-btn-primary" disabled={submitting}>
                <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>{' '}
                {submitting
                  ? (uploadPct > 0 && uploadPct < 100 ? `جاري رفع الملف... ${uploadPct}%` : 'جاري الحفظ...')
                  : (editingId ? 'حفظ التعديلات' : 'حفظ الواجب')}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Submit (student) */}
      {submitModal && createPortal(
        <SubmitModal
          homework={submitModal.homework}
          existing={submissions.get(submitModal.homework.id) || null}
          onClose={() => setSubmitModal(null)}
          onDone={(res) => {
            const now = new Date().toISOString()
            setSubmissions((prev) => {
              const m = new Map(prev)
              const existing = prev.get(submitModal.homework.id) || {}
              m.set(submitModal.homework.id, {
                ...existing,
                ...res,
                submitted_at: now,
                graded_at: now,
              })
              return m
            })
            setSubmitModal(null)
            flash(`تم التسليم — ${res.correct ?? 0}/${res.total ?? 0} صحيحة (${res.score ?? 0}/${res.max_score ?? 0})`)
          }}
          onError={(msg) => flash(msg || 'تعذر تسليم الواجب', 'warning')}
        />,
        document.body
      )}

      {/* Grade (admin) */}
      {gradeModal && createPortal(
        <GradeModal
          homework={gradeModal.homework}
          graderId={userId}
          onClose={() => setGradeModal(null)}
          onFlash={flash}
        />,
        document.body
      )}

      {toast && (
        <div className={`hw-toast hw-toast-${toast.kind}`}>
          <i className={`fas ${toast.kind === 'success' ? 'fa-circle-check' : toast.kind === 'warning' ? 'fa-circle-exclamation' : 'fa-circle-info'}`}></i>
          <span>{toast.msg}</span>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          title="تأكيد حذف الواجب"
          itemLabel={confirmDelete.title}
          message="سيتم حذف الواجب وجميع التسليمات والملفات المرتبطة نهائياً. لا يمكن التراجع."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDelete}
        />
      )}

      {pdfViewer && createPortal(
        <PdfViewerModal viewer={pdfViewer} onClose={() => setPdfViewer(null)} />,
        document.body
      )}
    </main>
  )
}

/* ─────────────────────── sub-components ─────────────────────── */

function HomeworkCard({ hw, isAdmin, submission, onOpen, onSubmit, onGrade, onEdit, onDelete }) {
  const now = Date.now()
  const due = hw.due_at ? new Date(hw.due_at).getTime() : null
  const overdue = due && now > due

  // Status pill for the student. submit_homework() auto-grades on submit,
  // so a successful submission ALWAYS shows the score immediately.
  let status = null
  if (!isAdmin) {
    if (submission?.submitted_at) {
      const sc = submission.score ?? 0
      const mx = submission.max_score ?? hw.max_score
      status = { label: `الدرجة: ${sc}/${mx}`, cls: 'hw-status-graded', icon: 'fa-circle-check' }
    } else if (overdue) {
      status = { label: 'فات موعد التسليم', cls: 'hw-status-overdue', icon: 'fa-triangle-exclamation' }
    } else {
      status = { label: 'لم يتم التسليم بعد', cls: 'hw-status-pending', icon: 'fa-hourglass-half' }
    }
  }

  return (
    <article className="hw-card">
      <div className="hw-card-cover">
        <img src={hw.cover} alt={hw.title} loading="lazy" />
        <div className="hw-card-cover-grad"></div>
        <div className="hw-card-ribbon">
          <i className="fas fa-clipboard-list"></i> واجب
        </div>
        {hw.week && (
          <div className="hw-card-title-pill">
            <i className="fas fa-bookmark"></i> {hw.week}
          </div>
        )}
      </div>

      <div className="hw-card-body">
        <h3 className="hw-card-title">{hw.title}</h3>
        {hw.desc && <p className="hw-card-desc">{hw.desc}</p>}

        {hw.due_at && (
          <div className={`hw-due ${overdue ? 'is-overdue' : ''}`}>
            <i className="fas fa-clock"></i>
            <span>آخر موعد: {fmtDateTime(hw.due_at)}</span>
          </div>
        )}

        {status && (
          <div className={`hw-status ${status.cls}`}>
            <i className={`fas ${status.icon}`}></i>
            <span>{status.label}</span>
            {submission?.feedback && (
              <small className="hw-feedback" title={submission.feedback}>
                — {submission.feedback}
              </small>
            )}
          </div>
        )}

        <div className="hw-card-meta">
          <span><i className="fas fa-calendar"></i> {hw.date}</span>
          {hw.pdf_url && (
            <span className="hw-meta-file"><i className="fas fa-file-pdf"></i> PDF</span>
          )}
          <span><i className="fas fa-star"></i> {hw.max_score}</span>
        </div>

        <div className="hw-card-actions">
          <button className="hw-btn hw-btn-ghost" onClick={onOpen}>
            <i className="fas fa-eye"></i> عرض
          </button>
          {isAdmin ? (
            <>
              <button className="hw-btn hw-btn-primary" onClick={onGrade}>
                <i className="fas fa-list-check"></i> التسليمات
              </button>
              <button className="hw-btn hw-btn-ghost hw-btn-icon" onClick={onEdit} title="تعديل">
                <i className="fas fa-pen"></i>
              </button>
              <button className="hw-btn hw-btn-danger hw-btn-icon" onClick={onDelete} title="حذف">
                <i className="fas fa-trash"></i>
              </button>
            </>
          ) : (
            <button className="hw-btn hw-btn-primary" onClick={onSubmit}>
              <i className="fas fa-cloud-arrow-up"></i>
              {' '}{submission?.submitted_at ? 'تعديل الإجابات' : 'حل الواجب'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function SubmitModal({ homework, existing, onClose, onDone, onError }) {
  // Render N radio groups derived from the answer key. Each entry stores
  // the index the student picked (or null).
  const key = Array.isArray(homework.answer_key) ? homework.answer_key : []
  const initial = useMemo(() => {
    const prev = Array.isArray(existing?.responses) ? existing.responses : []
    return key.map((_, i) => (typeof prev[i] === 'number' ? prev[i] : null))
  }, [key, existing])

  const [picks, setPicks] = useState(initial)
  const [busy, setBusy]   = useState(false)
  const answeredCount = picks.filter((p) => p != null).length

  const choose = (qIdx, optIdx) => {
    setPicks((prev) => {
      const next = prev.slice()
      next[qIdx] = optIdx
      return next
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (key.length === 0) { onError('لا توجد أسئلة في هذا الواجب'); return }
    if (answeredCount < key.length) {
      if (!window.confirm(`لم تجب على ${key.length - answeredCount} سؤال. هل تريد التسليم رغم ذلك؟`)) return
    }
    setBusy(true)
    try {
      const res = await submitHomework(homework.id, picks)
      onDone({ ...res, responses: picks })
    } catch (err) {
      // Surface the real error message — Postgres function errors carry
      // useful info in `details` / `hint` / `message`. Without this the
      // UI just shows a generic "تعذر التسليم" and the actual cause
      // (missing column, missing migration, etc.) is invisible.
      console.error('submitHomework failed:', err)
      const detail = err?.message || err?.details || err?.code || 'تعذر التسليم'
      onError(`تعذر التسليم — ${detail}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hw-modal-overlay" onClick={onClose}>
      <form className="hw-modal hw-modal-wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="hw-modal-head">
          <div className="hw-modal-icon"><i className="fas fa-paper-plane"></i></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>تسليم الواجب</h3>
            <p style={{ margin: 0, color: '#718096', fontSize: 13 }}>{homework.title}</p>
          </div>
          <button type="button" className="hw-modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="hw-modal-body">
          {existing?.submitted_at && (
            <div className="hw-existing">
              <i className="fas fa-circle-check"></i>
              <span>لديك تسليم سابق</span>
              {existing.score != null && (
                <strong>— الدرجة: {existing.score}/{existing.max_score ?? homework.max_score}</strong>
              )}
              <small>— يمكنك تعديل إجاباتك وإعادة التسليم</small>
            </div>
          )}

          <div className="hw-split">
            {homework.pdf_url ? (
              <div className="hw-split-pdf">
                <PdfInline url={homework.pdf_url} title={homework.title} />
              </div>
            ) : (
              <div className="hw-pdf-link" style={{ background: '#fef3c7', color: '#92400e' }}>
                <i className="fas fa-triangle-exclamation"></i>
                <span>هذا الواجب لا يحتوي على ملف PDF</span>
              </div>
            )}

            <div className="hw-split-form">
              {key.length === 0 ? (
                <div className="hw-empty"><i className="fas fa-circle-info"></i><p>لا توجد أسئلة لهذا الواجب بعد</p></div>
              ) : (
                <div className="hw-mcq-list">
                  <div className="hw-mcq-progress">
                    <strong>{answeredCount}</strong> / {key.length} أجوبت
                  </div>
                  {key.map((q, qi) => {
                    const opts = Math.max(2, parseInt(q?.options, 10) || 4)
                    return (
                      <div key={qi} className="hw-mcq-row">
                        <div className="hw-mcq-q">السؤال {qi + 1}</div>
                        <div className="hw-mcq-opts">
                          {Array.from({ length: opts }).map((_, oi) => {
                            const isOn = picks[qi] === oi
                            return (
                              <label key={oi} className={`hw-mcq-opt ${isOn ? 'is-on' : ''}`}>
                                <input
                                  type="radio"
                                  name={`q-${qi}`}
                                  checked={isOn}
                                  onChange={() => choose(qi, oi)}
                                />
                                <span className="hw-mcq-letter">{OPT_LETTERS[oi] || String.fromCharCode(65 + oi)}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hw-modal-foot">
          <button type="button" className="hw-btn hw-btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
          <button type="submit" className="hw-btn hw-btn-primary" disabled={busy || key.length === 0}>
            <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>{' '}
            {busy ? 'جاري التسليم...' : 'إرسال الإجابات'}
          </button>
        </div>
      </form>
    </div>
  )
}

function GradeModal({ homework, graderId, onClose, onFlash }) {
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [draft, setDraft] = useState({}) // submissionId -> { score, feedback }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listSubmissionsForHomework(homework.id)
        if (cancelled) return
        setSubs(rows)
        const init = {}
        for (const r of rows) init[r.id] = { score: r.score ?? '', feedback: r.feedback ?? '' }
        setDraft(init)
      } catch (e) {
        if (!cancelled) onFlash(e.message || 'تعذر تحميل التسليمات', 'warning')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [homework.id, onFlash])

  const save = async (sub) => {
    const d = draft[sub.id] || {}
    setSavingId(sub.id)
    try {
      const row = await gradeSubmission(sub.id, {
        score: d.score === '' ? null : d.score,
        feedback: d.feedback,
        graderId,
      })
      setSubs(prev => prev.map(s => s.id === row.id ? { ...s, ...row } : s))
      onFlash('تم حفظ الدرجة')
    } catch (e) {
      onFlash(e.message || 'تعذر الحفظ', 'warning')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="hw-modal-overlay" onClick={onClose}>
      <div className="hw-modal hw-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="hw-modal-head">
          <div className="hw-modal-icon"><i className="fas fa-list-check"></i></div>
          <div>
            <h3>تسليمات: {homework.title}</h3>
            <p style={{ margin: 0, color: '#718096', fontSize: 13 }}>الدرجة الكاملة: {homework.max_score}</p>
          </div>
          <button type="button" className="hw-modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="hw-modal-body">
          {loading ? (
            <div className="hw-empty"><i className="fas fa-spinner fa-spin"></i><p>جاري التحميل...</p></div>
          ) : subs.length === 0 ? (
            <div className="hw-empty"><i className="fas fa-inbox"></i><p>لا توجد تسليمات بعد</p></div>
          ) : (
            <div className="hw-sub-list">
              {subs.map((sub) => (
                <div key={sub.id} className="hw-sub-row">
                  <div className="hw-sub-meta">
                    <strong>{sub.profiles?.name || '—'}</strong>
                    <span className="hw-sub-phone">{sub.profiles?.phone || ''}</span>
                    <span className="hw-sub-when">سُلِّم: {fmtDateTime(sub.submitted_at)}</span>
                    {sub.note && <p className="hw-sub-note">📝 {sub.note}</p>}
                    <ResponsesReview
                      answerKey={homework.answer_key}
                      responses={sub.responses}
                    />
                    {sub.score != null && (
                      <small className="hw-sub-auto">
                        التصحيح التلقائي: {sub.score}/{sub.max_score ?? homework.max_score}
                      </small>
                    )}
                  </div>
                  <div className="hw-sub-grade">
                    <input type="number" min="0" max={homework.max_score}
                      placeholder="الدرجة"
                      value={draft[sub.id]?.score ?? ''}
                      onChange={(e) => setDraft(d => ({ ...d, [sub.id]: { ...(d[sub.id] || {}), score: e.target.value } }))} />
                    <input type="text" placeholder="ملاحظات (اختياري)"
                      value={draft[sub.id]?.feedback ?? ''}
                      onChange={(e) => setDraft(d => ({ ...d, [sub.id]: { ...(d[sub.id] || {}), feedback: e.target.value } }))} />
                    <button className="hw-btn hw-btn-primary" onClick={() => save(sub)} disabled={savingId === sub.id}>
                      <i className={`fas ${savingId === sub.id ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                      حفظ
                    </button>
                    {sub.graded_at && <small className="hw-sub-graded-at">آخر تصحيح: {fmtDateTime(sub.graded_at)}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* PDF picker — file input + label + progress bar (used by Add and Submit). */
function PdfPicker({ file, setFile, pct, disabled, accept = 'application/pdf,.pdf', inputId, placeholder = 'اختر ملف PDF من جهازك' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor={inputId} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        border: '1px dashed #cbd5e0', borderRadius: 10, background: '#f8fafc',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        color: '#2d3748', fontWeight: 500,
      }}>
        <i className="fas fa-cloud-arrow-up" style={{ color: '#667eea' }}></i>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file ? file.name : placeholder}
        </span>
        {file && (
          <span style={{ fontSize: 12, color: '#718096' }}>
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </span>
        )}
      </label>
      <input id={inputId} type="file" accept={accept} style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => setFile(e.target.files?.[0] || null)} />
      {pct > 0 && pct < 100 && (
        <div style={{ height: 6, background: '#edf2f7', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#667eea,#764ba2)', transition: 'width .15s ease' }} />
        </div>
      )}
      {pct > 0 && (
        <span style={{ fontSize: 12, color: '#4a5568' }}>
          {pct < 100 ? `جاري الرفع... ${pct}%` : 'تم رفع الملف ✓'}
        </span>
      )}
    </div>
  )
}

/* Inline PDF viewer used inside the student SubmitModal so the questions
   live next to the answer form (no new tab). On mobile we route through
   gview because Chrome / Safari for Android+iOS won't render an
   <iframe src=foo.pdf> directly — they show a "Download" prompt. */
function PdfInline({ url, title }) {
  const isMobile = typeof navigator !== 'undefined' &&
    /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry/i.test(navigator.userAgent)
  const src = isMobile
    ? `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
    : url
  return (
    <iframe
      src={src}
      title={title}
      className="hw-pdf-inline"
      referrerPolicy="no-referrer"
    />
  )
}

function PdfViewerModal({ viewer, onClose }) {
  const isMobile = typeof navigator !== 'undefined' &&
    /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry/i.test(navigator.userAgent)
  const iframeSrc = isMobile
    ? `https://docs.google.com/gview?url=${encodeURIComponent(viewer.url)}&embedded=true`
    : viewer.url
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="hw-pdf-overlay" onClick={onClose}>
      <div className="hw-pdf-window" onClick={(e) => e.stopPropagation()}>
        <header className="hw-pdf-head">
          <div className="hw-pdf-title"><i className="fas fa-file-pdf"></i><span>{viewer.title}</span></div>
          <button type="button" className="hw-pdf-close" onClick={onClose} aria-label="إغلاق" title="إغلاق">
            <i className="fas fa-xmark"></i>
          </button>
        </header>
        <iframe className="hw-pdf-frame" src={iframeSrc} title={viewer.title} referrerPolicy="no-referrer" />
      </div>
    </div>
  )
}

function PrepCard({ prep, count, onClick }) {
  return (
    <button className={`prep-card prep-${prep.accent}`} onClick={onClick}>
      <div className="prep-cover">
        <div className="prep-cover-deco" />
        <PrepIllustration kind={prep.id} stage={prep.nameEn} />
      </div>
      <div className="prep-body">
        <h3>{prep.nameAr}</h3>
        <p>{prep.desc}</p>
        <div className="prep-foot">
          <span className="prep-count">
            <i className="fas fa-clipboard-list"></i> {count} واجب
          </span>
          <span className="prep-cta">استعراض <i className="fas fa-arrow-left"></i></span>
        </div>
      </div>
    </button>
  )
}

function Field({ label, icon, required, children }) {
  return (
    <div className="hw-field">
      <label>
        <i className={`fas ${icon}`}></i> {label}
        {required && <span className="hw-required">*</span>}
      </label>
      {children}
    </div>
  )
}

/* ── Admin MCQ key builder ──────────────────────────────────────
   value: [{ options: 4, correct: 1 }, ...]
   Admin enters question count, then sets options + correct answer per row. */
function AnswerKeyBuilder({ value, onChange }) {
  const list = Array.isArray(value) ? value : []
  const setRow = (idx, patch) => {
    const next = list.slice()
    next[idx] = { ...next[idx], ...patch }
    // Clamp `correct` if options shrank below it.
    if (patch.options != null && next[idx].correct >= patch.options) {
      next[idx].correct = 0
    }
    onChange(next)
  }
  const setCount = (n) => {
    const target = Math.max(0, Math.min(100, parseInt(n, 10) || 0))
    if (target === list.length) return
    if (target > list.length) {
      onChange([
        ...list,
        ...Array.from({ length: target - list.length }, () => ({ options: 4, correct: 0 })),
      ])
    } else {
      onChange(list.slice(0, target))
    }
  }
  return (
    <div className="hw-mcq-builder">
      <div className="hw-mcq-builder-head">
        <label>عدد الأسئلة:</label>
        <input
          type="number"
          min="0"
          max="100"
          value={list.length}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      {list.length === 0 && (
        <div className="hw-mcq-empty">حدد عدد الأسئلة أولاً</div>
      )}
      {list.map((q, i) => {
        const opts = q?.options ?? 4
        const correct = q?.correct ?? 0
        return (
          <div key={i} className="hw-mcq-builder-row">
            <div className="hw-mcq-q">س {i + 1}</div>
            <label className="hw-mcq-mini">
              عدد الخيارات
              <select
                value={opts}
                onChange={(e) => setRow(i, { options: parseInt(e.target.value, 10) || 4 })}
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="hw-mcq-key">
              <span className="hw-mcq-key-label">الإجابة الصحيحة:</span>
              <div className="hw-mcq-opts">
                {Array.from({ length: opts }).map((_, oi) => (
                  <label key={oi} className={`hw-mcq-opt ${correct === oi ? 'is-on is-correct' : ''}`}>
                    <input
                      type="radio"
                      name={`key-${i}`}
                      checked={correct === oi}
                      onChange={() => setRow(i, { correct: oi })}
                    />
                    <span className="hw-mcq-letter">{OPT_LETTERS[oi] || String.fromCharCode(65 + oi)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Admin: per-submission review (correct vs wrong indicators) ──
   Renders one row per question showing what the student picked and
   whether it matched the answer key. */
function ResponsesReview({ answerKey, responses }) {
  const key = Array.isArray(answerKey) ? answerKey : []
  const picks = Array.isArray(responses) ? responses : []
  if (key.length === 0) return null
  return (
    <div className="hw-review">
      {key.map((q, i) => {
        const correct = q?.correct
        const pick = picks[i]
        const ok = pick != null && pick === correct
        const skipped = pick == null
        return (
          <span
            key={i}
            className={`hw-review-pill ${skipped ? 'is-skipped' : ok ? 'is-ok' : 'is-bad'}`}
            title={`السؤال ${i + 1}: ${
              skipped ? 'لم تُجَب' :
              `أجاب ${OPT_LETTERS[pick] || pick} — الصواب ${OPT_LETTERS[correct] || correct}`
            }`}
          >
            {i + 1}
          </span>
        )
      })}
    </div>
  )
}
