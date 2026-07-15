# Sky Visa CRM — Data Storage Overview & Optimization Guide

**Companion to:** `DATABASE_SCHEMA.md` (v1.2) and `SCHEMA_IMPROVEMENT_SUGGESTIONS.md`
**Date:** July 13, 2026
**Purpose:** One place that shows **everything actually stored** (every top-level collection + its document form as used by the code), and then — for each collection — concrete ways to **cut storage, cut read/write cost, and what extra tech to add**, plus which collections should change.

> **Verified against code, not just docs.** The collections below are the ones the app actually reads/writes (`collection(firestore, '…')` / `FINANCE_COLLECTIONS`). Six collections that appear in older schema docs — `process_tracking`, `customer_statuses`, `roles`, `audit_logs`, `error_logs`, `login_attempts` — are **not used anywhere in the code**. See §4 (Dead schema).

---

## How Firestore actually bills you (so the advice makes sense)

Firestore charges on four axes. Every optimization below targets one of them:

| Axis | You pay per… | Biggest driver in this app |
|------|--------------|-----------------------------|
| **Document reads** | each document returned | pages that read a **whole collection** to compute one number (finance, dashboard) |
| **Document writes** | each document written | rewriting a big `bookings` doc on every small change (arrays) |
| **Deletes** | each document deleted | negligible here |
| **Storage + network** | GB stored / GB egress | large nested arrays and any file blobs kept in Firestore |

**Rule of thumb:** reads dominate cost in a CRM. The single most expensive habit here is *"load the entire collection into the browser and filter/sum in JavaScript."* Most of §2 is about removing that.

---

## Part 1 — Complete inventory of stored data (top-level collections)

### 1.1 At-a-glance map

| # | Collection | What it stores | Doc weight | Growth rate | Read pattern today |
|---|-----------|----------------|-----------|-------------|--------------------|
| 1 | `users` | Staff profiles, roles, work config | Small | Very slow (staff count) | Whole collection, often (name lookups) |
| 2 | `clients` | Customer profiles + travel prefs | **Medium–large** (arrays) | Steady | Whole collection on list/dashboard/org |
| 3 | `bookings` | Sales orders + payments + itinerary | **Large** (many arrays) | Fast | **Whole collection in ~9 places** ⚠️ |
| 4 | `invoices` | Invoice headers | Small | Steady | Per-client / list |
| 5 | `leads` | Website + manual leads | Medium (rawPayload) | **Fast** (marketing) | List / dashboard |
| 6 | `organizations` | Corporate account headers | Small | Slow | Whole collection (small) |
| 7 | `customer_logs` | Activity/audit trail per client | Small, **many rows** | **Fast** (append-only) | Per-client / recent |
| 8 | `follow_ups` | Scheduled follow-up tasks | Small | Steady | Per-client / due list |
| 9 | `attendance` | Daily punch + breaks per employee | Medium (breaks[]) | **Fast** (1/employee/day) | Per-user/day |
| 10 | `leaves` | Leave requests | Small | Slow | List |
| 11 | `holidays` | Company holiday calendar | Tiny | Very slow | Whole (tiny) |
| 12 | `accounts` | Finance cash/bank accounts | Small | Very slow | Whole (small) |
| 13 | `finance_transactions` | Real income/expense/transfer rows | Small, **many rows** | Fast | Whole collection (finance) |
| 14 | `suppliers` | Payee directory | Small | Slow | Whole (small) |
| 15 | `expense_categories` | Expense category config | Tiny | Very slow | Whole (tiny) |
| 16 | `payment_methods` | Payment method config | Tiny | Very slow | Whole (tiny) |
| 17 | `agent_expenses` | Agent-logged reimbursables | Small | Steady | Whole (finance/agent) |

**Legend — doc weight** ≈ average serialized document size: Tiny <1 KB · Small 1–3 KB · Medium 3–10 KB · Large 10 KB+.

### 1.2 The document form of each collection

Compact field forms (full field-by-field detail lives in `DATABASE_SCHEMA.md`). `?` = optional, `[]` = array, `{}` = nested map.

