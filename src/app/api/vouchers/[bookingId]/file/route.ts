import { NextRequest, NextResponse } from 'next/server';
import { verifyVoucherLink } from '@/lib/voucher-link';
import { generateVoucherForBooking } from '@/lib/voucher-generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VOUCHER_MIME = 'application/pdf';

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

  const result = await generateVoucherForBooking(bookingId);
  if ('error' in result) {
    const status = result.error === 'Booking not found.' ? 404 : 422;
    return NextResponse.json({ error: result.error }, { status });
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
