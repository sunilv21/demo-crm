# Sky Visa CRM — Schema & Architecture Improvement Suggestions

**Companion to:** `DATABASE_SCHEMA.md` (v1.2)
**Date:** July 13, 2026
**Scope:** Better approaches and future fixes for the data model, money flow, security, and integrity. Nothing here is a bug report — the app works today. These are the higher-leverage changes to make it robust as data grows.

Each item is tagged with **Priority** (P1 = do soon / correctness-adjacent, P2 = worth doing, P3 = nice-to-have) and **Effort** (S / M / L).

---

## 1. Money model — derive-on-read vs. a real ledger

### Current approach
Booking collections and agent expenses are **derived on read** into Finance (`bookingPaymentsAsTransactions`, `agentExpensesAsTransactions`). Account balances are computed by summing every transaction each time a page loads. This was the right call to ship: no double-entry, no migration, historical bookings show up for free.

### Where it strains
- **Every finance page reads the entire `bookings` + `finance_transactions` collections** to compute one number. At a few thousand bookings this is fine; at tens of thousands it becomes slow and expensive (Firestore bills per document read).
- Derived booking income has **`accountId: ''`** (unassigned), so it never lands in a real account balance — it only shows in "collected" totals. Reconciling "cash the agent collected" → "cash actually in the drawer/account" is manual.
- No **immutable audit trail**: if a booking's `amountPaid` is edited, the historical derived transaction silently changes. A real ledger never rewrites the past.

### Better approach (P2, L) — hybrid ledger with monthly snapshots
1. Keep derive-on-read for the **current open period** (fast to change, no migration pain).
2. On a schedule (or a "close month" action), **materialize** that month's booking payments into real `finance_transactions` rows with a real `accountId`, set `financeTxnId` back on the booking `Payment` (the field already exists — it's currently unused as the reconciliation hook), and store a **`period_balances/{accountId}_{YYYY-MM}`** snapshot doc with the closing balance.
3. Balance-on-read then = latest snapshot + only the current period's deltas. Reads drop from "all history" to "one month."

**Smaller interim win (P1, S):** cache the computed dashboard KPIs in a single `finance_summary/current` doc updated by a Cloud Function on booking/transaction writes, so the dashboard reads 1 doc instead of the whole collections.

---

## 2. Reconciliation: make `financeTxnId` do its job

`Payment.financeTxnId` exists but is never written. Right now there's no way to answer "has this collected payment been deposited into a real account yet?"

**Suggestion (P1, M):** Add a lightweight **"Deposit / Reconcile"** action in Finance → Money In: select unassigned booking payments, pick the destination account, and on confirm write a real `finance_transactions` income row + stamp `financeTxnId` on each `Payment`. The derivation already skips any payment with `financeTxnId` set, so this composes cleanly with the existing code — no double counting. This turns the abstract "collected" number into "money actually in accounts."

---

## 3. Agent revenue attribution — close the edge cases

`bookingAgentId(b, roleOf)` credits `agentId` if that user is *currently* an `agent`, else the creator if they're an agent, else nobody.

### Weak spots
- **Role changes rewrite history.** If an agent later becomes a manager, all their past bookings silently drop out of Agent Performance and Finance-by-agent reporting. Attribution should be a fact recorded *at the time*, not recomputed from the user's current role.
- **Unclaimed bookings vanish** from revenue reporting (employee-created, no agent priced them) — correct by design, but there's no report surfacing "₹X of revenue is unattributed," which is exactly the leakage an owner wants to see.

**Suggestion (P2, S):**
- When `agentId` is set, also snapshot `agentRole: 'agent'` (or just trust that only agents ever get written to `agentId`, and stop re-checking `roleOf` on read). Attribution becomes stable across role changes.
- Add an **"Unattributed revenue"** line to Agent Performance so nothing is silently dropped.

---

## 4. Denormalization drift