```
users/{id}
  name, email, phone?, jobTitle?, avatar?, role(employee|manager|admin|agent|finance),
  baseSalary?, workStartTime?, workEndTime?, lateGraceMinutes?, monthlyLeaveCap?,
  dailyBreakCapMinutes?, createdAt, updatedAt, createdBy, updatedBy

clients/{id}
  name, organizationId?, email?, phone, avatar, preferences, status,
  dateOfBirth?, gender?, nationality?, preferredDestination?, travelPurpose?,
  preferredTravelDates{from,to}?, tripDestinations[]?, budget?, hotelPreference?,
  services[]?, additionalServices[]?, assignedEmployees[]?,
  visaStatus?, visaHistory[]?, previousTrips[]?, requiredDocuments[]?,
  followUpDate?, pax?, companions[]?, createdAt, updatedAt, createdBy, updatedBy

bookings/{id}
  clientId, clientName, agentId?,                       ← sales owner
  bookingType, destination?,
  isOneWay?, hasLayover?, layoverAirport?, isMultiCity?, sectors[]?,   ← flight
  visaApplicants[]?, hotelGuests[]?, bookingPortal?,
  startDate, endDate, status, progress,
  total, amountPaid?, balanceAmount?, paymentStatus?, payments[]?,     ← money
  supplierName?, supplierCost?, supplierReference?, profit?,
  bookingDetails{}?, documents[]?, remarks?,
  cancellationReason?, cancelledAt?, cancellationCharges?,             ← refund
  refundAmount?, refundStatus?, refundedAt?, refundMode?, refundReference?,
  archived?, archivedAt?, archiveExempt?, timeline[]?,
  createdAt, updatedAt, createdBy, updatedBy

invoices/{id}         bookingId, clientName, amount, dueDate, status, +audit
leads/{id}            name, email?, phone, avatar, status, source?, …,
                      convertedToClientId?, destination?, message?, rawPayload{}?, +audit
organizations/{id}    name, type('corporate'), contactPerson?, email?, phone?,
                      gstNumber?, billingAddress?, notes?, +audit
customer_logs/{id}    clientId, clientName?, userId, userName?, activity, +audit
follow_ups/{id}       clientId, clientName, clientEmail?, clientPhone?, date,
                      notes, done, priority, +audit
attendance/{id}       userId, userName, date, punchIn, punchOut?, workStartTime,
                      workEndTime, lateGraceMinutes, punchInLate, punchOutEarly,
                      autoLoggedOut, workMinutes?, status, breaks[]?, breakMinutes?,
                      activeMinutes?, lastActiveAt?, +audit
leaves/{id}           userId, userName, type, startDate, endDate, days, reason,
                      status, approvedBy?/rejectedBy?/…, +audit
holidays/{id}         date, name, createdAt, createdBy

accounts/{id}             name, type, bankName?, accountNumber?, ifsc?,
                          openingBalance, status, notes?, +audit
finance_transactions/{id} type(income|expense|transfer), amount, date, accountId,
                          toAccountId?, clientId?/bookingId?/invoiceId?/supplierId?,
                          categoryId?/Name?, paymentMethod?, reference?, remarks?,
                          status, source?(booking|agent|manual), bookingPaymentId?, +audit
suppliers/{id}            name, category?, contactPerson?, phone?, email?, gst?,
                          address?, notes?, status, +audit
expense_categories/{id}   name, active, +audit
payment_methods/{id}      name, direction(incoming|outgoing), requiresReference?,
                          requiresAttachment?, active?, +audit
agent_expenses/{id}       amount, date, category?, purpose?, payee?, paymentMethod?,
                          reimbursed?, reimbursedAt?, reimbursedTxnId?, +audit
```

**Nested arrays that live *inside* a parent doc (no subcollection today):**
`bookings.payments[]`, `bookings.sectors[]`, `bookings.visaApplicants[]`, `bookings.hotelGuests[]`, `bookings.documents[]`, `bookings.timeline[]`, `clients.visaHistory[]`, `clients.previousTrips[]`, `clients.requiredDocuments[]`, `clients.companions[]`, `attendance.breaks[]`. These are the main storage-and-write-cost levers (see §2).

---

## Part 2 — Per-collection: storage, read/write, extra tech, and whether to change

Each card: **Storage** (shrink the bytes) · **Read/Write** (cut operations) · **Extra tech** (what to add) · **Change?** (verdict).

