import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './Lectures.css'
import PrepIllustration from '../components/PrepIllustration'

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

const SAMPLE_LECTURES = {
  first: [
    {
      id: 'L101',
      title: 'مقدمة في الجبر',
      desc: 'تعريف المتغيرات، المعادلات الخطية، وأمثلة محلولة خطوة بخطوة لفهم الأساسيات.',
      subject: 'رياضيات',
      teacher: 'أ. محمد علي',
      week: 'الأسبوع 1',
      date: '2026-04-10',
      cover: PLACEHOLDER_COVER,
    },
    {
      id: 'L102',
      title: 'العمليات الحسابية المتقدمة',
      desc: 'الجمع والطرح والضرب على الأعداد الصحيحة مع تدريبات عملية.',
      subject: 'رياضيات',
      teacher: 'أ. محمد علي',
      week: 'الأسبوع 2',
      date: '2026-04-13',
      cover: PLACEHOLDER_COVER,
    },
  ],
  second: [
    {
      id: 'L201',
      title: 'الهندسة المستوية',
      desc: 'الزوايا والمضلعات وقواعد التطابق مع رسومات توضيحية.',
      subject: 'رياضيات',
      teacher: 'أ. سارة أحمد',
      week: 'الأسبوع 1',
      date: '2026-04-12',
      cover: PLACEHOLDER_COVER,
    },
  ],
  third: [
    {
      id: 'L301',
      title: 'حساب المثلثات',
      desc: 'النسب المثلثية، التمارين، وحل المسائل التطبيقية.',
      subject: 'رياضيات',
      teacher: 'أ. خالد رضا',
      week: 'الأسبوع 1',
      date: '2026-04-15',
      cover: PLACEHOLDER_COVER,
    },
  ],
}

export default function Lectures() {
  const [grade, setGrade] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [lectures, setLectures] = useState(SAMPLE_LECTURES)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({
    title: '',
    desc: '',
    subject: '',
    teacher: '',
    week: '',
    cover: '',
    file: null,
  })

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
    } catch {
      setUserRole(null)
    }
  }, [])

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

  const onCoverChange = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => setForm((f) => ({ ...f, cover: e.target.result }))
    reader.readAsDataURL(file)
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim() || !grade) return
    const id = 'L' + Math.floor(Math.random() * 9000 + 1000)
    const today = new Date().toISOString().slice(0, 10)
    const newLec = {
      id,
      title: form.title.trim(),
      desc: form.desc.trim() || '—',
      subject: form.subject.trim() || 'عام',
      teacher: form.teacher.trim() || '—',
      week: form.week.trim() || '—',
      date: today,
      cover: form.cover || PLACEHOLDER_COVER,
      fileName: form.file?.name,
    }
    setLectures((prev) => ({ ...prev, [grade]: [newLec, ...(prev[grade] || [])] }))
    flash('تمت إضافة المحاضرة بنجاح')
    setModalOpen(false)
    setForm({ title: '', desc: '', subject: '', teacher: '', week: '', cover: '', file: null })
  }

  const removeLecture = (id) => {
    setLectures((prev) => ({
      ...prev,
      [grade]: (prev[grade] || []).filter((l) => l.id !== id),
    }))
    flash('تم حذف المحاضرة', 'warning')
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
              <button className="lec-back" onClick={() => { setGrade(null); setSearch('') }}>
                <i className="fas fa-arrow-right"></i> العودة للمراحل
              </button>
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
                <button className="lec-add-btn" onClick={() => setModalOpen(true)}>
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

            {filtered.length === 0 ? (
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
                    onOpen={() => flash('سيتم فتح: ' + lec.title, 'info')}
                    onDownload={() => flash('بدء التحميل: ' + lec.title, 'info')}
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
                <p>املأ بيانات المحاضرة وارفع صورة الغلاف وملف الـ PDF</p>
              </div>
              <button type="button" className="lec-modal-close" onClick={() => setModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="lec-modal-body">
              {/* Cover uploader */}
              <label className="lec-cover-uploader">
                {form.cover ? (
                  <img src={form.cover} alt="cover" />
                ) : (
                  <div className="lec-cover-placeholder">
                    <i className="fas fa-image"></i>
                    <span>اضغط لرفع صورة الغلاف</span>
                    <small>JPG / PNG — يفضّل بنسبة 16:9</small>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => onCoverChange(e.target.files[0])}
                />
              </label>

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
                <Field label="المادة" icon="fa-book">
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="رياضيات / علوم / لغة..."
                  />
                </Field>
              </div>

              <div className="lec-form-row">
                <Field label="المعلم" icon="fa-chalkboard-user">
                  <input
                    type="text"
                    value={form.teacher}
                    onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                    placeholder="اسم المدرس"
                  />
                </Field>
                <Field label="الأسبوع / الترم" icon="fa-calendar-week">
                  <input
                    type="text"
                    value={form.week}
                    onChange={(e) => setForm({ ...form, week: e.target.value })}
                    placeholder="الأسبوع الأول"
                  />
                </Field>
              </div>

              <Field label="الوصف" icon="fa-align-right">
                <textarea
                  rows="3"
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  placeholder="نبذة قصيرة عن محتوى المحاضرة..."
                />
              </Field>

              <Field label="ملف PDF" icon="fa-file-pdf">
                <label className="lec-file-input">
                  <i className="fas fa-cloud-arrow-up"></i>
                  <span>{form.file?.name || 'اختر ملف PDF'}</span>
                  <input
                    type="file"
                    accept=".pdf"
                    hidden
                    onChange={(e) => setForm({ ...form, file: e.target.files[0] })}
                  />
                </label>
              </Field>
            </div>

            <div className="lec-modal-foot">
              <button type="button" className="lec-btn lec-btn-ghost" onClick={() => setModalOpen(false)}>
                إلغاء
              </button>
              <button type="submit" className="lec-btn lec-btn-primary">
                <i className="fas fa-check"></i> حفظ المحاضرة
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

function LectureCard({ lec, isAdmin, onOpen, onDownload, onDelete }) {
  return (
    <article className="lec-card">
      <div className="lec-card-cover">
        <img src={lec.cover} alt={lec.title} loading="lazy" />
        <div className="lec-card-cover-grad"></div>
        <div className="lec-card-ribbon">
          <i className="fas fa-circle-play"></i> محاضرة
        </div>
        <div className="lec-card-id">
          <i className="fas fa-hashtag"></i>{lec.id}
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
          {lec.fileName && (
            <span className="lec-meta-file">
              <i className="fas fa-file-pdf"></i> {lec.fileName}
            </span>
          )}
        </div>

        <div className="lec-card-actions">
          <button className="lec-btn lec-btn-primary" onClick={onOpen}>
            <i className="fas fa-eye"></i> فتح المحاضرة
          </button>
          <button className="lec-btn lec-btn-ghost" onClick={onDownload}>
            <i className="fas fa-download"></i> تحميل
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
