import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log("Checking tenants table...")
  const { data: tenants, error: err } = await supabase
    .from('tenants')
    .select('*')
  
  if (err) {
    console.error("Error fetching tenants:", err)
  } else {
    console.log("Tenants found:", tenants)
  }

  console.log("Checking tenants selection query from TenantContext...")
  const { data: qData, error: qErr } = await supabase
    .from('tenants')
    .select(`
      *,
      tenant_settings (*),
      tenant_features (*)
    `)
  console.log("Result of querying nested relations:", { qData, qErr })
}

main()
