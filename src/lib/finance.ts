import type {
  FinanceAccount,
  FinanceTransaction,
  FinanceAccountType,
  Booking,
} from '@/lib/types';
import { PAYMENT_MODE_LABELS } from '@/lib/utils';
import { ledgerFor } from '@/lib/payments';

// Firestore collection names for the Finance module.
export const FINANCE_COLLECTIONS = {
  accounts: 'accounts',
  transactions: 'finance_transactions',
  suppliers: 'suppliers',
  categories: 'expense_categories',
  methods: 'payment_methods',
} as const;

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
  if (t.type === 'expense') return t.accountId === accountId ? -amt : 0;
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

/** Total balance across a set of accounts. */
export function totalBalance(accounts: FinanceAccount[], transactions: FinanceTransaction[]): number {
  return accounts.reduce((s, a) => s + accountBalance(a, transactions), 0);
}

const dayKey = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const monthKey = (iso?: string) => (iso ? iso.slice(0, 7) : '');

/** Sum of income (money in) over live transactions, optionally within a date/month scope. */
export function sumIncome(transactions: FinanceTransaction[], filter?: (t: FinanceTransaction) => boolean): number {
  return transactions
    .filter((t) => live(t) && t.type === 'income' && (!filter || filter(t)))
    .reduce((s, t) => s + (t.amount || 0), 0);
}

export function sumExpense(transactions: FinanceTransaction[], filter?: (t: FinanceTransaction) => boolean): number {
  return transactions
    .filter((t) => live(t) && t.type === 'expense' && (!filter || filter(t)))
    .reduce((s, t) => s + (t.amount || 0), 0);
}

export const onDate = (isoDate: string) => (t: FinanceTransaction) => dayKey(t.date) === isoDate;
export const inMonth = (isoMonth: string) => (t: FinanceTransaction) => monthKey(t.date) === isoMonth;

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
        amount: p.amount,
        date: (p.date || '').slice(0, 10) || bookingDateISO(b),
        accountId: '',
        clientId: b.clientId,
        clientName: b.clientName,
        bookingId: b.id,
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

// A derived (read-only, from a booking) transaction can't be cancelled/edited.
export const isDerivedTxn = (t: FinanceTransaction) => t.id.startsWith('bk_');

// Unified payment methods — the same labels the booking Payments dialog uses
// (PaymentMode), so agent-collected payments and finance entries speak one
// vocabulary. Extra outgoing-only options are appended for expenses.
export const UNIFIED_METHODS = Object.values(PAYMENT_MODE_LABELS);
export const DEFAULT_IN_METHODS = [...UNIFIED_METHODS];
export const DEFAULT_OUT_METHODS = [...UNIFIED_METHODS, 'Salary Transfer'];
export const DEFAULT_EXPENSE_CATEGORIES = ['Visa Fees', 'Air Ticket', 'Hotel', 'Courier', 'Fuel', 'Rent', 'Salary', 'Internet', 'Marketing', 'Software', 'Miscellaneous'];
