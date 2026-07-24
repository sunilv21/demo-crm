import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit-log';
import { encryptSecret } from '@/lib/mailbox-crypto';
import { bridgeConnectAccount } from '@/lib/whatsapp-bridge-client';
import type { WhatsAppProvider } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateAccountBody {
  provider?: WhatsAppProvider;
  label?: string;
  isDefault?: boolean;
  // Twilio
  accountSid?: string;
  authToken?: string;
  whatsappFrom?: string;
  // Meta Cloud API
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
}

/**
 * POST /api/whatsapp/accounts
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Creates a new WhatsApp account. whatsapp_web starts a QR pairing session on
 * the whatsapp-web.js bridge (async — the bridge writes the QR back onto this
 * doc). Twilio/Meta Cloud API connect synchronously: credentials are
 * verified with a live API call before the account is saved as connected,
 * mirroring the email module's "Test Connection" flow.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const body = (await req.json().catch(() => ({}))) as CreateAccountBody;
  const label = body.label?.trim();
  if (!label) {
    return NextResponse.json({ error: 'A label for this WhatsApp number is required.' }, { status: 400 });
  }
  const provider = body.provider || 'whatsapp_web';

  const db = adminDb();
  const ref = db.collection('whatsapp_accounts').doc();

  async function clearOtherDefaults() {
    if (!body.isDefault) return;
    const others = await db.collection('whatsapp_accounts').where('isDefault', '==', true).get();
    const batch = db.batch();
    for (const doc of others.docs) batch.update(doc.ref, { isDefault: false });
    await batch.commit();
  }

  const now = FieldValue.serverTimestamp();
  const baseFields = {
    label,
    provider,
    isDefault: !!body.isDefault,
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
  };

  if (provider === 'whatsapp_web') {
    await clearOtherDefaults();
    await ref.set({ ...baseFields, status: 'pending_qr', qr: null, connectionError: null });
    try {
      await bridgeConnectAccount(ref.id);
    } catch (err: any) {
      await ref.set({ status: 'error', connectionError: err?.message || 'Could not reach the WhatsApp bridge.' }, { merge: true });
      return NextResponse.json({ error: err?.message || 'Could not reach the WhatsApp bridge.' }, { status: 502 });
    }
  } else if (provider === 'twilio') {
    if (!body.accountSid || !body.authToken || !body.whatsappFrom) {
      return NextResponse.json({ error: 'Account SID, Auth Token, and WhatsApp number are required.' }, { status: 400 });
    }
    // Verify before saving — a bad SID/token should never be stored as "connected".
    const basicAuth = Buffer.from(`${body.accountSid}:${body.authToken}`).toString('base64');
    const testRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${body.accountSid}.json`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    if (!testRes.ok) {
      const data = await testRes.json().catch(() => ({}));
      return NextResponse.json({ error: data?.message || 'Could not verify Twilio credentials.' }, { status: 400 });
    }

    await clearOtherDefaults();
    const enc = encryptSecret(body.authToken);
    const whatsappFrom = body.whatsappFrom.startsWith('whatsapp:') ? body.whatsappFrom : `whatsapp:${body.whatsappFrom}`;
    await ref.set({
      ...baseFields,
      status: 'connected',
      connectionError: null,
      phoneNumber: whatsappFrom.replace('whatsapp:', ''),
      twilioAccountSid: body.accountSid,
      twilioAuthTokenCiphertext: enc.ciphertext,
      twilioAuthTokenIv: enc.iv,
      twilioAuthTokenAuthTag: enc.authTag,
      twilioWhatsAppFrom: whatsappFrom,
      lastConnectedAt: now,
    });
  } else if (provider === 'meta_cloud') {
    if (!body.phoneNumberId || !body.accessToken) {
      return NextResponse.json({ error: 'Phone Number ID and Access Token are required.' }, { status: 400 });
    }
    const testRes = await fetch(
      `https://graph.facebook.com/v21.0/${body.phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${body.accessToken}` } }
    );
    const testData = await testRes.json().catch(() => ({}));
    if (!testRes.ok) {
      return NextResponse.json({ error: testData?.error?.message || 'Could not verify Meta credentials.' }, { status: 400 });
    }

    await clearOtherDefaults();
    const enc = encryptSecret(body.accessToken);
    await ref.set({
      ...baseFields,
      status: 'connected',
      connectionError: null,
      phoneNumber: testData.display_phone_number || undefined,
      metaPhoneNumberId: body.phoneNumberId,
      metaWabaId: body.wabaId || null,
      metaAccessTokenCiphertext: enc.ciphertext,
      metaAccessTokenIv: enc.iv,
      metaAccessTokenAuthTag: enc.authTag,
      lastConnectedAt: now,
    });
  } else {
    return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 });
  }

  const callerSnap = await db.doc(`users/${uid}`).get();
  await logAudit({
    action: 'whatsapp_account.created',
    targetType: 'whatsapp_account',
    targetId: ref.id,
    targetLabel: label,
    actorId: uid,
    actorName: callerSnap.data()?.name || callerSnap.data()?.email || uid,
  });

  return NextResponse.json({ success: true, id: ref.id });
}
