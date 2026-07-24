# Performance & Scalability Audit — Masaar Multi-Tenant SaaS
**Date:** 2026-07-24 · **Scope:** full-stack static audit + analysis of the existing 500-user Locust run · **Author:** performance review pass · **Status:** audit only, no application code changed.

> Target scale under review: hundreds of teachers (tenants), thousands of concurrent students.
> Priority per request: **reduce unnecessary requests** far above micro-optimization. Never trade correctness or multi-tenant isolation for speed.

---

## 1. Executive Summary

The platform is **architecturally healthy** for its stage. The three things that usually sink a Supabase SaaS are already done well here:

- **Caching** — `src/utils/cache.js` is a real cache: in-memory + localStorage, **in-flight promise de-duplication** (concurrent identical requests collapse to one network call), tenant-scoped keys, large lists kept memory-only. This already eliminates most *duplicate concurrent* requests.
- **Indexing** — `tenant_id` is indexed on every table (`2026_05_26_multitenant.sql` loop), plus composite hot-path indexes (attendance, grades, profiles roster, barcode/QR, ledger) and a **partial index** on the WhatsApp JSONB queue. Very little is missing.
- **Server-side aggregation** — heavy work is pushed into RPCs (`save_attendance_batch_v2`, `finance_report`, `biz_dashboard`, `get_student_status_counts`, `submit_exam_attempt`, `get_student_identity`), not done by downloading rows to the browser.

**The single biggest scalability risk is not any one query — it is a constant, per-user _polling floor_.** Two always-on intervals run for every logged-in user regardless of whether anything is happening:

| Source | Interval | Cost per user | File |
|---|---|---|---|
| Student chat widget | **5 s** | ~12 req/min | `src/components/StudentChatWidget.jsx:78` |
| Notifications bell | **30 s** (10 s cache ⇒ always a miss) × **2 queries** | ~4 req/min | `src/components/Notifications.jsx:93` |

At 1,000 concurrent students that is **~15,000–16,000 requests/minute (~250–270 req/s) of pure baseline**, independent of real usage, that never pauses when the tab is backgrounded. This floor — not feature traffic — is what will dominate Supabase compute, egress, and the connection saturation already visible in your 500-user run (**P99 = 18 s, max = 51 s, `ConnectionReset` failures**).

Fixing the polling floor and three over-fetch queries is estimated to cut steady-state Supabase request volume by **70–90%** with small, low-risk changes and **zero** correctness or isolation impact.

---

## 2. Architecture Overview

- **Frontend:** React + Vite SPA, one build served on many custom domains. Tenant resolved at boot from hostname/`?tenant=` (`TenantContext.jsx`), theme + config lazy-imported per tenant.
- **Auth:** custom session layer in `sessionStorage` (`masar-token`/`masar-user`/`masar-permissions`) synced with `supabase.auth.onAuthStateChange`; a background `refreshProfile()` pulls role/permissions on boot (`AuthContext.jsx`).
- **Data:** Supabase (PostgREST) accessed directly from the browser through `backend/*Api.js` modules using the anon key + RLS. Writes and aggregations use SQL **RPCs**.
- **Multi-tenant isolation:** every table carries `tenant_id`; RLS uses `current_tenant_id()` / `has_permission()` / `is_admin()` — all `STABLE SECURITY DEFINER` (evaluated once per query).
- **Edge Functions:** `wapilot-send` (WhatsApp, now with a per-tenant lease lock), plus `bunny-*`/`r2-*` for media, `create-tenant-admin`, `sync-students`.
- **Background work:** pg_cron heartbeat drains the WhatsApp queue; a module-singleton browser worker (`whatsappWorker.js`) shows progress and can drive sends.
- **Storage:** Bunny/R2 via signed-URL edge functions (media never proxied through the DB — good).

---

## 3. Locust Results (existing run — `locust_500_v2_stats.csv`, 500 users, 2026-06-29)

| Metric | Value |
|---|---|
| Total requests | 14,648 |
| Failures | 37 (**0.25%**) — all `ConnectionResetError(10054)` |
| Throughput | 122 req/s |
| Median | 670 ms |
| P95 | 5,600 ms |
| **P99** | **18,000 ms** |
| **Max** | **51,326 ms** |

**Reading it:** the median is fine, but the **tail collapses** — P99 of 18 s and a 51 s max mean that under 500 users a meaningful slice of requests are effectively timing out, and the failures are *connection resets* (the server/pool closing connections), i.e. **connection/rate saturation**, not slow SQL. 

