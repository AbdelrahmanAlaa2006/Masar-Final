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
  
  console.log("Signed in successfully.")
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('*')
    .limit(1)
  console.log("Tenants:", tenant)

  const { data: groups, error: gErr } = await supabase
    .from('groups')
    .select('*')
  console.log("Groups:", groups)

  const { data: students, error: sErr } = await supabase
    .from('profiles')
    .select('id, name, grade, group')
    .eq('role', 'student')
  console.log("Students:", students)
}

main()
