import type {
  FinanceAccount,
  FinanceTransaction,
  FinanceAccountType,
  Booking,
  AgentExpense,
  User,
} from '@/lib/types';
import { PAYMENT_MODE_LABELS, formatINR } from '@/lib/utils';
import { ledgerFor } from '@/lib/payments';

// Firestore collection names for the Finance module.
export const FINANCE_COLLECTIONS = {
  accounts: 'accounts',
  transactions: 'finance_transactions',
  suppliers: 'suppliers',
  categories: 'expense_categories',
  methods: 'payment_methods',
  agentExpenses: 'agent_expenses',
} as const;

// The supplier/portal/rental-company/agency directory's category list — one
// place so Finance → Suppliers, Database → Suppliers, and the booking form's
// quick-add dialog all offer the exact same options.
export const SUPPLIER_CATEGORIES = [
  'VFS', 'BLS', 'Embassy', 'DMC', 'B2B Portal', 'Booking Portal', 'Agency', 'Airline', 'Hotel',
  'Transport', 'Rental Company', 'Tour Operator', 'Insurance', 'Courier', 'Marketing',
  'Software / SaaS', 'Bank / Gateway', 'Employee', 'Landlord', 'Utility', 'Government', 'Other',
] as const;

export const ACCOUNT_TYPE_LABELS: Record<FinanceAccountType, string> = {
  cash: 'Cash',
  'petty-cash': 'Petty Cash',
  current: 'Current A/C',
  savings: 'Savings A/C',
  wallet: 'Wallet',
};

// Cash vs bank/wallet split for the dashboard KPIs.
export const isCashAccount = (a: FinanceAccount) => a.type === 'cash' || a.type === 'petty-cash';

const live = (t: FinanceTransaction) => t.status !== 'cancelled';

/** Net effect of one transaction on a specific account (+in / −out). */
export function txnDeltaForAccount(t: FinanceTransaction, accountId: string): number {
  if (!live(t)) return 0;
  const amt = t.amount || 0;
  if (t.type === 'income') return t.accountId === accountId ? amt : 0;
  if (t.type === 'expense') {
    if (t.accountId === accountId) return -amt;
    // Funds a wallet account (e.g. depositing into a supplier's balance).
    if (t.toAccountId === accountId) return amt;
    return 0;
  }
  // transfer: leaves accountId, arrives toAccountId
  if (t.type === 'transfer') {
    if (t.accountId === accountId) return -amt;
    if (t.toAccountId === accountId) return amt;
  }
  return 0;
}

/** Current balance of an account = opening + Σ transaction effects (compute-on-read). */
export function accountBalance(account: FinanceAccount, transactions: FinanceTransaction[]): number {
  return (account.openingBalance || 0) + transactions.reduce((s, t) => s + txnDeltaForAccount(t, account.id), 0);
}

/** For a wallet-type account that's gone negative (spent more than was
 * deposited — e.g. a person's card used past what they were given), read
 * this as money owed to that person/portal, not a plain negative balance. */
export function accountBalanceLabel(account: FinanceAccount, balance: number): string {
  if (balance < 0 && account.type === 'wallet') return `Owed ${formatINR(Math.abs(balance))}`;
  return formatINR(balance);
}

/** Total balance across a set of accounts. */
export function totalBalance(accounts: FinanceAccount[], transactions: FinanceTransaction[]): number {
  return accounts.reduce((s, a) => s + accountBalance(a, transactions), 0);
}

// Reconciliation ("Buy Price" / "Needs Attention" tabs): how much has
// actually been paid toward each booking's supplier cost, from live expense
// transactions tagged to it. One place for this so both tabs stay in sync.
export function paidToSupplierByBooking(transactions: FinanceTransaction[]): Map<string, number> {
  const out = new Map<string, number>();
  transactions.forEach((t) => {
    if (t.status === 'cancelled' || t.type !== 'expense' || !t.bookingId || t.categoryName !== 'Supplier Cost') return;
    out.set(t.bookingId, (out.get(t.bookingId) || 0) + (t.amount || 0));
  });
  return out;
}

const dayKey = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const monthKey = (iso?: string) => (iso ? iso.slice(0, 7) : '');

/** True if `dateISO` falls in `month` ('YYYY-MM'). An empty `month` means "all months". */
export function matchesMonth(dateISO: string | undefined | null, month: string): boolean {
  if (!month) return true;
  return !!dateISO && dateISO.slice(0, 7) === month;
}

/** Sum of income (money in) over live transactions, optionally within a date/month scope. */
export function sumIncome(transactions: FinanceTransaction[], filter?: (t: FinanceTransaction) => boolean): number {
  return transactions
    .filter((t) => live(t) && t.type === 'income' && (!filter || filter(t)))
    .reduce((s, t) => s + (t.amount || 0), 0);
}

export function sumExpense(transactions: FinanceTransaction[], filter?: (t: FinanceTransaction) => boolean): number {
  return transactions
    .filter((t) => live(t) && t.type === 'expense' && !t.excludeFromExpenseTotal && (!filter || filter(t)))
    .reduce((s, t) => s + (t.amount || 0), 0);
}

export const onDate = (isoDate: string) => (t: FinanceTransaction) => dayKey(t.date) === isoDate;
export const inMonth = (isoMonth: string) => (t: FinanceTransaction) => monthKey(t.date) === isoMonth;

/** True if `dateISO` falls in or before `month` ('YYYY-MM') — used to replay a
 * balance as it stood at the end of a selected month. An empty `month` means
 * "no cutoff" (i.e. every transaction). */
