import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function main() {
  const { data, error } = await supabase
    .from('grades')
    .select('id, type, title, score, max_score, created_at')
    
  if (error) {
    console.error('Error fetching grades:', error)
    return
  }

  console.log(`Total grades in table: ${data.length}`)
  
  const quizzes = data.filter(g => 
    g.title.includes('تسميع') || 
    g.title.includes('التسميع') ||
    g.type === 'quiz'
  )

  console.log(`Found ${quizzes.length} records that look like quizzes:`)
  quizzes.forEach((q, idx) => {
    console.log(`[${idx+1}] ID: ${q.id} | Type: ${q.type} | Title: ${q.title} | Score: ${q.score}/${q.max_score}`)
  })
}

main()
