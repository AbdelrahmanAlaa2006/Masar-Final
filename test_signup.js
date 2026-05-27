import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const phone = '012571179';
  const email = `${phone}-mona-chem@masaar.app`
  const password = 'password123'
  const tenantId = '46c9da75-7682-47aa-8a27-0e517cdfdcdc' // Mona Chem ID from query output

  console.log('Attempting sign up for email:', email)
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { 
        name: 'Ahmed Test', 
        phone: phone, 
        role: 'student', 
        grade: 'first-prep',
        tenant_id: tenantId // Let's try BOTH with and without this metadata
      },
    },
  })

  if (error) {
    console.error('Sign Up Error:', error)
  } else {
    console.log('Sign Up Success:', JSON.stringify(data, null, 2))
  }
}

main()
