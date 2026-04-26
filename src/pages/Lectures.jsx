import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './Lectures.css'
import PrepIllustration from '../components/PrepIllustration'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import {
  listLectures,
  createLecture,
  deleteLecture,
  uiToDbGrade,
  dbToUiGrade,
} from '@backend/lecturesApi'
import { uploadLecturePdf } from '@backend/r2'

/* ──────────────────────────────────────────────────────────────
   Lectures page — image-driven course cards + prep picker.
   ────────────────────────────────────────────────────────────── */

const PREPS = [
  {
    id: 'first',
    nameAr: 'الصف الأول الإعدادي',
    nameEn: 'First Prep',
    icon: 'fa-seedling',
    accent: 'green',
    desc: 'بداية المرحلة الإعدادية والتأسيس',
  },
  {
    id: 'second',
    nameAr: 'الصف الثاني الإعدادي',
    nameEn: 'Second Prep',
    icon: 'fa-book-open-reader',
    accent: 'blue',
    desc: 'تعميق المفاهيم وبناء المهارات',
  },
  {
    id: 'third',
    nameAr: 'الصف الثالث الإعدادي',
    nameEn: 'Third Prep',
    icon: 'fa-trophy',
    accent: 'orange',
    desc: 'الاستعداد لاختبارات الشهادة',
  },
]

