import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './Lectures.css'
import PrepIllustration from '../components/PrepIllustration'
import {
  listLectures,
  createLecture,
  deleteLecture,
  uiToDbGrade,
  dbToUiGrade,
} from '../services/lecturesApi'

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
    pdf_url: '',
    grade: '',
  })

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
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
      pdf_url: '',
      grade: grade || 'first',
    })
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
      await createLecture({
        title: form.title.trim(),
        description: form.desc.trim() || null,
        subject: form.subject.trim() || null,
        teacher: form.teacher.trim() || null,
        week: form.week.trim() || null,
        grade: dbGrade,
        cover_url: form.cover_url.trim() || null,
        pdf_url: form.pdf_url.trim() || null,
        created_by: userId,
      })
      flash('تمت إضافة المحاضرة بنجاح')
      setModalOpen(false)
      await refresh()
    } catch (err) {
      flash(err.message || 'تعذر حفظ المحاضرة', 'warning')
    } finally {
      setSubmitting(false)
    }
  }

  const removeLecture = async (id) => {
    try {
      await deleteLecture(id)
      setRows((prev) => prev.filter((r) => r.id !== id))
      flash('تم حذف المحاضرة', 'warning')
    } catch (err) {
      flash(err.message || 'تعذر حذف المحاضرة', 'warning')
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
                      if (lec.pdf_url) window.open(lec.pdf_url, '_blank', 'noopener')
                      else flash('لا يوجد ملف PDF لهذه المحاضرة', 'warning')
                    }}
                    onDelete={() => removeLecture(lec.id)}
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
                <p>املأ بيانات المحاضرة وألصق رابط الـ PDF من R2</p>
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

              <Field label="رابط ملف PDF من R2" icon="fa-file-pdf">
                <input
                  type="url"
                  value={form.pdf_url}
                  onChange={(e) => setForm({ ...form, pdf_url: e.target.value })}
                  placeholder="https://pub-xxx.r2.dev/lectures/xxx.pdf"
                />
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
                {' '}{submitting ? 'جاري الحفظ...' : 'حفظ المحاضرة'}
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
          {lec.pdf_url && (
            <a
              className="lec-btn lec-btn-ghost"
              href={lec.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <i className="fas fa-download"></i> تحميل
            </a>
          )}
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
