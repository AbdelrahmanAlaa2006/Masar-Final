import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const { data, error } = await supabase
    .from('homeworks')
    .select('reveal_grades')
    .limit(1)

  if (error) {
    console.error('Error selecting reveal_grades:', error)
  } else {
    console.log('Successfully selected reveal_grades column!', data)
  }
}

main()