### 3 · `bookings` — the hottest, most expensive collection ⚠️ (change: YES)
- **Storage:** heaviest docs (up to ~6 arrays each). `documents[]` must hold **Cloud Storage URLs, never file bytes/base64** — verify none are inlined. `timeline[]` grows unbounded per booking.
- **Read/Write:** read as a **whole collection in ~9 places** (finance dashboard/transactions/reports/money-in, agent-performance, dashboard, revenue, bookings list, organizations). Every small edit (add a payment) rewrites the *entire* doc including all arrays → wasted write bytes.
- **Extra tech:**
  - **Firestore aggregation queries** (`count()`, `sum()`, `average()`) for the finance/dashboard totals — server computes the sum and bills ~1 read instead of N. **Biggest single win.**
  - **Summary/rollup docs** (`finance_summary/current`, per-agent counters) maintained by a **Cloud Function** trigger.
  - **Move `payments[]`, `timeline[]`, `documents[]` to subcollections** (`bookings/{id}/payments/*`, …) so a payment write is a tiny doc, not a full-booking rewrite; keeps parent under the 1 MB ceiling.
- **Change?** **Yes** — biggest ROI in the system. Aggregations + a summary doc first (no migration), subcollections for `payments`/`timeline` next.

### 2 · `clients` (change: MAYBE)
- **Storage:** several optional arrays; fine unless a client accumulates long `visaHistory`/`previousTrips`. Ensure `avatar` is a URL (Storage/DiceBear), not embedded image data.
- **Read/Write:** whole-collection reads on the Clients list, dashboard, org pages, and finance money-in. Already has date-range filtering + pagination groundwork — push those filters into the **query** (`where`/`orderBy` + `limit` + cursor) instead of filtering in JS.
- **Extra tech:** **Typesense/Algolia/Meilisearch** for client search (name/phone/email) — client-side substring search currently forces loading the whole collection. A search index makes search O(query) and slashes reads.
- **Change?** Mostly query-side; schema is fine. Add a search index when the client list gets large.

### 1 · `users` (change: NO, add caching)
- **Storage:** tiny, slow-growing. Fine.
- **Read/Write:** loaded in full repeatedly just to map `userId → name/role` (dashboard, agent-performance, reports, clients). That's re-reading the same ~dozen docs constantly.
- **Extra tech:** cache users once in a **React context / IndexedDB** (they change rarely) instead of re-querying per page; or ship as a **Firestore bundle**. Enable **offline persistence** so repeat reads hit local cache for free.
- **Change?** No schema change — cache it.

### 5 · `leads` (change: SMALL)
- **Storage:** `rawPayload{}` stores the entire inbound website payload per lead — can bloat. Keep it, but consider trimming to known fields after conversion.
- **Read/Write:** append-heavy from marketing. Query by `status`/date with indexes; paginate.
- **Extra tech:** **TTL policy** to auto-expire `lost`/unconverted leads after N months (Firestore native TTL deletes them for you, reclaiming storage). Export to **BigQuery** for funnel analytics instead of pulling into the browser.
- **Change?** Add a TTL field (e.g. `expireAt`) for dead leads; otherwise fine.

### 7 · `customer_logs` (change: YES — lifecycle)
- **Storage:** append-only, **highest row count** over time; each row is small but they never stop growing.
- **Read/Write:** read per-client and "recent." Fine if always **queried with `limit`** (never whole-collection).
- **Extra tech:** **Firestore TTL policy** (e.g. keep 12–24 months) for automatic pruning; **BigQuery export** if long-term history is needed cheaply. This is a textbook fit for TTL.
- **Change?** Yes — add `expireAt` + a TTL policy; guarantees the collection can't grow without bound.

### 9 · `attendance` (change: MAYBE)
- **Storage:** `breaks[]` grows within a day; `lastActiveAt` heartbeat rewrites the doc **every minute** while the app is open — that's a lot of writes per employee per day.
- **Read/Write:** the per-minute heartbeat is the concern (writes = employees × minutes online).
- **Extra tech:** throttle the heartbeat (e.g. every 2–5 min), or move it to **Realtime Database / a presence system** (cheaper for high-frequency presence than Firestore), reconciling into `attendance` less often. **TTL** older-than-N-years rows.
- **Change?** Consider splitting live presence from the daily attendance record; reduce heartbeat frequency.

### 13 · `finance_transactions` (change: NO, query-scope)
- **Storage:** small rows; fine. Grows steadily.
- **Read/Write:** finance pages read the whole collection to sum. Use **aggregation queries** + **scoped queries** (`where('date','>=',monthStart)`, `where('status','==','completed')`) + the **period-snapshot** idea from `SCHEMA_IMPROVEMENT_SUGGESTIONS.md` §1A.
- **Change?** Schema fine; change the *access pattern* + add snapshots for old periods.

