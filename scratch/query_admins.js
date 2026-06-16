import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, role, tenant_id')
    .eq('role', 'admin')

  if (error) {
    console.error('Error fetching admin profiles:', error)
  } else {
    console.log('Admin profiles:', JSON.stringify(data, null, 2))
  }
}

main()
