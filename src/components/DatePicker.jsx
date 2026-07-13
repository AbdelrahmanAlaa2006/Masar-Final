import React, { useState, useRef, useEffect } from 'react'
import './DatePicker.css'

/* ---------------------------------------------------------------------------
   Premium, self-contained date picker (no dependency). RTL, Arabic months,
   gradient-accented selection, today ring, keyboard-free simple UX. Emits and
   accepts the same `YYYY-MM-DD` string as a native <input type="date">, so it's
   a drop-in replacement anywhere.
   --------------------------------------------------------------------------- */

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const AR_DOW = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseISO = (s) => {
  if (!s) return null
  const [y, m, d] = String(s).split('-').map(Number)
  return (y && m && d) ? new Date(y, m - 1, d) : null
}
const sameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function DatePicker({ value = '', onChange, placeholder = 'اختر يومًا', style }) {
  const [open, setOpen] = useState(false)
  const selected = parseISO(value)
  const [view, setView] = useState(() => selected || new Date())
  const ref = useRef(null)

  useEffect(() => { const s = parseISO(value); if (s) setView(s) }, [value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const today = new Date()
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  const label = selected ? `${selected.getDate()} ${AR_MONTHS[selected.getMonth()]} ${selected.getFullYear()}` : placeholder
  const pick = (d) => { onChange && onChange(toISO(d)); setOpen(false) }
  const clear = () => { onChange && onChange('') }

  return (
    <div className="dpk" ref={ref} dir="rtl" style={style}>
      <button type="button" className={`dpk-trigger ${selected ? 'has-val' : ''} ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        <i className="fas fa-calendar-day dpk-tico" />
        <span className="dpk-label">{label}</span>
        {selected
          ? <i className="fas fa-xmark dpk-x" title="مسح" onClick={(e) => { e.stopPropagation(); clear() }} />
          : <i className="fas fa-chevron-down dpk-caret" />}
      </button>

      {open && (
        <div className="dpk-pop">
          <div className="dpk-head">
            <button type="button" className="dpk-nav" onClick={() => setView(new Date(year, month - 1, 1))} aria-label="السابق"><i className="fas fa-chevron-right" /></button>
            <div className="dpk-title">{AR_MONTHS[month]} <span>{year}</span></div>
            <button type="button" className="dpk-nav" onClick={() => setView(new Date(year, month + 1, 1))} aria-label="التالي"><i className="fas fa-chevron-left" /></button>
          </div>

          <div className="dpk-dow">{AR_DOW.map(d => <span key={d}>{d}</span>)}</div>

          <div className="dpk-grid">
            {cells.map((d, i) => d
              ? (
                <button
                  key={i}
                  type="button"
                  className={`dpk-day ${sameDay(d, selected) ? 'sel' : ''} ${sameDay(d, today) ? 'today' : ''}`}
                  onClick={() => pick(d)}
                >{d.getDate()}</button>
              )
              : <span key={i} className="dpk-empty" />)}
          </div>

          <div className="dpk-foot">
            <button type="button" className="dpk-foot-btn" onClick={() => { clear(); setOpen(false) }}>مسح</button>
            <button type="button" className="dpk-foot-btn primary" onClick={() => pick(selected || new Date())}>تأكيد</button>
          </div>
        </div>
      )}
    </div>
  )
}
