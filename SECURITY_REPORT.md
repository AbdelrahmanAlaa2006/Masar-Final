# Masaar Platform — Security Report

**Date:** 2026-06-29 · **No files modified.**
Severity scale: Critical / High / Medium / Low. All findings cite `file:line`.

> Context: Auth is **real Supabase Auth** (phone→fake-email per tenant, `backend/authApi.js`), so `auth.uid()`-based RLS is valid. Tenant isolation uses `current_tenant_id()` (SECURITY DEFINER, `2026_05_26_multitenant.sql:43-58`). RLS has been progressively hardened. The findings below are the remaining gaps.

---

## S-1 — Plaintext `password` column stored and sent to the client (High)

**Evidence:**
- `backend/profilesApi.js:9` — `listStudents()` selects `password` among student columns.
- `backend/assistantsApi.js:57-66` — `createAssistant(name, phone, password, …)` writes a `password` value into a row.
- `backend/studentsSyncApi.js:41` — CSV import expects a `password` column.

**Why it's a problem:** A `password` column implies credentials are stored in plaintext (or reversibly) in `profiles`/`tenant_admins`, **in addition** to Supabase Auth's hashed copy. `listStudents()` then transmits every student's password to the admin browser and (via the `students` cache) into `localStorage`.

**Production impact:** Full credential disclosure if an admin device, browser profile, or a single admin account is compromised; violates basic credential-handling expectations; expands blast radius of any XSS to "all student passwords".

**Recommended fix (backward-compatible, staged):**
1. **Immediately** drop `password` from the `listStudents()` projection (`profilesApi.js:9`) and from any admin list cache. Admin UIs that "show the password" should instead offer **reset** (a `reset_student_password` RPC already exists: `2026_06_19_reset_student_password.sql`).
2. Stop writing plaintext on assistant creation / CSV sync; rely on Supabase Auth.
3. Schedule a migration to **drop the column** after confirming nothing depends on it, or replace with a one-time "temporary password shown once at creation" flow.

---

## S-2 — Full student PII (incl. passwords) persisted in `localStorage` (High)

**Evidence:** `src/utils/cache.js:36-42` persists every `cached()` value to `localStorage`; the `students` cache key (`cached('students', LIST_TTL, listStudents)`, used in 12+ files) therefore stores the entire student array — names, phones, **parent phones**, QR/barcode tokens, and the `password` field — at rest in the browser.

**Why:** `localStorage` is readable by any script on the origin and survives process exit. The QR/barcode tokens are effectively attendance/identity secrets (used by `get_student_identity_by_qr`).

**Impact:** On a shared/teacher device, the next person (or any injected script) can read all student PII and identity tokens without authenticating. Combined with S-1, passwords are included.

**Fix:** Don't persist large/PII lists to `localStorage` (memory-only — see PERFORMANCE P-2); remove `password` from the payload (S-1); consider treating `qr_token`/`barcode_token` as sensitive (fetch on demand, don't cache broadly).

---

## S-3 — `is_current_user_admin()` treats every assistant as admin; videos write policy relies on it (High)

**Evidence:**
- `2026_06_16_attendance_grades.sql:167-182` — `is_current_user_admin()` returns `role IN ('admin','assistant')` (later also `super_admin`, `2026_07_02_super_admin_policies.sql:8`).
- `2026_07_01_playlists_packages.sql:340-341` — videos **write** policy: `FOR ALL USING (tenant_id = current_tenant_id() AND public.is_current_user_admin())`.
- Contrast: exams/homeworks write policies use the granular `has_permission(auth.uid(), 'exams'|'homework')` (`2026_06_16_attendance_grades.sql:249-295`).

**Why it's a problem:** An assistant **without** the `videos` permission can still INSERT/UPDATE/DELETE videos by calling Supabase directly, because the video write policy only checks "is admin-ish", not the specific permission. This is an RBAC bypass and is **inconsistent** with how exams/homework are gated.

**Impact:** Privilege escalation within a tenant; an assistant scoped to (say) "attendance only" can tamper with video content. Also, any policy elsewhere using `is_current_user_admin()` as a write gate inherits this over-grant.

**Fix:** Change the videos write policy to `has_permission(auth.uid(), 'videos')` (and add a separate `WITH CHECK`). Audit every `FOR ALL/UPDATE/DELETE … USING (… is_current_user_admin())` and replace with the appropriate `has_permission(...)`. Keep `is_current_user_admin()` only for genuinely admin-wide gates (audit logs, tenant settings).

---

## S-4 — Auth in `sessionStorage` but data cache in `localStorage` → data outlives the session (Medium)

