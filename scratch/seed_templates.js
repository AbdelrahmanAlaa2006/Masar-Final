import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://zphnjirmcrolqjrhjjqt.supabase.co"
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG5qaXJtY3JvbHFqcmhqanF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NTUwOSwiZXhwIjoyMDkyMzcxNTA5fQ.rU0dGuhEK-CCufehF24FpS5YyQy1OsQXQT612rga5bs"

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const MOHAMED_ABDELLA_TEMPLATES = {
  attendance_absent: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد تغيب اليوم *{{day_name}}*

بتاريخ *{{date}}*

عن حصة *{{lesson_name}}*

مجموعة الساعة *{{group_name}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`,

  attendance_makeup: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حضر متأخراً اليوم *{{day_name}}*

بتاريخ *{{date}}*

عن حصة *{{lesson_name}}*

مجموعة الساعة *{{group_name}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`,

  quiz: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حصل على درجة

*{{grade}}*

من

*{{total_grade}}*

في تسميع

*{{quiz_name}}*

بتاريخ

*{{date}}*

من درس

*{{lesson_name}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`,

  exam: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حصل على درجة

*{{grade}}*

من

*{{total_grade}}*

في امتحان

*{{exam_name}}*

بتاريخ

*{{date}}*

من درس

*{{lesson_name}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`,

  homework: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حصل على درجة

*{{grade}}*

من

*{{total_grade}}*

في واجب

*{{homework_name}}*

بتاريخ

*{{date}}*

من درس

*{{lesson_name}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`,

  payment: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

يرجى العلم بضرورة سداد المصروفات المستحقة لكورس *{{course_name}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`,

  behavior: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حصل على درجة تقييم سلوكي ومشاركة

*{{grade}}*

من

*{{total_grade}}*

بتاريخ

*{{date}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`,

  participation: `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حصل على درجة تقييم سلوكي ومشاركة

*{{grade}}*

من

*{{total_grade}}*

بتاريخ

*{{date}}*

مع تحيات
أ/ محمد عبداللاه

للتواصل معنا على رقم

0453176310
01155731401

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`
}

async function main() {
  // Find Mohamed Abdella tenant ID
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', 'mohamed-abdella')
    .single()

  if (tenantError || !tenant) {
    console.error("Error finding Mohamed Abdella tenant:", tenantError)
    return
  }

  const tenantId = tenant.id
  console.log(`Seeding templates for tenant mohamed-abdella (ID: ${tenantId})...`)

  for (const [type, templateText] of Object.entries(MOHAMED_ABDELLA_TEMPLATES)) {
    // Check if active template exists
    const { data: existing } = await supabase
      .from('whatsapp_templates')
      .select('id, version')
      .eq('tenant_id', tenantId)
      .eq('notification_type', type)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      console.log(`Template for ${type} already exists. Skipping...`)
      continue
    }

    const { error: insertError } = await supabase
      .from('whatsapp_templates')
      .insert({
        tenant_id: tenantId,
        notification_type: type,
        template: templateText.trim(),
        version: 1,
        is_active: true
      })

    if (insertError) {
      console.error(`Failed to insert template for ${type}:`, insertError)
    } else {
      console.log(`Successfully seeded active template for ${type}.`)
    }
  }

  console.log("Seeding process completed!")
}

main()
