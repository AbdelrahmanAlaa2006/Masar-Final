# Implementation Plan — Teacher Feature Requests (2026-07-13)

Covers: (1) barcode attendance reliability, (2) manual announcements (WhatsApp + portal)
with saved messages & templates, (3) full financial ledger. All changes EXTEND existing
systems — nothing is replaced, all tables stay tenant-isolated under the existing RLS
model (`current_tenant_id()` + `has_permission()` + `set_tenant_id_on_insert` trigger).

---

## 1. Database changes (3 new idempotent migrations in `backend/migrations/`)

### A. `2026_07_14_barcode_reliability.sql`
Root causes of «لم يتم العثور على طالب مطابق لهذا الباركود أو البطاقة»:
1. **Token case/garbling** — USB keyboard-wedge scanners emit keystrokes through the OS
   layout. CapsLock / Shift / Arabic layout turn `BC-4f2a…` into `bc-4F2A…` or Arabic
   letters. The client maps Arabic→English but the result is lowercase, and the v3
   migration's `LOWER()` comparisons cannot use the existing `(barcode_token, tenant_id)`
   btree index (seq scan on every scan) and still miss codes with stray whitespace /
   control characters / Code39 `*` delimiters.
2. **Race in the input handler** — the Enter handler waited 50 ms before reading the
   input; a second scan arriving inside that window concatenated two barcodes into one
   lookup string (guaranteed "not found" on fast repeated scans).
3. **Missing tokens** — students created before the barcode column, or via older sync
   paths, can have NULL `barcode_token`/`qr_token`.

Fix (complete, not partial):
- New immutable SQL helper `normalize_scan_code(text)`: strip control chars, trim,
  strip Code39 `*` wrappers, lowercase.
- Redefine `get_student_identity(p_code, p_tenant_id)` to match
  `normalize_scan_code(qr_token/barcode_token) = normalize_scan_code(p_code)` with
  `LIMIT 1`, preserving the exact same return payload (no client contract change).
- Functional indexes `(tenant_id, normalize_scan_code(barcode_token))` and
  `(tenant_id, normalize_scan_code(qr_token))` → indexed O(log n) lookups at any scale.
- Backfill NULL tokens for every student in every tenant.

### B. `2026_07_14_announcements.sql`
- `message_templates` — one table for both saved messages (`kind='saved'`) and
  placeholder templates (`kind='template'`): title, body, category, timestamps.
  RLS: staff with `whatsapp` permission, tenant-scoped. Index `(tenant_id, kind)`.
- `announcements` — audit log of every manual send: scope
  (`all|grade|group|student`), targets, channels, recipient counts, body.
  RLS: staff `whatsapp`, tenant-scoped.
- `unified_notifications` extensions (queue is reused, NOT rebuilt):
  - `recipient text default 'parent' check (parent|student)`
  - `recipient_phone text` — phone snapshot resolved at queue time; senders use
    `COALESCE(recipient_phone, profiles.parent_phone)` so all legacy rows behave
    exactly as before.
  - `announcement_id uuid` (nullable FK), type CHECK gains `'announcement'`.
  - Partial index on pending WhatsApp rows for the queue drain.
- **Regression fix**: `2026_07_11_notifications_tenant_scope.sql` recreated
  `notifications_select_targeted` WITHOUT the `scope='group'` branch (added earlier by
  `group_scope.sql`), so group-targeted portal notifications are currently invisible to
  students. The policy is recreated with tenant scoping AND the group branch restored.

### C. `2026_07_14_finance_ledger.sql`
- `student_ledger` gains `transaction_date date` (backfilled from `created_at`,
  default `current_date`) and `billing_period text` (e.g. «اشتراك شهر يوليو») —
  backdated entries + partial-payment attribution. Index `(tenant_id, transaction_date)`.
- `finance_categories` — admin-defined revenue/expense categories:
  `(tenant_id, name, kind in ('revenue','expense'), is_active)`, unique per tenant,
  seeded with sensible defaults for every existing tenant (books, printing, rent,
  electricity, salaries…). RLS: `payments` staff write, tenant read.
- `finance_transactions` — non-student-ledger cash movements (custom revenue + all
  expenses): category, direction in/out, amount, description, optional student link,
  `transaction_date`, timestamps. RLS `payments` staff; indexes on
  `(tenant_id, transaction_date)` and `(tenant_id, category_id)`.
- RPCs (SECURITY DEFINER, guarded by `has_permission(auth.uid(),'payments')` +
  `current_tenant_id()`, execute revoked from anon):
  - `finance_daily_ledger(p_from, p_to)` — chronological UNION of approved student
    payments/refunds and finance transactions, with opening balance + running balance
    computed in SQL (single query, no N+1).
  - `finance_report(p_from, p_to)` — revenue total/by category, expenses total/by
    category, subscriptions total, net income (single query).
  - `finance_cash_balance()` — all-time cash on hand.
  - `finance_outstanding_balances()` — per-student (charges − payments) > 0, grouped
    in SQL.
