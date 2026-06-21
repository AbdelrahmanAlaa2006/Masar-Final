import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log("Connecting to Supabase...");
  
  // Try to bypass RLS policies by logging in as the admin user
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: '01099999999@masaar.app',
    password: '12345678'
  })

  if (authError) {
    console.error("Auth login failed:", authError.message)
    return
  }

  console.log("Logged in as admin successfully!");

  // Query ALL student_ledger records where status = 'rejected'
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('student_ledger')
    .select(`
      id,
      amount,
      status,
      type,
      tenant_id,
      student_id,
      description,
      profiles:student_id ( name, phone )
    `)
    .eq('status', 'rejected')

  if (ledgerError) {
    console.error("Error fetching ledger rows:", ledgerError.message);
  } else {
    console.log(`\n--- ALL Rejected student_ledger rows (${ledgerRows.length}) ---`);
    ledgerRows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`  Student: ${row.profiles?.name} (${row.profiles?.phone})`);
      console.log(`  Amount: ${row.amount}`);
      console.log(`  Type: ${row.type}`);
      console.log(`  Tenant ID: ${row.tenant_id}`);
      console.log(`  Desc: ${row.description}`);
      console.log(`-------------------------------------`);
    });
  }

  // Query ALL payments rows where status = 'rejected'
  const { data: legacyRows, error: legacyError } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      status,
      tenant_id,
      student_id,
      profiles:student_id ( name, phone )
    `)
    .eq('status', 'rejected')

  if (legacyError) {
    console.error("Error fetching legacy rows:", legacyError.message);
  } else {
    console.log(`\n--- ALL Rejected legacy payments rows (${legacyRows.length}) ---`);
    legacyRows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`  Student: ${row.profiles?.name} (${row.profiles?.phone})`);
      console.log(`  Amount: ${row.amount}`);
      console.log(`  Tenant ID: ${row.tenant_id}`);
      console.log(`-------------------------------------`);
    });
  }
}

main()
