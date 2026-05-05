# Production Hardening — Deploy Guide

Everything in code is done. Below are the **manual steps** you must run
once before deploying to production. Do them in order.

---

## 1. Run the SQL migration

Open **Supabase Dashboard → SQL Editor → New query** and paste the
entire contents of:

```
backend/migrations/2026_05_05_hardening.sql
```

Hit **Run**. It is idempotent — safe to re-run.

This adds:
- 14 indexes for the hot queries
- `bunny_video_id` + `bunny_library_id` columns on `video_parts`
- `increment_part_view()` Postgres function (atomic view counter)
- `submit_exam_attempt()` Postgres function (server-side exam scoring)
- `ENABLE ROW LEVEL SECURITY` on every public table

## 2. Audit RLS policies

After the migration, run this in the SQL editor:

```sql
select schemaname, tablename, rowsecurity,
  (select count(*) from pg_policies p
    where p.schemaname='public' and p.tablename=t.tablename) as policy_count
from pg_tables t
where schemaname='public'
order by tablename;
```

For every row:
- `rowsecurity` MUST be `true`.
- `policy_count` MUST be `> 0`. **A table with RLS enabled and zero
  policies is completely locked.** If you see one, either add the right
  policies or temporarily disable RLS on it until you do.

The .sql files in `backend/` already define policies for
`access_overrides`, `notifications`, `notification_reads`, and group
scope. Verify policies also exist on:
- `videos`, `video_parts`
- `lectures`
- `exams`, `exam_attempts`
- `quiz_attempts`, `video_progress`
- `profiles`

If any are missing, add them in the dashboard → Authentication →
Policies before you let users in.

## 3. Remove the committed `.env`

Real anon keys aren't a breach (they're meant to be public), but
committing `.env` is a foot-gun for the next secret. Run:

```bash
git rm --cached .env
git commit -m "chore: stop tracking .env"
```

Then audit history for any service-role key leak:

```bash
git log --all -p -S "service_role"
git log --all -p -S "SUPABASE_SERVICE_ROLE_KEY"
```

If you find one, **rotate it** in Supabase Dashboard → Project Settings
→ API → Reset service_role key.

## 4. Set up Bunny Stream

1. Bunny Dashboard → **Stream** → create a Library (or use your existing one).
2. Library → **Settings → Security** → enable **Token Authentication**.
3. Copy the **"Token Authentication Key"** (this is NOT the API key).
4. Note your **Library ID** (the integer in the URL/library list).
5. (Optional, recommended) **Allowed Referrers**: add your domain(s).

## 5. Configure Supabase Edge Function secrets

In your terminal:

```bash
supabase secrets set BUNNY_TOKEN_KEY=<paste-token-auth-key>
supabase secrets set BUNNY_LIBRARY_ID=<paste-library-id>
```

(R2 secrets — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_PUBLIC_BASE` — are already required by the existing
`r2-upload-url` / `r2-delete` functions; nothing new there.)

## 6. Deploy the Edge Functions

```bash
supabase functions deploy bunny-signed-url
# (re-deploy the existing ones too if you haven't recently)
supabase functions deploy r2-upload-url
supabase functions deploy r2-delete
supabase functions deploy sync-students
```

## 7. Build & deploy the frontend

```bash
npm run build
# Vercel auto-deploys on git push, or:
vercel --prod
```

The new `vercel.json` adds long-cache headers for `/assets/*` and
sensible security headers (HSTS, X-Frame-Options, Referrer-Policy,
Permissions-Policy) to every other route.

---

## What changed in the code (quick reference)

| Change | File(s) |
|---|---|
| Drop `questions` from list payload | `backend/examsApi.js` |
| Server-side scoring | `backend/examsApi.js`, `src/pages/ExamTaking.jsx` |
| Atomic view counter | `backend/progressApi.js`, `src/pages/Videos.jsx` |
| Bunny Stream support | `backend/videosApi.js`, `backend/bunnyApi.js`, `src/components/BunnyPlayer.jsx`, `src/pages/Videos.jsx`, `src/pages/VideoAdd.jsx` |
| Bunny signed-URL Edge Function | `supabase/functions/bunny-signed-url/index.ts` |
| Client cache (60s TTL) | `src/utils/cache.js`, wired in `Videos.jsx`, `Lectures.jsx`, `ControlPanel.jsx` |
| Security + cache headers | `vercel.json` |
| All migrations | `backend/migrations/2026_05_05_hardening.sql` |

## Adding a Bunny video (admin workflow)

1. Upload the video in the Bunny Stream dashboard.
2. Copy the **Video GUID** (looks like `3f9c7d12-4b2a-4cf2-9e1b-72a0bfa0cbe4`).
3. In Masaar → **Add Video** → for each part, pick **Bunny Stream** as
   the source, paste the GUID. Leave Library ID empty unless this video
   is in a non-default library.
4. Save. Students see a token-signed Bunny iframe; the GUID is never
   guessable from the network response (the URL is always signed).

## What still needs YouTube → Bunny migration

Existing rows still have `source='youtube'` and a `youtube_id`. They
will keep playing through the YouTube embed until you re-add them as
Bunny parts. There's no auto-migration — Bunny needs the actual file,
which YouTube doesn't expose. Re-upload to Bunny over time.

## Verifying it works after deploy

- Sign in as a student → open a video → confirm view counter ticks once
  per playback (atomic — no double-count).
- Submit an exam → server logs should show `submit_exam_attempt` RPC; the
  `exam_attempts.score` is computed server-side.
- DevTools → Network: opening Videos page twice within 60s should fire
  `videos?select=...` only ONCE.
- Try a Bunny video as a student in the wrong grade — should get 403.
- DevTools → Network on a Bunny video: the iframe URL must contain
  `?token=...&expires=...`.

## Cost expectations

- Supabase Free tier handles up to ~300 DAU comfortably.
- Move to Supabase Pro ($25/mo) at 300+ DAU or for daily backups.
- Bunny Stream at 1000 DAU watching 30 min/day ≈ **$45/mo** delivery.

## If something breaks

Rollback steps:
- The cache is opt-in; remove the `cached(...)` wrappers in `Videos.jsx`,
  `Lectures.jsx`, `ControlPanel.jsx` to disable it (no data loss).
- The exam scoring RPC fails fast on missing function. If the migration
  didn't run, exam submits will throw — students keep their answers in
  localStorage so re-deploying after the migration lets them retry.
- Bunny: if signing fails, `BunnyPlayer` shows an inline error and does
  not fall back to an unsigned URL (intentional — never serve unsigned).
