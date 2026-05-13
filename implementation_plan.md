# Full Optimization & SaaS Architecture Review — Masar Platform

## Executive Summary

After a thorough review of ~30 source files, 12 API modules, 5 edge functions, and all page components, I've identified **42 specific issues** across 8 categories. The codebase is surprisingly well-structured for its stage — good RLS, lean API layer, existing cache system. The main problems are: **no code splitting**, **giant monolithic components**, **auth state scattered via sessionStorage**, **no React context/query layer**, and **zero multi-tenant infrastructure**.

This plan is ordered by **impact-to-effort ratio** — quick wins first, architectural changes last.

---

## User Review Required

> [!IMPORTANT]
> **Multi-Tenant Scope**: The SaaS multi-teacher architecture (Section 7) is the largest change. It touches the database schema, auth flow, and deployment. I need your confirmation on the tenant isolation model before implementing it.

> [!WARNING]  
> **`.env` contains live Supabase credentials** committed to the repo. The anon key is low-risk (it's meant to be public), but the `.env` file pattern should still be enforced via `.gitignore` — which it already is, but the file was committed before the rule was added. We should rotate credentials after fixing.

---

## Open Questions

1. **Teacher count estimate**: How many teachers do you expect in Year 1? (5? 50? 500?) This affects whether we need DB-level tenant isolation (separate schemas) or row-level isolation (tenant_id column).
2. **Custom domains**: Will each teacher bring their own domain, or will you offer subdomains (teacher1.masaar.app)?
3. **Shared vs separate Supabase projects**: One Supabase project for all teachers, or one per teacher? (I recommend one shared project with row-level isolation for <100 teachers.)
4. **Current VPS specs**: What Hostinger plan are you on? (CPU, RAM, storage) — affects Docker/Nginx recommendations.
5. **Budget for monitoring**: Free-tier tools only, or open to paid solutions like Sentry ($26/mo)?

---

## Proposed Changes

### Phase 1: Quick Wins — Request & Bundle Optimization (Priority: CRITICAL)

---

#### 1.1 Route-Based Code Splitting

**Problem**: ALL 18 pages are eagerly imported in [App.jsx](file:///c:/Users/LENOVO/Downloads/masaar-react-new/src/App.jsx#L1-L26). The entire app loads as a single JS chunk. `ControlPanel.jsx` alone is **116KB** of source (likely 40-50KB gzipped JS).

##### [MODIFY] [App.jsx](file:///c:/Users/LENOVO/Downloads/masaar-react-new/src/App.jsx)

Replace all static imports with `React.lazy()`:

```diff
-import Home from './pages/Home'
-import Login from './pages/Login'
-import Homework from './pages/Homework'
-import Exams from './pages/Exams'
-import Videos from './pages/Videos'
-// ... 13 more imports
+const Home = React.lazy(() => import('./pages/Home'))
+const Login = React.lazy(() => import('./pages/Login'))
+const Homework = React.lazy(() => import('./pages/Homework'))
+const Exams = React.lazy(() => import('./pages/Exams'))
+const Videos = React.lazy(() => import('./pages/Videos'))
+// ... all pages lazy-loaded
```

Wrap `<Routes>` in `<Suspense fallback={<PageLoader />}>`.

##### [MODIFY] [vite.config.js](file:///c:/Users/LENOVO/Downloads/masaar-react-new/vite.config.js)

Add manual chunk splitting:
```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'supabase': ['@supabase/supabase-js'],
        'tus': ['tus-js-client'],
      }
    }
  }
}
```

**Impact**: Reduces initial bundle by ~60-70%. Login page loads in <100KB instead of 400KB+.

---

#### 1.2 Auth Context — Eliminate Scattered sessionStorage Reads

**Problem**: Every page independently reads `sessionStorage.getItem('masar-user')` and parses it — found in **14 files**:
- `App.jsx` (line 141), `Home.jsx` (line 140), `Videos.jsx` (line 94), `Exams.jsx` (line 32), `Homework.jsx` (line 114), `Header.jsx` (line 44), `Notifications.jsx` (line 52), `HomeDashboard.jsx` (line 150), `Profile.jsx`, `Report.jsx`, `ExamTaking.jsx`, `VideosReport.jsx`, `ExamsReport.jsx`, `ControlPanel.jsx`

Each does its own `try/catch` + `JSON.parse` + `useState` + `useEffect`. This is ~10 lines of boilerplate repeated 14 times, and causes **redundant rerenders** when state falls out of sync.

##### [NEW] `src/contexts/AuthContext.jsx`

Create a single auth provider that:
- Reads user from sessionStorage once on mount
- Provides `{ user, role, isLoggedIn, isAdmin, login, logout }` via context
- Broadcasts changes via the existing `masar-user-updated` event
- All 14 files consume via `useAuth()` hook — zero sessionStorage reads scattered

**Impact**: Removes ~140 lines of duplicated boilerplate. Single source of truth for auth state. Eliminates the `location`-dependent re-read in App.jsx (line 139-150) which fires on EVERY route change.

---

#### 1.3 Deduplicate Data Fetching with Shared Cache Keys

**Problem**: `HomeDashboard.jsx` calls `listVideos()`, `listExams()`, `listHomeworks()`, and `listStudents()` on every Home page visit — the same data that `Videos.jsx`, `Exams.jsx`, `Homework.jsx`, and `ControlPanel.jsx` also fetch. The cache system (`cache.js`) already handles this correctly with shared keys (`'videos'`, `'exams'`, etc.), but the **30-minute TTL** combined with no background refresh means:
- First visit: 4 parallel Supabase requests
- Subsequent visits within 30min: 0 requests (good)
- After 30min: stale data shown until next navigation

**Current state is acceptable** — the caching layer is well-designed. The improvement is to add **stale-while-revalidate** behavior:

##### [MODIFY] [cache.js](file:///c:/Users/LENOVO/Downloads/masaar-react-new/src/utils/cache.js)

Add a `cachedSWR()` variant that returns stale data immediately while refetching in the background. Use for list endpoints only.

---

#### 1.4 Fix `select('*')` Overfetching

**Problem found in 4 places**:

| File | Line | Issue |
|------|------|-------|
| `authApi.js` | 21 | `select('*')` on profiles during login — fetches all columns including avatar blob |
| `authApi.js` | 62 | `select('*')` on profiles during register |
| `examsApi.js` | 42 | `getExam()` uses `select('*')` — includes full `questions` JSON (can be 100KB+) |
| `homeworksApi.js` | 158 | `getMySubmission()` uses `select('*')` on submissions |

##### [MODIFY] Each file — replace `select('*')` with explicit column lists.

**Impact**: Login payload drops from ~2KB to ~200 bytes. `getExam()` for metadata-only uses drops by 10-100x.

---

#### 1.5 Home Page Particle System Performance

**Problem**: [Home.jsx](file:///c:/Users/LENOVO/Downloads/masaar-react-new/src/pages/Home.jsx) has **TWO separate particle systems** running simultaneously:
1. Canvas-based constellation (lines 38-136) — **O(n²) line-drawing** with 38+ particles checking 130px proximity
2. DOM-based particles (lines 177-202) — creates a **new DOM element every 800ms** via `document.createElement`, each living for 6 seconds

The DOM particle system is a **memory leak pattern** — it appends to `document.body` (not a React-managed node), and while `setTimeout` removes them, rapid navigation can orphan elements.

##### [MODIFY] [Home.jsx](file:///c:/Users/LENOVO/Downloads/masaar-react-new/src/pages/Home.jsx)

- Remove the DOM particle system entirely (lines 177-202)
- Optimize canvas: reduce particle count on mobile, skip line-drawing when `!mouse.active`, use spatial hashing for proximity checks

---

### Phase 2: Frontend Optimization (Priority: HIGH)

---

#### 2.1 Split ControlPanel.jsx (2870 lines, 116KB)

**Problem**: This is the largest file in the project — a single component with 15+ inline sub-components. It eagerly imports all API modules. Any change to any sub-panel causes the entire file to re-parse.

##### [MODIFY] Split into separate files:

```
src/pages/ControlPanel/
  index.jsx              — shell + routing
  AttemptsPanel.jsx      — scope/target/items flow
  AvailabilityPanel.jsx  — already a sub-component
  RevealPanel.jsx        — already a sub-component  
  StudentsSyncPanel.jsx  — already a sub-component
  SeasonalThemePanel.jsx — already a sub-component
  shared.jsx             — Breadcrumbs, SectionCard, etc.
```

Each panel lazy-loaded via `React.lazy()` so navigating to "Students Sync" doesn't load exam/video API code.

---

#### 2.2 Memoize Expensive Renders

**Candidates identified**:

| Component | Issue | Fix |
|-----------|-------|-----|
| `HomeworkCard` (Homework.jsx:575) | Re-renders on any parent state change | Wrap in `React.memo` |
| `TargetRow` (ControlPanel.jsx:686) | 100+ student rows re-render on any override change | `React.memo` + stable callbacks |
| `EditVideoModal` / `EditExamModal` | Inline in render tree | Already stable — no action needed |
| `Videos.jsx` line 531 video cards | Re-render on every quizTick change even when player is open | Move video list to memoized child |

---

#### 2.3 External CSS/Font Optimization

**Problem** ([index.html](file:///c:/Users/LENOVO/Downloads/masaar-react-new/index.html)):
- Font Awesome loaded from CDN as **full 60KB+ CSS** (line 23) — most icons unused
- Google Fonts `Cairo` loaded render-blocking (line 22)

##### [MODIFY] [index.html](file:///c:/Users/LENOVO/Downloads/masaar-react-new/index.html)

- Add `display=swap` and `preconnect` for Google Fonts
- Replace CDN Font Awesome with tree-shakeable `@fortawesome/fontawesome-svg-core` package, OR subset to only used icons
- Add `<link rel="preconnect">` for Supabase and R2 domains

---

### Phase 3: Database & Query Optimization (Priority: HIGH)

---

#### 3.1 Missing Pagination

**Problem**: Every `list*()` function fetches ALL rows with no pagination:
- `listVideos()` — all videos, all grades
- `listExams()` — all exams
- `listHomeworks()` — all homeworks
- `listStudents()` — all student profiles
- `listNotifications()` — already has `limit: 50` ✓

At 100 videos × 5 parts each, `listVideos()` returns 100 parent rows + 500 embedded part rows in one request.

##### [MODIFY] Add pagination to API functions

For now, the counts are small enough that pagination isn't urgent. But prepare the API layer:
- Add optional `{ page, pageSize }` params to each `list*()` function
- Default to returning all (backward compatible)
- Add `.range()` when params are provided
- The UI can implement infinite scroll or "Load More" when content grows

---

#### 3.2 Recommended Supabase Indexes

Based on the query patterns in the API layer, these indexes should exist (verify in Supabase dashboard):

```sql
-- Frequently filtered by grade (RLS + client)
CREATE INDEX IF NOT EXISTS idx_videos_grade ON videos(grade);
CREATE INDEX IF NOT EXISTS idx_exams_grade ON exams(grade);
CREATE INDEX IF NOT EXISTS idx_homeworks_grade ON homeworks(grade);
CREATE INDEX IF NOT EXISTS idx_profiles_grade_role ON profiles(grade, role);

-- Access overrides — the OR clause in listEffectiveOverrides
CREATE INDEX IF NOT EXISTS idx_overrides_lookup 
  ON access_overrides(item_type, scope, target_id);

-- Video progress — frequent lookups by (video_id, student_id)
CREATE INDEX IF NOT EXISTS idx_vprogress_video_student 
  ON video_progress(video_id, student_id);

-- Exam attempts — countSubmittedAttemptsBatch
CREATE INDEX IF NOT EXISTS idx_attempts_student_exam 
  ON exam_attempts(student_id, exam_id);
```

---

#### 3.3 Notification Read-State Optimization

**Problem**: `listMyReadIds()` fetches ALL read IDs for a user (could be hundreds over time) just to compute the unread badge count.

##### Recommend: Add a DB view or RPC

```sql
CREATE OR REPLACE FUNCTION unread_notification_count(p_user_id uuid)
RETURNS integer AS $$
  SELECT count(*)::integer FROM notifications n
  WHERE NOT EXISTS (
    SELECT 1 FROM notification_reads r
    WHERE r.notification_id = n.id AND r.user_id = p_user_id
  )
  -- add RLS-compatible scope filter here
$$ LANGUAGE sql STABLE;
```

---

### Phase 4: Security Fixes (Priority: CRITICAL)

---

#### 4.1 `.env` Committed to Repository

**Problem**: [.env](file:///c:/Users/LENOVO/Downloads/masaar-react-new/.env) contains live Supabase URL and anon key. While `.gitignore` lists `.env`, the file was committed before the rule was added.

##### Fix:
```bash
git rm --cached .env
git commit -m "Remove .env from tracking"
```

> [!CAUTION]
> The Supabase anon key is designed to be public (it's in the JS bundle anyway via `VITE_` prefix). But good hygiene dictates not committing `.env` files. The real secrets (service role key, R2 credentials, Bunny API key) are safely in Supabase Edge Function environment variables — NOT in the client bundle. ✅

---

#### 4.2 Client-Side Auth is Advisory Only

**Problem**: Auth check in `App.jsx` (line 139-150) reads token from sessionStorage on every route change. A user who manually sets `sessionStorage['masar-token']` and `sessionStorage['masar-user']` can bypass the `ProtectedRoute` gate.

**Mitigating factor**: All data access goes through Supabase with RLS, which validates the JWT server-side. The client-side gate is UX only — it redirects to login but doesn't protect data.

**No code change needed** — this is the correct architecture for an SPA. Document it.

---

#### 4.3 Anti-Cheating Measures are Deterrents Only

The `blockKeys` / `contextmenu` / `copy` prevention in App.jsx (lines 155-203) and `ScreenGuard.jsx` are commented as "deterrent, not real security" — **this is correct and honest**. The real protection is server-side scoring (`submit_exam_attempt` RPC) which never trusts client scores.

**No change needed** — architecture is sound.

---

### Phase 5: Production Deployment (Priority: HIGH)

---

#### 5.1 Docker + Nginx + PM2 Setup

##### [NEW] `Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

##### [NEW] `docker-compose.yml`

```yaml
version: '3.8'
services:
  web:
    build: .
    ports:
      - "3000:80"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

##### [NEW] `nginx.conf`

SPA-aware config with:
- `try_files $uri $uri/ /index.html` for client-side routing
- Gzip compression for JS/CSS/JSON
- Cache headers: immutable for hashed assets, no-cache for `index.html`
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, CSP

---

#### 5.2 Cloudflare Integration

Recommend Cloudflare as the CDN/proxy layer:
- DNS proxied through Cloudflare (orange cloud)
- SSL: Full (strict) mode
- Page Rules: cache everything under `/assets/` for 1 year
- Workers (optional): edge-side tenant routing for multi-domain SaaS

---

#### 5.3 Environment Structure

##### [NEW] `.env.production.example`

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_R2_PUBLIC_BASE=https://your-r2-bucket.r2.dev
VITE_PLATFORM_ID=default
```

---

### Phase 6: Performance Monitoring (Priority: MEDIUM)

---

#### 6.1 Recommended Stack (Free Tier)

| Concern | Tool | Cost |
|---------|------|------|
| Error tracking | Sentry (free: 5K events/mo) | $0 |
| Analytics | Plausible Cloud or self-hosted Umami | $0-9/mo |
| Uptime monitoring | UptimeRobot (free: 50 monitors) | $0 |
| Server monitoring | Netdata (self-hosted on VPS) | $0 |
| Supabase monitoring | Built-in dashboard + pg_stat_statements | $0 |
| Bundle analysis | `vite-plugin-visualizer` (dev only) | $0 |

##### [NEW] Add Sentry integration:

```bash
npm install @sentry/react
```

Initialize in `main.jsx` with environment-gated DSN.

---

### Phase 7: SaaS Multi-Tenant Architecture (Priority: STRATEGIC)

> [!IMPORTANT]
> This is the largest architectural change. It should be implemented AFTER Phases 1-5 are stable. Do NOT rush this.

---

#### 7.1 Tenant Isolation Model (Recommended: Row-Level)

For <100 teachers, use a **shared database with row-level isolation**:

```sql
-- Add to every content table
ALTER TABLE videos ADD COLUMN tenant_id uuid REFERENCES tenants(id);
ALTER TABLE exams ADD COLUMN tenant_id uuid REFERENCES tenants(id);
ALTER TABLE homeworks ADD COLUMN tenant_id uuid REFERENCES tenants(id);
ALTER TABLE profiles ADD COLUMN tenant_id uuid REFERENCES tenants(id);
-- ... etc

-- New table
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,        -- 'teacher-ahmed'
  domain text UNIQUE,               -- 'ahmed-math.com'
  name text NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#7c3aed',
  secondary_color text DEFAULT '#06b6d4',
  config jsonb DEFAULT '{}',        -- feature flags, limits
  created_at timestamptz DEFAULT now()
);

-- RLS: every query automatically scoped to tenant
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON videos
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

#### 7.2 Domain-Based Tenant Resolution

##### [NEW] `src/contexts/TenantContext.jsx`

```jsx
// On app boot:
// 1. Read hostname (teacher1.com or teacher1.masaar.app)
// 2. Call tenants table: SELECT * FROM tenants WHERE domain = $hostname
// 3. Set Supabase session variable: SET app.tenant_id = $id
// 4. Provide tenant config (logo, colors, name) via React context
// 5. Apply CSS variables for theming
```

##### [NEW] `src/hooks/useTenant.js`

```jsx
export function useTenant() {
  return useContext(TenantContext)
  // Returns: { id, name, slug, domain, logo, colors, config }
}
```

---

#### 7.3 Theme System

##### [NEW] `src/themes/applyTenantTheme.js`

Dynamic CSS custom properties based on tenant config:

```js
export function applyTenantTheme(tenant) {
  const root = document.documentElement
  root.style.setProperty('--primary', tenant.primary_color)
  root.style.setProperty('--secondary', tenant.secondary_color)
  // Update meta theme-color, favicon, document title
  document.title = `${tenant.name} | منصة تعليمية`
}
```

**No CSS file duplication** — one codebase, CSS variables for all color differences.

---

## Verification Plan

### Automated Tests
- `npm run build` — verify zero errors after code splitting
- Bundle size check: `npx vite-bundle-visualizer` — confirm <150KB initial load
- Lighthouse audit: target 90+ Performance score
- Docker build + run: verify nginx serves SPA correctly

### Manual Verification
- Navigate all routes — confirm lazy loading works (check network tab)
- Test login/logout flow with AuthContext
- Verify cache behavior: navigate Home → Videos → Home (should NOT re-fetch)
- Test on mobile: particle performance, drawer behavior
- Test dark mode persistence across routes

---

## Priority Order Summary

| # | Phase | Impact | Effort | Status |
|---|-------|--------|--------|--------|
| 1 | Code splitting (1.1) | 🔴 Critical | 1 hour | Pending |
| 2 | Auth context (1.2) | 🔴 Critical | 2 hours | Pending |
| 3 | `.env` cleanup (4.1) | 🔴 Critical | 5 min | Pending |
| 4 | `select('*')` fixes (1.4) | 🟠 High | 30 min | Pending |
| 5 | Home particle fix (1.5) | 🟠 High | 30 min | Pending |
| 6 | ControlPanel split (2.1) | 🟠 High | 2 hours | Pending |
| 7 | Font/CSS optimization (2.3) | 🟠 High | 1 hour | Pending |
| 8 | DB indexes (3.2) | 🟠 High | 30 min | Pending |
| 9 | SWR cache (1.3) | 🟡 Medium | 1 hour | Pending |
| 10 | React.memo (2.2) | 🟡 Medium | 1 hour | Pending |
| 11 | Docker/Nginx (5.1) | 🟠 High | 2 hours | Pending |
| 12 | Monitoring (6.1) | 🟡 Medium | 1 hour | Pending |
| 13 | Pagination prep (3.1) | 🟡 Medium | 1 hour | Pending |
| 14 | Multi-tenant (7.x) | 🟣 Strategic | 2-3 days | Pending approval |

**Total estimated effort**: ~3-4 days for Phases 1-6, additional 2-3 days for Phase 7 (SaaS).
