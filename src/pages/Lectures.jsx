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

import { useI18n } from '../i18n'

/* ──────────────────────────────────────────────────────────────
   Lectures page — image-driven course cards + prep picker.
   ────────────────────────────────────────────────────────────── */

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
        fill="rgba(255,255,255,0.85)" text-anchor="middle" dominant-baseline="middle">Masar</text>
    </svg>`
  )

// Normalize a DB row into the shape the card components expect.
function rowToCard(row, lang) {
  return {
    id: row.id,
    title: row.title,
    desc: row.description || '—',
    subject: row.subject || (lang === 'ar' ? 'عام' : 'General'),
    teacher: row.teacher || '—',
    week: row.week || '—',
    date: (row.created_at || '').slice(0, 10),
    cover: row.cover_url || PLACEHOLDER_COVER,
    pdf_url: row.pdf_url || null,
    grade: row.grade,
  }
}

export default function Lectures() {
  const { t, lang } = useI18n()
  const PREPS = [
    {
      id: 'first',
      nameAr: t('grades.first'),
      nameEn: 'First Prep',
      icon: 'fa-seedling',
      accent: 'green',
      desc: lang === 'ar' ? 'بداية المرحلة الإعدادية والتأسيس' : 'Start of prep stage and foundation',
    },
    {
      id: 'second',
      nameAr: t('grades.second'),
      nameEn: 'Second Prep',
      icon: 'fa-book-open-reader',
      accent: 'blue',
      desc: lang === 'ar' ? 'تعميق المفاهيم وبناء المهارات' : 'Deepening concepts and skill building',
    },
    {
      id: 'third',
      nameAr: t('grades.third'),
      nameEn: 'Third Prep',
      icon: 'fa-trophy',
      accent: 'orange',
      desc: lang === 'ar' ? 'الاستعداد لاختبارات الشهادة' : 'Preparing for certificate exams',
    },
  ]

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
      setLoadError(err.message || t('common.error'))
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
      if (ui && grouped[ui]) grouped[ui].push(rowToCard(r, lang))
    }
    return grouped
  }, [rows, lang])

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
      flash(t('common.error'), 'warning')
      return
    }
    setSubmitting(true)
    try {
      // If a PDF was picked, upload it to R2 first; then attach its URL + key.
      let pdfUrl = null
      let pdfKey = null
      if (pdfFile) {
        if (pdfFile.type && pdfFile.type !== 'application/pdf') {
          throw new Error(t('common.error'))
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
      flash(t('lectures.lectureSaved'))
      setModalOpen(false)
      await refresh()
    } catch (err) {
      flash(err.message || t('common.error'), 'warning')
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
      flash(t('lectures.lectureDeleted'), 'warning')
    } catch (err) {
      flash(err.message || t('common.error'), 'warning')
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
                <h1>{t('lectures.pageTitle')}</h1>
                <p>{t('lectures.pickGrade')}</p>
              </div>
            </div>
            <div className="prep-grid">
              {PREPS.map((p) => (
                <PrepCard
                  key={p.id}
                  prep={p}
                  count={(lectures[p.id] || []).length}
                  onClick={() => setGrade(p.id)}
                  t={t}
                  lang={lang}
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
                  <i className={`fas ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i> {t('common.back')}
                </button>
              )}
              <div className="lec-search-wrap">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder={t('lectures.searchPlaceholder')}
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
                  <i className="fas fa-plus"></i> {t('lectures.addNew')}
                </button>
              )}
            </div>

            <div className="lec-section-head">
              <h2>
                <i className="fas fa-layer-group"></i>
                {' '}{t('lectures.pageTitle')} {PREPS.find((p) => p.id === grade)?.nameAr}
              </h2>
              <span className="lec-count-pill">{filtered.length} {t('lectures.pageTitle')}</span>
            </div>

            {loading ? (
              <div className="lec-empty">
                <i className="fas fa-spinner fa-spin"></i>
                <p>{t('lectures.loading')}</p>
              </div>
            ) : loadError ? (
              <div className="lec-empty">
                <i className="fas fa-triangle-exclamation"></i>
                <p>{loadError}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="lec-empty">
                <i className="fas fa-folder-open"></i>
                <p>{t('lectures.noLectures')}</p>
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
                      else flash(t('common.error'), 'warning')
                    }}
                    onDelete={() => requestDeleteLecture(lec)}
                    t={t}
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
                <h3>{t('lectures.addNew')}</h3>
                <p>{t('lectures.addDescPlaceholder')}</p>
              </div>
              <button type="button" className="lec-modal-close" onClick={() => setModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="lec-modal-body">
              <div className="lec-form-row">
                <Field label={t('lectures.addLectureTitle')} icon="fa-heading" required>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder={t('lectures.addLecturePlaceholder')}
                    required
                  />
                </Field>
                <Field label={t('lectures.grade')} icon="fa-graduation-cap" required>
                  <select
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    required
                  >
                    <option value="first">{t('grades.first')}</option>
                    <option value="second">{t('grades.second')}</option>
                    <option value="third">{t('grades.third')}</option>
                  </select>
                </Field>
              </div>

              <div className="lec-form-row">
                <Field label={t('reports.subject')} icon="fa-book">
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder={t('reports.subject')}
                  />
                </Field>
                <Field label={t('lectures.teacher') || 'Teacher'} icon="fa-chalkboard-user">
                  <input
                    type="text"
                    value={form.teacher}
                    onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                    placeholder={t('lectures.teacher') || 'Teacher'}
                  />
                </Field>
              </div>

              <Field label={t('lectures.week') || 'Week'} icon="fa-calendar-week">
                <input
                  type="text"
                  value={form.week}
                  onChange={(e) => setForm({ ...form, week: e.target.value })}
                  placeholder={t('lectures.week') || 'Week'}
                />
              </Field>

              <Field label={t('lectures.description')} icon="fa-align-right">
                <textarea
                  rows="3"
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  placeholder={t('lectures.addDescPlaceholder')}
                />
              </Field>

              <Field label={t('lectures.coverUrl') || 'Cover URL (Optional)'} icon="fa-image">
                <input
                  type="url"
                  value={form.cover_url}
                  onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
                  placeholder="https://..."
                />
              </Field>

              <Field label={t('lectures.pdfFile') || 'PDF File'} icon="fa-file-pdf">
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
                      {pdfFile ? pdfFile.name : (t('lectures.uploadPdf') || 'Upload PDF')}
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
                        ? `${t('common.loading')}... ${uploadPct}%`
                        : `${t('common.save')} ✓`}
                    </span>
                  )}
                  <small style={{ color: '#718096', fontSize: 12 }}>
                    {t('lectures.uploadDirectly') || 'File will be uploaded directly'}
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
                {t('common.cancel')}
              </button>
              <button type="submit" className="lec-btn lec-btn-primary" disabled={submitting}>
                <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                {' '}{
                  submitting
                    ? (uploadPct > 0 && uploadPct < 100
                        ? `${t('common.loading')}... ${uploadPct}%`
                        : t('common.loading'))
                    : t('common.save')
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
          title={t('lectures.confirmDeleteTitle')}
          itemLabel={confirmDelete.title}
          message={t('lectures.deleteWarning')}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDeleteLecture}
        />
      )}
    </main>
  )
}

/* ─────────────────────── sub-components ─────────────────────── */

function PrepCard({ prep, count, onClick, t, lang }) {
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
            <i className="fas fa-book"></i> {count} {t('lectures.pageTitle')}
          </span>
          <span className="prep-cta">
            {t('common.view')} <i className={`fas ${lang === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}`}></i>
          </span>
        </div>
      </div>
    </button>
  )
}

function LectureCard({ lec, isAdmin, onOpen, onDelete, t }) {
  return (
    <article className="lec-card">
      <div className="lec-card-cover">
        <img src={lec.cover} alt={lec.title} loading="lazy" />
        <div className="lec-card-cover-grad"></div>
        <div className="lec-card-ribbon">
          <i className="fas fa-circle-play"></i> {t('lectures.pageTitle')}
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
            <i className="fas fa-eye"></i> {t('lectures.open')}
          </button>
          {lec.pdf_url && (
            <a
              className="lec-btn lec-btn-ghost"
              href={lec.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <i className="fas fa-download"></i> {t('lectures.download')}
            </a>
          )}
          {isAdmin && (
            <button className="lec-btn lec-btn-danger lec-btn-icon" onClick={onDelete} title={t('common.delete')}>
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
