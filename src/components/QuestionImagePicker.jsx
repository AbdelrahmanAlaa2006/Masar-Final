import React, { useState, useRef } from 'react'
import { uploadQuestionImage } from '@backend/quizImagesApi'

/**
 * Per-question image attachment.
 * Renders a small drop/click area when no image is set, or a preview chip
 * with a remove button when one is. Uploads go to the `quiz-images` Supabase
 * Storage bucket and the resulting public URL is returned via onChange.
 *
 * Props:
 *   value:    string | null  — current public URL
 *   onChange: (url: string | '') => void
 *   label:    string         — small label shown above (default: "صورة للسؤال")
 */
export default function QuestionImagePicker({ value, onChange, label = 'صورة السؤال (اختياري)' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const userId = (() => {
    try { return JSON.parse(sessionStorage.getItem('masar-user'))?.id || null }
    catch { return null }
  })()

  const handleFile = async (file) => {
    if (!file) return
    setErr('')
    setBusy(true)
    try {
      const url = await uploadQuestionImage(file, { userId })
      onChange(url)
    } catch (e) {
      setErr(e.message || 'فشل رفع الصورة')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onPick = (e) => handleFile(e.target.files?.[0])
  const onDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files?.[0])
  }

  // ── Has an image: preview chip ──
  if (value) {
    return (
      <div className="qip-wrap" style={wrapStyle}>
        <div style={labelStyle}>
          <i className="fas fa-image" style={{ color: '#667eea' }}></i> {label}
        </div>
        <div style={previewStyle}>
          <img src={value} alt="صورة السؤال" style={imgStyle} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              style={smallBtn('#667eea')}
            >
              <i className="fas fa-arrows-rotate"></i> تغيير
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={busy}
              style={smallBtn('#dc2626')}
            >
              <i className="fas fa-trash"></i> حذف
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} hidden />
      </div>
    )
  }

  // ── Empty state: compact dropzone ──
  return (
    <div className="qip-wrap" style={wrapStyle}>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={dropStyle(busy)}
      >
        {busy ? (
          <><i className="fas fa-spinner fa-spin"></i>&nbsp; جارٍ رفع الصورة...</>
        ) : (
          <>
            <i className="fas fa-image" style={{ color: '#667eea' }}></i>
            &nbsp; <span>{label} — اسحب صورة هنا أو اضغط للاختيار</span>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} hidden />
      </label>
      {err && (
        <div style={errStyle}>
          <i className="fas fa-circle-exclamation"></i>&nbsp; {err}
        </div>
      )}
    </div>
  )
}

const wrapStyle = { margin: '8px 0' }
const labelStyle = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--text-muted, #718096)',
  marginBottom: 6,
}
const dropStyle = (busy) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 14px',
  border: '1.5px dashed rgba(102, 126, 234, 0.4)',
  borderRadius: 10,
  background: 'rgba(102, 126, 234, 0.05)',
  cursor: busy ? 'wait' : 'pointer',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary, #4a5568)',
  textAlign: 'center',
})
const previewStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 10,
  border: '1px solid var(--border-light, #e2e8f0)',
  borderRadius: 10,
  background: 'var(--page-bg-secondary, #fff)',
  flexWrap: 'wrap',
}
const imgStyle = {
  width: 110,
  height: 80,
  objectFit: 'cover',
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.08)',
  background: '#000',
}
const smallBtn = (color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 8,
  border: `1.5px solid ${color}55`,
  background: `${color}10`,
  color: color,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
})
const errStyle = {
  marginTop: 6,
  padding: '6px 10px',
  borderRadius: 6,
  background: 'rgba(239, 68, 68, 0.1)',
  color: '#dc2626',
  fontSize: 12,
  fontWeight: 600,
}
