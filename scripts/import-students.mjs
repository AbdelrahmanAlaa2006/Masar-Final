// Usage:  node scripts/import-students.mjs students.csv
// Requires env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const [,, csvPath] = process.argv
if (!csvPath) { console.error('usage: node scripts/import-students.mjs <file.csv>'); process.exit(1) }

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(url, key, { auth: { persistSession: false } })

// Tiny CSV parser — good enough for a sheet of names/phones.
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  const header = lines.shift().split(',').map(s => s.trim())
  return lines.map(line => {
    const cells = line.split(',').map(s => s.trim())
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
  })
}

const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))
const GRADES = new Set(['first-prep', 'second-prep', 'third-prep'])

let ok = 0, skipped = 0, failed = 0

for (const r of rows) {
  const { name, phone, password, grade } = r
  if (!name || !phone || !password || !GRADES.has(grade)) {
    console.warn(`skip: bad row ${JSON.stringify(r)}`); skipped++; continue
  }
  const email = `${phone}@masaar.app`

  // 1) create the auth user (auto-confirmed so login works immediately)
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone, role: 'student' },
  })
  if (authErr) {
    // already exists? grab the existing id so we can still set the grade.
    if (authErr.message?.toLowerCase().includes('already')) {
      console.warn(`exists: ${phone} — updating grade only`)
    } else {
      console.error(`fail ${phone}: ${authErr.message}`); failed++; continue
    }
  }

  const userId = created?.user?.id
    ?? (await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle()).data?.id
  if (!userId) { console.error(`no id for ${phone}`); failed++; continue }

  // 2) set the grade (profile row exists via trigger or prior import)
  const { error: upErr } = await supabase
    .from('profiles')
    .update({ name, phone, grade, role: 'student' })
    .eq('id', userId)
  if (upErr) { console.error(`grade fail ${phone}: ${upErr.message}`); failed++; continue }

  console.log(`ok: ${name} (${phone}) → ${grade}`)
  ok++
}

console.log(`\ndone — ok=${ok} skipped=${skipped} failed=${failed}`)