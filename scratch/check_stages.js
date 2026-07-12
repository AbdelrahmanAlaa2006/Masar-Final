import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, slug, name, config')
  
  tenants.forEach(t => {
    console.log(`Tenant: ${t.name} (Slug: ${t.slug})`)
    if (t.config?.stages) {
      console.log(`  Stages:`, JSON.stringify(t.config.stages, null, 2))
    } else {
      console.log(`  No config.stages`)
    }
  })
}

main()
