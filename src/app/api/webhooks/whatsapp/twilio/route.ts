import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { decryptSecret } from '@/lib/mailbox-crypto';
import { verifyTwilioSignature, publicUrlFor } from '@/lib/whatsapp-webhook-auth';
import { normalizeDigits } from '@/lib/whatsapp-send';
import type { WhatsAppAccount } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/whatsapp/twilio
 * Inbound WhatsApp messages from Twilio, form-encoded. No Firebase auth —
 * X-Twilio-Signature (HMAC-SHA1 of this exact URL + sorted form params,
 * using the account's own Auth Token) is what proves this call actually
 * came from Twilio for this account.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const to = params.To?.replace('whatsapp:', '') || '';
  if (!to) {
    return NextResponse.json({ error: 'Missing To.' }, { status: 400 });
  }

  const accountSnap = await adminDb()
    .collection('whatsapp_accounts')
    .where('twilioWhatsAppFrom', '==', `whatsapp:${to}`)
    .limit(1)
    .get();
  if (accountSnap.empty) {
    return NextResponse.json({ error: 'No matching account.' }, { status: 404 });
  }
  const accountDoc = accountSnap.docs[0];
  const account = { id: accountDoc.id, ...accountDoc.data() } as WhatsAppAccount;
  if (!account.twilioAuthTokenCiphertext) {
    return NextResponse.json({ error: 'Account is missing credentials.' }, { status: 500 });
  }
  const authToken = decryptSecret({
    ciphertext: account.twilioAuthTokenCiphertext,
    iv: account.twilioAuthTokenIv!,
    authTag: account.twilioAuthTokenAuthTag!,
  });

  const publicUrl = publicUrlFor(req);
  if (!verifyTwilioSignature(publicUrl, params, req.headers.get('x-twilio-signature'), authToken)) {
    console.error('[whatsapp/twilio webhook] signature verification failed', { publicUrl });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  const from = normalizeDigits(params.From?.replace('whatsapp:', '') || '');
  const body = params.Body || '';
  if (from && body) {
    await adminDb()
      .collection('whatsapp_messages')
      .add({
        accountId: account.id,
        chatId: from,
        direction: 'inbound',
        from,
        to: normalizeDigits(to),
        body,
        isRead: false,
        timestamp: FieldValue.serverTimestamp(),
        syncedAt: FieldValue.serverTimestamp(),
      });
  }

  // Twilio expects a 200 with empty/TwiML body — we're not replying inline.
  return new NextResponse('', { status: 200, headers: { 'Content-Type': 'text/xml' } });
}
