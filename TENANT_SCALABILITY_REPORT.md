# Tenant Scalability Report

**Date:** 2026-06-29
**Goal:** Thousands of students, 10+ teachers, hundreds of concurrent users, one Supabase project, one deployment — **and no tenant slowed by another tenant's size.**
**No changes implemented.**

> Read `MULTITENANT_AUDIT.md` first for the isolation model. This report quantifies load and gives the safe scaling plan.

---

## 1. Two numbers that are often confused

"5,000–10,000 students" can mean two very different things, and they scale differently:

| Distribution | What each query loads (RLS-scoped) | Risk profile |
|--------------|-------------------------------------|--------------|
| **Spread across teachers** (e.g. 10 teachers × ~700) | A teacher's admin page loads ~700 rows | Low per-tenant cost; risk is only aggregate DB load under concurrency |
| **Concentrated in one teacher** (e.g. 1 teacher × 6,000) | That teacher's admin page loads ~6,000 rows | High: that tenant's own UX degrades **and** its heavy queries pressure the shared DB |

Because RLS scopes every query to one tenant, **the dangerous case is a single large tenant**, not the global total. The plan below makes per-tenant cost flat regardless of tenant size.

---

## 2. The dominant cost: unpaginated student roster

**Evidence:** `backend/profilesApi.js:6-14` — `listStudents()` selects ~19 columns + a `student_groups(group_id)` sub-select, `WHERE role='student'`, `ORDER BY name`, **no `.range()`/`.limit()`**. Shared (via `cached('students', …)`) by ~12 pages: AccountsPanel, AttendancePanel, GradesPanel, AvailabilityPanel, RevealPanel, StudentAccessPanel, Report, the three GroupReports, ControlPanel index, HomeDashboard, Payments.

### Estimated payload & behavior by largest-tenant size

Assumptions: ~300–600 bytes/row serialized (19 cols + join), gzip ~3–4×, mid-range Android webview (Capacitor).

| Largest tenant | Rows/admin-load | Raw JSON | Over wire (gzip) | Parse+render feel | localStorage |
|---------------|----------------:|---------:|-----------------:|-------------------|--------------|
| **5,000** | 5,000 | ~2–3 MB | ~0.6–0.9 MB | 1–2 s, noticeable jank | near/over 5 MB quota |
| **10,000** | 10,000 | ~4–6 MB | ~1.2–1.8 MB | 2–5 s, clear lag on mobile | **exceeds quota** (silent fail) |
| **20,000** | 20,000 | ~8–12 MB | ~2.5–3.5 MB | 5–10 s+, near-unusable on mobile | exceeds quota |

**Note:** the `localStorage` overflow is already mitigated — Phase 1 added a memory-only guard for large arrays (`src/utils/cache.js`, `isTooLargeToPersist`). The **DB cost and payload/parse cost remain** until pagination lands.

### Production impact
- The large tenant's admin screens become slow; every navigation re-pulls (or re-parses) thousands of rows.
- Each such query holds a shared connection longer and burns shared CPU/buffer cache → **other tenants' queries queue or run colder** (the noisy-neighbor effect).
- On mobile (your Capacitor build) the parse/render dominates and can ANR-stall the webview.

---

## 3. Secondary scaling costs

| Item | Evidence | At scale |
|------|----------|----------|
| Missing composite indexes | `profiles` has only `tenant_id` index | `role='student' ORDER BY name` does filter+sort each load; worse as the tenant grows |
| `getExam` extra round-trips | `examsApi.js:94-117` | +2–3 queries per exam open × concurrency |
| Content list access lookup per call | `videosApi.js:52-57`, `examsApi.js:71-76` | extra query/import each list (cached, but adds up) |
| `invalidatePrefix` full localStorage scans in clusters | `cache.js:62-81`, `packagesApi.js:292-298` | 7 full scans per purchase resolution |
| `save_attendance_batch_v2` per-record SELECTs | `2026_06_27_architecture_refactor.sql:524-572` | 3×N point lookups when marking a whole group |
| No list virtualization | admin tables render all rows as DOM | thousands of nodes = slow scroll/jank on mobile |

---

## 4. Will one tenant slow another? — bounded answer

