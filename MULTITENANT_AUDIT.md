# Multi-Tenant Architecture Audit

**Date:** 2026-06-29
**Scope:** Tenant isolation + scalability of the current architecture (one Supabase project, one frontend deployment, shared DB).
**Constraints honored:** no separate deployments, no per-teacher DB, no per-tenant page duplication, no full redesign. **Nothing implemented — analysis only.**

> Companion docs: `TENANT_SCALABILITY_REPORT.md` (load/scaling math), `TENANT_CUSTOMIZATION_PLAN.md` (config-driven per-tenant UI). Earlier general findings live in `AUDIT_REPORT.md` / `SECURITY_REPORT.md` / `SCALABILITY_REPORT.md` and are referenced, not repeated.

---

## 0. The single most important fact

**RLS scopes every content/student query to the caller's tenant** via `tenant_id = public.current_tenant_id()` (`2026_05_26_multitenant.sql:123-159`). `current_tenant_id()` is a `STABLE SECURITY DEFINER` function reading the caller's own `profiles.tenant_id`.

Consequence: **a teacher only ever reads their own tenant's rows.** Tenant A growing to 5,000 students does **not** make tenant B's queries return more rows or run slower *at the query level*. Therefore:

- **Data isolation:** ✅ enforced by RLS on all scoped tables.
- **Resource isolation:** ❌ not enforced — all tenants share one Postgres instance, one connection pool, one CPU/IO budget, and (today) one browser cache namespace.

So the real "one tenant hurts another" risk is **shared-resource contention (noisy neighbor)**, plus a few **shared-cache** and **hardcoded-logic** issues. The architecture is fundamentally sound for your goals; the fixes are targeted, not structural.

---

## 1. Answers to your 10 questions

### Q1 — Will the current tenant architecture scale safely?
**Mostly yes, with two caveats.** Data isolation (RLS) and the config/theme delivery (per-tenant CSS chunk + JSONB config) scale cleanly to 10+ teachers. The caveats: (a) **unpaginated per-tenant lists** (`listStudents()`, `backend/profilesApi.js:6-14`) make a *large* tenant's own admin pages slow and consume disproportionate shared DB resources; (b) **browser cache keys aren't tenant-namespaced**. Both are fixable without redesign.

### Q2 — Can one large tenant negatively affect another?
**Yes — but only through shared resources, never through data.** RLS guarantees tenant B never sees or queries tenant A's rows. However, one Supabase project means:
- Shared **CPU/IO**: a large tenant running heavy unpaginated `SELECT * FROM profiles` (10k rows) on every admin page burns shared CPU and buffer cache, evicting other tenants' hot pages.
- Shared **connection pool / pooler**: long, large result sets hold connections longer → others queue.
- Shared **Postgres planner cache / disk**: large scans cause IO pressure.
**Mitigations (detailed in scalability report):** pagination + lean projections (cut the payload), composite indexes (cut scan/sort cost), and a per-statement `statement_timeout` so no single tenant query can run away. These bound the blast radius.

### Q3 — Are there queries that scan all tenants instead of the current tenant?
**Almost none.** Every scoped table query is filtered by RLS to the current tenant, even when the JS omits an explicit `tenant_id` filter (e.g. `listStudents` relies on RLS). The exceptions are intentional and cheap:
- `available-tenants` — `SELECT slug, name FROM tenants` loads **all** tenants (`TenantContext.jsx:52-58`). It's metadata only, cached 30 min, and used by the localhost dev switcher; in production it runs once per session. **Recommend:** gate this fetch behind `import.meta.env.DEV` so production never lists all tenants.
- The `tenants` table itself is world-readable by design (`"Allow public select on tenants"`, `2026_05_26_multitenant.sql:24-26`) so anonymous visitors can resolve branding. Fine, but means tenant slugs/names are public.

### Q4 — Are there missing tenant_id indexes?
**Base `tenant_id` indexes exist on essentially every table** — the multitenant loop indexed the original tables (`2026_05_26:108`) and `2026_07_05_dynamic_tenant_config.sql:10-20` covered all the newer ones (branches, groups, attendance_*, ledger, notes, attachments, audit_logs, unified_notifications). ✅
**What's missing are composite indexes matching real query+sort patterns:**
- `profiles(tenant_id, role, name)` — the dominant student-list query is `WHERE role='student' [tenant via RLS] ORDER BY name`; today only `tenant_id` is indexed, so the `role` filter + `name` sort still cost extra.
- `profiles(tenant_id, status)` and `profiles(branch_id)`, `profiles(academic_year_id)` for filtered/branch views.
These are additive `CREATE INDEX IF NOT EXISTS` — see scalability report SC-3.

### Q5 — Are there components that load unnecessary data from other tenants?
**No cross-tenant data loads** (RLS blocks them). The real waste is **intra-tenant over-fetching**: ~12 pages load the *entire* current-tenant student roster via `cached('students', listStudents)` — full rows, all columns, no pagination (`PERFORMANCE_REPORT.md` P-1). For a large tenant that's its own students, but far more than any one screen needs.

