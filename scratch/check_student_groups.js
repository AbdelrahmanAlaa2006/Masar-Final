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
  
  console.log("Fetching student_groups...")
  const { data: studentGroups, error: err } = await supabase
    .from('student_groups')
    .select(`
      id,
      student_id,
      group_id,
      groups (
        id,
        name,
        grade
      ),
      profiles (
        name
      )
    `)
  
  if (err) {
    console.error("Error:", err)
    return
  }
  
  console.log("Student Groups assignments in DB:")
  studentGroups.forEach((sg, i) => {
    console.log(`[${i+1}] Student: ${sg.profiles?.name} (ID: ${sg.student_id})`)
    console.log(`    Group: ${sg.groups?.name} (ID: ${sg.group_id}, Grade: ${sg.groups?.grade})`)
  })
}

main()
