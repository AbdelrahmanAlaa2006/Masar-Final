import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, config')
    .eq('id', 'd3b07384-d113-4ec2-a5d6-d005b6be4979')
    .single()

  if (error) {
    console.error('Error fetching tenant:', error)
  } else {
    console.log('Tenant gateway config:', JSON.stringify(data.config?.gateway || null, null, 2))
  }
}

main()