### Q6 — Are there caches shared between tenants?
**Yes — this is a real isolation gap.** `src/utils/cache.js` keys are **not** tenant-namespaced: `cached('students', …)`, `cached('available-tenants', …)`, and the per-list keys (`videos`, `exams`, `homeworks`). On a **shared device** or when a **super-admin switches tenants**, the cache can serve tenant A's `students`/`videos` to tenant B until TTL expiry. The live query would be RLS-correct, but the cached copy is ambiguous.
**Fix:** namespace volatile keys by `tenant_id` (e.g. `students:<tenantId>`). The tenant *config* key is already candidate-scoped (`tenant-config:${candidate}`). See scalability report SC-4.

### Q7 — Is tenant configuration loaded efficiently?
**Yes, the hot path is efficient — one cached row.** `TenantContext` fetches a single `tenants` row (`id, slug, name, domain, logo_url, primary_color, secondary_color, config`) with a 10-min cache + localStorage persistence (`TenantContext.jsx:84-153`), then dynamically imports exactly one `tenants/<folder>/config.js` + `styles.css` chunk. One DB row + one code chunk per visit. ✅
**But:** the query does **not** load the `tenant_features` / `tenant_settings` tables, yet `isFeatureEnabled()` checks `tenant.tenant_features` first (`TenantContext.jsx:211-217`). That branch is **dead** — features only ever resolve from `config.features`. Either load those tables or drop the dead branch (don't leave a half-wired feature-flag system).

### Q8 — Will adding many tenant-specific themes or layouts impact performance?
**No, because of code-splitting.** Each tenant's `styles.css` and `config.js` are loaded via **dynamic `import()`** (`TenantContext.jsx:161-164`), so a visitor downloads **only their own** tenant's theme chunk — not all of them. Adding a 30th tenant adds two files to the repo but **zero** bytes to any other tenant's download. This stays true **only if** you keep theming in per-tenant CSS/config chunks and avoid (a) bundling all tenant CSS globally or (b) giant `if (tenant === …)` layout branches inside shared pages. The customization plan keeps you on the safe path.

### Q9 — Are there places where hardcoded tenant logic exists?
**Yes — the main cleanup target.** Concrete spots:
- `TenantContext.jsx:60-150` — slug remaps (`cyber`/`power-platform`/`sherif-programming` → "منصة باور"; `sherif-english`/`waled-english` → "The Miracle in English") with hardcoded names, colors, logos.
- `getTenantFolder()` (`TenantContext.jsx:380-393`) — subject/slug string-matching with `.includes('power')`-style heuristics (fragile: a future slug containing "power" is mis-routed).
- `theme.js:16-20` — hardcoded list of all theme classes.
- `authApi.js` / `TenantContext` — the default-tenant UUID `d3b07384-…` hardcoded in multiple places.
**Impact:** adding/rebranding a tenant requires editing context code and risks mis-matching. **Fix:** move brand name/colors/logo/folder into `tenants.config` (DB) and have the context just read it (audit item C-5). Backward-compatible: keep the hardcoded fallbacks until every tenant row carries config.

### Q10 — Is the current theme/config system sufficient for large-scale multi-tenancy?
**Sufficient as a foundation; needs three reinforcements to be "large-scale ready":**
1. Move hardcoded branding into data (Q9).
2. Namespace caches per tenant (Q6).
3. Introduce a **config-driven section/layout registry** so home-page blocks, banners, hero, optional sections, and widgets are *data*, not code (see `TENANT_CUSTOMIZATION_PLAN.md`).
With these, one codebase + one Supabase project + one deployment comfortably serves 10+ teachers and the per-tenant UI variety you want. **No separate projects/deployments/DBs are needed or recommended.**

---

## 2. Tenant isolation scorecard

| Dimension | Status | Note |
|----------|:------:|------|
| Data isolation (read) | ✅ | RLS `tenant_id = current_tenant_id()` on all scoped tables |
| Data isolation (write) | ✅* | RBAC via `has_permission()`; *one videos-write gap fixed in `2026_07_07_fix_videos_write_policy.sql` |
| Config delivery | ✅ | 1 cached row + 1 dynamic chunk per visit |
| Theme delivery | ✅ | Per-tenant CSS chunk, code-split |
| Browser cache isolation | ⚠️ | Keys not tenant-namespaced (Q6) |
| Resource isolation (CPU/conn) | ⚠️ | Shared Postgres; bound via pagination + timeouts (Q2) |
| Index coverage | ⚠️ | Base tenant_id ✅; composite sort indexes missing (Q4) |
| Hardcoded tenant logic | ⚠️ | Remaps in context/theme (Q9) |
| Feature-flag system | ⚠️ | Tables exist but not loaded; dead branch (Q7) |

✅ = solid · ⚠️ = works but reinforce before scale. **No ❌ structural blockers.**

---

## 3. Verdict

The architecture is the **correct** multi-tenant pattern (shared pages + per-tenant config/CSS + RLS) and does **not** need a redesign. It already gives true data isolation. To guarantee "no tenant feels slower because another is large," address **resource contention** (pagination, indexes, statement timeout) and **shared cache namespacing** — all additive, all backward-compatible. The per-tenant UI flexibility you want is achievable with a config-driven block registry on top of the existing structure.
