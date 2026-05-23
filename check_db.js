import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  // Let's list student profiles using RPC or direct queries.
  // Wait, let's see if we can do a select on profiles with a column that might not exist, or see what columns are in profiles by calling a simple query.
  const { data, error } = await supabase
    .from('profiles')
    .select('name, phone, grade, group')
    .limit(1)

  if (error) {
    console.error('Error selecting profiles columns:', error)
  } else {
    console.log('Columns name, phone, grade, group exist!', data)
  }
}

main()
