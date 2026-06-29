# Masaar Platform — Codebase Audit Report

**Date:** 2026-06-29
**Scope:** Full-stack audit (React + Vite frontend, Supabase backend, multi-tenant SaaS).
**Method:** Static inspection of source, backend API modules, SQL migrations, contexts, hooks, routing, and the build output. **No files were modified.**
**Target scale assumption:** 5,000–10,000 students, multiple teachers/tenants, high concurrency.

> This is the master report. Performance, security, and scalability findings are summarized here and detailed in `PERFORMANCE_REPORT.md`, `SECURITY_REPORT.md`, and `SCALABILITY_REPORT.md`. The remediation sequence is in `IMPLEMENTATION_PLAN.md`.

---

## 1. Executive Summary

The platform is functionally mature: real Supabase Auth (phone→email), progressively tightened RLS, tenant isolation via `current_tenant_id()`, aggressive caching, lazy-loaded routes, and SECURITY DEFINER RPCs for hot paths (QR identity, parent portal, batch attendance). The build passes with no errors.

However, several issues will bite at the 10K-student scale or represent real security/robustness gaps **today**:

| Area | Critical | High | Medium | Low |
|------|:---:|:---:|:---:|:---:|
| Security / RLS | 1 | 2 | 3 | 1 |
| Performance | 0 | 3 | 4 | 2 |
| Scalability | 1 | 2 | 2 | 0 |
| Correctness / Robustness | 0 | 2 | 3 | 3 |

The three highest-leverage fixes: **(1)** stop selecting/storing the plaintext `password` column and stop caching the full student list (with passwords) in `localStorage`; **(2)** add a top-level React **ErrorBoundary**; **(3)** make `listStudents()` paginated/server-filtered so admin pages don't load 10K rows.

---

## 2. Correctness, Robustness & Logic Issues

### C-1 — No React ErrorBoundary anywhere (High)
**Evidence:** `grep ErrorBoundary|componentDidCatch|getDerivedStateFromError` → **0 matches**. `src/App.jsx` wraps routes only in `<Suspense fallback={<PageLoader/>}>`.
**Problem:** Suspense handles loading, not runtime errors. Any thrown error during render of a lazy page (e.g. a malformed `questions` JSON in an exam, a null deref in a report) unmounts the whole tree → blank white screen with no recovery.
**Production impact:** A single bad data row can take down the entire app for a user; no telemetry, no "try again". At 10K students the probability of hitting an edge case daily is high.
**Fix:** Add an `ErrorBoundary` component around `<Suspense>`/`<Routes>` with a friendly fallback and a "reload" button; optionally log to a `client_errors` table or console sink.

### C-2 — `AuthContext.refreshProfile` has a stale closure on `user` (Medium)
**Evidence:** `src/contexts/AuthContext.jsx:45-87` — `refreshProfile` reads `let activeUser = user` but its `useCallback` dependency array is `[]`.
**Problem:** `user` is captured at first render (always `null`), so the function always falls through to the `sessionStorage` branch. It works **by accident** because of the fallback, but the in-memory `user` path is dead.
**Impact:** Latent bug — if the sessionStorage fallback is ever removed/changed, profile refresh silently breaks. Also makes the code misleading.
**Fix:** Either add `user` to deps (and accept re-creation) or drop the `user` branch and always read from sessionStorage intentionally with a comment.

### C-3 — Duplicated student-block guard logic across route guards (Medium, maintainability)
**Evidence:** `src/App.jsx:286-298` and `:313-325` — the "inactive/suspended/archived/graduated → redirect to /payments" block is copy-pasted verbatim in `ProtectedRoute` and `PermissionRoute` (and the status list is repeated again in `Header.jsx:271` and `AccountsPanel.jsx:414`).
**Problem:** Four copies of the same status set. A new status (or a rule change) must be edited in 4 places; they will drift.
**Fix:** Extract `isStudentBlocked(user)` and `BLOCKED_STATUSES` into a shared util (e.g. `src/utils/access.js`) and reuse.

### C-4 — `getExam` re-derives auth on every call (Medium)
**Evidence:** `backend/examsApi.js:94-117` — `getExam` does `select('*')`, then `supabase.auth.getUser()`, then a `profiles` role query, then (for `packages` grade) a content-access lookup.
**Problem:** 2–3 extra round-trips per exam open; the role/access checks duplicate what RLS + `has_content_access()` already enforce server-side.
**Impact:** Slower exam open; redundant queries multiply under concurrency.
**Fix:** Rely on RLS for gating (the `exams` SELECT policy already calls `has_content_access`), and select only needed columns. See `PERFORMANCE_REPORT.md` P-3.

### C-5 — Tenant resolution carries heavy hardcoded slug remapping (Medium)
**Evidence:** `src/contexts/TenantContext.jsx:60-150` — `cyber`/`power-platform`/`sherif-programming` collapse to one brand; `sherif-english`/`waled-english` to another; plus `getTenantFolder()` (`:380-393`) re-implements similar slug guessing with `.includes()` heuristics.
**Problem:** Branding identity is encoded as imperative string-matching in the context instead of data in the `tenants.config`. Adding a tenant means editing context code; the `.includes('power')` style matches are fragile (a future tenant slug containing "power" would be mis-branded).
**Fix:** Move brand name/colors/logo/folder into `tenants.config` JSON (already partially present) and delete the hardcoded branches. Backward-compatible: keep the fallbacks until all tenant rows carry config.

