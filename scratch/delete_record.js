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
    console.log('Authenticating...')
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: '01099999999@masaar.app',
      password: '12345678'
    })
    if (authErr) throw authErr

    const recordId = 'ec310d04-bd89-45b1-b2e5-6650ec6d3faf'
    console.log(`Deleting record: ${recordId}`)
    const { data, error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', recordId)
      
    if (error) throw error
    console.log('Successfully deleted the wrong attendance record for medo!')

  } catch (err) {
    console.error('Error:', err)
  }
}
run()