const PLACEHOLDER_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#667eea"/>
          <stop offset="100%" stop-color="#764ba2"/>
        </linearGradient>
      </defs>
      <rect width="600" height="340" fill="url(#g)"/>
      <text x="50%" y="50%" font-family="Cairo, Arial" font-size="44" font-weight="700"
        fill="rgba(255,255,255,0.85)" text-anchor="middle" dominant-baseline="middle">محاضرة</text>
    </svg>`
  )

// Normalize a DB row into the shape the card components expect.
function rowToCard(row) {
  return {
    id: row.id,
    title: row.title,
    desc: row.description || '—',
    subject: row.subject || 'عام',
    teacher: row.teacher || '—',
    week: row.week || '—',
    date: (row.created_at || '').slice(0, 10),
    cover: row.cover_url || PLACEHOLDER_COVER,
    pdf_url: row.pdf_url || null,
    grade: row.grade,
  }
}

export default function Lectures() {
  // Record this visit so the home dashboard's "Continue" widget knows
  // where the student last was.
  useEffect(() => { import('../utils/trackVisit').then(m => m.trackVisit('lectures')) }, [])
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
  const [form, setForm] = useState({
    title: '',
    desc: '',
    subject: '',
    teacher: '',
    week: '',
    cover_url: '',
    grade: '',
  })
  // The admin picks a PDF from their device; we upload it straight to R2.
  const [pdfFile, setPdfFile] = useState(null)
  const [uploadPct, setUploadPct] = useState(0)
  // Inline PDF viewer: when set, render a full-screen overlay with an
  // <iframe>. Modern browsers ship a PDF renderer that works inside an
  // iframe, so this avoids spawning a new browser tab.
  const [pdfViewer, setPdfViewer] = useState(null) // { url, title } | null

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
      setUserId(u?.id || null)
      // auto-select the student's own grade; admins still pick
      if (u?.role !== 'admin' && u?.grade) {
        setGrade(dbToUiGrade(u.grade))
      }
    } catch {
      setUserRole(null)
    }
  }, [])

  const refresh = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listLectures()
      setRows(data)
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل المحاضرات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const lectures = useMemo(() => {
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
    const list = lectures[grade] || []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((l) =>
      [l.title, l.desc, l.subject, l.teacher, l.week, l.id]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [lectures, grade, search])

  const openAddModal = () => {
    setForm({
      title: '',
      desc: '',
      subject: '',
      teacher: '',
      week: '',
      cover_url: '',
      grade: grade || 'first',
    })
    setPdfFile(null)
    setUploadPct(0)
    setModalOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!form.title.trim()) return
    const uiGrade = form.grade || grade
    const dbGrade = uiToDbGrade(uiGrade)
    if (!dbGrade) {
      flash('يجب اختيار الصف الدراسي', 'warning')
      return
    }
    setSubmitting(true)
    try {
      // If a PDF was picked, upload it to R2 first; then attach its URL + key.
      let pdfUrl = null
      let pdfKey = null
      if (pdfFile) {
        if (pdfFile.type && pdfFile.type !== 'application/pdf') {
          throw new Error('الملف يجب أن يكون بصيغة PDF')
        }
        setUploadPct(1)
        const { key, publicUrl } = await uploadLecturePdf(pdfFile, {
          onProgress: (p) => setUploadPct(Math.max(1, p)),
        })
        pdfUrl = publicUrl
        pdfKey = key
      }

      await createLecture({
        title: form.title.trim(),
        description: form.desc.trim() || null,
        subject: form.subject.trim() || null,
        teacher: form.teacher.trim() || null,
        week: form.week.trim() || null,
        grade: dbGrade,
        cover_url: form.cover_url.trim() || null,
        pdf_url: pdfUrl,
        pdf_key: pdfKey,
        created_by: userId,
      })
      flash('تمت إضافة المحاضرة بنجاح')
      setModalOpen(false)
      await refresh()
    } catch (err) {
      flash(err.message || 'تعذر حفظ المحاضرة', 'warning')
    } finally {
      setSubmitting(false)
      setUploadPct(0)
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title } | null

  const requestDeleteLecture = (lec) =>
    setConfirmDelete({ id: lec.id, title: lec.title })

  const performDeleteLecture = async () => {
    const target = confirmDelete
    if (!target) return
    try {
      await deleteLecture(target.id)
      setRows((prev) => prev.filter((r) => r.id !== target.id))
      flash('تم حذف المحاضرة', 'warning')
    } catch (err) {
      flash(err.message || 'تعذر حذف المحاضرة', 'warning')
    } finally {
      setConfirmDelete(null)
    }
  }

  /* ─────────── render ─────────── */
  return (
    <main className="lec-page" dir="rtl">
      <div className="lec-container">
        {/* Step 1 — prep picker */}
        {!grade && (
          <div className="lec-prep-wrap">
            <div className="lec-prep-head">
              <div className="lec-prep-icon"><i className="fas fa-book-bookmark"></i></div>
              <div>
                <h1>المحاضرات</h1>
                <p>اختر المرحلة الدراسية لاستعراض المحاضرات الخاصة بها</p>
              </div>
            </div>
            <div className="prep-grid">
              {PREPS.map((p) => (
                <PrepCard
                  key={p.id}
                  prep={p}
                  count={(lectures[p.id] || []).length}
                  onClick={() => setGrade(p.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — lectures of selected prep */}
        {grade && (
          <>
            <div className="lec-toolbar">
              {userRole === 'admin' && (
                <button className="lec-back" onClick={() => { setGrade(null); setSearch('') }}>
                  <i className="fas fa-arrow-right"></i> العودة للمراحل
                </button>
              )}
              <div className="lec-search-wrap">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="ابحث بعنوان المحاضرة، المادة، أو المعلم..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="lec-search-clear" onClick={() => setSearch('')}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
              {userRole === 'admin' && (
                <button className="lec-add-btn" onClick={openAddModal}>
                  <i className="fas fa-plus"></i> محاضرة جديدة
                </button>
              )}
            </div>

            <div className="lec-section-head">
              <h2>
                <i className="fas fa-layer-group"></i>
                {' '}محاضرات {PREPS.find((p) => p.id === grade)?.nameAr}
              </h2>
              <span className="lec-count-pill">{filtered.length} محاضرة</span>
            </div>

            {loading ? (
              <div className="lec-empty">
                <i className="fas fa-spinner fa-spin"></i>
                <p>جاري التحميل...</p>
              </div>
            ) : loadError ? (
              <div className="lec-empty">
                <i className="fas fa-triangle-exclamation"></i>
                <p>{loadError}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="lec-empty">
                <i className="fas fa-folder-open"></i>
                <p>لا توجد محاضرات مطابقة</p>
              </div>
            ) : (
              <div className="lec-grid">
                {filtered.map((lec) => (
                  <LectureCard
                    key={lec.id}
                    lec={lec}
                    isAdmin={userRole === 'admin'}
                    onOpen={() => {
                      if (lec.pdf_url) setPdfViewer({ url: lec.pdf_url, title: lec.title })
                      else flash('لا يوجد ملف PDF لهذه المحاضرة', 'warning')
                    }}
                    onDelete={() => requestDeleteLecture(lec)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add modal */}
      {modalOpen && createPortal(
        <div className="lec-modal-overlay" onClick={() => setModalOpen(false)}>
          <form className="lec-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="lec-modal-head">
              <div className="lec-modal-icon"><i className="fas fa-circle-plus"></i></div>
              <div>
                <h3>إضافة محاضرة جديدة</h3>
                <p>املأ بيانات المحاضرة وارفع ملف الـ PDF من جهازك</p>
              </div>
              <button type="button" className="lec-modal-close" onClick={() => setModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="lec-modal-body">
              <div className="lec-form-row">
                <Field label="عنوان المحاضرة" icon="fa-heading" required>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="مثال: مقدمة في الجبر"
                    required
                  />
                </Field>
                <Field label="الصف الدراسي" icon="fa-graduation-cap" required>
                  <select
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    required
                  >
                    <option value="first">الأول الإعدادي</option>
                    <option value="second">الثاني الإعدادي</option>
                    <option value="third">الثالث الإعدادي</option>
                  </select>
                </Field>
              </div>

              <div className="lec-form-row">
                <Field label="المادة" icon="fa-book">
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="رياضيات / علوم / لغة..."
                  />
                </Field>
                <Field label="المعلم" icon="fa-chalkboard-user">
                  <input
                    type="text"
                    value={form.teacher}
                    onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                    placeholder="اسم المدرس"
                  />
                </Field>
              </div>

              <Field label="الأسبوع / الترم" icon="fa-calendar-week">
                <input
                  type="text"
                  value={form.week}
                  onChange={(e) => setForm({ ...form, week: e.target.value })}
                  placeholder="الأسبوع الأول"
                />
              </Field>

              <Field label="الوصف" icon="fa-align-right">
                <textarea
                  rows="3"
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  placeholder="نبذة قصيرة عن محتوى المحاضرة..."
                />
              </Field>

              <Field label="رابط صورة الغلاف (اختياري)" icon="fa-image">
                <input
                  type="url"
                  value={form.cover_url}
                  onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
                  placeholder="https://..."
                />
              </Field>

              <Field label="ملف الـ PDF" icon="fa-file-pdf">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label
                    htmlFor="lec-pdf-input"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px',
                      border: '1px dashed #cbd5e0',
                      borderRadius: 10,
                      background: '#f8fafc',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.6 : 1,
                      color: '#2d3748',
                      fontWeight: 500,
                    }}
                  >
                    <i className="fas fa-cloud-arrow-up" style={{ color: '#667eea' }}></i>
                    <span style={{
                      flex: 1, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {pdfFile ? pdfFile.name : 'اختر ملف PDF من جهازك'}
                    </span>
                    {pdfFile && (
                      <span style={{ fontSize: 12, color: '#718096' }}>
                        {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    )}
                  </label>
                  <input
                    id="lec-pdf-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: 'none' }}
                    disabled={submitting}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null
                      setPdfFile(f)
                      setUploadPct(0)
                    }}
                  />
                  {uploadPct > 0 && uploadPct < 100 && (
                    <div style={{
                      height: 6, background: '#edf2f7',
                      borderRadius: 999, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${uploadPct}%`, height: '100%',
                        background: 'linear-gradient(90deg,#667eea,#764ba2)',
                        transition: 'width 0.15s ease',
                      }} />
                    </div>
                  )}
                  {uploadPct > 0 && (
                    <span style={{ fontSize: 12, color: '#4a5568' }}>
                      {uploadPct < 100
                        ? `جاري الرفع... ${uploadPct}%`
                        : 'تم رفع الملف ✓'}
                    </span>
                  )}
                  <small style={{ color: '#718096', fontSize: 12 }}>
                    يتم رفع الملف مباشرة إلى التخزين السحابي — لا حاجة لنسخ أي روابط.
                  </small>
                </div>
              </Field>
            </div>

            <div className="lec-modal-foot">
              <button
                type="button"
                className="lec-btn lec-btn-ghost"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
              >
                إلغاء
              </button>
              <button type="submit" className="lec-btn lec-btn-primary" disabled={submitting}>
                <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                {' '}{
                  submitting
                    ? (uploadPct > 0 && uploadPct < 100
                        ? `جاري رفع الملف... ${uploadPct}%`
                        : 'جاري الحفظ...')
                    : 'حفظ المحاضرة'
                }
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {toast && (
        <div className={`lec-toast lec-toast-${toast.kind}`}>
          <i className={`fas ${
            toast.kind === 'success' ? 'fa-circle-check'
              : toast.kind === 'warning' ? 'fa-circle-exclamation'
              : 'fa-circle-info'
          }`}></i>
          <span>{toast.msg}</span>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          title="تأكيد حذف المحاضرة"
          itemLabel={confirmDelete.title}
          message="سيتم حذف المحاضرة وملف الـ PDF المرتبط بها نهائياً. لا يمكن التراجع عن هذا الإجراء."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDeleteLecture}
        />
      )}

      {pdfViewer && createPortal(
        <div className="lec-pdf-overlay" onClick={() => setPdfViewer(null)}>
          <div className="lec-pdf-window" onClick={(e) => e.stopPropagation()}>
            <header className="lec-pdf-head">
              <div className="lec-pdf-title">
                <i className="fas fa-file-pdf"></i>
                <span>{pdfViewer.title}</span>
              </div>
              <button
                type="button"
                className="lec-pdf-close"
                onClick={() => setPdfViewer(null)}
                aria-label="إغلاق"
                title="إغلاق"
              >
                <i className="fas fa-xmark"></i>
              </button>
            </header>
            <iframe
              className="lec-pdf-frame"
              src={pdfViewer.url}
              title={pdfViewer.title}
            />
          </div>
        </div>,
        document.body
      )}
    </main>
  )
}

