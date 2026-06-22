import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log("Updating English tenant in database...")
  
  // Find current row for 'sherif-english'
  const { data: current, error: fetchErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'sherif-english')
    .maybeSingle()

  if (fetchErr) {
    console.error("Error fetching tenant:", fetchErr)
    return
  }

  if (!current) {
    console.error("English tenant not found with slug 'sherif-english'")
    return
  }

  console.log("Current tenant data:", current)

  const updatedConfig = {
    ...current.config,
    subject: 'english'
  }

  const { data: updated, error: updateErr } = await supabase
    .from('tenants')
    .update({
      name: 'The Miracle in English',
      slug: 'waled-english', // Changing slug to waled-english matches our branding
      primary_color: '#1b439c', // light mode primary
      secondary_color: '#df8d27', // light mode secondary
      config: updatedConfig
    })
    .eq('id', current.id)
    .select('*')

  if (updateErr) {
    console.error("Error updating tenant:", updateErr)
  } else {
    console.log("Tenant successfully updated:", updated)
  }
}

main()