### 4 · `invoices` · 8 · `follow_ups` · 10 · `leaves` (change: NO)
- Small, well-scoped, queried per-client / per-status. Just ensure every list query carries `where`/`limit` and has a matching composite index. No schema change.

### 6 · `organizations` · 11 · `holidays` · 12 · `accounts` · 14 · `suppliers` · 15 · `expense_categories` · 16 · `payment_methods` (change: NO)
- All **small, slow-growing config/reference** collections. Whole-collection reads are cheap because the collections are tiny. Ideal candidates to ship as **Firestore bundles** or cache in context so they load once. No schema change.

### 17 · `agent_expenses` (change: NO)
- Small, steady. Already models the pending-reimbursement flow correctly. Query by `createdBy` (agent) or whole (finance, small). Fine.

---

## Part 3 — Extra technology to add (cross-cutting), ranked by payoff

| Tech | What it fixes | Effort | Cost impact |
|------|---------------|--------|-------------|
| **Firestore aggregation queries** (`count`/`sum`/`avg`) | Replaces "read whole collection, sum in JS" on finance/dashboard | **S** | ⭐⭐⭐ huge read savings |
| **Cloud Functions** (triggers + scheduled) | Server-side integrity, summary/rollup docs, month-close snapshots, auto-archive, reimbursement/refund postings | M | ⭐⭐⭐ correctness + read savings |
| **Summary / counter docs** | Dashboards read 1 doc, not thousands | S–M | ⭐⭐⭐ |
| **Scoped queries + composite indexes + cursor pagination** | Stop shipping whole collections to the browser | S–M | ⭐⭐⭐ |
| **Cloud Storage for files/images** (booking docs, avatars) | Keeps blobs out of Firestore (cheaper storage, smaller docs, CDN delivery) | S | ⭐⭐ storage + egress |
| **Firestore TTL policies** | Auto-prune `customer_logs`, dead `leads`, old `attendance` | S | ⭐⭐ storage |
| **Offline persistence + client cache (context/IndexedDB)** | Free repeat reads of `users` and config collections | S | ⭐⭐ reads |
| **Search index (Typesense / Algolia / Meilisearch)** | Fast client/lead/booking search without full-collection scans | M | ⭐⭐ reads at scale |
| **BigQuery export** (Firestore→BigQuery extension) | Heavy reporting/forecasting off Firestore; feeds the Reports charts | M | ⭐⭐ analytics cost |
| **Firestore bundles** for static reference data | Config collections load from CDN, 0 reads | M | ⭐ |
| **Realtime DB / presence service** for the attendance heartbeat | High-frequency presence off Firestore | M | ⭐⭐ writes |
| **CDN + caching headers** (already partly via Next) | Static asset delivery | S | ⭐ |
| Redis / Memorystore cache | Hot aggregates for very high traffic | L | situational — likely overkill now |

**If you adopt only three:** aggregation queries, Cloud Functions (summary docs + integrity), and scoped queries/indexes. They attack the dominant cost — reads — and make the money numbers trustworthy at the same time.

---

## Part 4 — Dead schema to prune (documentation debt)

These are documented in older docs but **have no code path** — no reads, no writes. Either implement or remove them from the schema so the docs reflect reality:

- `process_tracking`, `customer_statuses`, `roles` (roles are a TS union, not a collection), `audit_logs`, `error_logs`, `login_attempts`.

**Action:** decide per item — e.g. `audit_logs`/`error_logs` are worth *adding* (write from a Cloud Function) for a real audit trail; the rest can be dropped from the schema doc. Keeping phantom collections in the schema misleads future work.

---

## Part 5 — Recommended sequence

1. **Aggregation queries** on finance/dashboard totals — immediate read-cost drop, no schema change. *(S)*
2. **Cloud Function + `finance_summary/current`** — dashboards read one doc; also host server-side integrity (recompute booking money, guard refunds). *(M)*
3. **Scoped queries + index audit + cursor pagination** across list pages and finance. *(S–M)*
4. **Cloud Storage** for booking documents/avatars if any bytes are inlined today. *(S)*
5. **TTL policies** on `customer_logs` and dead `leads`. *(S)*
6. **Subcollections** for `bookings.payments[]` / `timeline[]` once bookings get busy. *(M)*
7. **Search index** and **BigQuery export** when data volume makes list-scanning and client-side reporting painful. *(M)*
8. **Prune/implement** the dead collections in §4. *(S)*

Steps 1–3 alone remove the great majority of avoidable Firestore read cost while making the finance figures both faster and more correct.