/* ─────────────────────── sub-components ─────────────────────── */

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
            <i className="fas fa-book"></i> {count} محاضرة
          </span>
          <span className="prep-cta">
            استعراض <i className="fas fa-arrow-left"></i>
          </span>
        </div>
      </div>
    </button>
  )
}

function LectureCard({ lec, isAdmin, onOpen, onDelete }) {
  return (
    <article className="lec-card">
      <div className="lec-card-cover">
        <img src={lec.cover} alt={lec.title} loading="lazy" />
        <div className="lec-card-cover-grad"></div>
        <div className="lec-card-ribbon">
          <i className="fas fa-circle-play"></i> محاضرة
        </div>
        <div className="lec-card-title-pill">
          <i className="fas fa-bookmark"></i> {lec.week}
        </div>
      </div>

      <div className="lec-card-body">
        <div className="lec-card-tags">
          <span className="lec-tag lec-tag-subject"><i className="fas fa-book"></i> {lec.subject}</span>
          <span className="lec-tag"><i className="fas fa-chalkboard-user"></i> {lec.teacher}</span>
        </div>

        <h3 className="lec-card-title">{lec.title}</h3>
        <p className="lec-card-desc">{lec.desc}</p>

        <div className="lec-card-meta">
          <span><i className="fas fa-calendar"></i> {lec.date}</span>
          {lec.pdf_url && (
            <span className="lec-meta-file">
              <i className="fas fa-file-pdf"></i> PDF
            </span>
          )}
        </div>

        <div className="lec-card-actions">
          <button className="lec-btn lec-btn-primary" onClick={onOpen}>
            <i className="fas fa-eye"></i> فتح المحاضرة
          </button>
          {isAdmin && (
            <button className="lec-btn lec-btn-danger lec-btn-icon" onClick={onDelete} title="حذف">
              <i className="fas fa-trash"></i>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function Field({ label, icon, required, children }) {
  return (
    <div className="lec-field">
      <label>
        <i className={`fas ${icon}`}></i> {label}
        {required && <span className="lec-required">*</span>}
      </label>
      {children}
    </div>
  )
}
