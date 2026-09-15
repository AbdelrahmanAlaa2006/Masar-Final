import { createClient } from '@supabase/supabase-js'
import { authStore } from './authStorage'

const env = (typeof import.meta.env !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})) || {}
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill both values.'
  )
}

/* The session is stored through authStore, which routes it either to
   sessionStorage (logged out when the tab or app closes) or to localStorage
   (stays logged in on this device). Students stay logged in by default;
   staff only when they tick «تذكرني». See ./authStorage. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? authStore : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
})
