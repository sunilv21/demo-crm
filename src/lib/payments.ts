import type { Booking, Payment, PaymentStatus } from './types';

export const newPaymentId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type PaymentSource = Pick<Booking, 'payments' | 'amountPaid' | 'createdAt' | 'total'>;

/**
 * The ledger to display for a booking. If there's a cached `amountPaid` but no
 * ledger yet (booking form / older data / revenue collect), surface it as a
 * single synthetic "recorded earlier" opening row (id 'opening') so the ledger
 * always reconciles with amountPaid.
 */
export function ledgerFor(b: PaymentSource): Payment[] {
  if (b.payments && b.payments.length) return b.payments;
  if ((b.amountPaid || 0) > 0) {
    let date = '';
    const c: any = b.createdAt;
    const d = c?.toDate ? c.toDate() : c ? new Date(c) : null;
    if (d && !isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    return [{ id: 'opening', amount: b.amountPaid || 0, date, mode: 'other', reference: 'Recorded earlier' }];
  }
  return [];
}

/** A persistable copy of the opening entry (real id) when the ledger is synthetic. */
function persistableExisting(b: PaymentSource): Payment[] {
  if (b.payments && b.payments.length) return b.payments;
  const synthetic = ledgerFor(b);
  return synthetic.map((p) => ({ ...p, id: newPaymentId() }));
}

export function computeTotals(payments: Payment[], total: number): {
  amountPaid: number;
  balanceAmount: number;
  paymentStatus: PaymentStatus;
} {
  const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  return {
    amountPaid: paid,
    balanceAmount: Math.max(0, total - paid),
    paymentStatus: total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
  };
}

/** Fields to write when adding a payment to a booking (seeds an opening entry if needed). */
export function withAddedPayment(b: PaymentSource, payment: Payment) {
  const payments = [...persistableExisting(b), payment];
  return { payments, ...computeTotals(payments, b.total || 0) };
}

/** Fields to write when removing a ledger row. */
export function withRemovedPayment(b: PaymentSource, id: string) {
  const payments = (b.payments || []).filter((p) => p.id !== id);
  return { payments, ...computeTotals(payments, b.total || 0) };
}
