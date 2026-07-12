import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function main() {
  const { data, error } = await supabase.rpc('get_table_constraints', { table_name: 'grades' })
  // Since the RPC might not exist, let's run a raw query using SQL if we can, 
  // or we can select from information_schema.table_constraints via a general query,
  // or write a quick anonymous PG block and execute it if we have database client access.
  // Actually, we can run a SQL statement if we create/call an RPC or use a migration file.
  // Let's write a simple RPC or query pg_catalog.
  const { data: constraints, error: cError } = await supabase
    .from('grades')
    .select('*')
    .limit(1)

  console.log('grades sample:', constraints, cError)
}

main()