**Coverage gap:** this suite is **read-only** — students reading videos/exams/homeworks/profile and the admin roster. It does **not** exercise writes (attendance save, grade recording), RPCs, edge functions, the dashboard multi-query load, chat, or the notification poll. So the real production tail is **worse** than this run shows, because the polling floor and write paths aren't represented. Section 3 of the roadmap adds them (see the new Locust suite, `locustfile_full.py`).

---

## 4. API Performance (per feature — requests issued)

| Feature | Requests on use | Notes |
|---|---|---|
| Teacher login | 1 auth + `refreshProfile` (1 profiles, +1 tenant_admins if assistant) | `login()` calls `refreshProfile`, and the mount effect calls it again → **double profile fetch on login** (`AuthContext.jsx:99,162`). |
| Dashboard load | `get_student_status_counts` RPC + roster count/page + summaries | Counts are a server RPC (good). |
| Student home | ~7–9 queries in 2 parallel groups | `Promise.all([H,V,E,S])` + `Promise.all([subs,prog,attempts])` + events + cached upcoming-exam (`HomeDashboard.jsx:90,209,248,269`). Shared lists cached; per-student ones are not. |
| Attendance save | 1 RPC `save_attendance_batch_v2` | Batched server-side — excellent. |
| Grade recording | batch insert + reveal notification fan-out | OK. |
| Notifications (all users) | **2 queries / 30 s, forever** | `listNotifications(50)` + `listMyReadIds` (**unbounded**). See §13. |
| Student chat | **1 query / 5 s, forever while mounted** | `StudentChatWidget.jsx:78`. See §13. |
| Barcode lookup | 1 RPC `get_student_identity` | Indexed, server-side — excellent. |
| Parent report | grades + attendance + ledger reads | `listCenterUniqueEvaluations` over-fetches (see §5/§11). |
| WhatsApp queue panel | status poll / 5 s (admin only, panel open) | Low volume, acceptable. |

---

## 5. Database Performance

**Strong:** RPC-first for aggregation/batch; head-only `count` queries for summaries (`getNotificationQueueSummary`, roster count); RLS helpers `STABLE` (one eval/query).

**Weak spots (over-fetch / fetch-then-filter-in-JS):**
1. `reportsApi.js:52` `listCenterUniqueEvaluations(grade,type)` — `.eq('type',type)` only, then **filters `profiles.grade === grade` in JavaScript** (`:65`). Downloads **every grade row of that type in the tenant** to derive a dropdown of titles. Should filter by grade in SQL (or a `DISTINCT title` RPC).
2. `parentNotificationsApi.js:224` `retryAllFailed` — `.eq('tenant_id',…)` only, then filters `status.whatsapp==='failed'` in JS (`:231`). Downloads the **entire** `unified_notifications` table for the tenant to find failed rows. Should filter `status->>whatsapp='failed'` in SQL (a partial index like the pending one would make it instant).
3. `select('*')` on wide/hot tables: `attendanceApi.js:139/163/437`, `gradesApi.js:83/436/565`, `homeworksApi.js:194/210`, `paymentsApi.js:68/355`, `packagesApi.js:310`, `examsApi.js:80`. Each returns all columns — extra egress on every read.

---

## 6. Frontend Performance

- **Route/code splitting:** tenant theme + config are dynamically imported per tenant (`TenantContext.jsx:142`) — good. Confirm heavy report/exam pages are `React.lazy` (recommended if not).
- **`available-tenants` query runs for every visitor** (`TenantContext.jsx:62`) though it only feeds the **localhost dev switcher**. Cached 30 min, but still one query per cold visitor. Gate it behind `isLocalhost`.
- **Blocking boot chain:** tenant resolve → tenant config → dynamic theme import all gate first paint (`{!loading && …}`). Acceptable but the `available-tenants` call is on the critical path for no production benefit.

---

## 7. React Rendering Audit

- **Context value memoization is done right** — `TenantContext` and `AuthContext` both wrap their `value` in `useMemo` with correct deps, and callbacks in `useCallback`. This prevents whole-tree re-renders on every provider render. 
- **`Notifications.jsx` recomputes `sorted` via `useMemo`** — good, but it re-runs every 30 s poll because `list` changes identity each fetch even when data is unchanged. Minor; the real cost is the network poll, not the render.
- **No obvious unkeyed list or inline-object-prop storms** in the components read. The rendering layer is not your bottleneck — the **network floor** is.

---

## 8. Supabase Usage Audit

