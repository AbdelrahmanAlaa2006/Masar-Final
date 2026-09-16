/**
 * Read EVERY row of a query, however many there are.
 *
 * Supabase (PostgREST) returns at most 1000 rows per request and says nothing
 * when it stops — the rest simply never arrives. Screens that loaded a whole
 * list in one request therefore lost their OLDEST data once a tenant grew past
 * 1000 rows (grading sessions, attendance and finance totals went missing in
 * 2026-09 although nothing had been deleted).
 *
 * This asks for the rows 1000 at a time until a page comes back short.
 *
 *   const rows = await fetchAllRows(() => supabase
 *     .from('attendance_records')
 *     .select('id, status')
 *     .eq('session_id', id)
 *     .order('id'))
 *
 * Rules for callers:
 *  - Pass a FUNCTION that builds a fresh query: a supabase query builder can
 *    only be awaited once, so every page needs its own.
 *  - The query MUST have a stable order that ends in a unique column (usually
 *    `.order('id')`). Without it Postgres may return rows in a different order
 *    per page, and rows get skipped or repeated at page boundaries.
 *  - Do not add .range()/.limit()/.single() yourself.
 *
 * PAGE_SIZE must not be larger than the API's max rows (1000 on this project,
 * measured: rows 1001+ were cut off exactly). A short page means "done".
 */

const PAGE_SIZE = 1000

export async function fetchAllRows(buildQuery, { pageSize = PAGE_SIZE } = {}) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    const page = data || []
    for (const row of page) rows.push(row)
    if (page.length < pageSize) break
  }
  return rows
}

/**
 * `.in('student_id', ids)` puts every id into the request URL (~37 characters
 * each). Measured on this project's API (2026-09-17): 393 ids still worked,
 * 400 ids (~14.6 KB of URL) were rejected outright. 250 leaves room for a long
 * select list and other filters, and keeps any stage up to 250 students at a
 * single request — exactly what it cost before.
 *
 * Prefer filtering in the database (e.g. `profiles!student_id!inner(grade)` +
 * `.eq('profiles.grade', grade)`) when the list is "every student of a stage":
 * that is one request at any size. Use the chunk helpers only when the ids
 * really are an arbitrary list.
 */
export const IN_CHUNK = 250

/** Split a list into chunks of at most `size`. */
export function chunk(list, size = IN_CHUNK) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * Read rows filtered by a (possibly huge) list of values.
 *
 *   const profiles = await selectInChunks(studentIds, (part) => supabase
 *     .from('profiles').select('id, name').in('id', part).order('id'))
 *
 * Duplicates in `values` are dropped first, so chunks never overlap and no row
 * comes back twice. Chunks run one after another (not in parallel) to avoid
 * bursts against the database; each chunk is itself read with fetchAllRows.
 */
export async function selectInChunks(values, buildQuery, { size = IN_CHUNK } = {}) {
  const unique = [...new Set((values || []).filter((v) => v != null))]
  const rows = []
  for (const part of chunk(unique, size)) {
    const page = await fetchAllRows(() => buildQuery(part))
    for (const row of page) rows.push(row)
  }
  return rows
}

/**
 * Run a write (update/delete) for a (possibly huge) list of values, one chunk
 * at a time. `action(part)` must return the supabase query (or its result);
 * an error on any chunk is thrown.
 *
 *   await runInChunks(ids, (part) => supabase.from('grades').delete().in('id', part))
 */
export async function runInChunks(values, action, { size = IN_CHUNK } = {}) {
  const unique = [...new Set((values || []).filter((v) => v != null))]
  for (const part of chunk(unique, size)) {
    const { error } = await action(part)
    if (error) throw error
  }
}
