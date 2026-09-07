import React, { useState, useRef, useEffect } from 'react'
import './DatePicker.css'

/* ---------------------------------------------------------------------------
   Ultra-Luxury DateTimePicker (Zero Dependency).
   - Arabic RTL month/weekday names.
   - Interactive steppers & direct numeric typing for Hours, Minutes & Seconds.
   - Every single minute (00-59) and second (00-59) fully selectable.
   - Instant live sync with parent `onChange`.
   - Arabic AM/PM (ص / م) period switcher.
   - Quick one-tap presets.
   - Solid dark glassmorphic container with zero clipping and high contrast.
   --------------------------------------------------------------------------- */

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const AR_DOW = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const AR_DAYS_FULL = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const pad = (n) => String(n ?? 0).padStart(2, '0')

const formatToDateTimeLocal = (date) => {
  if (!date || isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  const sec = pad(date.getSeconds())
  return `${y}-${m}-${d}T${h}:${min}:${sec}`
}

const parseDateTimeLocal = (str) => {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

const sameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function DateTimePicker({
  value = '',
  onChange,
  placeholder = 'اختر التاريخ والوقت',
  style,
  id
}) {
  const [open, setOpen] = useState(false)
  const selectedDate = parseDateTimeLocal(value)
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date())

  // Time state (12h format + min + sec + AM/PM)
  const initialHour24 = selectedDate ? selectedDate.getHours() : new Date().getHours()
  const initialMin = selectedDate ? selectedDate.getMinutes() : 0
  const initialSec = selectedDate ? selectedDate.getSeconds() : 0

  const [selectedHour12, setSelectedHour12] = useState(() => {
    const h = initialHour24 % 12
    return h === 0 ? 12 : h
  })
  const [selectedMinute, setSelectedMinute] = useState(() => initialMin)
  const [selectedSecond, setSelectedSecond] = useState(() => initialSec)
  const [selectedPeriod, setSelectedPeriod] = useState(() => (initialHour24 >= 12 ? 'PM' : 'AM'))
  const [activeDate, setActiveDate] = useState(() => selectedDate || new Date())

  const ref = useRef(null)

  useEffect(() => {
    const parsed = parseDateTimeLocal(value)
    if (parsed) {
      setViewDate(parsed)
      setActiveDate(parsed)
      const h24 = parsed.getHours()
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12
      setSelectedHour12(h12)
      setSelectedMinute(parsed.getMinutes())
      setSelectedSecond(parsed.getSeconds())
      setSelectedPeriod(h24 >= 12 ? 'PM' : 'AM')
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Calendar calculations
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  // Build the 24h date from state
  const buildDateObject = (datePart, h12, min, sec, period) => {
    const base = new Date(datePart || new Date())
    let h24 = parseInt(h12 || 12, 10)
    if (period === 'PM' && h24 < 12) h24 += 12
    if (period === 'AM' && h24 === 12) h24 = 0
    base.setHours(h24, parseInt(min || 0, 10), parseInt(sec || 0, 10), 0)
    return base
  }

  const updateAndEmit = (d, h, m, s, p) => {
    const finalDate = buildDateObject(d, h, m, s, p)
    onChange && onChange(formatToDateTimeLocal(finalDate))
  }

  const handleApply = () => {
    updateAndEmit(activeDate, selectedHour12, selectedMinute, selectedSecond, selectedPeriod)
    setOpen(false)
  }

  const handleDatePick = (d) => {
    setActiveDate(d)
    updateAndEmit(d, selectedHour12, selectedMinute, selectedSecond, selectedPeriod)
  }

  // Steppers for hour, minute, second
  const stepHour = (delta) => {
    let next = selectedHour12 + delta
    if (next > 12) next = 1
    if (next < 1) next = 12
    setSelectedHour12(next)
    updateAndEmit(activeDate, next, selectedMinute, selectedSecond, selectedPeriod)
  }

  const stepMinute = (delta) => {
    let next = selectedMinute + delta
    if (next > 59) next = 0
    if (next < 0) next = 59
    setSelectedMinute(next)
    updateAndEmit(activeDate, selectedHour12, next, selectedSecond, selectedPeriod)
  }

  const stepSecond = (delta) => {
    let next = selectedSecond + delta
    if (next > 59) next = 0
    if (next < 0) next = 59
    setSelectedSecond(next)
    updateAndEmit(activeDate, selectedHour12, selectedMinute, next, selectedPeriod)
  }

  const handleHourChange = (e) => {
    const val = parseInt(e.target.value, 10)
    if (isNaN(val)) {
      setSelectedHour12(1)
      return
    }
    const clamped = Math.max(1, Math.min(12, val))
    setSelectedHour12(clamped)
    updateAndEmit(activeDate, clamped, selectedMinute, selectedSecond, selectedPeriod)
  }

  const handleMinuteChange = (e) => {
    const val = parseInt(e.target.value, 10)
    if (isNaN(val)) {
      setSelectedMinute(0)
      return
    }
    const clamped = Math.max(0, Math.min(59, val))
    setSelectedMinute(clamped)
    updateAndEmit(activeDate, selectedHour12, clamped, selectedSecond, selectedPeriod)
  }

  const handleSecondChange = (e) => {
    const val = parseInt(e.target.value, 10)
    if (isNaN(val)) {
      setSelectedSecond(0)
      return
    }
    const clamped = Math.max(0, Math.min(59, val))
    setSelectedSecond(clamped)
    updateAndEmit(activeDate, selectedHour12, selectedMinute, clamped, selectedPeriod)
  }

  const setPeriod = (p) => {
    setSelectedPeriod(p)
    updateAndEmit(activeDate, selectedHour12, selectedMinute, selectedSecond, p)
  }

  const handleQuickPreset = (preset) => {
    const now = new Date()
    let target = new Date()
    if (preset === 'now') {
      target = now
    } else if (preset === 'today_evening') {
      target.setHours(18, 0, 0, 0)
    } else if (preset === 'tomorrow_morning') {
      target.setDate(target.getDate() + 1)
      target.setHours(9, 0, 0, 0)
    } else if (preset === 'tomorrow_evening') {
      target.setDate(target.getDate() + 1)
      target.setHours(18, 0, 0, 0)
    } else if (preset === 'in_2_days') {
      target.setDate(target.getDate() + 2)
      target.setHours(12, 0, 0, 0)
    }

    setViewDate(target)
    setActiveDate(target)
    const h24 = target.getHours()
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    setSelectedHour12(h12)
    setSelectedMinute(target.getMinutes())
    setSelectedSecond(target.getSeconds())
    setSelectedPeriod(h24 >= 12 ? 'PM' : 'AM')

    onChange && onChange(formatToDateTimeLocal(target))
    setOpen(false)
  }

  const clear = () => {
    onChange && onChange('')
  }

  // Format label for display
  const getDisplayLabel = () => {
    if (!selectedDate) return placeholder
    const dow = AR_DAYS_FULL[selectedDate.getDay()]
    const d = selectedDate.getDate()
    const m = AR_MONTHS[selectedDate.getMonth()]
    const y = selectedDate.getFullYear()
    let h24 = selectedDate.getHours()
    const min = pad(selectedDate.getMinutes())
    const sec = pad(selectedDate.getSeconds())
    const p = h24 >= 12 ? 'م' : 'ص'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return `${dow}، ${d} ${m} ${y} — ${pad(h12)}:${min}:${sec} ${p}`
  }

  return (
    <div
      className={`dpk dtpk ${open ? 'is-open' : ''}`}
      ref={ref}
      dir="rtl"
      style={{
        zIndex: open ? 9999999 : 1,
        position: 'relative',
        ...style
      }}
    >
      <button
        type="button"
        id={id}
        className={`dpk-trigger ${selectedDate ? 'has-val' : ''} ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fas fa-clock dpk-tico" />
        <span className="dpk-label">{getDisplayLabel()}</span>
        {selectedDate ? (
          <i
            className="fas fa-xmark dpk-x"
            title="مسح"
            onClick={(e) => {
              e.stopPropagation()
              clear()
            }}
          />
        ) : (
          <i className="fas fa-chevron-down dpk-caret" />
        )}
      </button>

      {open && (
        <div className="dpk-pop dtpk-pop">
          {/* Quick presets */}
          <div className="dtpk-presets">
            <button type="button" onClick={() => handleQuickPreset('now')}>الآن ⚡</button>
            <button type="button" onClick={() => handleQuickPreset('today_evening')}>اليوم 6:00 م</button>
            <button type="button" onClick={() => handleQuickPreset('tomorrow_morning')}>غداً 9:00 ص</button>
            <button type="button" onClick={() => handleQuickPreset('tomorrow_evening')}>غداً 6:00 م</button>
            <button type="button" onClick={() => handleQuickPreset('in_2_days')}>بعد يومين</button>
          </div>

          {/* Month/Year Navigation */}
          <div className="dpk-head">
            <button
              type="button"
              className="dpk-nav"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              aria-label="الشهر السابق"
            >
              <i className="fas fa-chevron-right" />
            </button>
            <div className="dpk-title">
              {AR_MONTHS[month]} <span>{year}</span>
            </div>
            <button
              type="button"
              className="dpk-nav"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              aria-label="الشهر التالي"
            >
              <i className="fas fa-chevron-left" />
            </button>
          </div>

          {/* Day of Week Headers */}
          <div className="dpk-dow">
            {AR_DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="dpk-grid">
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  className={`dpk-day ${sameDay(d, activeDate) ? 'sel' : ''} ${sameDay(d, today) ? 'today' : ''}`}
                  onClick={() => handleDatePick(d)}
                >
                  {d.getDate()}
                </button>
              ) : (
                <span key={i} className="dpk-empty" />
              )
            )}
          </div>

          {/* Time Picker Card (Interactive Steppers & Numeric Inputs) */}
          <div className="dtpk-time-card">
            <div className="dtpk-time-header">
              <span className="dtpk-time-title">
                <i className="fas fa-clock" /> تحديد الوقت بدقة (ساعة : دقيقة : ثانية)
              </span>
            </div>

            <div className="dtpk-time-spinners-row">
              {/* Hour Column */}
              <div className="dtpk-spinner-col">
                <button
                  type="button"
                  className="dtpk-spin-btn"
                  onClick={() => stepHour(1)}
                  title="زيادة الساعة"
                >
                  <i className="fas fa-chevron-up" />
                </button>
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="dtpk-spin-input"
                  value={pad(selectedHour12)}
                  onChange={handleHourChange}
                />
                <button
                  type="button"
                  className="dtpk-spin-btn"
                  onClick={() => stepHour(-1)}
                  title="إنقاص الساعة"
                >
                  <i className="fas fa-chevron-down" />
                </button>
                <span className="dtpk-spin-lbl">ساعة</span>
              </div>

              <span className="dtpk-spin-sep">:</span>

              {/* Minute Column (00 - 59 Every single minute) */}
              <div className="dtpk-spinner-col">
                <button
                  type="button"
                  className="dtpk-spin-btn"
                  onClick={() => stepMinute(1)}
                  title="زيادة الدقيقة"
                >
                  <i className="fas fa-chevron-up" />
                </button>
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="dtpk-spin-input"
                  value={pad(selectedMinute)}
                  onChange={handleMinuteChange}
                />
                <button
                  type="button"
                  className="dtpk-spin-btn"
                  onClick={() => stepMinute(-1)}
                  title="إنقاص الدقيقة"
                >
                  <i className="fas fa-chevron-down" />
                </button>
                <span className="dtpk-spin-lbl">دقيقة</span>
              </div>

              <span className="dtpk-spin-sep">:</span>

              {/* Second Column (00 - 59 Every single second) */}
              <div className="dtpk-spinner-col">
                <button
                  type="button"
                  className="dtpk-spin-btn"
                  onClick={() => stepSecond(1)}
                  title="زيادة الثانية"
                >
                  <i className="fas fa-chevron-up" />
                </button>
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="dtpk-spin-input"
                  value={pad(selectedSecond)}
                  onChange={handleSecondChange}
                />
                <button
                  type="button"
                  className="dtpk-spin-btn"
                  onClick={() => stepSecond(-1)}
                  title="إنقاص الثانية"
                >
                  <i className="fas fa-chevron-down" />
                </button>
                <span className="dtpk-spin-lbl">ثانية</span>
              </div>

              {/* AM / PM Period Column */}
              <div className="dtpk-period-col">
                <button
                  type="button"
                  className={`dtpk-ampm-btn ${selectedPeriod === 'AM' ? 'active' : ''}`}
                  onClick={() => setPeriod('AM')}
                >
                  ص
                </button>
                <button
                  type="button"
                  className={`dtpk-ampm-btn ${selectedPeriod === 'PM' ? 'active' : ''}`}
                  onClick={() => setPeriod('PM')}
                >
                  م
                </button>
                <span className="dtpk-spin-lbl">الفترة</span>
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="dpk-foot">
            <button
              type="button"
              className="dpk-foot-btn"
              onClick={() => {
                clear()
                setOpen(false)
              }}
            >
              مسح
            </button>
            <button type="button" className="dpk-foot-btn primary" onClick={handleApply}>
              تأكيد وحفظ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
