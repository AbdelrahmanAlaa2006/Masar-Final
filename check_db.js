import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const { data, error } = await supabase
    .from('videos')
    .insert({ title: 'Test PDF Column Check Temp', grade: 'first-sec', active_hours: 1 })
    .select()

  console.log('Insert attempt output:', { data, error })
  
  if (data && data.length > 0) {
    await supabase.from('videos').delete().eq('id', data[0].id)
  }
}

main()
