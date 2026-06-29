# Masaar Platform — Implementation Plan (Audit 2026-06-29)

> **Note:** An older `IMPLEMENTATION_PLAN.md` (526 lines) already exists from a previous session. To avoid destroying it, this audit's plan is in a separate file. If you want them merged or this one promoted to `IMPLEMENTATION_PLAN.md`, say so.

**Source reports:** `AUDIT_REPORT.md`, `PERFORMANCE_REPORT.md`, `SECURITY_REPORT.md`, `SCALABILITY_REPORT.md`.
**Status:** Proposal — **awaiting approval. No code/SQL changed yet.**

## Guiding rules (per your constraints)
- Never break existing functionality; every change is **additive or behind a fallback**.
- **No duplicate DB structures** — extend existing tables/policies/RPCs; reuse `has_permission()`, `current_tenant_id()`, existing migrations.
- **No duplicate tenant logic** — consolidate, don't fork.
- Preserve backward compatibility (keep old code paths until callers migrate).
- **Run `npm run build` after every phase**; verify no new errors and bundle sizes don't regress.
- Migrations are idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE`), run in Supabase SQL editor, and only **add/replace** — never drop data-bearing columns without a separate, confirmed step.
- Each item references its report ID so we don't do duplicate work.

---

## Phase 0 — Safety net (do first, tiny, high value)
1. **Add a top-level `ErrorBoundary`** (AUDIT C-1) — new `src/components/ErrorBoundary.jsx`, wrap `<Suspense><Routes/></Suspense>` in `App.jsx`. Friendly fallback + reload button.
2. **Commit the already-made AttendancePanel dynamic-import fix** (PERFORMANCE P-8) if not yet committed.

**Validation:** build; throw in a child to confirm the boundary catches; AttendancePanel chunk stays ~45 kB. **Risk:** none (additive).

---

## Phase 1 — Critical security (no schema duplication)
1. **Remove `password` from `listStudents()` projection** (SECURITY S-1, `backend/profilesApi.js:9`). Replace "show password" UIs with the existing reset RPC (`2026_06_19_reset_student_password.sql`).
2. **Stop persisting large/PII lists to `localStorage`** (SECURITY S-2 / PERFORMANCE P-2): in `src/utils/cache.js`, skip the `localStorage` branch for arrays over a size/row threshold (keep memory cache + in-flight dedup). Small configs still persist.
3. **Tighten videos write RLS to `has_permission('videos')`** (SECURITY S-3): migration `2026_07_07_fix_videos_write_policy.sql` — drop+recreate the videos write policy with the granular check; audit other `is_current_user_admin()` write gates in the same file.

**Validation:** build; admin still CRUDs videos; assistant without `videos` permission denied a direct write; student list loads without `password`. **Backward compat:** policies replaced not duplicated; `role='admin'` unaffected (`has_permission` returns true for admins).

---

## Phase 2 — Session/cache hardening & cleanup
1. **Cache lifetime parity** (SECURITY S-4): clear `masar-cache:*` on boot when no Supabase session exists (or move data cache to `sessionStorage`).
2. **Tenant-namespace volatile cache keys** (SCALABILITY SC-4): `students` → `students:<tenantId>`, etc.; shorten volatile TTLs.
3. **Batch invalidation** (PERFORMANCE P-5): add `invalidatePrefixes([...])` (single scan); switch clustered callers (`packagesApi.js:292-298`, `overridesApi.js`).
4. **Public-endpoint review** (SECURITY S-5/S-6): per-function review of SECURITY DEFINER report/parent RPCs; require unguessable per-student token + rate-limit `/public-report`; restrict default-tenant login fallback to `super_admin` (`authApi.js:31-47`).

**Validation:** build; purchase resolution still refreshes content; parent/public report works with token; no cross-tenant cache collision on shared device.

---

## Phase 3 — Scalability: pagination & lean queries (largest win)
1. **New paged/searchable student API** (SCALABILITY SC-1 / PERFORMANCE P-1): `listStudentsPaged({page,pageSize,search,groupId,branchId,status})` with `.range()` + server-side `ilike` + lean projection; `getStudentFull(id)` for the modal. Keep `listStudents()` until callers migrate.
2. **Migrate consumers incrementally** + add **virtualization** (PERFORMANCE P-7) on `AccountsPanel`, `AttendancePanel`, `GradesPanel`, reports; bulk staff flows query **by group**.
3. **Additive composite indexes** (SCALABILITY SC-3) `2026_07_08_perf_indexes.sql`: `profiles(tenant_id,role,name)`, `profiles(tenant_id,status)`, `profiles(branch_id)`, `grades(student_id,created_at DESC)`, `attendance_records(session_id)`, `student_content_access(student_id,content_type)`. Validate with `EXPLAIN ANALYZE`.

**Validation:** build; load-test an admin page on a seeded 10K dataset (timing + query count before/after); old pages still work mid-migration.

---

## Phase 4 — Query/render efficiency
1. **`getExam` slimming** (PERFORMANCE P-3 / AUDIT C-4): explicit columns, rely on RLS gating, drop redundant round-trips.
2. **Content-list access** (PERFORMANCE P-4): hoist `packagesApi` import; rely on cached access set; consider DB-side `grade='packages'` gating.
3. **`save_attendance_batch_v2` set-based rewrite** (SCALABILITY SC-2): single join, same signature; `CREATE OR REPLACE FUNCTION` (no new objects).
4. **React profiling pass** (PERFORMANCE P-6): `useMemo`/`React.memo`/windowing on heaviest panels.

**Validation:** build; attendance batch output identical on a sample; profile before/after.

---

## Phase 5 — Maintainability & hygiene (low risk)
1. **De-duplicate guard logic** (AUDIT C-3): `src/utils/access.js` (`BLOCKED_STATUSES`, `isStudentBlocked`) reused in `App.jsx`, `Header.jsx`, `AccountsPanel.jsx`.
2. **Fix `refreshProfile` stale closure** (AUDIT C-2).
3. **Move tenant branding into `tenants.config`**, delete hardcoded slug remaps (AUDIT C-5); keep fallbacks until all tenant rows carry config.
4. **Dev-gate localhost cache-busting** (AUDIT C-6).
5. **Remove stray root debug/scratch files** (AUDIT C-7) — **only after you confirm the exact list**.

**Validation:** build; per-tenant branding visual check; all four guard sites behave identically.

---

## Phase 6 — Schema cleanup (explicit sign-off required)
1. **Drop plaintext `password` column** after Phase 1 proves nothing reads it (SECURITY S-1) — separate reversible migration, confirm first.
2. **`set_tenant_id_on_insert` strictness** (SECURITY S-7): raise on null tenant for authenticated writes; keep default for anon registration/payments.

---

## Priority / sequencing at a glance

| Phase | Theme | Severity | Breaks anything? | DB change |
|-------|-------|----------|------------------|-----------|
| 0 | ErrorBoundary + commit bundle fix | High (C-1) | No | No |
| 1 | Credential/PII + videos RLS | High (S-1,S-2,S-3) | No | 1 idempotent policy migration |
| 2 | Cache/session/public-endpoint hardening | Med (S-4,S-5,S-6,P-5,SC-4) | No | Possible RPC tweaks |
| 3 | Pagination + indexes + virtualization | Critical@scale (SC-1,P-1,P-7) | No (additive) | Additive indexes |
| 4 | Query/render efficiency | Med (P-3,P-4,SC-2,P-6) | No | 1 `CREATE OR REPLACE` RPC |
| 5 | Maintainability/hygiene | Low (C-2..C-7) | No | No |
| 6 | Schema cleanup | High (S-1)/Low (S-7) | Needs sign-off | Column drop |

## Definition of done (per phase)
- `npm run build` passes, no new warnings/errors.
- Bundle sizes reviewed (no regressions; AttendancePanel stays small).
- Manual smoke test of touched flows (admin + assistant + student).
- Each change explained referencing its report ID.

### Recommended starting point
**Phase 0 + Phase 1** — most safety for least risk (crash protection + credential/PII exposure + the one real RBAC bypass), all backward-compatible. Approve those first; Phase 3 (pagination) is the big scalability win and follows once comfortable.