### C-6 — Localhost cache-busting code shipped in production context (Low)
**Evidence:** `src/contexts/TenantContext.jsx:24-39` removes specific `masar-cache:` keys and special-cases localhost inside the provider.
**Problem:** Dead weight in the production bundle and couples dev concerns into runtime.
**Fix:** Gate behind `import.meta.env.DEV`.

### C-7 — Stray debug/scratch files tracked in repo (Low, hygiene)
**Evidence:** repo root contains `check_db.js`, `check_payments_debug.js`, `check_videos.js`, `inspect_trigger.js`, `query_profiles.js`, `test.js`, `test_signup.js`, `scratch_login.jsx`, and a tracked `scratch/` folder.
**Problem:** Not imported by the app, but they clutter the tree, can contain credentials/connection assumptions, and confuse onboarding.
**Fix:** Remove or move to a git-ignored `dev/` folder (with confirmation — see plan).

---

## 3. Dead / Duplicate Code

- **Dead branch:** `AuthContext.refreshProfile` in-memory `user` path (C-2).
- **Duplicate guard logic:** student-blocked status set ×4 (C-3).
- **Duplicate slug logic:** brand remap in `TenantContext` vs `getTenantFolder` (C-5).
- **Duplicate access-gating:** frontend package gating in `listVideos`/`listExams`/`getExam` duplicates RLS policies `has_content_access` (07_01 migration). Frontend filtering is a UX nicety but the source of truth is RLS; keep one, document the other.
- **Repeated cache-invalidation fan-out:** `invalidatePrefix('videos'|'exams'|'homeworks'|…)` is called in clusters in `packagesApi.js:292-298`, `overridesApi.js`, etc. Each call scans the **entire** `localStorage` (see `PERFORMANCE_REPORT.md` P-5).

---

## 4. Missing Loading / Error States

- **No global error boundary** (C-1).
- `cached()` evicts on rejection (`src/utils/cache.js:43-49`) — good — but most call sites `await` without try/catch, so a failed list fetch surfaces as an unhandled rejection unless the page wraps it. Audit each page's `useEffect` loader for a `.catch`/error UI. Representative good pattern exists (`HomeDashboard` uses a `wrap()` helper); not universal.
- Several admin panels load the full student list synchronously with only a spinner; no empty-state vs error distinction at 0 rows.

---

## 5. Routing & Auth Flow

- **Guards** (`ProtectedRoute`/`PermissionRoute`/`AdminRoute`, `src/App.jsx:280-343`) are coherent and defer real enforcement to RLS. ✅
- **Session model:** auth in `sessionStorage` (closes-tab logout) but the data **cache lives in `localStorage`** (`src/utils/cache.js`) — a mismatch with privacy implications on shared devices (see `SECURITY_REPORT.md` S-4).
- **Cross-tenant safety:** `AuthContext.jsx:117-121` logs out users whose `tenant_id` ≠ active tenant (except super_admin). ✅ Good defense-in-depth.

---

## 6. Cross-Reference Index

| ID | Title | Severity | Detailed in |
|----|-------|----------|-------------|
| S-1 | Plaintext `password` column selected to client | High | SECURITY |
| S-2 | Full student list (incl. password) cached in localStorage | High | SECURITY / SCALABILITY |
| S-3 | `is_current_user_admin()` grants all assistants; videos write uses it | High | SECURITY |
| S-4 | Per-user data persists in localStorage after tab-close logout | Medium | SECURITY |
| S-5 | Anonymous SECURITY DEFINER report/parent RPC surface | Medium | SECURITY |
| P-1 | `listStudents()` unpaginated, wide select, shared by ~12 pages | High | PERFORMANCE / SCALABILITY |
| P-2 | Heavy `localStorage` JSON (de)serialization of large lists | High | PERFORMANCE |
| P-3 | `getExam` extra auth/profile/access queries | Medium | PERFORMANCE |
| P-4 | Content lists do dynamic import + access lookup per call | Medium | PERFORMANCE |
| P-5 | `invalidatePrefix` full-localStorage scan, called in clusters | Medium | PERFORMANCE |
| SC-1 | No pagination anywhere on student-scoped lists | Critical@scale | SCALABILITY |
| SC-2 | `save_attendance_batch_v2` per-record SELECTs in loop | Medium | SCALABILITY |
| C-1 | No ErrorBoundary | High | this doc |

---

## 7. What Is Already Done Well (do **not** rebuild)

- Real Supabase Auth with tenant-scoped phone→email; cross-tenant login rejection (`authApi.js:62-66`).
- RLS exists on all content/operational tables; later migrations added `has_permission()` RBAC and super_admin handling.
- Hot read paths use single-call RPCs (`get_student_identity_by_qr`, `get_parent_portal_summary`, `save_attendance_batch_v2`).
- Route-level code splitting via `React.lazy` (`App.jsx:7-32`).
- In-flight request dedup in `cached()` prevents duplicate concurrent fetches.
- The recently shipped archiving feature enforces `is_archived=false` **server-side** for non-admins (`videosApi.js:43-45`, `examsApi.js:62-64`) — correct.
- AttendancePanel's QR library was just moved to an on-demand dynamic import (381 kB → 45 kB chunk).
