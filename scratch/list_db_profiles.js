import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(url, key)

async function listProfiles() {
  console.log('Logging in as Admin...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: '01099999999@masaar.app',
    password: '12345678'
  })

  if (authError) {
    console.error('Failed to log in as admin:', authError)
    return
  }

  console.log('Successfully logged in!')
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, role, tenant_id, is_active, is_approved')
  
  if (error) {
    console.error('Error fetching profiles:', error)
  } else {
    console.log('Profiles found:', data)
  }
}

listProfiles()
