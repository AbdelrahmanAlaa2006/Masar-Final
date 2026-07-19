# Business Finance — System Architecture

**Scope:** the complete Business Management System (phases 1–8). Companion documents: [BUSINESS_ARCHITECTURE.md](BUSINESS_ARCHITECTURE.md) (database foundation & schema rationale, phases 0), [BUSINESS_FINANCE_GUIDE.md](BUSINESS_FINANCE_GUIDE.md) (user guide), [BUSINESS_FINANCE_REPORT.md](BUSINESS_FINANCE_REPORT.md) (implementation report).

---

## 1. Layered view

```
┌─ UI (super admin only, lazy chunk) ────────────────────────────┐
│ src/pages/ControlPanel/BusinessPanel.jsx                       │
│   8 tabs — each backed by exactly ONE aggregated read          │
└──────────────────────────┬─────────────────────────────────────┘
                           │  backend/bizFinanceApi.js (thin wrappers)
┌──────────────────────────▼─────────────────────────────────────┐
│ RPCs (SECURITY DEFINER + is_super_admin guard, REVOKEd anon)   │
│   biz_dashboard(from,to)     overview + costs                  │
│   biz_post_due_recurring()   materialize due subscriptions     │
│   biz_billing_overview()     billing center                    │
│   biz_kpis()                 executive KPIs                    │
│   biz_operations()           platform ops                      │
└──────────────────────────┬─────────────────────────────────────┘
┌──────────────────────────▼─────────────────────────────────────┐
│ Tables (RLS: is_super_admin only — invisible to tenants)       │
│   biz_transactions ← THE LEDGER (single source of truth)       │
│   biz_contracts / biz_recurring / biz_accounts /               │
│   biz_categories / biz_settings                                │
└────────────────────────────────────────────────────────────────┘
```

Two invariants hold everywhere:

1. **Ledger-only money.** Every number on every screen is an aggregate over `biz_transactions` rows with `status='confirmed'`. No balance is stored, no total is kept in React state beyond the current render's data.
2. **One screen = one round trip.** Each tab calls one RPC (Overview calls two: post-due + dashboard). There is no per-row fetching anywhere — the contracts tab reuses the billing RPC's per-contract sums instead of calling `getContractCollected` per card (that helper exists for single-contract views only).

## 2. Phase-by-phase mapping

| Phase | Where | Mechanism |
|---|---|---|
| 1 Finance dashboard | Overview + Ledger tabs | `biz_dashboard` + paged `listBizTransactions`; manual income/expense via tx modal; categories/accounts inline manager |
| 2 Contracts | Contracts tab | `biz_contracts` (open `contract_type` + `terms` JSONB + auto snapshot history); expected/collected/remaining from `biz_billing_overview` |
| 3 Billing | Billing tab | `biz_billing_overview()` — expected income derived in SQL from terms (upfront once, yearly × years, per-student × months, `expected_total` override), collected from ledger, overdue = owes + no payment this month |
| 4 KPIs | KPIs tab | `biz_kpis()` — MRR (monthly-normalized active contracts), ARR, ARPT, simplified 90-day churn, MoM growth, 12-month series |
| 5 Operations | Operations tab | `biz_operations()` — tenants/profiles counts, `pg_database_size`, WhatsApp queue stats from `unified_notifications` (reuses the safety engine's own status fields — no new monitoring infra) |
| 6 Cost analysis | Costs tab | derived client-side from the already-fetched `biz_dashboard` payload (zero extra queries): burn rate = period expenses / months, committed burn from `recurring_monthly_burn` |
| 7 Reports | Reports tab | 6 report types built from the same read APIs; CSV with BOM (Excel-ready), PDF via print window |
| 8 Future-ready | (architecture only) | see §5 |

## 3. Security audit

- **Tables:** all six `biz_*` tables have exactly one policy: `FOR ALL TO authenticated USING/WITH CHECK is_super_admin(auth.uid())`. No anon grants. A teacher's session receives zero rows and cannot insert.
- **RPCs:** all five are `SECURITY DEFINER` with `is_super_admin` as the first statement (verified live: unauthenticated call → `P0001 not authorized`), `REVOKE`d from `public, anon`, granted to `authenticated` only.
- **UI:** BusinessPanel is only reachable from SuperAdminPanel, which renders only for `role === 'super_admin'` — but the UI gate is cosmetic; RLS is the boundary.
- **Isolation from tenant finance:** no code path joins `biz_*` with `student_ledger`/`finance_*`. The only tenant reference is `tenants(id,name)` for revenue attribution — read via the super admin's existing tenant-read rights.

## 4. Performance audit

- **Bundle:** BusinessPanel is a lazy chunk (~14.5 kB gzip) loaded only when the owner opens it. Charts are dependency-free inline SVG — no chart library added.
- **Queries per screen:** Overview 2 RPC calls; Ledger 1 list query (+1 count via same request); Contracts 2 (list + billing, parallel); Billing/KPIs/Operations 1 each; Costs 0 (reuses overview data). Lookups (accounts/categories/tenants) load once per panel mount.
- **No polling:** Operations refresh is manual; recurring posting happens on dashboard open (idempotent via the unique `(recurring_id, occurred_on)` index).
- **Renders:** tab data lives in independent state slices; switching tabs doesn't refetch already-loaded tabs (dashboard intentionally refetches when its date range changes). Memoized maps (`collectedByContract`) prevent per-row recomputation.
- **Volume headroom:** company-scale ledger (≤10⁵ rows) with `occurred_on` btree + partial FK indexes ⇒ every RPC is a single indexed range scan.

## 5. Extension points (phase 8 — prepared, not built)

| Future module | Plug-in path |
|---|---|
| Payroll | `source='payroll'` (already in CHECK) + expense category + optional `biz_employees` satellite |
| Taxes | tax category + `metadata.tax_ref`; filings satellite if needed |
| Invoices | `biz_invoices` satellite (number/status/due) whose settlement writes ledger rows; numbering counter in `biz_settings` |
| CRM / sales pipeline | satellites keyed by `tenant_id`/`counterparty`; revenue side already attributed per tenant |
| Multiple companies/brands | add `company_id` column to `biz_*` + a `biz_companies` table; all RPCs take a company param — additive because every query already goes through the 5 RPC choke points |
| Investor dashboard | read-only views over the same RPCs |
| Runway | needs an opening-balance convention in `biz_settings` + cash trend — noted in Costs tab as future |

## 6. Trade-offs (carried from the foundation, still valid)

- Single-entry signed ledger over double-entry journals (mechanical conversion path documented).
- Expected income computed from `terms` in SQL with simple, documented rules + explicit override — chosen over a rigid billing-schedule table (which would fight the "future contract types with no redesign" requirement).
- EGP as sole functional currency; USD bills carried in `original_amount/currency` for reference.
- Simplified churn (ended-in-90d ÷ cohort) — honest for a small teacher count; a proper cohort model needs more history than exists.
