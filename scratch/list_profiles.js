import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const email = '01099999999@masaar.app'
  const password = '12345678'

  console.log('Logging in as:', email)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('Login failed:', authError)
    return
  }

  console.log('Login successful. Querying profiles...')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, role, tenant_id')
    .limit(10)

  if (error) {
    console.error('Error querying profiles:', error)
  } else {
    console.log('Sample profiles:', JSON.stringify(data, null, 2))
  }
}

main()
