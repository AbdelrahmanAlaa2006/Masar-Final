import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log("Signing in...")
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: '01099999999@masaar.app',
    password: '12345678'
  })
  
  if (authError) {
    console.error("Auth error:", authError)
    return
  }
  
  console.log("Signed in successfully. Fetching profiles...")
  const { data: students, error: err } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'student')
  
  if (err) {
    console.error("Error fetching profiles:", err)
    return
  }
  
  console.log(`Total students in DB: ${students.length}`)
  console.log("\nDetails of all students:")
  students.forEach((s, i) => {
    console.log(`\n[${i+1}] ID: ${s.id}`)
    console.log(`    Name: ${s.name}`)
    console.log(`    Role: ${s.role}`)
    console.log(`    Grade: ${s.grade}`)
    console.log(`    Is Approved: ${s.is_approved}`)
    console.log(`    Branch ID: ${s.branch_id}`)
    console.log(`    Academic Year ID: ${s.academic_year_id}`)
    console.log(`    Group: ${s.group}`)
  })
}

main()
