import React, { useState, useEffect, useRef } from 'react'
import {
  SEASONAL_THEMES,
  setSeasonOverride,
  getSeasonOverride,
  useSeasonalTheme,
} from '../../seasonal/useSeasonalTheme'
import { findThemeForDate, todayIso } from '../../seasonal/themes'

const ICONS = {
  ramadan:    'fa-moon',
  'eid-fitr': 'fa-cookie-bite',
  'eid-adha': 'fa-mosque',
  christmas:  'fa-snowflake',
}

function formatRange({ start, end }) {
  const fmt = (iso) => new Date(iso).toLocaleDateString('ar-EG', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  return `${fmt(start)} — ${fmt(end)}`
}

export default function SeasonalThemePanel() {
  const active = useSeasonalTheme()
  const [override, setOverride] = useState(() => getSeasonOverride() || 'auto')
  const [cycleIdx, setCycleIdx] = useState(-1) // -1 = idle
  const cycleSavedRef = useRef(null)
  const CYCLE_MS = 8000
  const isCycling = cycleIdx >= 0

  const apply = (value) => {
    if (isCycling) stopCycle({ restore: false })
    setOverride(value)
    if (value === 'auto') setSeasonOverride(null)
    else setSeasonOverride(value)
  }

  const startCycle = () => {
    cycleSavedRef.current = getSeasonOverride()
    setCycleIdx(0)
  }
  const stopCycle = ({ restore = true } = {}) => {
    setCycleIdx(-1)
    if (restore) {
      const saved = cycleSavedRef.current
      cycleSavedRef.current = null
      if (!saved) {
        setSeasonOverride(null)
        setOverride('auto')
      } else {
        setSeasonOverride(saved)
        setOverride(saved)
      }
    }
  }

  useEffect(() => {
    if (cycleIdx < 0) return
    const theme = SEASONAL_THEMES[cycleIdx]
    if (!theme) { stopCycle({ restore: true }); return }
    setSeasonOverride(theme.id)
    setOverride(theme.id)
    const t = setTimeout(() => {
      if (cycleIdx + 1 >= SEASONAL_THEMES.length) {
        stopCycle({ restore: true })
      } else {
        setCycleIdx(cycleIdx + 1)
      }
    }, CYCLE_MS)
    return () => clearTimeout(t)
  }, [cycleIdx])

  useEffect(() => {
    return () => {
      if (cycleSavedRef.current !== null) {
        const saved = cycleSavedRef.current
        cycleSavedRef.current = null
        if (!saved) setSeasonOverride(null)
        else setSeasonOverride(saved)
      }
    }
  }, [])

  const nextRange = (theme) => {
    const today = todayIso()
    const upcoming = (theme.ranges || [])
      .find((r) => r.end >= today)
    return upcoming || null
  }

  const autoTheme = findThemeForDate()

  return (
    <section className="cp-panel">
      <div className="cp-panel-header">
        <h2><i className="fas fa-moon"></i> السمات الموسمية</h2>
        <p>
          تتبدّل ألوان وزخارف الموقع تلقائياً حسب المناسبة (رمضان، الأعياد، الشتاء).
          يمكنك تعطيلها أو إجبارها على سمة معيّنة من هنا.
        </p>
      </div>

      <div className="cp-stats-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <button
          className={`cp-btn ${override === 'auto' && !isCycling ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          onClick={() => apply('auto')}
          disabled={isCycling}
        >
          <i className="fas fa-wand-magic-sparkles"></i> تلقائي حسب التاريخ
        </button>
        <button
          className={`cp-btn ${override === 'none' && !isCycling ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          onClick={() => apply('none')}
          disabled={isCycling}
        >
          <i className="fas fa-ban"></i> تعطيل التزيين
        </button>
        <button
          className={`cp-btn ${isCycling ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          onClick={() => isCycling ? stopCycle({ restore: true }) : startCycle()}
        >
          {isCycling ? (
            <>
              <i className="fas fa-stop"></i>
              {' '}إيقاف المعاينة (
                {SEASONAL_THEMES[cycleIdx]?.label || ''}
                {' '}{cycleIdx + 1}/{SEASONAL_THEMES.length})
            </>
          ) : (
            <>
              <i className="fas fa-play"></i> تجربة كل السمات الآن
            </>
          )}
        </button>
      </div>

      {override === 'auto' && (
        <div className="cp-empty" style={{ marginTop: 12, padding: 14 }}>
          <i className={`fas ${autoTheme ? 'fa-check-circle' : 'fa-circle-info'}`}
             style={{ color: autoTheme ? '#16a34a' : '#64748b' }} />
          <p>
            {autoTheme
              ? `السمة المفعّلة الآن: ${autoTheme.label}`
              : 'لا توجد سمة موسمية مفعّلة الآن — السمة الأساسية فقط.'}
          </p>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        {SEASONAL_THEMES.map((t) => {
          const next = nextRange(t)
          const isCurrentlyActive = active?.id === t.id
          const isPicked = override === t.id
          return (
            <button
              key={t.id}
              onClick={() => apply(t.id)}
              className={`cp-target ${isPicked ? 'is-active' : ''}`}
              style={{ padding: 14, borderRadius: 14, textAlign: 'start' }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 56, height: 56, borderRadius: 14,
                  flexShrink: 0,
                  background: `linear-gradient(135deg, ${t.vars['--season-accent']}, ${t.vars['--season-accent-soft']})`,
                  boxShadow: t.vars['--season-glow'] || '0 0 14px rgba(0,0,0,0.15)',
                  display: 'grid', placeItems: 'center',
                  color: '#fff', fontSize: 22,
                }}
              >
                <i className={`fas ${ICONS[t.id] || 'fa-star'}`}></i>
              </div>
              <div className="cp-target-body">
                <div className="cp-target-name">
                  <span>{t.label}</span>
                  {isCurrentlyActive && (
                    <span className="cp-id-pill cp-id-pill-active">
                      <i className="fas fa-circle-check"></i> مفعّلة الآن
                    </span>
                  )}
                </div>
                <div className="cp-target-sub">
                  {next ? (
                    <span>
                      <i className="fas fa-calendar-day"></i>
                      {' '}{formatRange(next)}
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>
                      <i className="fas fa-circle-exclamation"></i>
                      {' '}أضِف نطاقات تواريخ في themes.js
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
