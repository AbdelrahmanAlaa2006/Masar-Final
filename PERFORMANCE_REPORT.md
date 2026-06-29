# Masaar Platform — Performance Report

**Date:** 2026-06-29 · **Scale target:** 10,000 students, multi-tenant, high concurrency.
**No files modified.** Findings reference `file:line`.

---

## P-1 — `listStudents()` is unpaginated with a wide projection, and is the shared data source for ~12 pages (High)

**Evidence:** `backend/profilesApi.js:6-14`
```js
.select('id, name, phone, grade, "group", password, avatar_url, created_at, is_active,
         is_approved, qr_token, barcode_token, parent_phone, branch_id, academic_year_id,
         status, enrollment_type, flags, student_groups(group_id)')
.eq('role','student').order('name')   // no .range(), no .limit()
```
Consumers (all using the same `cached('students', …)` key): `AttendancePanel`, `GradesPanel`, `AvailabilityPanel`, `RevealPanel`, `AccountsPanel`, `StudentAccessPanel`, `Report`, `HomeworkGroupReport`, `VideosGroupReport`, `ExamsGroupReport`, `ControlPanel/index`, `HomeDashboard`, `Payments`.

**Why it's a problem:** At 10K students this is a single ~3–6 MB JSON response (19 columns + a joined sub-select) on every cold load of any of those pages. It is fetched, parsed, held in memory, **and** serialized to `localStorage`.

**Production impact:** Multi-second TTFB on admin pages; large memory footprint on low-end Android (this app ships via Capacitor); mobile data cost; `localStorage` quota overflow (see P-2 / SC-1).

**Recommended fix:**
- Add server-side **pagination** (`.range(from, to)`) and **search** (filter by name/phone/group server-side) for list UIs.
- Split projections: a **lean** list (id, name, grade, group, status, avatar) for tables; fetch the heavy fields (parent_phone, tokens, flags) only in the details modal.
- For bulk operations (attendance/grades over a whole group), query **by group** (`student_groups`) instead of pulling every student.
- **Never** select `password` (see SECURITY S-1).

---

## P-2 — Caching large lists in `localStorage` is expensive and unsafe (High)

**Evidence:** `src/utils/cache.js:36-42` writes every cached value to `localStorage` as JSON; `cached('students', …)` therefore persists the entire student array.

**Why it's a problem:**
- `JSON.stringify`/`parse` of a 10K-row array is a **main-thread blocking** operation (tens to hundreds of ms) on each cache write/read — janks the UI.
- `localStorage` is ~5 MB per origin; a 10K-student payload can exceed it. The write `try/catch` swallows the `QuotaExceededError` (`cache.js:41`), so caching **silently degrades** to memory-only and may also evict other cached keys non-deterministically.
- Storing PII (and currently passwords) at rest in the browser (see SECURITY S-2/S-4).

**Recommended fix:**
- Keep `localStorage` persistence only for **small, stable** configs (tenant config, feature flags, permissions). For large/volatile lists, use **memory-only** cache (skip the `localStorage` branch when value size or row count exceeds a threshold).
- Or move large caches to **IndexedDB** (async, no main-thread stringify, larger quota) if cross-refresh persistence is genuinely needed.
- Pair with P-1 pagination so cached payloads are small by construction.

---

## P-3 — `getExam` issues redundant auth/profile/access queries per open (Medium)

**Evidence:** `backend/examsApi.js:94-117` — `select('*')` then `auth.getUser()` + `profiles` role query + (conditionally) `listStudentContentAccess`.

**Why:** RLS already gates `exams` SELECT via `has_content_access()` (migration `2026_07_01_playlists_packages.sql:352-356`). The JS re-checks the same thing with extra round-trips, and `select('*')` pulls the full `questions` JSONB even when only metadata is needed for some callers.

**Fix:** Trust RLS for access; select explicit columns; drop the in-JS getUser/profile/access dance (or keep a single friendly error mapping for the RLS-denied case).

---

## P-4 — Content list endpoints do a dynamic import + access lookup on every student call (Medium)