Many docs copy a name for display: `clientName` on bookings, `supplierName`/`categoryName`/`clientName` on transactions, `userName` on attendance/leaves, `createdByName` on payments/expenses. If the source record is renamed, copies go stale.

**Suggestion (P2, M):** Pick a policy and document it in the schema:
- **Accept drift** for historical/audit rows (a receipt *should* show the name as it was) — most of these fall here. Just say so explicitly.
- For **live** joins where the current name matters, resolve by ID on read (you already load `users` into a `Map` in several pages — extend that pattern) instead of trusting the copy.
- Optionally add a small **backfill/repair script** run occasionally to re-sync names where drift isn't wanted.

---

## 5. Server-side integrity (the real gap)

All validation is client-side Zod + Firestore rules. Rules enforce *who* can write, not *what's consistent*. Nothing stops a client from writing `balanceAmount` that doesn't equal `total − amountPaid`, or a `payments[]` sum that disagrees with `amountPaid`, or a refund larger than the amount collected.

**Suggestion (P1, M) — Cloud Functions as the integrity layer:**
- `onBookingWrite`: recompute `amountPaid`/`balanceAmount`/`profit` server-side from `payments[]` + `total`/`supplierCost` so they can't diverge (the client already computes these via `computeTotals` — move the authoritative copy to a trigger).
- `onRefundWrite`: reject `refundAmount > collected` and `cancellationCharges > total`.
- Enforce enum/required fields in rules too (rules *can* check `request.resource.data.type in ['income','expense','transfer']`), not only in the client.

This is the single biggest robustness upgrade and pairs naturally with #1's summary-doc function.

---

## 6. Indexes & query cost

**Suggestion (P2, S):**
- Audit `firestore.indexes.json` against the actual queries — every `where(...).orderBy(...)` combination needs a composite index or it throws in production even if it works locally.
- The finance pages that pull **whole collections** to filter/sum in JS should move to **scoped queries** (`where('date','>=',monthStart)`, `where('status','==','completed')`) so Firestore returns only what's needed. This also directly reduces read billing.
- Add `where('archived','!=',true)` (or an `archived==false` index) to the default booking lists so the archival feature actually shrinks the working set.

---

## 7. Subcollections for unbounded arrays

`Booking.payments[]` is an in-document array. Fine for a handful of installments; a 1 MB doc ceiling and full-doc rewrites-on-every-payment make it a poor fit if a booking accrues many payments.

