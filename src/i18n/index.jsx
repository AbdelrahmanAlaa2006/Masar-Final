import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { ar } from './ar'
import { en } from './en'

/* Lightweight i18n. We avoided pulling in i18next because the app's
   needs are modest: two languages, JSX-friendly lookups, and a global
   direction flip. The provider stores the active language in
   localStorage and reflects it on <html dir/lang> so every CSS rule
   that already uses logical properties (inset-inline-*, padding-inline-*)
   works without modification.

   Usage:
     const { t, lang, setLang } = useI18n()
     <h1>{t('home.welcome')}</h1>
*/

const DICTS = { ar, en }
const LangCtx = createContext({ lang: 'ar', setLang: () => {}, t: (k) => k })

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem('masar-lang')
      if (saved === 'ar' || saved === 'en') return saved
    } catch {}
    return 'ar'
  })

  useEffect(() => {
    try { localStorage.setItem('masar-lang', lang) } catch {}
    document.documentElement.setAttribute('lang', lang)
    document.documentElement.setAttribute('dir', 'rtl') // DO NOT ROTATE PAGE
    document.body.classList.toggle('lang-ar', lang === 'ar')
    document.body.classList.toggle('lang-en', lang === 'en')
  }, [lang])

  const setLang = useCallback((next) => {
    if (next === 'ar' || next === 'en') setLangState(next)
  }, [])

  /* Resolve a dotted key like 'header.logout' against the active dict.
     Falls back to the AR dict, then the key itself, so missing strings
     are visible during development without crashing the page.
     Supports simple {placeholder} interpolation via the second arg. */
  const t = useCallback((key, vars) => {
    const fromActive = lookup(DICTS[lang], key)
    const value = fromActive ?? lookup(DICTS.ar, key)
    
    if (value === undefined) return undefined // Let inline fallbacks trigger

    if (vars && typeof value === 'string') {
      return value.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`))
    }
    return value
  }, [lang])

  return (
    <LangCtx.Provider value={{ lang, setLang, t }}>
      {children}
    </LangCtx.Provider>
  )
}

function lookup(obj, key) {
  if (!obj) return undefined
  const parts = key.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p]
    else return undefined
  }
  return cur
}

export function useI18n() {
  return useContext(LangCtx)
}

// Convenience hook when only the translator function is needed.
export function useT() {
  return useContext(LangCtx).t
}
