import { supabase } from './supabase'
import { createNotification } from './notificationsApi'
import { invalidatePrefix } from '../src/utils/cache'

/* ---------------------------------------------------------------------------
   Manual announcements (Feature: "Manual WhatsApp / Portal Messages").

   Reuses the two EXISTING delivery rails instead of adding a new one:
     * portal  -> one row in `notifications` (scope all/grade/group/student —
                  RLS fans it out to students, including short-code students
                  with no phone).
     * whatsapp -> rows in the `unified_notifications` queue (one per phone:
                  always the parent when parent_phone exists, plus the student
                  themself ONLY when their login handle is a real phone).
                  The existing WhatsApp queue panel / WAPilot batch / Cloud API
                  / wa.me manual flows then send them unchanged.

   Templates & saved messages live in `message_templates` (kind 'saved' or
   'template'); each send is logged in `announcements`.
   --------------------------------------------------------------------------- */

// A student's own login handle counts as a WhatsApp-able phone only when it is
// an actual phone number (>= 10 digits). Short-code logins ("a7x9" etc.) and
// empty values are silently portal-only — never an error.
export function isRealPhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '')
  return digits.length >= 10
}

// Substitute {{placeholders}} for one recipient. Unknown placeholders are left
// intact so the sender can see them and fix the template.
export function applyPlaceholders(body, student, gradeLabel = {}) {
  return String(body || '')
    .replaceAll('{{student_name}}', student?.name || '')
    .replaceAll('{{grade}}', gradeLabel[student?.grade] || student?.grade || '')
    .replaceAll('{{group}}', student?.group || '')
}

// ── Saved messages & templates ──────────────────────────────────────────────

