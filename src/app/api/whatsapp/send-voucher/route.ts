import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/api-auth';
import { sendViaTwilio, sendViaMeta } from '@/lib/whatsapp-send';
import { publicBaseUrlOrNull } from '@/lib/whatsapp-webhook-auth';
import { createVoucherLink } from '@/lib/voucher-link';
import type { Booking, WhatsAppAccount } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/send-voucher
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * "Email Voucher"'s WhatsApp equivalent — same admin/manager/agent gating as
 * /api/whatsapp/send. Unlike a text send, the voucher .docx isn't generated
 * here: it builds a short-lived signed link to
 * /api/vouchers/[bookingId]/file (src/lib/voucher-link.ts) and hands that URL
 * to Twilio/Meta as the document's media source — both providers fetch media
 * from a URL themselves rather than accepting file bytes inline.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager', 'agent']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => ({}))) as { accountId?: string; to?: string; bookingId?: string; caption?: string };
  const { accountId, to, bookingId, caption } = body;
  if (!accountId || !to || !bookingId) {
    return NextResponse.json({ error: 'accountId, to, and bookingId are required.' }, { status: 400 });
  }

  const db = adminDb();
  const [accountSnap, bookingSnap] = await Promise.all([
    db.doc(`whatsapp_accounts/${accountId}`).get(),
    db.doc(`bookings/${bookingId}`).get(),
  ]);
  if (!accountSnap.exists || accountSnap.data()?.status !== 'connected') {
    return NextResponse.json({ error: 'This WhatsApp account is not connected.' }, { status: 409 });
  }
  if (!bookingSnap.exists) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }
  const account = { id: accountSnap.id, ...accountSnap.data() } as WhatsAppAccount;
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
  if (booking.bookingType !== 'hotel') {
    return NextResponse.json({ error: 'Vouchers are currently available for hotel bookings only.' }, { status: 422 });
  }
  if (account.provider !== 'twilio' && account.provider !== 'meta_cloud') {
    return NextResponse.json({ error: 'Sending a voucher over WhatsApp requires a Twilio or Meta Cloud API account.' }, { status: 422 });
  }

  const base = publicBaseUrlOrNull(req);
  if (!base) {
    return NextResponse.json(
      { error: 'No public URL is configured for this app, so Twilio/Meta cannot fetch the voucher file. Set WHATSAPP_PUBLIC_BASE_URL.' },
      { status: 500 }
    );
  }
  const { token, expiresAt } = createVoucherLink(bookingId);
  const mediaUrl = `${base}/api/vouchers/${bookingId}/file?token=${token}&exp=${expiresAt}`;
  const filename = `Voucher-${booking.clientName || bookingId}.docx`.replace(/[^\w.\- ]+/g, '_');
  const media = { url: mediaUrl, filename };
  const text = caption?.trim() || `Hi ${booking.clientName || ''}, please find your booking voucher attached.`.trim();

  try {
    if (account.provider === 'twilio') {
      const statusCallbackUrl = `${base}/api/webhooks/whatsapp/twilio/status`;
      await sendViaTwilio(account, to, text, statusCallbackUrl, media);
    } else {
      await sendViaMeta(account, to, text, media);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to send the voucher.' }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
