import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kbnxopmenafcvfyffzjx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibnhvcG1lbmFmY3ZmeWZmemp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDI2NzcsImV4cCI6MjA5MTQxODY3N30.b2WBu7aKhhI9N_3um_E50wQOypMsO7sjvViPiuwwfjU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
