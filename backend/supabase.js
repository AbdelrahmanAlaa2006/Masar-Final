import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill both values.'
  )
}

/* Session lives in sessionStorage instead of the default localStorage,
   so closing the browser/tab logs the user out — they must sign in
   again next visit. Refreshing the page mid-session still keeps them
   in (sessionStorage survives reloads, just not new browsing
   sessions). */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
})
