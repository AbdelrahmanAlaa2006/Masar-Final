import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log('Logging in as admin...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: '01099999999@masaar.app',
    password: '12345678'
  })

  if (authError) {
    console.error('Admin login failed:', authError)
    return
  }

  console.log('Admin login successful. Inserting a temporary test exam...')
  const testExam = {
    title: 'Temporary Test Exam for Migration Verification',
    questions: [
      { text: 'Question 1', points: 5 },
      { text: 'Question 2', points: 5 },
      { text: 'Question 3', points: 10 }
    ],
    grade: 'first-prep',
    duration_minutes: 30,
    total_points: 20
  }

  const { data: insertData, error: insertError } = await supabase
    .from('exams')
    .insert([testExam])
    .select('id, title, questions_count, questions')

  if (insertError) {
    console.error('Error inserting test exam:', insertError)
    return
  }

  console.log('Successfully inserted test exam:')
  console.log(JSON.stringify(insertData, null, 2))

  if (insertData && insertData.length > 0) {
    const createdId = insertData[0].id
    console.log(`Deleting temporary exam with id: ${createdId}...`)
    const { error: deleteError } = await supabase
      .from('exams')
      .delete()
      .eq('id', createdId)

    if (deleteError) {
      console.error('Error deleting test exam:', deleteError)
    } else {
      console.log('Cleaned up test exam successfully.')
    }
  }
}

main()
