import { supabase } from './supabase'

/* access_overrides wrapper.
   Rows key = (scope, target_id, item_type, item_id) UNIQUE.

   scope='prep'    → target_id is a DB grade enum ('first-prep',...)
   scope='group'   → target_id is "<grade>:<group>" — applies to all
                     students whose (grade, group) matches.
   scope='student' → target_id is a profiles.id (uuid) stringified

   `allowed`  toggles access on/off.
   `attempts` overrides the item's default limit (null = use the default).
*/

// Build the "<grade>:<group>" composite key used for scope='group'.
// Both halves are coalesced so the format matches the SQL RLS policy
// even when one of the values is missing.
export function groupTargetId(grade, group) {
  return `${grade ?? ''}:${group ?? ''}`
}

const TABLE = 'access_overrides'

/* Admin: fetch all overrides for a single target (the admin is editing one
   target at a time). Returns a Map keyed by `${item_type}:${item_id}`. */
export async function listOverridesForTarget(scope, targetId, itemType) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('item_id, item_type, allowed, attempts, available_hours')
    .eq('scope', scope)
    .eq('target_id', String(targetId))
    .eq('item_type', itemType)
  if (error) throw error
  const map = new Map()
  for (const r of (data || [])) map.set(`${r.item_type}:${r.item_id}`, r)
  return map
}

/* Admin: upsert one override row. Pass { allowed, attempts } — either may be
   omitted to keep its previous/default value. */
export async function upsertOverride({ scope, targetId, itemType, itemId, allowed, attempts, availableHours }) {
  const payload = {
    scope,
    target_id: String(targetId),
    item_type: itemType,
    item_id: itemId,
    ...(allowed        !== undefined ? { allowed }  : {}),
    ...(attempts       !== undefined ? { attempts } : {}),
    ...(availableHours !== undefined ? { available_hours: availableHours } : {}),
  }
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'scope,target_id,item_type,item_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

/* Admin: drop an override back to defaults. */
export async function deleteOverride({ scope, targetId, itemType, itemId }) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('scope', scope)
    .eq('target_id', String(targetId))
    .eq('item_type', itemType)
    .eq('item_id', itemId)
  if (error) throw error
}

/* Student / admin-impersonation: list every override that applies to this
   student (their grade + their group + their own id). RLS on the student
   role already limits rows to exactly this — admins pass the extra
   studentId / grade / group filters explicitly so the client logic works
   the same either way. The `group` arg is optional; when omitted no group
   filter is added to the OR clause. */
export async function listEffectiveOverrides({ studentId, grade, group, itemType }) {
  // Compose the OR clause dynamically so we don't ask the server for
  // group rows we know can't match (e.g. the student isn't in a group).
  const clauses = [
    `and(scope.eq.student,target_id.eq.${studentId})`,
    `and(scope.eq.prep,target_id.eq.${grade})`,
  ]
  if (group) {
    clauses.push(`and(scope.eq.group,target_id.eq.${groupTargetId(grade, group)})`)
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('scope, target_id, item_type, item_id, allowed, attempts, available_hours, updated_at')
    .eq('item_type', itemType)
    .or(clauses.join(','))
  if (error) throw error
  return data || []
}

/* Given the rows returned above, reduce to the effective setting per item.
   Precedence: student > group > prep. The more-specific scope wins so an
   admin can grant access to a single student inside an otherwise-locked
   group, or to a single group inside an otherwise-locked grade. */
const SCOPE_RANK = { prep: 1, group: 2, student: 3 }
export function reduceEffective(rows) {
  const byItem = new Map()
  for (const r of rows) {
    const cur = byItem.get(r.item_id)
    if (!cur) { byItem.set(r.item_id, r); continue }
    if ((SCOPE_RANK[r.scope] || 0) > (SCOPE_RANK[cur.scope] || 0)) {
      byItem.set(r.item_id, r)
    }
  }
  const out = new Map()
  for (const [k, r] of byItem) {
    out.set(k, {
      allowed: r.allowed !== false,
      attempts: r.attempts ?? null,
      // Per-audience availability override — null means "use the item default".
      availableHours: r.available_hours ?? null,
      // updated_at doubles as a "reset point" — attempts submitted before
      // this moment no longer count against the newly-granted allowance.
      updatedAt: r.updated_at || null,
    })
  }
  return out
}