- Partial payments: when staff record a subscription payment for month M and no
  `charge` exists for (student, M), a charge of `max(0, grade fee − student discount)`
  is auto-inserted with the same `billing_period`; remaining = charge − Σ payments.
  This reuses the ledger's existing charge/payment semantics — the outstanding-balance
  logic in `get_student_identity` and `getStudentBalance` keeps working untouched.

## 2. API changes (`backend/`)
- `profilesApi.js` — unchanged (`getStudentIdentityByQr` contract preserved).
- **new** `announcementsApi.js` — templates CRUD/search; `sendAnnouncement()` resolves
  recipients with ONE lean profiles select per send, creates ONE portal `notifications`
  row (existing scope model: all/grade/group/student), chunk-batch-inserts
  `unified_notifications` rows (500/insert — no N+1), substitutes `{{student_name}}`,
  `{{grade}}`, `{{group}}` per recipient, queues parent WhatsApp always (when
  parent_phone exists) and student WhatsApp ONLY when the student's login handle is a
  real phone (short-code students are silently portal-only — never an error).
- **new** `financeApi.js` — categories CRUD, transactions CRUD (edit/delete with
  `audit_logs` entries), report/ledger/balance/outstanding wrappers, and
  `recordSubscriptionPayment` (charge-then-payment partial logic).
- `paymentsApi.js` — `recordCashPayment` gains optional `transactionDate` +
  `billingPeriod` (backward-compatible defaults).
- `parentNotificationsApi.js` — queue list/processors become recipient-aware via
  `COALESCE(recipient_phone, parent_phone)`; everything else untouched.
- `supabase/functions/wapilot-send/index.ts` — batch drain selects `recipient_phone`
  and coalesces (needs redeploy; degrades gracefully until then).

## 3. UI changes (`src/pages/ControlPanel/`)
- `AttendancePanel.jsx` — scanner input handler rewritten: synchronous DOM read on
  Enter/Tab, immediate clear (kills the double-scan race), client-side normalization
  (control chars, `*`, whitespace, Arabic layout map, Arabic-Indic digits), serialized
  lookups, debug console spam removed. Everything else (sessions, auto check-in,
  payment bell, modal) untouched.
- **new** `AnnouncementsPanel.jsx` — compose (audience: all / stage / group-in-stage /
  single student), template & saved-message pickers (searchable, editable, deletable,
  categorized), placeholder preview, channel toggles (portal / WhatsApp), send history.
  Registered as section `announcements`, gated by `whatsapp` permission + notifications
  feature flag.
- **new** `FinancePanel.jsx` — tabs: الدفتر اليومي (running balance, add
  revenue/expense, edit/delete, backdate date picker), التصنيفات, التقارير (date-range
  revenue/expenses/net/by-category + CSV export + printable PDF via the established
  print-window pattern), المتأخرات (outstanding balances). Registered as section
  `finance`, gated by `payments` permission.
- `index.jsx` — two new SectionCards + `isSectionAllowed` entries.
- `Payments.jsx` — duplicate-month hard block relaxed for partial payments (shows paid
  so far + remaining instead of refusing), passes billing period + optional backdate.

## 4. Notification flow (announcements)
compose → resolve recipients (1 query) → `announcements` log row →
portal: 1 `notifications` row (RLS fan-out, zero per-student rows) →
WhatsApp: batch rows in `unified_notifications` (parent + eligible students) →
existing queue panel / WAPilot batch / Cloud API / wa.me manual flows send them.
Students with short-code logins: portal ✔, own WhatsApp skipped, parent WhatsApp ✔.

## 5–7. Ledger / template / saved-message design — see §1B, §1C above.

## 8. Performance
- Barcode lookups become index-only; no client behavior change otherwise.
- Announcement fan-out: 1 select + ⌈N/500⌉ inserts for N recipients; portal cost is O(1).
- Ledger reports are single SQL aggregates with supporting indexes; no unbounded
  client-side reduction of full tables.
- No new runtime dependencies; new panels are lazy-loaded like the existing ones.

## 9. Security
- Every new table: RLS ON, tenant trigger, tenant-scoped policies, permission gates
  (`whatsapp` for messaging, `payments` for finance) mirroring existing conventions.
- New RPCs: SECURITY DEFINER + explicit permission/tenant checks + `search_path=public`
  + EXECUTE revoked from anon/public (repo convention from `subscription_fees`).
- Fixes the group-scope portal notification RLS regression with tenant scoping kept.

## 10. Migration strategy
- Three idempotent SQL files (repo convention: run once in Supabase SQL editor);
  additive-only — no destructive changes, existing rows backfilled in place.
- Order: barcode → announcements → finance (independent; any order is safe).
- Rollback: each file only adds columns/tables/policies/functions; policies/functions
  can be re-created from the previous migration files if ever needed.