**Suggestion (P3, M):** If any booking realistically exceeds ~20 payments, move to `bookings/{id}/payments/{paymentId}` subcollection. Keep `amountPaid`/`balanceAmount` denormalized on the parent (maintained by the #5 trigger) so list views don't need the subcollection.

---

## 8. Refund / cancellation as a first-class flow

`refundStatus: 'pending' | 'processed'` captures state but there's no money movement tied to it — a processed refund should **decrease** an account and appear in Finance as an outgoing.

**Suggestion (P2, M):** When a refund is marked processed, post a `finance_transactions` **expense** (source `'manual'`, category "Refund", linked `bookingId`) against the account it's paid from — symmetric with how #2 handles deposits. Then refunds show in cash-flow and account balances instead of living only on the booking.

---

## 9. Consolidate "role capability" definitions

Role gates are spread across `use-app-user.tsx` (`canViewRevenue`, `canViewFinance`), `app-sidebar-nav.tsx` (`FINANCE_ROLES`, `ALL_ROLES`), layout `RequireRole` allow-lists, `finance-role-guard.tsx`, and `firestore.rules`. Adding the next role means editing 5 places and it's easy to miss one (rules vs. UI can silently disagree).

**Suggestion (P2, S):** Centralize a single `ROLE_CAPABILITIES` map (role → booleans/allowed-paths) in one module, and derive nav, guards, and `RequireRole` from it. Keep `firestore.rules` as the independent enforcement layer, but generate its role lists from the same source of truth where possible.

---

## 10. Naming & schema hygiene (low-risk cleanups)

**Suggestion (P3, S):**
- Finance collection names are unprefixed (`accounts`, `suppliers`, `payment_methods`) — generic enough to collide with future modules. Consider a `finance_` prefix convention (you already have `finance_transactions`) for the rest, or document that they're finance-owned.
- `expense_categories` and `payment_methods` fall back to hardcoded defaults until a doc exists. Document the default lists in the schema so nobody assumes an empty collection means "no methods."
- Add `createdAt`/`updatedAt`/`createdBy` uniformly — a few of the newer types are inconsistent about which audit fields they carry.

---

## How the data is stored — current vs. recommended

This section shows the **actual document shapes** for the highest-value changes, so it's clear what "better" means concretely and why.

### A. Money model — three storage strategies compared

| Strategy | How data is stored | Read cost | Audit trail | Migration | Verdict |
|----------|--------------------|-----------|-------------|-----------|---------|
| **Derive-on-read** (today) | Nothing extra stored. Balances = sum of *all* `bookings` + `finance_transactions` on every page load. | Grows forever (reads whole collections) | Weak — editing a booking rewrites the past | None | ✅ Good to ship, ❌ doesn't scale |
| **Write-on-transaction** (full ledger) | Every collection writes a real `finance_transactions` row immediately; balance stored + updated per write. | Cheap (read balance doc) | Strong | Heavy backfill, double-entry risk | Robust but rigid |
| **Hybrid: snapshot + derive current period** ⭐ | Store a monthly closing balance per account; derive only the *open* month on read. | Cheap (1 snapshot + 1 short month) | Strong (closed months are immutable) | Incremental, no big-bang | **Best fit** |

**Recommended storage — a period snapshot doc:**
```typescript
// period_balances/{accountId}_{YYYY-MM}
{
  accountId: string
  period: string          // "2026-07"
  openingBalance: number  // = previous period's closingBalance
  income: number          // sum of income posted to this account this period
  expense: number
  transfersIn: number
  transfersOut: number
  closingBalance: number  // opening + income − expense + in − out (frozen at close)
  closedAt: Timestamp
  closedBy: string
}
```
**Balance-on-read becomes:** `latest snapshot.closingBalance + sum(current-month deltas)` — bounded, not "all history."

**Benefits:** predictable read cost as the business grows; closed months can't silently change (real audit trail); month-end numbers are frozen and trustworthy; still no risky big-bang migration — you start snapshotting from this month forward.

---

### B. Interim summary doc (do this first — smallest effort, big win)

Instead of every dashboard visit summing whole collections, keep one rolled-up doc a Cloud Function maintains on write:
```typescript
// finance_summary/current
{
  totalCash: number
  totalBank: number
  totalAvailable: number
  monthIncome: number
  monthExpense: number
  pendingReimbursements: number   // agent expenses not yet paid
  unassignedCollected: number     // collected but not deposited to an account
  updatedAt: Timestamp
}
```
**How it's stored:** a single always-current document; the function adjusts the affected fields (+/−) on each booking/transaction write rather than recomputing from scratch.
**Benefits:** the Finance dashboard reads **1 document instead of thousands**; near-instant load; dramatically lower Firestore read billing; no schema change to existing collections.

---

### C. Reconciliation — activate the unused `Payment.financeTxnId`

**Today:** a booking payment lives only inside the booking; `financeTxnId` is defined but never written, so "collected" and "money actually in an account" can't be linked.
```typescript
// bookings/{id}.payments[n]  — BEFORE
{ id, amount: 5000, mode: 'cash', date, reference }   // financeTxnId absent → unassigned income, accountId ''
```
**Recommended:** a "Deposit / Reconcile" action posts a real income row to a chosen account and stamps the link back:
```typescript
// finance_transactions/{txnId}  — NEW real row
{ type: 'income', amount: 5000, accountId: 'cash-drawer', source: 'booking',
  bookingId, bookingPaymentId: '<paymentId>', status: 'completed', ... }

// bookings/{id}.payments[n]  — AFTER
{ id, amount: 5000, mode: 'cash', date, reference, financeTxnId: '<txnId>' }
```
The existing derivation **already skips any payment with `financeTxnId` set**, so a reconciled payment stops being derived and starts being a real account entry — **no double counting**.
**Benefits:** "collected" becomes reconcilable against real accounts; you can answer "how much collected cash is still undeposited?"; account balances reflect reality; the reconciliation is auditable per payment.

---

### D. Stable agent attribution

**Today:** attribution is recomputed from the user's *current* role on every read, so a role change rewrites reporting history.
```typescript
// bookings/{id}  — BEFORE (attribution is a runtime guess)
{ agentId: 'u123', createdBy: 'u123' }   // credited only while roleOf('u123') === 'agent'
```
**Recommended:** record attribution as a fact at the moment of pricing/collection:
```typescript
// bookings/{id}  — AFTER (attribution is stored, immutable)
{ agentId: 'u123', agentName: 'Ravi', attributedAt: Timestamp, createdBy: 'u123' }
```
**Benefits:** past performance stays correct even after promotions/role changes; reporting stops depending on the live `users` collection; enables an "unattributed revenue" report (bookings with no `agentId`) so nothing leaks silently.

---

### E. Refunds move real money

**Today:** `refundStatus: 'processed'` is a flag on the booking; no money leaves any account.
**Recommended:** on "mark processed," post a matching outgoing so it appears in cash-flow:
```typescript
// finance_transactions/{txnId}
{ type: 'expense', amount: <refundAmount>, accountId: '<paid-from>',
  categoryName: 'Refund', bookingId, source: 'manual', status: 'completed', ... }
```
**Benefits:** refunds show up in account balances and reports (not just on the booking); symmetric with deposits (C); the net "revenue after refunds" is real, not implied.

---

## Benefits at a glance

| # | Change | Primary benefit | Who feels it |
|---|--------|-----------------|--------------|
| 5 | Server-side integrity (Cloud Functions) | Money numbers can't diverge or be tampered client-side | Owner / Finance — trust |
| 2 | Reconcile payments (`financeTxnId`) | "Collected" ties to real accounts; nothing double-counted | Finance — daily reconciliation |
| 1B | `finance_summary/current` doc | Dashboard reads 1 doc, not whole collections | Everyone — speed & cost |
| 1A | Period snapshots (hybrid ledger) | Predictable cost at scale + immutable closed months | Owner — audit, scaling |
| 3 | Stable attribution | History survives role changes; no revenue leaks unseen | Agents & Owner — fairness |
| 6 | Scoped queries + indexes | Lower read billing, no production index errors | Everyone — cost & reliability |
| 8 | Refunds as real transactions | Cash-flow and balances reflect refunds | Finance — accuracy |
| 9 | Central role capabilities | One place to edit; UI and rules can't disagree | Devs — fewer bugs |
| 4 | Denormalization policy | Names are either intentionally frozen or resolved live | Devs — clarity |
| 7 | Payments subcollection | No 1 MB doc ceiling; smaller writes | Scaling edge case |

---

## Priority summary

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 5 | Server-side integrity via Cloud Functions | **P1** | M |
| 2 | Reconcile booking payments into accounts (`financeTxnId`) | **P1** | M |
| 1 | Finance summary doc (interim) → hybrid ledger (later) | P1 / P2 | S / L |
| 3 | Stable agent attribution + unattributed-revenue report | P2 | S |
| 6 | Scoped finance queries + index audit | P2 | S |
| 8 | Refunds post real outgoing transactions | P2 | M |
| 9 | Centralize role capabilities | P2 | S |
| 4 | Denormalization drift policy | P2 | M |
| 7 | Payments subcollection (only if arrays grow) | P3 | M |
| 10 | Naming/hygiene cleanups | P3 | S |

**If you do only three things:** #5 (integrity triggers), #2 (reconciliation), and the interim summary-doc half of #1. Together they make the money numbers authoritative, reconcilable, and cheap to read.
