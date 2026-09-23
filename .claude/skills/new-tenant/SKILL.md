---
name: new-tenant
description: Onboard a new teacher (tenant) onto Masaar end to end — tenant row + branding config, first admin account, theme folder, custom domain (Vercel + Spaceship DNS), and per-domain SEO files. Use when the user says "add a new teacher", "new tenant", "new platform for <teacher>", "set up <domain> for <teacher>", or runs /new-tenant.
---

# New tenant onboarding

Onboard one teacher. Work through the phases in order, and finish each phase before starting the next. At the end, commit the work with NO `Co-Authored-By`/AI attribution line, and ask before `git push`.

## Phase 0: Collect inputs

Ask for anything missing, in **one** message. Don't guess brand facts.

| Input | Example | Required |
|---|---|---|
| Teacher / platform name (Arabic) | مستر محمد ياسر | yes |
| Slug (`^[a-z0-9-]+$`, unique) | `mohamed-yasser` | yes |
| Subject (picks the theme folder, see Phase 2) | `english`, `math`, `physics`, `arabic`, `primary-multi` … | yes |
| Stages / grades taught | secondary only, primary 1–6, baccalaureate … | yes |
| Primary + secondary brand colours | `#ee7d30`, `#1c3257` | yes |
| Logo + teacher photo files (the user drops them in `public/images/`) | `Logo X.png` | optional |
| Custom domain | `mrmohamedyasser.com` | optional (without one, the tenant is reachable only via `?tenant=<slug>`) |
| First admin: name + phone | the user will type the password in the UI | yes |
| Teacher bio, social links, phone, city (for the landing page + SEO) | | optional |

Check that the slug is free:
```bash
echo "select slug, domain from public.tenants order by created_at;" > "$TMP/q.sql" && supabase db query -f "$TMP/q.sql" --linked
```
(Use the session scratchpad instead of `$TMP`.)

## Phase 1: Tenant row and config (database)

Write a migration `backend/migrations/YYYY_MM_DD_create_<slug>_tenant.sql`. Copy the shape of `backend/migrations/2026_08_20_create_elsharawy_tenant.sql`: `INSERT INTO public.tenants (slug, name, primary_color, secondary_color, logo_url, config)`, with `config` holding `subject`, `theme` (light/dark bg, card, text), `teacher`, `branding`, `features`, and `stages` (only the teacher's stages `enabled: true`; keep the others present but `enabled: false`).

Rules:
- Make it re-runnable: `ON CONFLICT (slug) DO UPDATE SET …`, or guard with `WHERE NOT EXISTS`.
- Don't set `tenant_id` defaults or add grade CHECK constraints (see CLAUDE.md, Multi-tenancy).
- Keep feature flags to what the teacher actually uses. Opt-in restrictions like `student_device_limit` stay off.
- `domain` holds the apex only (no `www.`, no scheme).

Show the user the SQL. After they say yes, apply it:
```bash
supabase db query -f backend/migrations/<file>.sql --linked
```
Then confirm the row exists and note its `id`.

## Phase 2: First admin account

The admin **password must not pass through Claude.** Ask the user to create the admin themselves:
- **Preferred:** Control Panel → Super Admin → the platform row → create admin. This calls the `create-tenant-admin` edge function, which also seeds a default branch and an active academic year.
- Then check it worked:
  ```sql
  select p.id, p.name, p.role, p.tenant_id from profiles p where p.tenant_id = '<tenant-id>' and p.role = 'admin';
  select count(*) from branches where tenant_id = '<tenant-id>';
  ```

## Phase 3: Theme folder (frontend)

`getTenantFolder()` in `src/tenants/brandOverrides.js` maps slug/subject to a folder under `src/tenants/`. Existing folders: biology, chemistry, default, elsharawy, english, geology, humanities, math, mohamed-yasser, physics, power-platform, science.
- If the subject already has a folder, **reuse it**. Nothing to do.
- Only if the teacher needs a unique look: create `src/tenants/<slug>/config.js` + `styles.css` by copying the closest folder, add a match line in `getTenantFolder()`, and (if the display name/colors must override the DB) add a `BRAND_OVERRIDES` entry.
- If the slug needs aliases (old links, the domain written as a slug), add them in the resolver in `src/contexts/TenantContext.jsx` next to the existing alias blocks.

## Phase 4: Custom domain (only if a domain was given)

1. **DB:** already set in Phase 1 (`tenants.domain`).
2. **Vercel** (project `masar-final`, scope `abdelrahman-alaa-projects`). This is outward-facing, so ask before running:
   ```bash
   npx vercel domains add <domain> masar-final --scope abdelrahman-alaa-projects
   npx vercel domains add www.<domain> masar-final --scope abdelrahman-alaa-projects
   ```
3. **DNS at Spaceship.** The user does this in the Spaceship dashboard. Give them exactly these two records (explicit records, NOT Vercel nameservers):
   - `A` `@` → `216.198.79.1`
   - `CNAME` `www` → `7a3908f8de9ac012.vercel-dns-017.com`

## Phase 5: Per-domain SEO (only if a domain was given)

Every step matters: if one is missed, the new domain silently serves another teacher's title/canonical.
1. `seo/domains.mjs`: add a `DOMAINS['<key>']` entry. Copy the `'mohamed-yasser'` entry's shape: `hosts` (apex, www, `<slug>.masaar.app`), title, description, keywords, canonical, ogImage, themeColor, favicon, siteName, jsonLd person/org.
2. `public/robots-<key>.txt`: copy `public/robots-mohamed-yasser.txt` and change the header and `Sitemap:` line.
3. `public/sitemap-<key>.xml`: copy an existing one and change the URLs.
4. `vercel.json`: add three host rewrites, each **before** its catch-all fallback: `/sitemap.xml` → `/sitemap-<key>.xml`, `/robots.txt` → `/robots-<key>.txt`, and `/(.*)` → `/<key>.html`. Use the host regex `(www\\.)?<domain-with-escaped-dots>`.
5. `src/components/RouteSeo.jsx`: add the apex to `PRODUCTION_HOSTS`.
6. Never create a generic `public/robots.txt`, `public/sitemap.xml` or tenant-specific canonical in `index.html`.

## Phase 6: Verify

- `npm run build` must pass, and `dist/<key>.html` must exist with the right `<title>` and canonical:
  ```bash
  grep -o '<title>[^<]*</title>\|rel="canonical"[^>]*' dist/<key>.html
  ```
- Open `http://localhost:3000/?tenant=<slug>` in the browser pane. Check that the login/landing page shows the new name, colours, logo and only the right stages in registration. **Don't register test students on the new tenant.** It's a real teacher's platform. If a signup test is needed, do it on `default`.
- After the user deploys `main` and DNS propagates, check the live site:
  ```bash
  curl -sI https://<domain>/ | head -5
  curl -s https://<domain>/robots.txt | tail -2
  ```

## Phase 7: Report

Tell the user:
1. What was created (tenant id, slug, admin account status).
2. **Files changed**, plus the commit hash (not pushed).
3. Their remaining manual steps: DNS at Spaceship (if not done), deploy `main` on Vercel, then Google Search Console (verify the domain with a TXT record, submit `sitemap.xml`, request indexing for `/` and `/login`) and import it into Bing Webmaster Tools.
