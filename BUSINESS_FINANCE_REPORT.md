# Business Finance — Implementation Report

**Date:** 2026-07-19 · **Status:** Phases 1–7 implemented; Phase 8 prepared architecturally · **Build:** ✅ zero errors · **Regression:** ✅ tenant app verified unaffected

## What was implemented

**Database (applied live):**
- Foundation: `biz_accounts`, `biz_categories`, `biz_contracts` (open type + terms JSONB + snapshot history trigger), `biz_recurring`, `biz_transactions` (the single ledger: status/source/attachments/audit/original-currency), `biz_settings` — all with super-admin-only RLS, seeded categories and a default account.
- RPCs (all `SECURITY DEFINER`, guarded, anon-revoked, guard verified live): `biz_dashboard`, `biz_post_due_recurring` (idempotent via unique `(recurring_id, occurred_on)` index), `biz_billing_overview`, `biz_kpis`, `biz_operations`.

**Services:** `backend/bizFinanceApi.js` — dashboard/billing/KPIs/operations wrappers, ledger CRUD with filters+pagination, void/confirm, contracts, recurring, accounts, categories, settings.

**UI:** `src/pages/ControlPanel/BusinessPanel.jsx` — lazy chunk (~14.5 kB gzip), 8 tabs (overview, ledger, contracts, billing, KPIs, costs, operations, reports), dependency-free SVG charts, date presets + custom range, category/teacher/status filters, pagination, CSV(Excel)/PDF exports, modals for transactions/contracts/recurring/categories/accounts. Entry card added to SuperAdminPanel.

## Architectural decisions (justifications in BUSINESS_FINANCE_ARCHITECTURE.md)

1. Ledger-only money — every displayed number aggregates stored `confirmed` transactions; nothing derives from UI state.
2. One RPC per screen — 8 tabs, ≤2 round trips each, zero N+1 (contracts reuse the billing RPC's sums).
3. Contracts store agreements; money always flows through ledger rows carrying `contract_id`.
4. Expected income computed in SQL from terms (documented rules + `expected_total` override) — flexible without a billing-schedule table.
5. `biz_` namespace + single-role RLS = structural isolation from tenant finance.
6. Inline SVG charts + lazy chunk = zero new dependencies, zero tenant-bundle impact.

## Performance considerations
- Indexed range scans for all reports; head-only counts; partial FK indexes.
- No polling anywhere; operations refresh is manual; recurring posting piggybacks on dashboard open.
- Per-tab state slices; already-visited tabs don't refetch; lookups load once.

## Security considerations
- RLS `is_super_admin()` on all 6 tables (FOR ALL, authenticated only); 5 RPCs guarded + revoked; live negative test passed (`not authorized`).
- No join path between company and tenant money; tenants referenced only for revenue attribution.
- UI role gate is cosmetic defense-in-depth; the database is the boundary.

## Scalability considerations
- Company-scale volumes (thousands of rows/year) leave 100× headroom on current indexes; a materialized monthly rollup is the documented escape hatch at millions of rows.
- Multi-company/brand future = additive `company_id` because all reads pass through 5 RPC choke points.

## Trade-offs considered
- Single-entry vs double-entry (chose simple, with mechanical upgrade path).
- Terms-derived expected income vs billing schedule table (chose flexibility; override field covers odd deals).
- Simplified 90-day churn vs cohort analysis (data volume doesn't justify cohorts yet).
- EGP functional currency with USD reference fields vs full multi-currency (no FX logic in SQL).

## Recommended future improvements
1. **Runway** — needs an opening-balance convention in `biz_settings`; then Costs tab can show months-of-cash.
2. **Warm-up for contract billing** — auto-generate `pending` ledger rows from `terms.payment_day` (the poster pattern already exists for recurring).
3. **Attachment upload UI** — columns exist; wire the existing R2 helper into the tx/contract modals.
4. **R2 storage metrics + response-time telemetry** for the Operations tab (needs external instrumentation, not SQL).
5. **`FOR UPDATE SKIP LOCKED`** claim in recurring posting if multiple super admins ever exist.
6. **Invoice satellite** (`biz_invoices`) when formal invoicing starts — numbering counter slot already reserved in `biz_settings`.

## Verification performed
- `npm run build` — zero errors; BusinessPanel emitted as separate lazy chunk.
- Live DB: all tables/columns present; RPC guards return `not authorized` without super-admin auth; seeds idempotent.
- Regression: dev server loads the power tenant landing with correct branding/title; console clean of new errors (only a pre-existing vendor-prefix warning). Tenant flows untouched — no tenant-facing file was modified except SuperAdminPanel (super-admin-only screen).
