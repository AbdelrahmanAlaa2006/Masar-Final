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
    const { count: profileCount, error: err1 } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    console.log('Total profiles:', profileCount, err1)

    const { count: recordCount, error: err2 } = await supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
    console.log('Total attendance records:', recordCount, err2)

    // Fetch first 10 students
    const { data: students, error: err3 } = await supabase
      .from('profiles')
      .select('id, name, grade, role')
      .eq('role', 'student')
      .limit(20)
    console.log('First 20 students in database:')
    students?.forEach(s => console.log(`- ${s.name} (${s.grade}) [${s.id}]`))

  } catch (err) {
    console.error(err)
  }
}
run()