- **Requests:** the polling floor (chat + notifications) is the overwhelming majority of steady-state Supabase requests at scale. Everything else is bursty and cache-shielded.
- **Egress:** `select('*')` reads and the notification badge fetching 50 full rows + all read-ids every 30 s are the main avoidable bytes.
- **Connections:** PostgREST + the browser-direct model means every polling client holds/opens connections; the 500-user `ConnectionReset` failures indicate you're already brushing pooler limits. Reducing the floor directly relieves this.
- **Realtime:** not currently used for chat/notifications (they poll). Realtime would replace *N polls/min* with *1 subscription* — but has its own concurrent-connection ceiling; see §10 for the safer middle path.

---

## 9. Edge Function Audit

- **`wapilot-send`** — now guarded by the per-tenant **lease lock** (`acquire_whatsapp_lock`/`release_whatsapp_lock`), a 110 s time budget, and per-row status writes. Auth/config resolve once per batch. This is in good shape post-fix. Residual: `whatsapp_cloud` gateway still sends client-side (not server-owned); only `wapilot` is covered by cron + lease.
- **Media edge functions** (`bunny-*`, `r2-*`) issue signed URLs — correct pattern, no DB proxying of bytes.
- No edge function does per-item loops with per-item network calls except the intentional, paced WhatsApp sender.

---

## 10. Caching Opportunities (highest leverage)

