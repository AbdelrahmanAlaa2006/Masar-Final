import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const TABLES = [
  'tenants',
  'grades',
  'groups',
  'branches',
  'academic_years',
  'profiles',
  'student_groups',
  'attendance_sessions',
  'attendance_records',
  'payments',
  'financial_ledger',
  'subscription_fees',
  'student_discounts',
  'homeworks',
  'homework_submissions',
  'exams',
  'exam_attempts',
  'exam_questions',
  'exam_shared_text_blocks',
  'booklets',
  'student_booklets',
  'videos',
  'video_notes',
  'video_comments',
  'playlists',
  'packages',
  'announcements'
]

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupDir = path.join(process.cwd(), 'backups', `backup_${timestamp}`)

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  console.log(`\n🚀 Starting Database Backup: ${timestamp}`)
  console.log(`📁 Target Directory: ${backupDir}\n`)

  const summary = {}

  for (const table of TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')

      if (error) {
        console.warn(`⚠️ Table [${table}]: Skipped (${error.message})`)
        continue
      }

      const count = data ? data.length : 0
      const filePath = path.join(backupDir, `${table}.json`)
      fs.writeFileSync(filePath, JSON.stringify(data || [], null, 2), 'utf8')
      console.log(`✓ Table [${table}]: Exported ${count} rows`)
      summary[table] = count
    } catch (err) {
      console.warn(`⚠️ Table [${table}]: Error (${err.message})`)
    }
  }

  // Save manifest summary
  fs.writeFileSync(
    path.join(backupDir, '_summary.json'),
    JSON.stringify({ timestamp, tables_summary: summary }, null, 2),
    'utf8'
  )

  console.log(`\n🎉 Backup Completed Successfully! Saved in: backups/backup_${timestamp}\n`)
}

backup()
