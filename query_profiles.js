import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const email = '012571179-mona-chem@masaar.app'
  const password = 'password123'

  console.log('Logging in as:', email)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('Login failed:', authError)
    return
  }

  console.log('Login successful. Querying profile...')
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone', '012571179')

  if (error) {
    console.error('Error querying profiles:', error)
  } else {
    console.log('Profiles with phone 012571179:', JSON.stringify(data, null, 2))
  }
}

main()
