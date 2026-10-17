// Plain-serializable input for the hotel booking voucher generators — the
// local "Download Voucher" action still produces a .docx
// (src/app/actions/voucher-docx.ts), while email/WhatsApp sends use the PDF
// renderer (src/app/actions/voucher-pdf.ts) instead. Vouchers are
// hotel-bookings only — both generators reject any other booking type.
//
// A Server Action's arguments must be plain JSON-serializable values — a
// live Booking/Client can carry Firestore Timestamp instances (createdAt,
// documents[].uploadedAt, timeline[].createdAt) which are NOT plain objects,
// so this picks only the plain fields a voucher actually needs (converting
// createdAt to a plain ISO string here, client-side) rather than passing the
// whole record across the boundary.
import type { Booking, Client, BookingType, BookingStatus } from '@/lib/types';
import { bookingReference } from '@/lib/booking-details';

export type VoucherInput = {
  bookingId: string;
  bookingType: BookingType;
  status: BookingStatus;
  bookingDate?: string; // ISO — when the booking was created, shown as "Booking Date" on the voucher
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientNationality?: string;
  destination?: string;
  startDate: string;
  endDate: string;
  isOneWay?: boolean;
  supplierName?: string;
  supplierReference?: string;
  bookingPortal?: string;
  total?: number;
  amountPaid?: number;
  balanceAmount?: number;
  remarks?: string;
  hotelGuests?: { name?: string }[];
  bookingDetails?: Record<string, string | number | boolean | null>;
  reference: { label: string; value: string } | null;
  // Sourced from the linked Hotel Master record (booking.bookingDetails.hotelId)
  // at generation time, if any — replaces the generic hardcoded terms on the
  // voucher, and adds a Notes section when set. Set by the caller after
  // buildVoucherInput(); see voucher-docx.ts / voucher-pdf.ts.
  hotelTermsAndConditions?: string;
  hotelNotes?: string;
};

// NOTE: intentionally excludes supplierCost and profit — a voucher is a
// customer/supplier-facing document, so the agency's internal margin has no
// business being on it (unlike the internal Print Settings dialog, which
// gates those behind explicit, default-off toggles for internal use).
export function buildVoucherInput(booking: Booking, client?: Pick<Client, 'name' | 'phone' | 'email' | 'nationality'> | null): VoucherInput {
  // bookingDetails can hold arbitrary shapes from older records; keep only
  // primitive values so the payload is guaranteed plain-serializable.
  const rawDetails = (booking.bookingDetails || {}) as Record<string, unknown>;
  const bookingDetails: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(rawDetails)) {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      bookingDetails[k] = v;
    }
  }

  const createdAt = (booking as any).createdAt;
  const bookingDate = createdAt?.toDate ? createdAt.toDate().toISOString() : undefined;

  return {
    bookingId: booking.id,
    bookingType: booking.bookingType,
    status: booking.status,
    bookingDate,
    clientName: client?.name || booking.clientName,
    clientPhone: client?.phone,
    clientEmail: client?.email,
    clientNationality: client?.nationality,
    destination: booking.destination,
    startDate: booking.startDate,
    endDate: booking.endDate,
    isOneWay: booking.isOneWay,
    supplierName: booking.supplierName,
    supplierReference: booking.supplierReference,
    bookingPortal: booking.bookingPortal,
    total: booking.total,
    amountPaid: booking.amountPaid,
    balanceAmount: booking.balanceAmount,
    remarks: booking.remarks,
    hotelGuests: booking.hotelGuests?.map((g) => ({ name: g.name })),
    bookingDetails,
    reference: bookingReference(booking),
  };
}