| Channel | Isolated today? | How to bound it |
|---------|:---------------:|-----------------|
| Returned data (rows) | ✅ RLS | already isolated |
| DB CPU / buffer cache | ❌ shared | pagination + lean projection + indexes shrink each query's cost |
| Connection pool | ❌ shared | smaller/faster queries free connections sooner; use Supabase pooler (transaction mode) |
| Runaway query | ❌ shared | set `statement_timeout` (e.g. 8–15 s) so no tenant query can monopolize a backend |
| Browser cache | ⚠️ shared keys | tenant-namespace cache keys |
| Theme/config download | ✅ code-split | already isolated (one chunk per tenant) |

After the plan below, a single tenant's queries are small and time-bounded, so its **size cannot meaningfully degrade another tenant.**

---

## 5. Safe scaling plan (additive, backward-compatible, no redesign)

Ordered by impact-per-risk. Each step keeps existing code working until callers migrate.

### Step 1 — Paginate + slim the student roster (biggest win)
- Add `listStudentsPaged({ page, pageSize, search, groupId, branchId, status })` using `.range()` + server-side `ilike` on name/phone + a **lean projection** (id, name, grade, group, status, avatar). Keep `listStudents()` during migration.
- Add `getStudentFull(id)` for the details modal (heavy fields on demand).
- Migrate the heavy consumers first (AccountsPanel, AttendancePanel, GradesPanel). For bulk staff flows, query **by group** via `student_groups`, not the whole tenant.
- **Effect:** per-screen cost becomes O(pageSize), **flat regardless of tenant size** → directly satisfies "no tenant feels slower because another is large."

### Step 2 — Composite indexes (additive migration)
`profiles(tenant_id, role, name)`, `profiles(tenant_id, status)`, `profiles(branch_id)`, `grades(student_id, created_at DESC)`, `attendance_records(session_id)`, `student_content_access(student_id, content_type)`. All `CREATE INDEX IF NOT EXISTS`. Validate with `EXPLAIN ANALYZE` on a seeded large tenant.

### Step 3 — Per-statement safety valve
Set a conservative `statement_timeout` (and optionally `idle_in_transaction_session_timeout`) at the role/DB level so a pathological query can't hold shared resources. Bounds the worst case for every tenant.

### Step 4 — Tenant-namespace the volatile cache
`students` → `students:<tenantId>`, same for `videos`/`exams`/`homeworks`. Removes cross-tenant cache ambiguity (Audit Q6). Shorten TTL for volatile lists; precise invalidation already exists.

### Step 5 — List virtualization on big tables
Window long admin tables so only visible rows are in the DOM. Pairs with Step 1 to keep mobile smooth.

### Step 6 — Trim per-screen query counts
`getExam` slimming, hoist content-access import, batch `invalidatePrefixes`, set-based `save_attendance_batch_v2`. Each reduces shared DB load under concurrency.

---

## 6. Concurrency outlook (hundreds of concurrent users)

- Supabase/PostgREST sits on a connection pool; the limiting factor is **query duration × concurrency**. Steps 1–3 cut duration sharply, multiplying effective concurrency on the same plan.
- Use the **transaction-mode pooler** for the app's anon/auth role to maximize concurrent short queries.
- Hot dashboards/reports can move to `SECURITY DEFINER` RPCs returning exactly one screen's data in one round-trip (you already do this for QR/parent/attendance — extend the pattern to the heaviest admin dashboards).
- Watch Supabase compute tier: at a concentrated 10–20k tenant with hundreds concurrent, plan a compute upgrade; but with Steps 1–3 the smaller per-query cost likely keeps you on a modest tier far longer.

---

## 7. Bottom line by scale

| Largest tenant | Without plan | With Steps 1–3 |
|---------------|--------------|----------------|
| 5,000 | sluggish admin, quota pressure | fast, flat per-screen cost |
| 10,000 | slow, mobile lag, noisy-neighbor begins | fast; shared-DB pressure bounded |
| 20,000 | near-unusable admin on mobile, real cross-tenant impact | still fast; size is irrelevant to other tenants |

The architecture does not need replacing — it needs **pagination, indexes, a statement timeout, and tenant-scoped caching.** All additive, none breaking existing features.
