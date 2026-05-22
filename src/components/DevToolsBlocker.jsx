import React from 'react'
import './DevToolsBlocker.css'

export default function DevToolsBlocker() {
  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="devtools-blocker-overlay">
      <div className="devtools-blocker-card">
        <div className="devtools-lock-container">
          {/* A premium, modern 3D-styled SVG Padlock */}
          <svg
            className="devtools-lock-svg"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="shackle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c7d2fe" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="40%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <filter id="lock-shadow" x="-10%" y="-10%" width="130%" height="130%">
                <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000" floodOpacity="0.3" />
              </filter>
            </defs>

            {/* Padlock Shackle */}
            <path
              d="M 30 45 L 30 32 A 20 20 0 0 1 70 32 L 70 45"
              stroke="url(#shackle-grad)"
              strokeWidth="10"
              strokeLinecap="round"
              fill="none"
            />

            {/* Padlock Body */}
            <rect
              x="20"
              y="42"
              width="60"
              height="46"
              rx="14"
              fill="url(#body-grad)"
              filter="url(#lock-shadow)"
            />

            {/* Keyhole / Lock Pin */}
            <circle cx="50" cy="58" r="5" fill="#1e1b4b" />
            <path
              d="M 47.5 58 L 52.5 58 L 54 74 L 46 74 Z"
              fill="#1e1b4b"
            />
          </svg>
        </div>

        <h1 className="devtools-blocker-title">Access Denied</h1>
        
        <p className="devtools-blocker-desc">
          Developer tools are not allowed on this platform.<br />
          Please close DevTools and refresh the page to continue.
        </p>

        <button
          className="devtools-blocker-btn"
          onClick={handleRefresh}
          aria-label="Refresh Page"
        >
          Refresh Page
        </button>
      </div>
    </div>
  )
}
