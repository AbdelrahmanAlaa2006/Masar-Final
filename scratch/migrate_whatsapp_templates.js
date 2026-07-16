import './env.js'
import { createClient } from '@supabase/supabase-js'
import { renderNotificationTemplate } from '../backend/whatsappTemplates.js'

const SUPABASE_URL = "https://zphnjirmcrolqjrhjjqt.supabase.co"
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG5qaXJtY3JvbHFqcmhqanF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NTUwOSwiZXhwIjoyMDkyMzcxNTA5fQ.rU0dGuhEK-CCufehF24FpS5YyQy1OsQXQT612rga5bs"

// Service role client to bypass RLS and read data for migration
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const isDryRun = process.argv.includes('--execute') === false
  console.log("====================================================================")
  console.log(`WhatsApp Notification Queue Migration - Mode: ${isDryRun ? 'DRY-RUN (No updates)' : 'EXECUTE (Applying changes)'}`)
  console.log("====================================================================")

  // 1. Fetch all pending WhatsApp notifications
  const { data: pending, error } = await supabase
    .from('unified_notifications')
    .select('*')
  
  if (error) {
    console.error("Failed to query unified_notifications:", error)
    return
  }

  const pendingWhatsapp = (pending || []).filter(row => row.status?.whatsapp === 'pending')
  console.log(`Total notifications in database: ${pending?.length || 0}`)
  console.log(`Total pending WhatsApp notifications: ${pendingWhatsapp.length}`)
  console.log("--------------------------------------------------------------------")

  let migratedCount = 0
  let skippedCount = 0

  // Pre-load all tenants to avoid repeated network requests
  const { data: tenantList } = await supabase.from('tenants').select('*')
  const tenantsMap = new Map((tenantList || []).map(t => [t.id, t]))

  for (const notif of pendingWhatsapp) {
    const tenant = tenantsMap.get(notif.tenant_id)
    if (!tenant) {
      console.log(`[ID: ${notif.id}] SKIPPED: Tenant not found in database.`)
      skippedCount++
      continue
    }

    // A. Check if notification has a structured attendance record link
    if (notif.attendance_record_id) {
      try {
        // Query original attendance record
        const { data: attRecord, error: recordError } = await supabase
          .from('attendance_records')
          .select('student_id, session_id, status')
          .eq('id', notif.attendance_record_id)
          .maybeSingle()

        if (recordError || !attRecord) {
          console.log(`[ID: ${notif.id}] SKIPPED: Original attendance record (${notif.attendance_record_id}) no longer exists.`)
          skippedCount++
          continue
        }

        // Query student profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, group')
          .eq('id', attRecord.student_id)
          .maybeSingle()

        if (!profile) {
          console.log(`[ID: ${notif.id}] SKIPPED: Student profile (${attRecord.student_id}) no longer exists.`)
          skippedCount++
          continue
        }

        // Query session details
        const { data: session } = await supabase
          .from('attendance_sessions')
          .select('title, date, group_id')
          .eq('id', attRecord.session_id)
          .maybeSingle()

        if (!session) {
          console.log(`[ID: ${notif.id}] SKIPPED: Session (${attRecord.session_id}) no longer exists.`)
          skippedCount++
          continue
        }

        // Query group details if session is grouped
        let groupName = ''
        if (session.group_id) {
          const { data: group } = await supabase
            .from('groups')
            .select('name')
            .eq('id', session.group_id)
            .maybeSingle()
          groupName = group?.name || ''
        } else {
          groupName = profile.group || ''
        }

        const dateObj = new Date(session.date)
        const dateLabel = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
        const dayLabel = dateObj.toLocaleDateString('ar-EG', { weekday: 'long' })

        // Prepare structured payload
        const payload = {
          student_name: profile.name,
          lesson_name: session.title || 'الدرس',
          group_name: groupName,
          date: dateLabel,
          day_name: dayLabel,
          attendance_status: attRecord.status === 'absent' ? 'تغيب' : 'حضر متأخراً'
        }

        // Render template dynamically
        const newText = await renderNotificationTemplate({
          tenant,
          notification_type: attRecord.status === 'absent' ? 'attendance_absent' : 'attendance_makeup',
          locale: 'ar-EG',
          payload
        })

        console.log(`[ID: ${notif.id}] MATCH FOUND (Attendance): ${profile.name} - ${payload.attendance_status}`)
        console.log(`  Old Message: ${notif.message.replace(/\n/g, ' ')}`)
        console.log(`  New Message: ${newText.replace(/\n/g, ' ')}`)

        if (!isDryRun) {
          const { error: updateError } = await supabase
            .from('unified_notifications')
            .update({ message: newText })
            .eq('id', notif.id)

          if (updateError) {
            console.error(`  Error updating row:`, updateError.message)
            skippedCount++
            continue
          }
          console.log(`  -> Row updated successfully.`)
        }

        migratedCount++
      } catch (err) {
        console.error(`[ID: ${notif.id}] Error migrating row:`, err)
        skippedCount++
      }
    } else {
      // B. Notification does not have an attendance link (e.g. grade_added or others)
      // Under strict requirements: we do NOT parse message text, so they are kept exactly as-is.
      console.log(`[ID: ${notif.id}] UNMATCHED (Type: ${notif.type}): Original structured source data reference is not present. Leaving untouched.`)
      skippedCount++
    }
    console.log("--------------------------------------------------------------------")
  }

  console.log("====================================================================")
  console.log("MIGRATION SUMMARY:")
  console.log(`Total analyzed: ${pendingWhatsapp.length}`)
  console.log(`Migrated/Updated: ${migratedCount}`)
  console.log(`Skipped/Untouched: ${skippedCount}`)
  console.log("====================================================================")
}

main()
