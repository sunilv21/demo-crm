# Sky Visa CRM — Review, Fixes & Feature Ideas

_Audit date: 2026-07-05. A working snapshot of what to fix/update and what could be added next. File/line references are clickable in the editor._

---

## 1. Bugs & correctness issues (fix first)

### 1.1 TypeScript errors currently failing `npm run typecheck`
- **`booking.itineraryType` does not exist on `Booking`** — `src/app/(app)/bookings/page.tsx:310-311`. The itinerary icon + label read a field that was never on the type; it always renders `N/A`. Should use `bookingType` (with the `car → Transfer` mapping already used elsewhere).
- **`data` is possibly `undefined`** — `src/components/forms/client-form.tsx:70-71`. Guard the value before use (e.g. `data?.` or an early return) to avoid a runtime crash path.

_These are the only two files failing typecheck today; everything else compiles._

### 1.2 Dashboard "Recent Bookings" shows fake data
- `src/components/dashboard/recent-bookings.tsx` renders **mock data** (`mockClients`, `mockBookings` from `src/lib/data.ts`) with **`Math.random()` amounts**, hardcoded copy ("You made 4 bookings this month"), and **`$` currency** (the rest of the app uses `₹`). Replace with a real Firestore query (most-recent bookings) and correct currency/labels.

### 1.3 Silent write failures
- `addDocumentNonBlocking` (`src/firebase/non-blocking-updates.tsx`) catches **all** `addDoc` errors and re-emits them as a generic `FirestorePermissionError`. Real errors (e.g. `undefined` field values, network) are hidden and look like permission problems. Add proper error surfacing (toast + console) and distinguish permission vs. validation errors.

### 1.4 Legacy / migration gaps
- **Old bookings** created before the detail fields were wired have no `bookingDetails`, so the details grid + PNR/reference column show empty/`—` until re-saved.
- **`client.services`** may be a legacy string on old docs (now an array) — handled defensively in the UI, but a one-time data backfill would clean it up.
- **`budget` / `hotelPreference`** were removed from the client form but are **still referenced** in the client detail view (`src/app/(app)/clients/[clientId]/page.tsx`) and other files. Decide: fully remove or re-add to the form.

### 1.5 Stub pages shipped as "coming soon"
- `src/app/(app)/clients/[clientId]/invoices/page.tsx` and `.../itinerary/page.tsx` are 14-line placeholders ("… will be displayed here"). They're linked from Quick Access, so users hit dead ends.

---

## 2. Security — RBAC is UI-only (important)

The new **agent/employee** scoping and **revenue privacy** are enforced only in the React layer. `firestore.rules` still says:

```
match /clients/{id} { allow read, update: if isSignedIn(); }
match /bookings/{id} { allow read, create, update: if isSignedIn(); }
```

So any signed-in user can read **all** clients/bookings (incl. revenue/profit fields) directly via the SDK, bypassing the UI. To make it real RBAC:
1. Restrict `clients` read to `isAdminOrManager() || resource.data.assignedEmployee == request.auth.uid || resource.data.createdBy == request.auth.uid`.
2. Constrain **every** client/booking list query for non-admins with a matching `where(...)` clause (clients page, booking form customer dropdown, dashboard, etc.) and deploy the needed composite indexes.
3. Consider splitting revenue/cost fields into a subdocument readable only by the owning agent, so profit truly can't leak.

_This is a coordinated change (rules + queries + indexes) and should be tested against the emulator before deploy._

---

## 3. Updates / polish (medium priority)

- **Main bookings page still shows `BK-xxxxx`** as the Booking ID, while the client bookings page now shows the real reference (PNR / hotel booking id). Make them consistent.
- **`total` defaults to 0 for non-agents** (they have no pricing UI). Confirm this is intended for invoicing/reporting, or let a pricing role fill it later.
- **Payment tracking exists in the type but not the UI** — `amountPaid`, `balanceAmount`, `paymentStatus` on `Booking` are unused. Surface a payment status + balance on bookings.
- **No automated tests** and no CI. Even a thin smoke-test layer (Vitest + React Testing Library) around forms and the RBAC helpers would catch regressions.
- **Consistent loading/empty states** — some pages have skeletons, others don't; standardize.
- **`serviceLabels` / detail label maps are duplicated** across files; the booking one is now centralized in `src/lib/booking-details.ts` — do the same for client service labels.
- **Accessibility pass** — dialog focus traps, labels on icon-only buttons, color-contrast on the colored badges.

---

## 4. New features worth introducing

**Financials**
- **Invoice generation from a booking** (PDF/print) + email to client; wire the currently-stubbed client invoices page.
- **Payment tracking & receipts** — record part payments, outstanding balance, due reminders.
- **Multi-currency + GST/tax** handling on bookings and invoices.

**Productivity / automation**
- **Reminders & notifications** — follow-ups due, upcoming departures, visa-expiry — via email/WhatsApp (a Cloud Function + a notifications center).
- **Global search** across clients, bookings, leads.
- **Bulk actions & CSV import/export** for clients and leads.
- **Calendar view** for departures and attendance.

**Client-facing**
- **Shareable itinerary / client portal** — a public read-only link built from the itinerary builder.
- **Public document upload** for the client (passport, photos) tied to `requiredDocuments`.

**Analytics**
- **Reports dashboard** — revenue/profit by agent, lead-conversion funnel, month-over-month trends, with date-range filters and CSV export (agent-scoped per the revenue rules).

**AI (Genkit + Google GenAI already in the stack)**
- Auto-draft client emails/quotes from a booking.
- Lead scoring / next-best-action suggestions.
- Expand the existing itinerary-suggestions flow (`src/ai/flows/itinerary-suggestions.ts`) into a full day-by-day generator.

**Platform**
- **PWA / offline** support and installability (agents on the move).
- **Audit trail** beyond `customer_logs` — who changed what on bookings/clients.
- **Dark mode / theming** toggle.

---

## 5. Suggested order of work

1. Fix the two typecheck errors (§1.1) and the mock-data dashboard card (§1.2). _Quick, high impact._
2. Decide budget/hotelPreference + stub pages (§1.4, §1.5).
3. Harden Firestore rules for RBAC + revenue privacy (§2). _Highest security value._
4. Payment tracking + invoice generation (§4 Financials). _Highest business value._
5. Reminders/notifications and reports (§4).
6. Introduce tests + CI (§3) alongside the above.
