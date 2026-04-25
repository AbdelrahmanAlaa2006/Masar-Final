// Usage:  node scripts/import-admins.mjs admins.csv
// Requires env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const [,, csvPath] = process.argv
if (!csvPath) { console.error('usage: node scripts/import-admins.mjs <file.csv>'); process.exit(1) }

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(url, key, { auth: { persistSession: false } })

// Tiny CSV parser
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  const header = lines.shift().split(',').map(s => s.trim())
  return lines.map(line => {
    const cells = line.split(',').map(s => s.trim())
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
  })
}

const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))

let ok = 0, skipped = 0, failed = 0

for (const r of rows) {
  const { name, phone, password } = r
  if (!name || !phone || !password) {
    console.warn(`skip: bad row ${JSON.stringify(r)}`); skipped++; continue
  }
  const email = `${phone}@masaar.app`

  // 1) create the auth user (auto-confirmed so login works immediately)
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone, role: 'admin' },
  })
  if (authErr) {
    if (authErr.message?.toLowerCase().includes('already')) {
      console.warn(`exists: ${phone} — updating role only`)
    } else {
      console.error(`fail ${phone}: ${authErr.message}`); failed++; continue
    }
  }

  const userId = created?.user?.id
    ?? (await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle()).data?.id
  if (!userId) { console.error(`no id for ${phone}`); failed++; continue }

  // 2) set the role to admin in the profiles table
  const { error: upErr } = await supabase
    .from('profiles')
    .update({ name, phone, role: 'admin' })
    .eq('id', userId)
  if (upErr) { console.error(`role fail ${phone}: ${upErr.message}`); failed++; continue }

  console.log(`ok: ${name} (${phone}) → admin`)
  ok++
}

console.log(`\ndone — ok=${ok} skipped=${skipped} failed=${failed}`)
