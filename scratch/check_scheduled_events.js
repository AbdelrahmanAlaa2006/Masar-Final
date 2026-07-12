import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log("Checking if scheduled_events table exists...")
  const { data, error } = await supabase
    .from('scheduled_events')
    .select('*')
    .limit(1)

  if (error) {
    console.error("Error fetching from scheduled_events:", error.message)
    console.error("Full error object:", error)
  } else {
    console.log("scheduled_events table exists!")
    if (data && data.length > 0) {
      console.log("Columns:", Object.keys(data[0]))
      console.log("Sample event:", data[0])
    } else {
      console.log("Table is empty, but it exists.")
    }
  }
}

main()
