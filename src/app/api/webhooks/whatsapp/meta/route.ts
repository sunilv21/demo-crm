import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getMetaSettings, verifyMetaSignature } from '@/lib/whatsapp-webhook-auth';
import { normalizeDigits } from '@/lib/whatsapp-send';
import type { WhatsAppAccount, WhatsAppMessageStatus } from '@/lib/types';

// Meta's status values line up with ours directly except "read", which it
// only ever sends after a prior "delivered" — no extra mapping needed.
const META_STATUS: Record<string, WhatsAppMessageStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/webhooks/whatsapp/meta
 * Meta's one-time webhook verification handshake — echoes back the
 * challenge if the verify token matches the one saved in Settings.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const { verifyToken } = await getMetaSettings();
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed.' }, { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp/meta
 * Inbound messages + delivery/read status updates from Meta. No Firebase
 * auth — X-Hub-Signature-256 (HMAC-SHA256 of the raw body, using the App
 * Secret from Settings) is what proves this call actually came from Meta.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const { appSecret } = await getMetaSettings();
  if (!appSecret) {
    return NextResponse.json({ error: 'Meta App Secret is not configured.' }, { status: 500 });
  }
  if (!verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const db = adminDb();

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const accountSnap = await db
        .collection('whatsapp_accounts')
        .where('metaPhoneNumberId', '==', phoneNumberId)
        .limit(1)
        .get();
      if (accountSnap.empty) continue;
      const accountDoc = accountSnap.docs[0];
      const account = { id: accountDoc.id, ...accountDoc.data() } as WhatsAppAccount;

      // Inbound messages.
      for (const msg of value.messages ?? []) {
        if (msg.type !== 'text') continue; // Phase 1: text only, same as whatsapp_web
        const chatId = normalizeDigits(msg.from);
        await db.collection('whatsapp_messages').add({
          accountId: account.id,
          chatId,
          direction: 'inbound',
          from: chatId,
          to: account.phoneNumber || phoneNumberId,
          body: msg.text?.body || '',
          isRead: false,
          timestamp: FieldValue.serverTimestamp(),
          syncedAt: FieldValue.serverTimestamp(),
        });
      }

      // Delivery/read receipts for messages we sent.
      for (const status of value.statuses ?? []) {
        const mapped = META_STATUS[status?.status || ''];
        const providerMessageId = status?.id;
        if (!mapped || !providerMessageId) continue;
        const msgSnap = await db
          .collection('whatsapp_messages')
          .where('providerMessageId', '==', providerMessageId)
          .limit(1)
          .get();
        if (!msgSnap.empty) {
          await msgSnap.docs[0].ref.update({ status: mapped });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
