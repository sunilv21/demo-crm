import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/api-auth';
import { bridgeSendMessage } from '@/lib/whatsapp-bridge-client';
import { sendViaTwilio, sendViaMeta } from '@/lib/whatsapp-send';
import { publicBaseUrlOrNull } from '@/lib/whatsapp-webhook-auth';
import type { WhatsAppAccount } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/send
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Day-to-day send action — available to admin/manager/agent, same roles as
 * email sending (see /api/email/send). Dispatches by provider: the
 * whatsapp-web.js bridge performs the send and writes the outbound message
 * doc itself; Twilio/Meta Cloud API have no separate process, so this route
 * calls the provider's REST API directly and writes the message doc itself
 * too.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager', 'agent']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => ({}))) as { accountId?: string; to?: string; body?: string };
  const { accountId, to, body: text } = body;
  if (!accountId || !to || !text?.trim()) {
    return NextResponse.json({ error: 'accountId, to, and body are required.' }, { status: 400 });
  }

  const accountSnap = await adminDb().doc(`whatsapp_accounts/${accountId}`).get();
  if (!accountSnap.exists || accountSnap.data()?.status !== 'connected') {
    return NextResponse.json({ error: 'This WhatsApp account is not connected.' }, { status: 409 });
  }
  const account = { id: accountSnap.id, ...accountSnap.data() } as WhatsAppAccount;

  try {
    if (account.provider === 'twilio') {
      // Twilio flatly rejects a StatusCallback pointing at localhost (the
      // browser talks to this route directly, not through any tunnel) —
      // omit it entirely rather than let a bad URL break the send.
      const base = publicBaseUrlOrNull(req);
      const statusCallbackUrl = base ? `${base}/api/webhooks/whatsapp/twilio/status` : undefined;
      await sendViaTwilio(account, to, text.trim(), statusCallbackUrl);
      return NextResponse.json({ success: true });
    } else if (account.provider === 'meta_cloud') {
      await sendViaMeta(account, to, text.trim());
      return NextResponse.json({ success: true });
    } else {
      // Unlike Twilio/Meta, the bridge may resolve `to` (a phone number or an
      // existing chat's JID) to a different chatId than what was passed in
      // (WhatsApp's LID privacy ids) — hand it back so the UI can select the
      // right chat instead of guessing.
      const { chatId } = await bridgeSendMessage(accountId, to, text.trim());
      return NextResponse.json({ success: true, chatId });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to send message.' }, { status: 502 });
  }
}
