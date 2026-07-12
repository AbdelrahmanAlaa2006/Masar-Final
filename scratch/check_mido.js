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

    // 1. Find profile named "ميدو" or similar
    console.log('Searching for student profiles with name containing "ميدو" or "mido"...')
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, name, grade, role')
      .or('name.ilike.%ميدو%,name.ilike.%mido%')

    if (profileErr) throw profileErr
    console.log('Matching profiles:', profiles)

    if (!profiles || profiles.length === 0) {
      console.log('No profile found containing "ميدو" or "mido"')
      return
    }

    const studentIds = profiles.map(p => p.id)

    // 2. Find attendance records for these profiles
    console.log('\nSearching for attendance records for these students...')
    const { data: records, error: recordErr } = await supabase
      .from('attendance_records')
      .select(`
        id,
        student_id,
        status,
        session_id,
        created_at,
        notes,
        sessions:session_id (
          id,
          title,
          date,
          grade
        )
      `)
      .in('student_id', studentIds)

    if (recordErr) throw recordErr
    console.log('Found attendance records:', JSON.stringify(records, null, 2))

    if (records.length === 0) {
      console.log('No attendance records found for these students.')
      return
    }

    // Deleting mismatched records
    console.log('\nProcessing attendance records for Mido...')
    for (const record of records) {
      const studentProfile = profiles.find(p => p.id === record.student_id)
      const sessionGrade = record.sessions?.grade
      const studentGrade = studentProfile?.grade

      console.log(`Checking record ${record.id}: Student Grade = ${studentGrade}, Session Grade = ${sessionGrade}`)
      
      // The user says: "ميدو جربت اضيفه اضاف عادى شيله من الشكف الى اتضاف فيه"
      // They tried to add Mido (who is 2nd prep / تانيه اعدادي) to a 1st prep (اولى اعدادي) session.
      // So delete the record if it is in a different grade session!
      if (studentGrade !== sessionGrade) {
        console.log(`Deleting mismatch record: ${record.id} for student ${studentProfile.name} in session "${record.sessions?.title}"`)
        const { error: delErr } = await supabase
          .from('attendance_records')
          .delete()
          .eq('id', record.id)
        if (delErr) {
          console.error(`Failed to delete record ${record.id}:`, delErr)
        } else {
          console.log(`Successfully deleted record ${record.id}`)
        }
      }
    }

  } catch (err) {
    console.error('Error running script:', err)
  }
}

run()
