import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { decryptSecret } from '@/lib/mailbox-crypto';
import { verifyTwilioSignature, publicUrlFor } from '@/lib/whatsapp-webhook-auth';
import type { WhatsAppAccount, WhatsAppMessageStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Twilio's MessageStatus values, narrowed to what we track. queued/sending/
// accepted aren't meaningful beyond "sent" (already the value set at send
// time), so they're not mapped — nothing to update for those.
const STATUS_MAP: Record<string, WhatsAppMessageStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  undelivered: 'failed',
};

/**
 * POST /api/webhooks/whatsapp/twilio/status
 * Delivery/read receipts for messages we sent — the URL passed as
 * `StatusCallback` on the original send request (see src/lib/whatsapp-send.ts).
 * Same signature-verification requirement as the inbound message webhook;
 * looked up by From (our own Twilio number) here, not To, since this
 * callback is about a message where we were the sender.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const from = params.From?.replace('whatsapp:', '') || '';
  const messageStatus = STATUS_MAP[params.MessageStatus || ''];
  const messageSid = params.MessageSid;
  if (!from || !messageSid || !messageStatus) {
    // Not an error — just a status value we don't track (queued/sending/etc).
    return new NextResponse('', { status: 200 });
  }

  const accountSnap = await adminDb()
    .collection('whatsapp_accounts')
    .where('twilioWhatsAppFrom', '==', `whatsapp:${from}`)
    .limit(1)
    .get();
  if (accountSnap.empty) {
    return NextResponse.json({ error: 'No matching account.' }, { status: 404 });
  }
  const account = { id: accountSnap.docs[0].id, ...accountSnap.docs[0].data() } as WhatsAppAccount;
  if (!account.twilioAuthTokenCiphertext) {
    return NextResponse.json({ error: 'Account is missing credentials.' }, { status: 500 });
  }
  const authToken = decryptSecret({
    ciphertext: account.twilioAuthTokenCiphertext,
    iv: account.twilioAuthTokenIv!,
    authTag: account.twilioAuthTokenAuthTag!,
  });

  const publicUrl = publicUrlFor(req, '/api/webhooks/whatsapp/twilio/status');
  if (!verifyTwilioSignature(publicUrl, params, req.headers.get('x-twilio-signature'), authToken)) {
    console.error('[whatsapp/twilio status webhook] signature verification failed', { publicUrl });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  const msgSnap = await adminDb()
    .collection('whatsapp_messages')
    .where('providerMessageId', '==', messageSid)
    .limit(1)
    .get();
  if (!msgSnap.empty) {
    await msgSnap.docs[0].ref.update({ status: messageStatus });
  }

  return new NextResponse('', { status: 200 });
}
