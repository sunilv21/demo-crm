import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { encryptSecret } from '@/lib/mailbox-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOC_ID = 'meta_cloud';

/**
 * POST /api/whatsapp/meta-settings
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Saves the global Meta Cloud API App Secret (encrypted) and webhook verify
 * token. One Meta App backs every connected WABA/number, so this is a
 * single settings doc, not per-account. Blank appSecret = keep existing.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const body = (await req.json().catch(() => ({}))) as { appSecret?: string; verifyToken?: string };
  const ref = adminDb().doc(`whatsapp_settings/${DOC_ID}`);

  let appSecretFields: { appSecretCiphertext: string; appSecretIv: string; appSecretAuthTag: string } | {} = {};
  if (body.appSecret) {
    const enc = encryptSecret(body.appSecret);
    appSecretFields = {
      appSecretCiphertext: enc.ciphertext,
      appSecretIv: enc.iv,
      appSecretAuthTag: enc.authTag,
    };
  }

  const verifyToken = body.verifyToken?.trim() || crypto.randomBytes(24).toString('hex');

  await ref.set(
    {
      ...appSecretFields,
      verifyToken,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true }
  );

  return NextResponse.json({ success: true, verifyToken });
}
