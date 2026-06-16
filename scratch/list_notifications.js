import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const email = '01099999999@masaar.app'
  const password = '12345678'

  console.log('Logging in...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('Login failed:', authError)
    return
  }

  console.log('Login successful. Fetching notifications queue summary...')
  const { data, error } = await supabase
    .from('parent_notifications')
    .select('*')
    .limit(10)

  if (error) {
    console.error('Error fetching parent_notifications:', error)
  } else {
    console.log('Sample parent notifications:', JSON.stringify(data, null, 2))
  }
}

main()