**Evidence:** `backend/videosApi.js:52-57`, `backend/examsApi.js:71-76`
```js
const { listStudentContentAccess } = await import('./packagesApi')
const access = await listStudentContentAccess(user.id)  // cached, but still a call + filter each list
```
**Why:** Adds a module import and an access query to every videos/exams list for students. It is cached (`student-content:access:<id>`), so the cost is mostly the first call, but the `await import()` runs every time and the post-filter runs on the full row set.

**Fix:** Hoist the import to module top (tree-shaking already splits `packagesApi`); rely on the cached access set; consider doing the `grade='packages'` gating in the SQL/RLS layer so the client never receives locked rows.

---

## P-5 — `invalidatePrefix` scans the entire `localStorage` and is called in clusters (Medium)

**Evidence:** `src/utils/cache.js:62-81` loops over **all** `localStorage` keys. Callers fire several in a row, e.g. `backend/packagesApi.js:292-298`:
```js
invalidatePrefix('purchases:'); invalidatePrefix('student-content:'); invalidatePrefix('videos')
invalidatePrefix('exams'); invalidatePrefix('homeworks'); invalidatePrefix('student-payments-')
invalidatePrefix('admin-payments')
```
**Why:** Each call is O(localStorage size); 7 calls = 7 full scans per purchase resolution. With large cached lists present, this is repeated, blocking work.

**Fix:** Add a single `invalidatePrefixes([...])` that scans once; or namespace cache keys and keep an in-memory index of keys per prefix to avoid scanning `localStorage` at all.

---

## P-6 — React re-render / memoization gaps (Medium)

**Observations:**
- `AttendancePanel.jsx` (1,278 lines) holds many `useState`s and large derived arrays; verify heavy derivations (filtered/sorted student lists, anomaly computations) are in `useMemo` keyed correctly, and row components are `React.memo`'d — at 10K students an unmemoized filter on each keystroke is visibly laggy.
- `TenantContext` value is memoized (`TenantContext.jsx:286-296`) ✅; `AuthContext` value is memoized ✅. Good.
- The dev tenant-switcher overlay renders a large inline-styled node on every render in localhost only — fine (dev-gated).

**Fix:** Profile `AttendancePanel`, `GradesPanel`, and the report pages with React DevTools Profiler under a 1–2K row dataset; add `useMemo`/`React.memo`/virtualization (e.g. windowing) for long lists.

---

## P-7 — Long lists are not virtualized (Medium → High at scale)

**Why:** Rendering thousands of student/attendance/grade rows as DOM nodes is the dominant cost on admin screens and on mobile webviews.
**Fix:** Introduce list virtualization (e.g. a lightweight windowing approach) for any table that can exceed a few hundred rows. Combine with P-1 pagination.

---

## P-8 — Bundle size (Low/informational)

**Evidence (build output):**
- `index-df31d755.js` **269 kB** (gzip 83 kB) — main app shell.
- `supabase-33558510.js` **194 kB** (gzip 51 kB) — vendor, unavoidable but cacheable.
- `AttendancePanel` **now 45 kB** (was 381 kB) after moving `html5-qrcode` to dynamic import. ✅
- `PublicReport` 58 kB, `Videos` 72 kB — acceptable.

**Fix:** The main shell (269 kB) is the next target — audit what is eagerly imported in `App.jsx`/`Header`/`Footer`/contexts (icons, seasonal decor) and lazy-load non-critical pieces. Ensure `font-awesome`/icon usage isn't pulling a large set.

---

## Summary Table

| ID | Issue | Severity | Effort | Backward-compatible fix? |
|----|-------|----------|--------|--------------------------|
| P-1 | Unpaginated wide `listStudents` | High | M | Yes (additive lean list + paged API) |
| P-2 | Large lists in localStorage | High | M | Yes (threshold/memory-only) |
| P-3 | `getExam` redundant queries | Medium | S | Yes |
| P-4 | Per-call import + access lookup | Medium | S | Yes |
| P-5 | `invalidatePrefix` full scans | Medium | S | Yes |
| P-6 | Re-render/memo gaps | Medium | M | Yes |
| P-7 | No list virtualization | Med→High | M | Yes |
| P-8 | 269 kB main shell | Low | M | Yes |
