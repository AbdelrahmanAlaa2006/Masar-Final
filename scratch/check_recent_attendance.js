import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  try {
    console.log('Authenticating as teacher/admin...')
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: '01099999999@masaar.app',
      password: '12345678'
    })

    if (authErr) throw authErr
    console.log('Authenticated successfully as:', authData.user.email)

    console.log('Fetching attendance records created recently...')
    // Fetch last 50 attendance records
    const { data: records, error: recordErr } = await supabase
      .from('attendance_records')
      .select(`
        id,
        student_id,
        status,
        session_id,
        created_at,
        notes,
        profiles:student_id (
          id,
          name,
          grade
        ),
        sessions:session_id (
          id,
          title,
          date,
          grade
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (recordErr) throw recordErr

    console.log(`Found ${records.length} recent records:`)
    for (const r of records) {
      console.log(`RecordID: ${r.id} | Student: ${r.profiles?.name} (${r.profiles?.grade}) | Session: ${r.sessions?.title} (${r.sessions?.grade}) | CreatedAt: ${r.created_at}`)
    }

  } catch (err) {
    console.error('Error running script:', err)
  }
}

run()
