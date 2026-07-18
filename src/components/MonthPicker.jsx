import React, { useState, useRef, useEffect } from 'react'
import './DatePicker.css'

/* ---------------------------------------------------------------------------
   Premium month picker — same design system as DatePicker (shared CSS).
   RTL, Arabic month names, gradient-accented selection, current-month ring.
   Emits and accepts the same `YYYY-MM` string as a native <input type="month">.
   --------------------------------------------------------------------------- */

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const parseYM = (s) => {
  if (!s) return null
  const [y, m] = String(s).split('-').map(Number)
  return (y && m) ? { y, m } : null
}
const toYM = (y, m) => `${y}-${String(m).padStart(2, '0')}`

export default function MonthPicker({ value = '', onChange, placeholder = 'اختر شهرًا', style }) {
  const [open, setOpen] = useState(false)
  const selected = parseYM(value)
  const now = new Date()
  const [viewYear, setViewYear] = useState(() => selected?.y || now.getFullYear())
  const ref = useRef(null)

  useEffect(() => { const s = parseYM(value); if (s) setViewYear(s.y) }, [value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label = selected ? `${AR_MONTHS[selected.m - 1]} ${selected.y}` : placeholder
  const pick = (m) => { onChange && onChange(toYM(viewYear, m)); setOpen(false) }
  const clear = () => { onChange && onChange('') }
  const isSel = (m) => selected && selected.y === viewYear && selected.m === m
  const isNow = (m) => now.getFullYear() === viewYear && now.getMonth() + 1 === m

  return (
    <div className="dpk" ref={ref} dir="rtl" style={style}>
      <button type="button" className={`dpk-trigger ${selected ? 'has-val' : ''} ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        <i className="fas fa-calendar-days dpk-tico" />
        <span className="dpk-label">{label}</span>
        {selected
          ? <i className="fas fa-xmark dpk-x" title="مسح" onClick={(e) => { e.stopPropagation(); clear() }} />
          : <i className="fas fa-chevron-down dpk-caret" />}
      </button>

      {open && (
        <div className="dpk-pop">
          <div className="dpk-head">
            <button type="button" className="dpk-nav" onClick={() => setViewYear(y => y - 1)} aria-label="السنة السابقة"><i className="fas fa-chevron-right" /></button>
            <div className="dpk-title"><span>{viewYear}</span></div>
            <button type="button" className="dpk-nav" onClick={() => setViewYear(y => y + 1)} aria-label="السنة التالية"><i className="fas fa-chevron-left" /></button>
          </div>

          <div className="dpk-mgrid">
            {AR_MONTHS.map((name, i) => (
              <button
                key={name}
                type="button"
                className={`dpk-month ${isSel(i + 1) ? 'sel' : ''} ${isNow(i + 1) ? 'today' : ''}`}
                onClick={() => pick(i + 1)}
              >{name}</button>
            ))}
          </div>

          <div className="dpk-foot">
            <button type="button" className="dpk-foot-btn" onClick={() => { clear(); setOpen(false) }}>مسح</button>
            <button type="button" className="dpk-foot-btn primary" onClick={() => { onChange && onChange(toYM(now.getFullYear(), now.getMonth() + 1)); setOpen(false) }}>الشهر الحالي</button>
          </div>
        </div>
      )}
    </div>
  )
}
