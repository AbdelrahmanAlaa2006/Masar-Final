import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/* Deep link to one item on a list page, e.g. /exams?exam=<id>.
   Once the page has loaded, scrolls the element with id `focus-<id>` into
   view and highlights it briefly. Runs once per URL value. The element must
   render `id={`focus-${item.id}`}`. */
export function useFocusItem(param, ready) {
  const location = useLocation()
  const done = useRef(null)

  useEffect(() => {
    const id = new URLSearchParams(location.search).get(param)
    if (!ready || !id || done.current === id) return
    // Wait a frame so the list has painted.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`focus-${id}`)
      if (!el) return
      done.current = id
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('focus-flash')
      setTimeout(() => el.classList.remove('focus-flash'), 2600)
    })
    return () => cancelAnimationFrame(raf)
  }, [param, ready, location.search])
}
