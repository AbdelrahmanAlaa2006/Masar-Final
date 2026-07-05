# Rebranding Summary — Masar → GitFekra

**Scope:** branding, default-tenant routing, and a new company landing page — **only**.
No architecture change, no business-logic change, no new project/frontend/deployment.
The multi-tenant, custom-domain system is preserved exactly. Build passes.

---

## 1. New: the GitFekra company website
The **default tenant** now renders the **GitFekra company site** instead of an
educational platform. Every other tenant is unchanged.

**New files:**
- `src/pages/company/GitFekraLanding.jsx` — premium landing page (Hero, About,
  Vision, Products [Released + Currently building], Technologies, Why GitFekra,
  Contact, Footer). Bilingual (AR/EN toggle), scroll-reveal animations, self-contained header/footer.
- `src/pages/company/GitFekraLanding.css` — dark, minimal, premium styling.
- `src/pages/company/products.js` — **configuration-driven** product + tech catalog
  (add future products here; the page renders them automatically).

**Wiring (minimal, additive):**
- `TenantContext` exposes `isCompanySite` = `slug === 'default'`.
- `App.jsx`: the `/` route renders `<GitFekraLanding/>` when `isCompanySite`, else the
  educational `<Home/>`. `/home` redirects to `/` on the company site. The educational
  header/footer are suppressed on the company site (it has its own).

**How domains map (unchanged resolution):**
- `gitfekra.com` → default tenant → company website.
- `teacher-domain.com` → that tenant → their educational platform.
- (Optionally set the default tenant's `domain = 'gitfekra.com'` in Supabase for clarity.)

---

## 2. Rebranding — classification & actions

### 🟢 Renamed (safe, user-facing)
| Location | Before | After |
|---|---|---|
| `index.html` title + meta | منصة مسار / Masar | GitFekra / جِت فِكرة |
| `TenantContext` hard fallback name | منصة مسار التعليمية | GitFekra |
| `Login.jsx`, `Register.jsx` default-tenant brand fallbacks | Masar Educational Platform / منصة مسار التعليمية | GitFekra / جِت فِكرة |
| `Help.jsx`, `Privacy.jsx`, `Terms.jsx` contact emails | *@masar.edu | *@gitfekra.com |
| `Footer.jsx` fallback brand + email | منصة مسار / support@masar.edu | GitFekra / support@gitfekra.com |

### 🟡 Handled by routing, not renamed
- The default tenant's *display* became the company site (a routing decision), so its
  educational config/name in the DB is simply no longer rendered — nothing renamed,
  nothing broken.
- `newPass = 'masar' + …` (temp password prefix) — internal, left as-is.

### 🔴 Deliberately NOT changed (would break the app)
- **`@masaar.app`** — the auth email domain. Renaming breaks **every login**.
- **Storage keys** — `masar-token`, `masar-user`, `masar-permissions`, `masar-cache:`,
  `masar-tenant-slug`, `masar-user-updated`, `masar-devtools-blocked`,
  `masaar-remembered-phone`. Renaming logs everyone out / wipes cache.
- **DB identifiers** — `slug = 'default'`, the default tenant UUID.

The only remaining "masar" strings in the codebase are these internal keys — invisible
to users, correct to leave.

---

## 3. What did NOT change (as required)
- ✅ Multi-tenant architecture — untouched.
- ✅ Custom-domain tenant resolution — untouched (no subdomains introduced).
- ✅ One codebase / one frontend / one deployment / one Supabase project.
- ✅ Every teacher platform behaves exactly as before.
- ✅ No business logic modified.

---

## 4. To go live
1. Redeploy the frontend (Vercel) — the company site is included.
2. Point `gitfekra.com` at the deployment (and optionally set the default tenant's
   `domain` to `gitfekra.com` in Supabase).
3. Teacher domains keep working unchanged.

## 5. Preview locally
- Company site: open the app on the **default** tenant (no `?tenant=`, or `?tenant=default`).
- A teacher platform: `?tenant=<slug>` (e.g. `?tenant=sherif-english`) — still the educational app.

See **BRANDING_GUIDE.md** for name/usage rules and how to add future products.
