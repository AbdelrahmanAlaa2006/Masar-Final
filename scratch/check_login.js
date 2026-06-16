import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function test(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.log(`Failed for ${email}:`, error.message)
  } else {
    console.log(`Success for ${email}!`)
  }
}

async function main() {
  await test('01064483036@masaar.app', 'msr-3036')
  await test('01099999999@masaar.app', '12345678')
}

main()
