# Business Financial Architecture (Platform Owner)

**Date:** 2026-07-19 · **Audience:** Super Admin only · **Status:** Foundation implemented (schema + services), UI pending

This document describes the company-level accounting foundation: the platform owner's revenue, expenses, cash flow, P&L, teacher contracts, infrastructure costs — and the runway for payroll, taxes, and invoices. It is **fully separate** from the tenant-level finance system (`student_ledger`, `finance_transactions`, `finance_categories`), which belongs to teachers and their centers.

---

## 1. Design principles

1. **One ledger, one truth.** Every company money movement is one row in `biz_transactions`. Revenue and expenses use the same engine. Every report — P&L, cash flow, per-teacher revenue, category breakdowns — is an aggregate over stored rows. Nothing is ever computed from UI state, and no balance is ever stored (stored balances drift; derived balances can't).
2. **Agreements are not money.** A teacher contract describes a deal; it never *is* revenue. Money only exists when a ledger row is written (carrying `contract_id`). This single rule is what makes hybrid and future contract types free.
3. **Separate namespace.** `biz_*` tables vs the tenant-level `finance_*` tables. The two systems never join, never share categories, and have opposite RLS audiences. A future developer cannot accidentally sum teacher money into company money.
4. **Configuration-driven extensibility.** Open `contract_type` set + JSONB `terms`; `source` discriminator on ledger rows; `metadata` JSONB escape hatch. Payroll, taxes, and invoices become new `source`/category values and (if ever needed) satellite tables that *reference* the ledger — the ledger itself never changes.

## 2. Schema

```
biz_accounts        where company money sits (bank / cash / wallet)
biz_categories      revenue|expense classification (optional parent_id hierarchy)
biz_contracts       the agreement with a teacher (terms JSONB, open type set)
biz_recurring       repeating bills/income templates (Supabase, Claude, domains…)
biz_transactions    THE LEDGER — every movement, all sources
```

### Relationships

```
biz_transactions ─┬─→ biz_categories   (category_id, SET NULL)
                  ├─→ biz_accounts     (account_id,  SET NULL)
                  ├─→ tenants          (tenant_id,   SET NULL)  ← revenue attribution
                  ├─→ biz_contracts    (contract_id, SET NULL)  ← contract billings
                  ├─→ biz_recurring    (recurring_id, SET NULL) ← recurring postings
                  └─→ profiles         (created_by,  SET NULL)  ← audit
biz_contracts ───→ tenants (tenant_id, SET NULL)
biz_recurring ───→ biz_categories, biz_accounts
biz_categories ──→ biz_categories (parent_id, self, SET NULL)
```

All FKs use `ON DELETE SET NULL`: deleting a category/account/contract **never deletes or corrupts ledger history** — rows just lose the link. Ledger rows themselves are only removed by explicit super-admin delete.

### `biz_transactions` (the ledger)

| Column | Why |
|---|---|
| `occurred_on DATE` | the accounting date (backdating supported); drives every report |
| `direction in/out`, `amount NUMERIC(14,2) > 0` | signed math done in SQL, amounts always positive |
| `original_amount / original_currency` | USD bills (Supabase, Claude) recorded as billed; `amount` is always the EGP functional-currency value, so **no FX logic ever runs in SQL** |
| `source manual/recurring/contract` | provenance discriminator; future values (`payroll`, `invoice`, `tax`) are one CHECK-constraint edit |
| `tenant_id` | answers "which teacher generated this revenue" without touching tenant tables |
| `metadata JSONB` | escape hatch for future needs (invoice numbers, tax refs) without migrations |

### `biz_contracts` — how every contract type fits with zero schema change

`contract_type` is open text; `terms` JSONB holds the numbers:

| Type | terms example |
|---|---|
| `fixed_yearly` | `{"yearly_amount": 20000, "payment_day": 1}` |
| `upfront` | `{"upfront_amount": 15000}` |
| `per_student_monthly` | `{"monthly_per_student": 20, "expected_students": 300}` |
| `hybrid` | `{"upfront_amount": 5000, "monthly_per_student": 15}` |
| *(future)* `revenue_share` | `{"percent": 10}` — nothing else changes |

Reports **never read `terms`**. Collected-vs-agreed comparisons read the ledger (`getContractCollected`) against the terms — in the service layer, not the database.

### `biz_recurring` — infrastructure costs

Supabase, Claude Code, domains, Cloudflare, hosting = rows here (`cadence` monthly/quarterly/yearly, `next_due_on` cursor, `auto_post` flag). The `biz_post_due_recurring()` RPC materializes due templates into ledger rows and advances the cursor — one call when the dashboard opens (cron-ready later, same function).

**Why no `infrastructure_services` table:** it would be a 1:1 duplicate of `biz_recurring` (a service *is* a vendor + amount + cadence + category), forcing an extra join for zero information. Rejected as overengineering.

**Why not full double-entry bookkeeping:** journals + postings (debit/credit pairs against a chart of accounts) buy balance-sheet completeness — equity, liabilities, depreciation. This company needs P&L, cash flow, and cash position, which a single-entry signed ledger answers with far less operational complexity and no accountant-level data entry on every row. If double-entry is ever required, each `biz_transactions` row converts mechanically to a 2-line journal entry (cash account ↔ category account) — the data loses nothing by starting simple. This was the main trade-off decision.

## 3. Performance

- **Access pattern:** date-range aggregates. `idx_biz_tx_occurred` (btree on `occurred_on`) drives everything; partial indexes on each FK serve the filtered lists. Volume is company-scale (thousands of rows/year), so every dashboard query is effectively instant for the next decade.
- **No N+1 anywhere:** the `biz_dashboard(from, to)` RPC returns totals, account balances, category breakdown, per-tenant revenue, monthly P&L series, and committed monthly burn in **one round trip**. List endpoints embed their joins (`category:category_id (…)`) in single PostgREST queries.
- **Idempotent posting:** unique partial index `(recurring_id, occurred_on)` + `ON CONFLICT DO NOTHING` — a double-invoked posting run cannot double-book a bill.

## 4. Security

- RLS on all five tables: `USING (is_super_admin(auth.uid()))` for every command, `TO authenticated` only. Tenants, teachers, assistants, students — no policy grants them anything; the tables are invisible to them.
- RPCs are `SECURITY DEFINER` with an explicit `is_super_admin` check as the first statement, `REVOKE`d from `public`/`anon` (repo convention). Verified: calling `biz_dashboard` without a super-admin context raises `not authorized`.
- `tenant_id` on ledger rows is a *reference for attribution only* — no tenant-facing query path exists, so the multi-tenant architecture is untouched.

## 5. Future extensibility map

| Future need | What changes |
|---|---|
| Payroll | `source = 'payroll'` (CHECK edit) + an expense category; optionally a `biz_employees` satellite referencing ledger rows |
| Taxes | tax categories + `metadata.tax_ref`; a `biz_tax_periods` satellite if filings need tracking |
| Invoices | `biz_invoices` satellite (number, due date, status) whose settlement writes ledger rows — ledger untouched |
| Multi-currency accounts | `original_*` columns already carry billing currency; add an FX-rate column if reporting in USD is ever needed |
| Automated contract billing | a poster like `biz_post_due_recurring` reading `terms.payment_day` — same materialize-into-ledger pattern |
| Category hierarchy / budgets | `parent_id` already exists; budgets = satellite table keyed by category+month |

## 6. Service layer

`backend/bizFinanceApi.js` — thin, RLS-backed:

- `getBizDashboard(from, to)` / `postDueRecurring()` — the two dashboard calls
- `listBizTransactions(filters)` / `addBizTransaction` / `updateBizTransaction` / `deleteBizTransaction`
- `listBizAccounts` / `saveBizAccount` · `listBizCategories` / `saveBizCategory`
- `listBizContracts` / `saveBizContract` / `getContractCollected(contractId)`
- `listBizRecurring` / `saveBizRecurring` / `deleteBizRecurring`

No UI exists yet by design; the dashboard phase builds on exactly these calls.

## 7. v2 hardening (pre-UI review)

Six candidates were evaluated; all were integrated in restrained forms (`2026_07_19_business_finance_v2.sql`):

| Addition | Form chosen | Why now |
|---|---|---|
| **Transaction status** | `confirmed / pending / void`; all report aggregates count `confirmed` only, `pending` returned separately as expected cash | The single hardest thing to retrofit — every aggregate would need revisiting after the UI ships. **Void replaces delete**: history is preserved, reports are clean. |
| **Contract snapshots** | `history` JSONB + a `BEFORE UPDATE` trigger that appends prior `terms/contract_type/status` (with `changed_at`/`changed_by`) when they change | Renegotiating a contract previously overwrote the old deal silently. Trigger = automatic, zero app logic, no versions table needed at this scale. |
| **Source types** | CHECK widened to include `payroll`, `invoice`, `tax`, `adjustment` | One line now; zero migrations when those phases arrive. |
| **Attachments** | `attachment_url/key` on transactions + contracts | Receipts and signed PDFs. Columns only — upload wiring (existing R2 helper) is UI-phase work. |
| **Business settings** | `biz_settings` key→JSONB (seeded `general`: company name, functional currency, fiscal year start) | Home for invoice numbering counters, FX defaults, report preferences — without ever touching schema. |
| **Audit fields** | `updated_by` on transactions; `created_by/updated_by` on contracts & recurring | Cheap now, meaningful the day a second owner/accountant exists. Deliberately **not** added to accounts/categories (low-churn noise). |

Service layer additions: `voidBizTransaction` / `confirmBizTransaction` (preferred over delete), status/attachment parameters, audit stamping on every mutation, `getBizSettings` / `saveBizSettings`.

## 8. Post-implementation review findings

- **Unnecessary tables:** none — the proposed `infrastructure_services` and `financial_accounts` split was collapsed (see §2 rationales).
- **Duplicated data:** none stored; balances, totals, and contract progress are all derived. The only intentional denormalization is `counterparty` text on ledger rows (snapshot semantics — a renamed vendor must not rewrite history).
- **Normalization:** 3NF for real entities; JSONB only where the value set is genuinely open (`terms`, `metadata`) and never aggregated in SQL.
- **Indexing:** every report path covered; partial indexes keep write overhead minimal. No index on `direction` alone (low cardinality; date index dominates at this volume).
- **Scalability risks:** monthly series aggregates over the range scan — fine for ~10⁴–10⁵ rows; if the ledger ever reaches millions of rows, add a materialized monthly rollup (satellite, no schema change).
- **Security:** single-role RLS surface, definer functions guarded and revoked; no anon path; no cross-tenant leakage vector.
