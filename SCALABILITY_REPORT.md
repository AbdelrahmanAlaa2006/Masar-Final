# Masaar Platform — Scalability Report

**Date:** 2026-06-29 · **Target:** 10,000 students, many teachers/tenants, high concurrency.
**No files modified.**

---

## SC-1 — No pagination on student-scoped lists (Critical at scale)

**Evidence:** `backend/profilesApi.js:6-14` (`listStudents` — no `.range`/`.limit`); consumed unpaginated by `AccountsPanel`, `AttendancePanel`, `GradesPanel`, `AvailabilityPanel`, `RevealPanel`, `StudentAccessPanel`, `Report`, and the three GroupReport pages, plus `HomeDashboard`.

**Why critical:** Every one of these screens loads **all** students in the tenant. At 10K rows × ~19 columns + a sub-select, that is multi-MB per load, parsed on the main thread, cached to `localStorage` (which can exceed quota — see PERFORMANCE P-2), and rendered as thousands of DOM nodes.

**Production impact at 10K:**
- Admin pages take seconds to become interactive; worse on Capacitor Android webviews.
- `localStorage` quota overflow → silent cache failure → refetch storms.
- Memory pressure / crashes on low-end devices.

**Fix (backward-compatible):**
1. Add a **paged + searchable** student query (`.range()`, server-side `ilike` name/phone filter, `group_id`/`branch_id`/`status` filters).
2. Provide a **lean projection** for list views; load heavy fields only in the details modal.
3. For bulk staff workflows (attendance/grades), query **by group** via `student_groups`, not the whole tenant.
4. Keep the existing `listStudents()` as a deprecated path during migration; switch callers incrementally.

---

## SC-2 — `save_attendance_batch_v2` does per-record SELECTs inside a loop (Medium)

**Evidence:** `2026_06_27_architecture_refactor.sql:524-572` — for each record in the batch it runs three separate `SELECT`s (student tenant, session group, student primary group) before the upsert.

**Why:** Marking a full group's attendance (50–300 students) = 3×N point lookups + N upserts in one function call. It's transactional (good) but the per-row SELECTs are avoidable.

**Impact:** Slower bulk save; lock contention under concurrent attendance taking across groups.

**Fix:** Rewrite set-based — join the incoming `jsonb_to_recordset` against `profiles`, `attendance_sessions`, and `student_groups` once, then a single `INSERT … ON CONFLICT … SELECT …`. Same inputs/outputs, far fewer round-trips inside the function.

---

## SC-3 — Indexing review (Medium)

**Present (good):** tenant_id indexes on all scoped tables (`2026_05_26_multitenant.sql:108`); `idx_profiles_qr_token_tenant`, `idx_student_ledger_lookup`, `idx_attendance_records_lookup`, `idx_student_groups_lookup` (`2026_06_27:351-356`); partial archive indexes (`2026_06_29_add_archive.sql:14-16`); `idx_parent_notifications_queue` (`2026_06_16:133-134`); `idx_exams_type` (`2026_06_29_add_exam_type.sql:6`).

**Likely missing / to verify against query patterns:**
- `profiles(tenant_id, role, name)` — supports the dominant `WHERE role='student' [AND tenant] ORDER BY name` + future paged search. Currently only `tenant_id` is indexed; the `role`+`name` sort scans/sorts.
- `profiles(tenant_id, status)` and `profiles(branch_id)`, `profiles(academic_year_id)` — used by status/branch filters and the architecture backfill.
- `grades(student_id, created_at DESC)` — `getStudentGrades` orders by `created_at` per student (`gradesApi.js:24-25`).
- `attendance_records(session_id)` — the post-batch refetch filters by `session_id IN (...)` (`attendanceApi.js:163-166`); composite `(student_id, session_id)` exists but a `session_id` index helps session-centric reads.
- `student_content_access(student_id, content_type)` — gating filters by both.
- `unified_notifications(student_id)` and `parent_notifications` queue already covered.

**Fix:** Add the composite indexes above (all `CREATE INDEX IF NOT EXISTS`, additive, safe). Validate with `EXPLAIN ANALYZE` on a 10K-row dataset before/after.

---

## SC-4 — Caching strategy doesn't scale with tenant size (High)

**Evidence:** `src/utils/cache.js` — single shared `localStorage` cache; large lists cached under tenant-agnostic keys like `students`, `videos`, `exams`.

**Issues at scale:**
- **Key collisions across tenants on shared devices:** keys like `cached('students', …)` are not tenant-namespaced. A super-admin or a device used for two tenants can serve tenant A's cached `students` to tenant B until TTL/expiry. (Auth-level cross-tenant logout mitigates live queries, but the cache key itself is ambiguous.)
- **30-min TTL on volatile data** (`LIST_TTL`) means attendance/grade/student changes can be stale for up to 30 minutes across admin sessions.
- **No size cap / LRU** — unbounded growth toward quota.

**Fix:** Namespace cache keys by `tenant_id` (e.g. `students:<tenantId>`); shorten TTL for volatile lists and invalidate precisely on writes (already partially done via `invalidatePrefix`); cap persisted size / move big lists to memory or IndexedDB.

---

## SC-5 — Connection & query concurrency (Medium — operational)

**Observations:** The client talks directly to Supabase (PostgREST + GoTrue). Hot paths already use RPCs to collapse round-trips (QR, parent portal, attendance batch) — good. The remaining multi-query flows (`getExam` P-3, content-list access P-4, per-page `listStudents`) multiply connection usage under concurrency.

**At 10K students / many concurrent teachers:**
- Watch PostgREST/pooler connection limits; the unpaginated wide reads (SC-1) are the biggest consumers.
- Consider moving more read aggregation into SECURITY DEFINER RPCs returning exactly what a screen needs (one call per screen).

**Fix:** After SC-1 pagination, audit per-screen query counts; target ≤2–3 queries per screen load; add DB-side aggregation RPCs for dashboards/reports.

---

## SC-6 — Mobile / Capacitor considerations (Medium)

This app ships as a Capacitor Android app (`package.json` `@capacitor/*`, `cap:sync`). Large `localStorage` payloads, unvirtualized lists, and big initial bundles hit hardest in a webview on mid/low-end devices. SC-1, P-2, and P-7 are therefore **more** severe on mobile than on desktop.

---

## Summary Table

| ID | Issue | Severity | Effort | Notes |
|----|-------|----------|--------|-------|
| SC-1 | No pagination on student lists | Critical@scale | M–L | Additive paged API + lean projection |
| SC-2 | Per-record SELECTs in attendance batch | Medium | S | Set-based rewrite |
| SC-3 | Missing composite indexes | Medium | S | All additive `IF NOT EXISTS` |
| SC-4 | Non-namespaced, oversized cache | High | M | Tenant-key + size cap |
| SC-5 | Per-screen query multiplication | Medium | M | RPC aggregation |
| SC-6 | Mobile webview amplification | Medium | — | Follows SC-1/P-2/P-7 |
