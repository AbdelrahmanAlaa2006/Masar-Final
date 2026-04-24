import { supabase } from './supabase'

/* access_overrides wrapper.
   Rows key = (scope, target_id, item_type, item_id) UNIQUE.

   scope='prep'    → target_id is a DB grade enum ('first-prep',...)
   scope='student' → target_id is a profiles.id (uuid) stringified

   `allowed`  toggles access on/off.
   `attempts` overrides the item's default limit (null = use the default).
*/

const TABLE = 'access_overrides'

/* Admin: fetch all overrides for a single target (the admin is editing one
   target at a time). Returns a Map keyed by `${item_type}:${item_id}`. */
export async function listOverridesForTarget(scope, targetId, itemType) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('item_id, item_type, allowed, attempts')
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
export async function upsertOverride({ scope, targetId, itemType, itemId, allowed, attempts }) {
  const payload = {
    scope,
    target_id: String(targetId),
    item_type: itemType,
    item_id: itemId,
    ...(allowed  !== undefined ? { allowed }  : {}),
    ...(attempts !== undefined ? { attempts } : {}),
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
   student (their grade + their own id). RLS on the student role already
   limits rows to exactly this — admins pass the extra studentId + grade
   filters explicitly so the client logic works the same either way. */
export async function listEffectiveOverrides({ studentId, grade, itemType }) {
  let q = supabase
    .from(TABLE)
    .select('scope, target_id, item_type, item_id, allowed, attempts')
    .eq('item_type', itemType)
    .or(
      `and(scope.eq.student,target_id.eq.${studentId}),and(scope.eq.prep,target_id.eq.${grade})`
    )
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/* Given the rows returned above, reduce to the effective setting per item.
   Precedence: student-level row beats prep-level row beats {allowed:true}. */
export function reduceEffective(rows) {
  const byItem = new Map()
  for (const r of rows) {
    const cur = byItem.get(r.item_id)
    if (!cur) { byItem.set(r.item_id, r); continue }
    // student > prep
    if (cur.scope === 'prep' && r.scope === 'student') byItem.set(r.item_id, r)
  }
  const out = new Map()
  for (const [k, r] of byItem) {
    out.set(k, { allowed: r.allowed !== false, attempts: r.attempts ?? null })
  }
  return out
}