export async function listTemplates({ kind = null, search = '' } = {}) {
  let query = supabase
    .from('message_templates')
    .select('id, kind, title, body, category, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (kind) query = query.eq('kind', kind)
  if (search && search.trim()) {
    const q = search.trim().replace(/[%_,]/g, ' ')
    query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%,category.ilike.%${q}%`)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createTemplate({ kind = 'saved', title, body, category = null, createdBy = null }) {
  const { data, error } = await supabase
    .from('message_templates')
    .insert({ kind, title, body, category, created_by: createdBy })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTemplate(id, { title, body, category, kind }) {
  const patch = { updated_at: new Date().toISOString() }
  if (title !== undefined) patch.title = title
  if (body !== undefined) patch.body = body
  if (category !== undefined) patch.category = category
  if (kind !== undefined) patch.kind = kind
  const { data, error } = await supabase
    .from('message_templates')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('message_templates').delete().eq('id', id)
  if (error) throw error
  return true
}

// ── Recipient resolution ────────────────────────────────────────────────────

// One lean select resolving the audience of a scope. Only approved students.
// scope: 'all' | 'grade' | 'group' | 'student'
//   grade  -> targetGrade
//   group  -> targetGrade + targetGroupName (a group always belongs to a grade)
//   student-> targetStudentId
export async function resolveRecipients({ scope, targetGrade = null, targetGroupName = null, targetStudentId = null }) {
  let query = supabase
    .from('profiles')
    .select('id, name, phone, parent_phone, grade, "group"')
    .eq('role', 'student')
    .eq('is_approved', true)

  if (scope === 'grade') {
    query = query.eq('grade', targetGrade)
  } else if (scope === 'group') {
    query = query.eq('grade', targetGrade).eq('group', targetGroupName)
  } else if (scope === 'student') {
    query = query.eq('id', targetStudentId)
  } else if (scope !== 'all') {
    throw new Error('نطاق مستلمين غير مدعوم: ' + scope)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// ── Sending ─────────────────────────────────────────────────────────────────

const QUEUE_CHUNK = 500

/**
 * Send a manual announcement.
 *
 * @param {Object}   opts
 * @param {string}   opts.title            short title (portal + queue rows)
 * @param {string}   opts.body             message body (may contain {{placeholders}})
 * @param {string}   opts.scope            'all' | 'grade' | 'group' | 'student'
 * @param {string}   [opts.targetGrade]
 * @param {string}   [opts.targetGroupName]
 * @param {string}   [opts.targetGroupId]  groups.id (for the audit log)
 * @param {string}   [opts.targetStudentId]
 * @param {string[]} [opts.channels]       subset of ['portal','whatsapp']
 * @param {Object}   [opts.gradeLabel]     tenant grade-id -> Arabic label map
 * @param {string}   [opts.createdBy]
 * @returns {{ recipientsTotal, whatsappQueued, portalSent, announcement }}
 */
export async function sendAnnouncement({
  title,
  body,
  scope,
  targetGrade = null,
  targetGroupName = null,
  targetGroupId = null,
  targetStudentId = null,
  channels = ['portal', 'whatsapp'],
  gradeLabel = {},
  createdBy = null,
}) {
  if (!title?.trim() || !body?.trim()) throw new Error('العنوان ونص الرسالة مطلوبان')
  const wantPortal = channels.includes('portal')
  const wantWhatsapp = channels.includes('whatsapp')
  if (!wantPortal && !wantWhatsapp) throw new Error('اختر وسيلة إرسال واحدة على الأقل')

  // 1) Resolve the audience with a single query.
  const recipients = await resolveRecipients({ scope, targetGrade, targetGroupName, targetStudentId })
  if (recipients.length === 0) throw new Error('لا يوجد طلاب مطابقون لهذا النطاق')

  // 2) Audit-log row first so queue rows can link to it.
  const { data: announcement, error: annError } = await supabase
    .from('announcements')
    .insert({
      title: title.trim(),
      body,
      scope,
      target_grade: scope === 'grade' || scope === 'group' ? targetGrade : null,
      target_group_id: scope === 'group' ? targetGroupId : null,
      target_student: scope === 'student' ? targetStudentId : null,
      channels,
      recipients_total: recipients.length,
      created_by: createdBy,
    })
    .select()
    .single()
  if (annError) throw annError

  // 3) Portal: ONE notifications row — RLS fans it out (no per-student rows).
  //    Placeholders are substituted per student only for single-student sends;
  //    for broader scopes the generic body is shown as composed.
  let portalSent = false
  if (wantPortal) {
    const portalBody = scope === 'student'
      ? applyPlaceholders(body, recipients[0], gradeLabel)
      : body
    await createNotification({
      title: title.trim(),
      message: portalBody,
      level: 'info',
      scope,
      targetGrade,
      targetGroup: scope === 'group' ? `${targetGrade}:${targetGroupName}` : null,
      targetStudent: targetStudentId,
      meta: { kind: 'announcement', announcement_id: announcement.id },
      createdBy,
    })
    portalSent = true
  }

  // 4) WhatsApp: batch rows into the existing unified queue. Parent always
  //    (when a parent phone exists); the student themself only when their
  //    login handle is a real phone. Missing phones NEVER fail the send.
  let whatsappQueued = 0
  if (wantWhatsapp) {
    const rows = []
    for (const s of recipients) {
      const message = applyPlaceholders(body, s, gradeLabel)
      if (isRealPhone(s.parent_phone)) {
        rows.push({
          student_id: s.id,
          title: title.trim(),
          message,
          type: 'announcement',
          channels: ['whatsapp'],
          status: { whatsapp: 'pending' },
          recipient: 'parent',
          recipient_phone: s.parent_phone,
          announcement_id: announcement.id,
          created_by: createdBy,
        })
      }
      if (isRealPhone(s.phone)) {
        rows.push({
          student_id: s.id,
          title: title.trim(),
          message,
          type: 'announcement',
          channels: ['whatsapp'],
          status: { whatsapp: 'pending' },
          recipient: 'student',
          recipient_phone: s.phone,
          announcement_id: announcement.id,
          created_by: createdBy,
        })
      }
    }

    for (let i = 0; i < rows.length; i += QUEUE_CHUNK) {
      const chunk = rows.slice(i, i + QUEUE_CHUNK)
      const { error } = await supabase.from('unified_notifications').insert(chunk)
      if (error) throw error
      whatsappQueued += chunk.length
    }

    if (whatsappQueued > 0) {
      await supabase
        .from('announcements')
        .update({ whatsapp_queued: whatsappQueued })
        .eq('id', announcement.id)
    }
  }

  invalidatePrefix('notifications')
  return { recipientsTotal: recipients.length, whatsappQueued, portalSent, announcement }
}

// Sent-announcements history (audit log).
export async function listAnnouncements({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, scope, target_grade, target_group_id, target_student, channels, recipients_total, whatsapp_queued, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
