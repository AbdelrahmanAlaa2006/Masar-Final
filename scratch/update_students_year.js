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
  
  console.log("Signed in. Updating profiles with null academic_year_id...")
  const { data, error } = await supabase
    .from('profiles')
    .update({ academic_year_id: 'c4c53d68-49d8-4057-b39d-cc5cf81d8f78' })
    .eq('role', 'student')
    .is('academic_year_id', null)
    .select()

  if (error) {
    console.error("Error updating profiles:", error)
  } else {
    console.log(`Successfully updated ${data?.length || 0} profiles:`)
    data?.forEach(s => {
      console.log(`- ${s.name} (Grade: ${s.grade})`)
    })
  }
}

main()
