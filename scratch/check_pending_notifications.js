import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://zphnjirmcrolqjrhjjqt.supabase.co"
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG5qaXJtY3JvbHFqcmhqanF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NTUwOSwiZXhwIjoyMDkyMzcxNTA5fQ.rU0dGuhEK-CCufehF24FpS5YyQy1OsQXQT612rga5bs"

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const { data, error } = await supabase
    .from('unified_notifications')
    .select('type, status')
  
  if (error) {
    console.error("Error fetching notification types:", error)
    return
  }
  
  const counts = {}
  for (const row of data) {
    const isPending = row.status?.whatsapp === 'pending'
    const key = `${row.type} (pending: ${isPending})`
    counts[key] = (counts[key] || 0) + 1
  }
  console.log("Notification type/status counts:", counts)
}

main()
