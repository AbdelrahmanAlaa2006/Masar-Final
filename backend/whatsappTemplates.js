import { supabase } from './supabase.js'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const templateCache = new Map()
const inFlightLoads = new Map()

/**
 * Resolves standard details for the teacher (name, phones, signature) from tenant config.
 */
export function resolveTeacherDetails(tenant) {
  if (!tenant) return { name: '', phone_1: '', phone_2: '', phones: '', signature: '' }

  const config = tenant.config || {}
  const teacher = config.teacher || {}
  const location = config.location || {}

  // 1. Resolve Teacher Name
  let teacherName = ''
  if (typeof teacher.name === 'string') {
    teacherName = teacher.name
  } else if (teacher.name && typeof teacher.name === 'object') {
    teacherName = teacher.name.ar || teacher.name.en || ''
  }
  if (!teacherName) {
    teacherName = tenant.name || ''
  }

  // 2. Resolve Contact Phones
  let phone1 = ''
  let phone2 = ''

  if (Array.isArray(teacher.phones)) {
    phone1 = teacher.phones[0] || ''
    phone2 = teacher.phones[1] || ''
  } else if (typeof location.phone === 'string') {
    const split = location.phone.split('-').map(p => p.trim())
    phone1 = split[0] || ''
    phone2 = split[1] || ''
  }

  // Special defaults for Mr Mohamed Abdella
  if (tenant.slug === 'mohamed-abdella') {
    if (!phone1) phone1 = '0453176310'
    if (!phone2) phone2 = '01155731401'
    if (!teacherName) teacherName = 'محمد عبداللاه'
  }

  // Fallback to socials if still empty
  if (!phone1 && config.socials?.whatsapp) {
    const waPhone = String(config.socials.whatsapp).replace(/[^0-9]/g, '')
    if (waPhone) phone1 = '0' + waPhone.slice(2)
  }

  const mergedPhones = [phone1, phone2].filter(Boolean).join('\n')
  const teacherRole = teacher.role && typeof teacher.role === 'object' 
    ? (teacher.role.ar || teacher.role.en || '') 
    : (teacher.role || '')

  return {
    name: teacherName,
    phone_1: phone1,
    phone_2: phone2,
    phones: mergedPhones,
    signature: teacherRole || `إدارة ${teacherName}`
  }
}

/**
 * Returns the default template text for a specific notification type and tenant.
 */
export function getDefaultTemplate(tenant, notification_type) {
  const teacherDetails = resolveTeacherDetails(tenant)
  const isAbdella = tenant?.slug === 'mohamed-abdella'
  const signatureLine = isAbdella ? 'مع تحيات\nأ/ محمد عبداللاه' : 'مع تحيات\nأ/ {{teacher_name}}'
  const phonesBlock = isAbdella 
    ? '0453176310\n01155731401' 
    : '{{teacher_phones}}'

  switch (notification_type) {
    case 'attendance_absent':
      return `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد تغيب اليوم *{{day_name}}*

بتاريخ *{{date}}*

عن حصة *{{lesson_name}}*

مجموعة الساعة *{{group_name}}*

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`

    case 'attendance_makeup':
      return `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حضر متأخراً اليوم *{{day_name}}*

بتاريخ *{{date}}*

عن حصة *{{lesson_name}}*

مجموعة الساعة *{{group_name}}*

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`

    case 'quiz':
      return `السلام عليكم ورحمة الله وبركاته

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

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`

    case 'exam':
      return `السلام عليكم ورحمة الله وبركاته

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

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`

    case 'homework':
      return `السلام عليكم ورحمة الله وبركاته

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

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`

    case 'payment':
      return `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

يرجى العلم بضرورة سداد المصروفات المستحقة لكورس *{{course_name}}*

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`

    case 'behavior':
    case 'participation':
      return `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بأن

الطالب / *{{student_name}}*

قد حصل على درجة تقييم سلوكي ومشاركة

*{{grade}}*

من

*{{total_grade}}*

بتاريخ

*{{date}}*

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}

يرجى التفاعل على الرسالة بـ 👍🏻
حتى نتأكد من متابعتكم للطالب 🤎`

    case 'general':
    default:
      return `السلام عليكم ورحمة الله وبركاته

نود إبلاغكم بالتالي للطالب / *{{student_name}}*

{{message}}

${signatureLine}

للتواصل معنا على رقم

${phonesBlock}`
  }
}

/**
 * Replaces placeholders in template text with payload values.
 * Any unknown placeholder will be replaced with an empty string.
 */