| What | Where | Recommendation | Safe TTL |
|---|---|---|---|
| **Notification badge** | `Notifications.jsx` | Poll a **count only** (unread count), not 50 rows + all reads. Fetch the full list **only when the panel opens**. | count poll 60 s; list on-open (cache 10 s) |
| **Chat unread** | `StudentChatWidget.jsx` | Poll only while **open**; when closed, poll a cheap unread-count at a long interval (or Realtime on the student's own thread). Gate on `document.visibilityState`. | open: 5–8 s; closed: 30–60 s or realtime |
| `refreshProfile` | `AuthContext.jsx` | De-dupe the login+mount double call; cache profile for ~60 s. | 60 s |
| `available-tenants` | `TenantContext.jsx` | Only fetch on localhost. | n/a (skip in prod) |
| Report dropdowns (evaluations/titles) | `reportsApi.js` | Cache per (grade,type). | LIST_TTL (30 min) |

All of these are **safe** to cache because they are either per-user read state (short TTL) or tenant-stable config (already namespaced by tenant in `cache.js`).

---

## 11. Query Optimization Opportunities

1. **`listCenterUniqueEvaluations`** → push the grade filter into SQL (`profiles!student_id(grade)` with `.eq` isn't directly filterable through the embed, so use an RPC returning `DISTINCT title, max_score` for `(tenant, grade, type)`). Removes a full-type table download.
2. **`retryAllFailed`** → `update … where status->>whatsapp='failed'` in one statement (or select with that filter), never fetch-all-then-filter.
3. **`listMyReadIds`** → bound it: only reads for the currently-loaded notification ids (`.in('notification_id', visibleIds)`), or store a per-user `last_read_at` and compare, instead of returning the user's entire read history every poll.
4. **`select('*')` → explicit column lists** on the hot read paths (attendance/grades/homeworks lists), matching the lean pattern already proven in your Locust "PAGED+lean" vs "select=\* OLD" comparison (8.3 KB → 4.0 KB avg payload).

---

## 12. Missing Database Indexes

Indexing is already thorough. Only two gaps worth adding, both tied to §11:

1. **Partial index for failed WhatsApp rows** (mirrors the existing pending one) — supports a fixed `retryAllFailed`:
   ```sql
   create index if not exists idx_unified_notifications_wa_failed
     on public.unified_notifications(tenant_id, created_at)
     where (status->>'whatsapp') = 'failed';
   ```
2. **`grades(tenant_id, type, title)`** — supports the report evaluation/title lookups if they move server-side:
   ```sql
   create index if not exists idx_grades_tenant_type_title
     on public.grades(tenant_id, type, title);
   ```
No obviously **unused** indexes were found in the migration set, but confirm with `pg_stat_user_indexes` on the live DB (query provided in §16) before pruning anything — several composite indexes (e.g. `idx_grades_session`) may only be exercised by specific reports.

---

## 13. Request Reduction Opportunities (your top priority)

Ranked by requests eliminated at 1,000 concurrent students:

1. **Chat widget 5 s poll → visibility-gated + count-when-closed.** ~12 → ~1–2 req/min/user. **≈ -85% of chat traffic.** (`StudentChatWidget.jsx:78`)
2. **Notification badge: count-only poll at 60 s + list-on-open.** 2 queries/30 s (heavy) → 1 light query/60 s. **≈ -85% of notification traffic + smaller payloads.** (`Notifications.jsx:93`, `notificationsApi.js:8,19`)
3. **De-dupe `refreshProfile` on login** (remove the double call). -1 query per login.
4. **Skip `available-tenants` in production.** -1 query per cold visitor.
5. **Merge student-home per-student queries** (`subs`, `prog`, `attempts`) into **one RPC** returning the three result sets. 3 round-trips → 1. (`HomeDashboard.jsx:209`)
6. **`retryAllFailed` / report dropdowns**: one filtered query instead of full-table download (also §11).

Items 1–2 alone remove the majority of steady-state requests.

---

## 14. Estimated Cost Savings (order-of-magnitude, state assumptions)

Assume 1,000 concurrent students during peak, 3 peak hours/day.

- **Current baseline floor:** chat (12/min) + notif (4/min) ≈ **16 req/min/user** → 16,000 req/min → **~2.9 M requests over a 3-h peak/day**, ~23 M/day if usage is spread. Plus egress: the notification poll ships ~50 rows + read-ids ≈ several KB × 2/min/user.
- **After §13 items 1–2:** chat ~1.5/min + notif ~1/min ≈ **2.5 req/min/user** → **~85% fewer steady-state requests** and a comparable egress cut (count queries are tiny).
- **Impact:** directly relieves the pooler saturation behind the 500-user `ConnectionReset` failures, lowers Supabase compute (fewer RLS/query executions) and egress (fewer/smaller payloads). At Supabase's usage-based tiers this is the difference between comfortably serving thousands and paying for — or being throttled by — a self-inflicted request floor.

(These are planning estimates, not a billing forecast — validate against your Supabase dashboard's request/egress graphs before/after.)

---

## 15. Scalability Risks

| Severity | Risk | Root cause | Impact |
|---|---|---|---|
| **Critical** | Per-user polling floor (chat 5 s + notif 30 s) | Always-on intervals, no visibility gating, badge fetches full list | Linear request/egress/connection growth with users; drives pooler saturation |
| **Critical** | Tail-latency collapse at 500 users (P99 18 s, resets) | Connection/rate saturation, amplified by the floor | Real-user timeouts under load |
| High | Fetch-then-filter-in-JS (`listCenterUniqueEvaluations`, `retryAllFailed`) | Missing SQL filter | Full-table downloads; egress + slow admin actions |
| High | `listMyReadIds` unbounded | Returns entire read history each poll | Grows forever per active student |
| Medium | `select('*')` on hot read paths | Convenience | Extra egress on every read |
| Medium | Student-home multi-round-trip per load | Un-merged per-student queries | 3–4 avoidable round-trips/load |
| Low | `refreshProfile` double call; `available-tenants` in prod | Redundant calls | 1–2 extra queries per session |
| Low | `whatsapp_cloud` not server-owned | Only `wapilot` covered by cron/lease | Cloud tenants depend on tab (isolation not a concern) |
| Resolved | WhatsApp duplicate sends / cap overshoot | No mutual exclusion | Fixed 2026-07-24 via lease lock |

---

## 16. Prioritized Optimization Roadmap (highest impact → lowest risk; all reversible)

**Phase 1 — kill the polling floor (biggest win, lowest risk):**
1. Chat widget: gate polling on `isOpen` + `document.visibilityState`; when closed, poll a cheap unread count at 30–60 s (or subscribe to Realtime on the student's own thread only).
2. Notifications: split into a light **unread-count** poll (60 s) and a **full-list fetch on panel open**; bound `listMyReadIds` to visible ids or a `last_read_at` marker.

**Phase 2 — stop the full-table downloads:**
3. `retryAllFailed`: single filtered `update`/`select` + add `idx_unified_notifications_wa_failed`.
4. Reports: move evaluation/title derivation into a `DISTINCT` RPC filtered by `(tenant, grade, type)` + add `idx_grades_tenant_type_title`.

**Phase 3 — trim per-request cost:**
5. Replace `select('*')` with explicit columns on hot list reads (attendance/grades/homeworks).
6. Merge the three per-student home queries into one RPC.

**Phase 4 — cleanup:**
7. De-dupe `refreshProfile` login+mount; skip `available-tenants` in production.
8. Confirm index usage on the live DB before any pruning:
   ```sql
   select relname, indexrelname, idx_scan
   from pg_stat_user_indexes
   where schemaname='public'
   order by idx_scan asc;   -- idx_scan = 0 over a representative window ⇒ candidate to review
   ```

**Non-negotiables:** every change above preserves RLS/tenant scoping (the cache is already tenant-namespaced; count queries inherit the same RLS). None require a rewrite. Ship Phase 1 first and re-measure with the expanded Locust suite before proceeding.
