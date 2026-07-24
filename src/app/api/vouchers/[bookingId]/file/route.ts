import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyVoucherLink } from '@/lib/voucher-link';
import { buildVoucherInput } from '@/lib/voucher-types';
import { generateBookingVoucherDocx } from '@/app/actions/voucher-docx';
import type { Booking, Client, Hotel } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VOUCHER_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * GET /api/vouchers/[bookingId]/file?token=...&exp=...
 *
 * No Firebase auth — this is the URL Twilio/Meta's servers fetch a WhatsApp
 * document message's media from, so it has to be reachable over the open
 * internet. A signed, time-limited token (src/lib/voucher-link.ts) stands in
 * for auth instead: without a valid token this 403s, so it's not an open
 * "download anyone's booking voucher by ID" endpoint.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const { searchParams } = req.nextUrl;
  if (!verifyVoucherLink(bookingId, searchParams.get('token'), searchParams.get('exp'))) {
    return NextResponse.json({ error: 'This voucher link is invalid or has expired.' }, { status: 403 });
  }

  const db = adminDb();
  const bookingSnap = await db.doc(`bookings/${bookingId}`).get();
  if (!bookingSnap.exists) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
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

  const result = await generateBookingVoucherDocx(input);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return new NextResponse(Buffer.from(result.base64, 'base64'), {
    status: 200,
    headers: {
      'Content-Type': VOUCHER_MIME,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
