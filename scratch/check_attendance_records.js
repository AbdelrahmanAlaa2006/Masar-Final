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
  
  console.log("Fetching attendance_records...")
  const { data: records, error: err } = await supabase
    .from('attendance_records')
    .select(`
      id,
      student_id,
      status,
      session_id,
      notes,
      attendance_sessions (
        title,
        date
      ),
      student:profiles!attendance_records_student_id_fkey (
        name
      )
    `)
  
  if (err) {
    console.error("Error:", err)
    return
  }
  
  console.log(`Total attendance records in DB: ${records?.length}`)
  records?.forEach((r, i) => {
    console.log(`[${i+1}] Student: ${r.student?.name} | Status: ${r.status} | Session: ${r.attendance_sessions?.title} (${r.attendance_sessions?.date})`)
  })
}

main()