export const uptoMonth = (isoMonth: string) => (t: FinanceTransaction) => !isoMonth || monthKey(t.date) <= isoMonth;

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const thisMonthISO = () => new Date().toISOString().slice(0, 7);

// Fallback date (ISO yyyy-mm-dd) for a booking-level collected amount.
function bookingDateISO(b: Booking): string {
  if (b.createdAt?.toDate) return b.createdAt.toDate().toISOString().slice(0, 10);
  if (b.startDate) return String(b.startDate).slice(0, 10);
  return '';
}

// Every client-booking collection surfaces in Finance as an income transaction
// (derived on read — covers historical + new, no double-entry). Handles BOTH
// ways money is recorded: the per-payment ledger (booking.payments[]) AND a
// booking-level amountPaid set directly on the booking form (no ledger entry).
// These are unassigned to a finance account (collected, not yet reconciled), so
// they show in collection totals but not account balances. Entries already
// mirrored to a real finance doc (financeTxnId set) are skipped.
export function bookingPaymentsAsTransactions(bookings: Booking[]): FinanceTransaction[] {
  const out: FinanceTransaction[] = [];
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    // ledgerFor() is the SAME source the agent Revenue "Recent Collections" uses
    // — it returns booking.payments[] if present, else a synthetic entry from
    // amountPaid. Using it guarantees Finance shows exactly what agents collected.
    for (const p of ledgerFor(b)) {
      if (!p || !(p.amount > 0) || p.financeTxnId) continue;
      out.push({
        id: `bk_${b.id}_${p.id}`,
        type: 'income',
        amount: Math.round(p.amount),
        date: (p.date || '').slice(0, 10) || bookingDateISO(b),
        accountId: p.accountId || '',
        clientId: b.clientId,
        clientName: b.clientName,
        bookingId: b.id,
        bookingPaymentId: p.id,
        paymentMethod: PAYMENT_MODE_LABELS[p.mode] ?? p.mode,
        reference: p.reference,
        remarks: p.id === 'opening' ? 'Booking collected (recorded earlier)' : 'Booking payment',
        status: 'completed',
        source: 'booking',
        createdAt: p.createdAt ?? b.createdAt ?? null,
        createdBy: p.createdBy ?? b.createdBy ?? '',
        createdByName: p.createdByName,
        updatedAt: p.createdAt ?? b.updatedAt ?? null,
        updatedBy: p.createdBy ?? b.updatedBy ?? '',
      } as FinanceTransaction);
    }
  }
  return out;
}

// Agent-logged expenses surface in Finance as expense transactions (derived on
// read, like booking collections). Unassigned to a finance account until
// reconciled; they count in expense totals.
export function agentExpensesAsTransactions(expenses: AgentExpense[], nameById?: Map<string, string>): FinanceTransaction[] {
  return (expenses ?? [])
    .filter((e) => e && e.amount > 0)
    .map((e) => ({
      id: `ae_${e.id}`,
      type: 'expense',
      amount: Math.round(e.amount),
      date: (e.date || '').slice(0, 10),
      accountId: '',
      supplierName: e.payee || undefined,
      categoryName: e.category || 'Agent expense',
      paymentMethod: e.paymentMethod || '',
      remarks: e.purpose || 'Agent expense',
      status: 'completed',
      source: 'agent',
      createdAt: e.createdAt ?? null,
      createdBy: e.createdBy ?? '',
      createdByName: e.createdByName ?? (nameById ? nameById.get(e.createdBy) : undefined),
      updatedAt: e.updatedAt ?? null,
      updatedBy: e.updatedBy ?? '',
    } as FinanceTransaction));
}

// A derived (read-only) transaction can't be cancelled/edited in Finance.
export const isDerivedTxn = (t: FinanceTransaction) => t.id.startsWith('bk_') || t.id.startsWith('ae_');

// The agent credited for a booking's revenue/collection: the explicit owner
// (agentId) if they're currently an agent, else the creator if they're an
// agent, else null (e.g. an employee-created booking no agent has claimed).
export function bookingAgentId(
  b: Pick<Booking, 'agentId' | 'createdBy'>,
  roleOf: (uid: string) => string | undefined
): string | null {
  if (b.agentId && roleOf(b.agentId) === 'agent') return b.agentId;
  if (b.createdBy && roleOf(b.createdBy) === 'agent') return b.createdBy;
  return null;
}

// Display name of who booked it, for Reconciliation and similar admin views:
// the credited sales agent (see bookingAgentId above) if there is one, else
// whoever created the booking (e.g. an employee-created booking no agent has
// claimed) — so every row shows a name instead of blank.
export function bookingAgentName(
  b: Pick<Booking, 'agentId' | 'createdBy'>,
  userById: Map<string, Pick<User, 'name' | 'role'>>
): string {
  const agentUid = bookingAgentId(b, (uid) => userById.get(uid)?.role);
  const uid = agentUid || b.createdBy;
  return (uid && userById.get(uid)?.name) || 'Unknown';
}

// Unified payment methods — the same labels the booking Payments dialog uses
// (PaymentMode), so agent-collected payments and finance entries speak one
// vocabulary. Extra outgoing-only options are appended for expenses.
export const UNIFIED_METHODS = Object.values(PAYMENT_MODE_LABELS);
export const DEFAULT_IN_METHODS = [...UNIFIED_METHODS];
export const DEFAULT_OUT_METHODS = [...UNIFIED_METHODS, 'Salary Transfer'];
export const DEFAULT_EXPENSE_CATEGORIES = ['Visa Fees', 'Air Ticket', 'Hotel', 'Courier', 'Fuel', 'Rent', 'Salary', 'Internet', 'Marketing', 'Software', 'Miscellaneous', 'Others'];
