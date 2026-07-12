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
  
  console.log("Logged in user:", authData?.user?.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData?.user?.id)
    .single()
  console.log("Admin profile:", profile)

  const { data: tenants } = await supabase
    .from('tenants')
    .select('*')
  console.log("All tenants:", tenants)
}

main()
