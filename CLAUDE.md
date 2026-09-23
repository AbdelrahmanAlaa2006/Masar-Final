# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Masaar (مسار) is a multi-tenant, Arabic/RTL education platform for Egyptian private teachers: videos, course lectures, exams, homework, center attendance, grades, payments/packages, chat, parent reports. One React SPA + one Supabase project serve every teacher ("tenant"), each on its own custom domain. Also wrapped as an Android app via Capacitor (`android/`).

Most root-level `*.md` reports (START_HERE, QUICK_REFERENCE, CONVERSION_GUIDE, …) are historical and outdated; trust the code over them.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:3000
npm run build        # vite build + scripts/build-seo.mjs (per-domain HTML heads) — always use this, not bare `vite build`
npm run preview      # serve dist/
npm run backup       # scripts/backup_db.js
npm run cap:sync     # build + sync into the Android project
```

There is no lint, typecheck or unit-test setup. Verification is:
- `npm run build` to catch compile errors.
- End-to-end scripts against the live Supabase project: `node scripts/test_<name>.mjs` (e.g. `test_student_device_limit.mjs`, `test_profile_privilege_guard.mjs`, `test_exam_lifecycle.mjs`). They need `.env` plus `SUPABASE_SERVICE_ROLE_KEY` from `whatsapp-gateway/.env`, and create/delete their own throwaway `zz-*` data.
- Manual testing in the browser on the **`default` tenant only** (`http://localhost:3000/?tenant=default`). Never enable features or create test data on real teacher tenants.

Database and edge functions (Supabase CLI, project `zphnjirmcrolqjrhjjqt` is already linked; no DB password needed):

```bash
supabase db query -f backend/migrations/<file>.sql --linked     # apply a migration
supabase functions deploy <name> --use-api                      # deploy an edge function (no Docker)
```

localhost and production share the **same** database, so a migration is live everywhere immediately. Frontend changes reach production only after Vercel redeploys `main`.

## Architecture

**Layout**
- `src/`: React 18 + react-router v6 SPA; all pages are `lazy()`-loaded in `src/App.jsx`. The admin UI is `src/pages/ControlPanel/` (one `*Panel.jsx` per tab).
- `backend/`: despite the name, this is **browser-side** data-access code (one `*Api.js` per domain) imported via the `@backend/*` alias (vite.config.js / jsconfig.json). `backend/supabase.js` is the single Supabase client.
- `backend/migrations/`: hand-written, idempotent, date-prefixed SQL files. This is the schema source of truth (not `supabase/migrations/`). Rollbacks in `backend/migrations/rollback/`.
- `supabase/functions/`: Deno edge functions (Bunny video upload/signing, R2 file upload/download URLs, tenant-admin creation, student sync, WhatsApp send).
- `whatsapp-gateway/`: separate self-hosted Node server. The WhatsApp automation is stopped; don't build new automated WhatsApp features.

**Multi-tenancy (the core concept)**
- One DB; every tenant-owned row has `tenant_id`. RLS write policies check `tenant_id = current_tenant_id()` (the caller's `profiles.tenant_id`). A `set_tenant_id_on_insert()` trigger stamps `tenant_id` only when it is NULL, so **never give a `tenant_id` column a DEFAULT**. That silently stamps every row with the default tenant and breaks RLS for everyone else.
- Content tables must gate students by **tenant AND access** (grade match and, for package content, an approved `package_purchases` row), not by tenant alone. Follow the `videos`/`exams` policies; see `2026_09_23_course_lectures_student_access.sql`.
- Grades/stages are per-tenant config (`tenants.config.stages`) and validated in the app. Don't add DB CHECKs with fixed grade lists.
- Tenant resolution happens in `src/contexts/TenantContext.jsx`: hostname → `tenants.domain`/slug. On localhost and `*.vercel.app`, use `?tenant=<slug>` (remembered in sessionStorage). Legacy slug aliases and brand remaps live in the resolver and `src/tenants/brandOverrides.js`.
- Per-tenant look: `getTenantFolder()` picks a folder in `src/tenants/<folder>/` (`config.js` for particle/canvas theme, `styles.css`), which is loaded dynamically. DB colors in `tenants.config` feed `src/utils/theme.js` (`applyTenantTheme`) as CSS variables.
- Feature toggles: `src/config/features.js` (`GRANULAR_CAPABILITIES`, `CAPABILITY_MAP`), stored per tenant in `tenants.config.features` and switched in the Super Admin panel. Some flags (e.g. `student_device_limit`) are enforced in the DB, not just the UI.

**Auth and roles**
- Roles in `profiles.role`: `student`, `assistant`, `admin`, `super_admin`. Assistants get permissions from `tenant_admins.permissions` (granular keys like `videos:edit`). `hasPermission` (AuthContext) and the DB `has_permission()` both treat a coarse key (`videos`) as matching any granular one.
- Students log in with a phone number or short code, which `authApi` maps to a synthetic auth email. `profiles.password` holds a readable copy for printed login cards; auth hashes can't be read back.
- The session is stored via `backend/authStorage.js`: localStorage for students, sessionStorage for staff unless «تذكرني» is ticked.
- `backend/viewerContext.js` caches the current user/role/permissions for 60s. Call `invalidateViewerContext()` after a role change.

**Data-fetching rules**
- PostgREST returns at most **1000 rows** per request and silently drops the rest. For any list that can grow, use `backend/fetchAllRows.js` with a stable `.order(...)` ending in a unique column. Don't fetch unfiltered and filter in JS.
- `src/utils/cache.js` is a tenant-scoped SWR cache (memory + localStorage, in-flight dedup). Wrap reads in `cached(key, ttl, fn)` and `invalidate()` after writes.

**Per-domain SEO / deployment (Vercel project `masar-final`)**
- `scripts/build-seo.mjs` turns `dist/index.html` into one `dist/<key>.html` per domain from `seo/domains.mjs`. It then **deletes** `dist/index.html` so `vercel.json` host rewrites fire. A real file at a rewritten path (`index.html`, `robots.txt`, `sitemap.xml`) always shadows the rewrite, so keep only per-domain `robots-<key>.txt` / `sitemap-<key>.xml` in `public/`.
- Never put a tenant-specific canonical tag in the source `index.html`.
- Adding a teacher domain: set `tenants.domain`, add the Vercel domain (apex + www), add the DNS records, add an entry in `seo/domains.mjs`, add the rewrites and www→apex redirect in `vercel.json`, and add the host to `PRODUCTION_HOSTS` in `src/components/RouteSeo.jsx`.

## Conventions

- UI text is Arabic and RTL. Keep new UI strings in Arabic, matching the surrounding page.
- Schema changes go in a new `backend/migrations/YYYY_MM_DD_<name>.sql` that is safe to re-run (`if not exists`, `create or replace`, `drop policy if exists`).
- To debug RLS, reproduce it as the real user: `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}';` inside a transaction. The default `postgres` role bypasses RLS and hides the bug.
- Commits: allowed, but with NO `Co-Authored-By`/AI attribution lines, so they appear fully authored by the maintainer. Ask before every `git push`; pushing `main` deploys production on Vercel.
