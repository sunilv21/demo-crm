import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit-log';
import { bridgeDisconnectAccount } from '@/lib/whatsapp-bridge-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/whatsapp/accounts/[id]
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Logs the whatsapp-web.js session out on the bridge (so WhatsApp sees the
 * device as unlinked, not just abandoned) and deletes the account + its
 * stored auth state. Does NOT cascade-delete prior whatsapp_messages — kept
 * as history.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const { id } = await params;
  const db = adminDb();
  const snap = await db.doc(`whatsapp_accounts/${id}`).get();
  const label = snap.data()?.label || id;

  await bridgeDisconnectAccount(id).catch(() => {
    // Bridge may already be down/unreachable — still proceed with local cleanup.
  });

  const authStateKeys = await db.collection(`whatsapp_auth_state/${id}/keys`).listDocuments();
  const batch = db.batch();
  authStateKeys.forEach((docRef) => batch.delete(docRef));
  batch.delete(db.doc(`whatsapp_auth_state/${id}`));
  batch.delete(snap.ref);
  await batch.commit();

  const callerSnap = await db.doc(`users/${uid}`).get();
  await logAudit({
    action: 'whatsapp_account.deleted',
    targetType: 'whatsapp_account',
    targetId: id,
    targetLabel: label,
    actorId: uid,
    actorName: callerSnap.data()?.name || callerSnap.data()?.email || uid,
  });

  return NextResponse.json({ success: true });
}
