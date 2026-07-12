import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log("Signing in...")
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: '01099999999@masaar.app',
    password: '12345678'
  })
  
  console.log("Querying single row from attendance_sessions...")
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error("Error:", error)
  } else {
    console.log("Columns in attendance_sessions:", data && data.length > 0 ? Object.keys(data[0]) : "No rows found")
  }
}

main()
