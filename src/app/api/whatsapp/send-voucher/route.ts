import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/api-auth';
import { sendViaTwilio, sendViaMeta } from '@/lib/whatsapp-send';
import { bridgeSendMediaMessage } from '@/lib/whatsapp-bridge-client';
import { publicBaseUrlOrNull } from '@/lib/whatsapp-webhook-auth';
import { createVoucherLink } from '@/lib/voucher-link';
import { generateVoucherForBooking } from '@/lib/voucher-generate';
import type { Booking, WhatsAppAccount } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VOUCHER_MIME = 'application/pdf';

/**
 * POST /api/whatsapp/send-voucher
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * "Email Voucher"'s WhatsApp equivalent — same admin/manager/agent gating as
 * /api/whatsapp/send. Twilio/Meta Cloud API only accept media by fetching a
 * URL themselves, so those two build a short-lived signed link to
 * /api/vouchers/[bookingId]/file (src/lib/voucher-link.ts) instead of
 * generating the file here. whatsapp_web has no such restriction —
 * whatsapp-web.js sends file bytes inline — so that branch generates the
 * PDF directly (src/lib/voucher-generate.ts) and ships it to the bridge as
 * base64, no URL, no hosting, no cloud storage.
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

  const base = publicBaseUrlOrNull(req);
  const filename = `Voucher-${booking.clientName || bookingId}.pdf`.replace(/[^\w.\- ]+/g, '_');
  const text = caption?.trim() || `Hi ${booking.clientName || ''}, please find your booking voucher attached.`.trim();

  try {
    if (account.provider === 'twilio' || account.provider === 'meta_cloud') {
      if (!base) {
        return NextResponse.json(
          { error: 'No public URL is configured for this app, so Twilio/Meta cannot fetch the voucher file. Set WHATSAPP_PUBLIC_BASE_URL.' },
          { status: 500 }
        );
      }
      const { token, expiresAt } = createVoucherLink(bookingId);
      const mediaUrl = `${base}/api/vouchers/${bookingId}/file?token=${token}&exp=${expiresAt}`;
      const media = { url: mediaUrl, filename };
      if (account.provider === 'twilio') {
        const statusCallbackUrl = `${base}/api/webhooks/whatsapp/twilio/status`;
        await sendViaTwilio(account, to, text, statusCallbackUrl, media);
      } else {
        await sendViaMeta(account, to, text, media);
      }
    } else {
      // whatsapp_web — no URL fetch involved in the actual send, so no
      // public-URL requirement. Still build the signed link (best-effort;
      // sending isn't blocked if it's unavailable) purely so the resulting
      // chat message has an attachment link in the CRM, matching what
      // Twilio/Meta sends already show.
      const result = await generateVoucherForBooking(bookingId);
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }
      let mediaUrl: string | undefined;
      if (base) {
        const { token, expiresAt } = createVoucherLink(bookingId);
        mediaUrl = `${base}/api/vouchers/${bookingId}/file?token=${token}&exp=${expiresAt}`;
      }
      await bridgeSendMediaMessage(account.id, to, {
        base64: result.base64,
        mimetype: VOUCHER_MIME,
        filename: result.filename,
        caption: text,
        mediaUrl,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to send the voucher.' }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
