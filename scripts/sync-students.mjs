// Usage:
//   node scripts/sync-students.mjs scripts/students.csv           (dry-run)
//   node scripts/sync-students.mjs scripts/students.csv --apply   (actually delete)
//
// Treats the CSV as the source of truth for student accounts:
//   1. Every row in the CSV is upserted (created or its grade updated).
//   2. Any `profiles` row with role='student' whose phone is NOT in the
//      CSV is deleted from BOTH `profiles` and `auth.users`.
//
// Run without --apply first to preview what will be removed. Phones are
// normalised to digits-only before comparison so "01234..." and "1234..."
// match the same student.
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const csvPath = args.find(a => !a.startsWith('--'))
if (!csvPath) {
  console.error('usage: node scripts/sync-students.mjs <file.csv> [--apply]')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  const header = lines.shift().split(',').map(s => s.trim())
  return lines.map(line => {
    const cells = line.split(',').map(s => s.trim())
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
  })
}

// Strip leading zeros + non-digits so the same student doesn't appear
// twice once with a leading "0" and once without.
const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0+/, '')

const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))
const GRADES = new Set(['first-prep', 'second-prep', 'third-prep'])
const csvPhones = new Set()

console.log(apply ? '⚙️  APPLY mode — changes will be written' : '🔍 DRY-RUN — no changes will be written')
console.log(`📄 ${rows.length} rows in CSV\n`)

// ── 1) Upsert everyone in the CSV ───────────────────────────────
let ok = 0, skipped = 0, failed = 0
for (const r of rows) {
  const { name, phone, password, grade } = r
  if (!name || !phone || !password || !GRADES.has(grade)) {
    console.warn(`skip: bad row ${JSON.stringify(r)}`); skipped++; continue
  }
  csvPhones.add(normPhone(phone))
  const email = `${phone}@masaar.app`

  if (!apply) { console.log(`would upsert: ${name} (${phone}) → ${grade}`); ok++; continue }

  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name, phone, role: 'student' },
  })
  if (authErr && !authErr.message?.toLowerCase().includes('already')) {
    console.error(`fail ${phone}: ${authErr.message}`); failed++; continue
  }
  const userId = created?.user?.id
    ?? (await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle()).data?.id
  if (!userId) { console.error(`no id for ${phone}`); failed++; continue }

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ name, phone, grade, role: 'student' })
    .eq('id', userId)
  if (upErr) { console.error(`grade fail ${phone}: ${upErr.message}`); failed++; continue }
  console.log(`ok: ${name} (${phone}) → ${grade}`)
  ok++
}

// ── 2) Delete every student NOT in the CSV ──────────────────────
console.log('\n🧹 scanning for orphaned student accounts...')
const { data: dbStudents, error: listErr } = await supabase
  .from('profiles')
  .select('id, name, phone')
  .eq('role', 'student')
if (listErr) {
  console.error('failed to list profiles:', listErr.message)
  process.exit(1)
}

const orphans = (dbStudents || []).filter(s => !csvPhones.has(normPhone(s.phone)))
console.log(`found ${orphans.length} student(s) not in CSV`)

let deleted = 0, deleteFailed = 0
for (const s of orphans) {
  if (!apply) {
    console.log(`would delete: ${s.name} (${s.phone}) [id ${s.id}]`)
    continue
  }
  // Auth-side delete cascades to the profiles row via the FK that
  // references auth.users(id). If your schema doesn't cascade, the
  // profiles delete below is the safety net.
  const { error: delAuthErr } = await supabase.auth.admin.deleteUser(s.id)
  if (delAuthErr) {
    console.error(`delete auth fail ${s.phone}: ${delAuthErr.message}`)
    deleteFailed++; continue
  }
  await supabase.from('profiles').delete().eq('id', s.id)
  console.log(`deleted: ${s.name} (${s.phone})`)
  deleted++
}

console.log(
  `\ndone — upserted=${ok} skipped=${skipped} failed=${failed} ` +
  `${apply ? `deleted=${deleted} deleteFailed=${deleteFailed}` : `would-delete=${orphans.length}`}`
)
if (!apply && orphans.length > 0) {
  console.log('\n👉 re-run with --apply to actually delete the orphans above.')
}
