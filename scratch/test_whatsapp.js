import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function sendGatewayMessage(gatewayConfig, phone, message) {
  const { type, url, token } = gatewayConfig

  if (type === 'whatsapp_evolution') {
    if (!url || !token) throw new Error('بيانات Evolution API غير مكتملة (العنوان أو المفتاح مفقود)')
    const instanceUrl = url.endsWith('/') ? url : `${url}/`

    console.log(`Sending WhatsApp message via Evolution API to ${phone}...`)
    const response = await fetch(instanceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': token
      },
      body: JSON.stringify({
        number: phone,
        text: message,
        options: {
          delay: 1200,
          presence: 'composing'
        }
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Evolution API Error (${response.status}): ${errText || 'فشل الاتصال بالخادم'}`)
    }
    return true
  }

  throw new Error(`Unsupported/unconfigured gateway type: ${type}`)
}

async function main() {
  const email = '01099999999@masaar.app'
  const password = '12345678'

  console.log('Logging in as admin...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('Login failed:', authError)
    return
  }

  // Check CLI arguments
  const args = process.argv.slice(2)
  const targetPhone = args[0]
  const customMessage = args[1] || 'رسالة تجريبية من منصة مسار التعليمية لتأكيد إعدادات الاتصال بنجاح. ✅'

  if (!targetPhone) {
    console.log('\nUsage: node scratch/test_whatsapp.js <phone_number> "[optional message]"\n')
    console.log('Retrieving current gateway configuration from database...')
  }

  // Get tenant config
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, name, config')
    .eq('id', 'd3b07384-d113-4ec2-a5d6-d005b6be4979')
    .single()

  if (error) {
    console.error('Error fetching tenant:', error)
    return
  }

  const gatewayConfig = tenant.config?.gateway
  console.log('\nCurrent Gateway Settings:')
  console.log(JSON.stringify(gatewayConfig, null, 2))

  if (!gatewayConfig) {
    console.error('\nError: No gateway config set for the tenant. Please configure it in the Admin Control Panel first.')
    return
  }

  if (targetPhone) {
    try {
      console.log(`\nAttempting to send test message to: ${targetPhone}`)
      await sendGatewayMessage(gatewayConfig, targetPhone, customMessage)
      console.log('Success! Message sent successfully.')
    } catch (err) {
      console.error('\nError sending message:', err.message)
    }
  } else {
    // Check pending queue
    const { count, error: queueError } = await supabase
      .from('parent_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (queueError) {
      console.error('Error checking queue:', queueError)
    } else {
      console.log(`\nPending notifications in queue: ${count || 0}`)
      console.log('To send a test message, run:')
      console.log('  node scratch/test_whatsapp.js YOUR_PHONE_NUMBER')
    }
  }
}

main()
