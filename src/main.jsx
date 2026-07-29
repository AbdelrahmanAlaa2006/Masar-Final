import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Prevent accidental mouse-wheel value changes on ALL <input type="number"> elements site-wide
if (typeof window !== 'undefined') {
  window.addEventListener('wheel', (e) => {
    const isNumberInput = (el) => el && el.tagName === 'INPUT' && el.type === 'number'
    if (isNumberInput(e.target) || isNumberInput(document.activeElement)) {
      e.preventDefault()
      if (isNumberInput(e.target)) e.target.blur()
      if (isNumberInput(document.activeElement)) document.activeElement.blur()
    }
  }, { passive: false })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
