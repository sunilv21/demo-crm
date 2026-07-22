import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/settings/mailboxes/[id]
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Deletes the mailbox connection. Does NOT cascade-delete prior email_logs
 * or inbox_messages rows — those stay as history, just orphaned from a live
 * mailbox.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const { id } = await params;
  const db = adminDb();
  const snap = await db.doc(`mailboxes/${id}`).get();
  const email = snap.data()?.email || id;
  await snap.ref.delete();

  const callerSnap = await db.doc(`users/${uid}`).get();
  await logAudit({
    action: 'mailbox.deleted',
    targetType: 'mailbox',
    targetId: id,
    targetLabel: email,
    actorId: uid,
    actorName: callerSnap.data()?.name || callerSnap.data()?.email || uid,
  });

  return NextResponse.json({ success: true });
}
