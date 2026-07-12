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
  
  console.log("Fetching groups...")
  const { data: groups, error: err } = await supabase
    .from('groups')
    .select('*')
  
  if (err) {
    console.error("Error:", err)
    return
  }
  
  console.log("Groups in DB:", groups)
}

main()
