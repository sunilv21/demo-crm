// Server-only. Booking → voucher PDF bytes, entirely in memory (no disk,
// no cloud storage) — shared by the public signed-link route
// (src/app/api/vouchers/[bookingId]/file, which Twilio/Meta fetch from) and
// the whatsapp_web send-voucher path (src/app/api/whatsapp/send-voucher),
// which sends these bytes inline and has no need for a URL at all.

import { adminDb } from '@/lib/firebase-admin';
import { buildVoucherInput } from '@/lib/voucher-types';
import { generateBookingVoucherPdf } from '@/app/actions/voucher-pdf';
import type { Booking, Client, Hotel } from '@/lib/types';

export async function generateVoucherForBooking(
  bookingId: string
): Promise<{ base64: string; filename: string } | { error: string }> {
  const db = adminDb();
  const bookingSnap = await db.doc(`bookings/${bookingId}`).get();
  if (!bookingSnap.exists) {
    return { error: 'Booking not found.' };
  }
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;

  let client: Client | null = null;
  if (booking.clientId) {
    const clientSnap = await db.doc(`clients/${booking.clientId}`).get();
    if (clientSnap.exists) client = { id: clientSnap.id, ...clientSnap.data() } as Client;
  }

  const input = buildVoucherInput(booking, client);
  const hotelId = booking.bookingDetails?.hotelId;
  if (hotelId) {
    const hotelSnap = await db.doc(`hotels/${String(hotelId)}`).get();
    if (hotelSnap.exists) {
      const hotel = hotelSnap.data() as Hotel;
      input.hotelTermsAndConditions = hotel.termsAndConditions;
      input.hotelNotes = hotel.notes;
    }
  }

  return generateBookingVoucherPdf(input);
}