export function renderTemplateText(templateText, tenant, payload) {
  const teacherDetails = resolveTeacherDetails(tenant)

  const placeholders = {
    student_name: payload.student_name || '',
    teacher_name: teacherDetails.name || '',
    teacher_phone_1: teacherDetails.phone_1 || '',
    teacher_phone_2: teacherDetails.phone_2 || '',
    teacher_phones: teacherDetails.phones || '',
    teacher_signature: teacherDetails.signature || '',
    lesson_name: payload.lesson_name || '',
    group_name: payload.group_name || '',
    quiz_name: payload.quiz_name || '',
    exam_name: payload.exam_name || '',
    homework_name: payload.homework_name || '',
    grade: payload.grade !== undefined && payload.grade !== null ? String(payload.grade) : '',
    total_grade: payload.total_grade !== undefined && payload.total_grade !== null ? String(payload.total_grade) : '',
    date: payload.date || '',
    day_name: payload.day_name || '',
    course_name: payload.course_name || '',
    attendance_status: payload.attendance_status || '',
    message: payload.message || ''
  }

  // Merge any custom variables in payload directly
  if (payload && typeof payload === 'object') {
    Object.keys(payload).forEach(key => {
      if (placeholders[key] === undefined) {
        placeholders[key] = payload[key] !== undefined && payload[key] !== null ? String(payload[key]) : ''
      }
    })
  }

  // Replace all {{variable}} placeholders with resolved values or empty string
  return templateText.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim()
    return placeholders[trimmedKey] !== undefined ? placeholders[trimmedKey] : ''
  })
}

/**
 * Core entry point for rendering a template.
 * Employs tenant-isolated caching with Single-Flight database loading protection.
 */
export async function renderNotificationTemplate({ tenant, notification_type, locale = 'ar-EG', payload }) {
  if (!tenant) throw new Error('Tenant config is required for template rendering')

  const tenantId = tenant.id
  const now = Date.now()
  let templatesMap

  // 1. Check cache
  const cached = templateCache.get(tenantId)
  if (cached && cached.expiresAt > now) {
    templatesMap = cached.templates
  } else {
    // 2. Cache Miss - single-flight loader protection against cache stampedes
    let promise = inFlightLoads.get(tenantId)
    if (!promise) {
      promise = (async () => {
        try {
          const { data, error } = await supabase
            .from('whatsapp_templates')
            .select('notification_type, template')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)

          if (error) throw error

          const map = new Map()
          if (data) {
            data.forEach(row => {
              map.set(row.notification_type, row.template)
            })
          }
          
          templateCache.set(tenantId, {
            templates: map,
            expiresAt: Date.now() + CACHE_TTL_MS
          })

          return map
        } finally {
          inFlightLoads.delete(tenantId)
        }
      })()
      inFlightLoads.set(tenantId, promise)
    }
    
    templatesMap = await promise
  }

  // 3. Resolve template text
  let templateText = templatesMap.get(notification_type)
  if (!templateText) {
    templateText = getDefaultTemplate(tenant, notification_type)
  }

  // 4. Render
  return renderTemplateText(templateText, tenant, payload)
}

/**
 * Saves or updates a template version and invalidates the cache for that tenant.
 */
export async function saveTemplate(tenantId, notificationType, templateText, createdBy = null) {
  // Find current max version
  const { data: existing, error: fetchError } = await supabase
    .from('whatsapp_templates')
    .select('version')
    .eq('tenant_id', tenantId)
    .eq('notification_type', notificationType)
    .order('version', { ascending: false })
    .limit(1)

  if (fetchError) throw fetchError
  const maxVersion = existing?.[0]?.version || 0

  // Mark all existing versions as inactive
  const { error: deactivateError } = await supabase
    .from('whatsapp_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('notification_type', notificationType)

  if (deactivateError) throw deactivateError

  // Insert the new active template version
  const { data, error: insertError } = await supabase
    .from('whatsapp_templates')
    .insert({
      tenant_id: tenantId,
      notification_type: notificationType,
      template: templateText,
      version: maxVersion + 1,
      is_active: true,
      created_by: createdBy
    })
    .select()
    .single()

  if (insertError) throw insertError

  // Invalidate cache immediately
  clearTemplateCache(tenantId)

  return data
}

/**
 * Explicitly clears cache for one or all tenants.
 */
export function clearTemplateCache(tenantId) {
  if (tenantId) {
    templateCache.delete(tenantId)
  } else {
    templateCache.clear()
  }
}