**Evidence:** `backend/supabase.js:17-23` stores the auth session in `sessionStorage` (intentional: tab-close = logout). But `src/utils/cache.js` persists app data in `localStorage`, and it is only cleared on an explicit `logout()` (`AuthContext.jsx:98-107 → invalidateAll()`), **not** on tab-close.

**Why:** Closing the tab "logs out" (auth gone) but leaves all cached lists/PII in `localStorage`. The next user on that browser starts unauthenticated, yet stale tenant/student data sits at rest.

**Impact:** Privacy leakage on shared devices; stale-data confusion across users.

**Fix:** Either move the data cache to `sessionStorage` for parity with the auth lifetime, or clear `masar-cache:*` on app boot when no valid session is present.

---

## S-5 — Anonymous SECURITY DEFINER report/parent surface (Medium — review, likely intended)

**Evidence:** Public report / parent lookup RPCs run as SECURITY DEFINER and are reachable by anon (`2026_06_18_parent_lookup_api.sql`, `2026_06_18_public_report_api.sql`, `2026_06_20_public_platform_reports.sql`, `2026_06_28_public_report_refactor.sql`; `get_parent_portal_summary` in `2026_06_27_architecture_refactor.sql:495-521` keys on `parent_phone`).

**Why to review:** These intentionally expose student summaries to non-authenticated parents keyed by phone or token. Risks: (a) **enumeration** — if a parent can look up by phone alone with no secondary secret/rate-limit, an attacker can harvest student data by guessing phone numbers; (b) the functions are `SECURITY DEFINER` so they bypass RLS — the `WHERE tenant_id = p_tenant_id AND ...` clauses are the *only* isolation; any missing predicate leaks cross-student/tenant data.

**Impact:** Potential bulk PII disclosure via the public endpoints.

**Fix:** Require a per-student secret token (not just phone) for public lookups; add rate-limiting / captcha on the public report routes; review every SECURITY DEFINER function to confirm it filters by both `tenant_id` and an unguessable key, and returns only the minimum fields. (Detailed function-by-function review recommended as a Phase task.)

---

## S-6 — `phoneToEmail` default-tenant login fallback (Medium — verify)

**Evidence:** `backend/authApi.js:31-47` — if tenant-scoped login fails, it retries against the **default tenant** email (`<phone>@masaar.app`) to support the global super admin.

**Why to review:** This is gated afterward by the cross-tenant check (`authApi.js:62-66`, rejects unless `super_admin`), so it appears safe. But it means a login attempt on tenant B will also probe the default-tenant credential space. Confirm no non-super-admin can authenticate via the fallback and reach another tenant before the post-check signs them out.

**Fix:** Restrict the fallback to only succeed for `super_admin` (check role before returning), not just sign out afterward.

---

## S-7 — `set_tenant_id_on_insert` defaults to the default tenant when context is null (Low)

**Evidence:** `2026_05_26_multitenant.sql:184-195` — inserts with no resolvable tenant get `COALESCE(current_tenant_id(), '<default-tenant-uuid>')`.

**Why:** A misconfigured/edge insert silently lands in the **default** tenant rather than failing, which can cross-pollinate data.

**Fix:** For authenticated writes, prefer raising an exception when `current_tenant_id()` is null instead of silently defaulting (keep the default only for legitimate anonymous flows like registration/payments).

---

## Positive controls already in place (keep)

- Cross-tenant login rejection (`authApi.js:62-66`) and runtime cross-tenant logout (`AuthContext.jsx:117-121`).
- Granular `has_permission()` RBAC on exams, homework, attendance, grades, groups, ledger, notifications (`2026_06_16`, `2026_06_27`).
- `student_ledger` student-insert policy constrains students to `status='pending' AND type='payment' AND student_id = auth.uid()` (`2026_06_27_architecture_refactor.sql:205`) — well scoped.
- Archive visibility enforced server-side for non-admins (`videosApi.js:43-45`).

---

## Summary Table

| ID | Issue | Severity | Fix type |
|----|-------|----------|----------|
| S-1 | Plaintext password column to client | High | Code + migration |
| S-2 | PII/passwords in localStorage | High | Code (cache) |
| S-3 | Assistants treated as admin for video writes | High | Migration (RLS) |
| S-4 | Cache outlives session on shared devices | Medium | Code (cache lifetime) |
| S-5 | Anonymous SECURITY DEFINER report surface | Medium | Migration + rate limit |
| S-6 | Default-tenant login fallback | Medium | Code (authApi) |
| S-7 | Silent default-tenant on null context | Low | Migration |
