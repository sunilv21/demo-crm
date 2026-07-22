import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/settings/mailboxes/[id]/toggle
 * Body: { isEnabled: boolean }
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Enables/disables a mailbox without requiring the password to be re-entered
 * (separate from the save route, which is the only place passwords change).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const isEnabled = !!body?.isEnabled;

  const db = adminDb();
  const ref = db.doc(`mailboxes/${id}`);
  await ref.update({
    isEnabled,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  });

  const [snap, callerSnap] = await Promise.all([ref.get(), db.doc(`users/${uid}`).get()]);
  await logAudit({
    action: isEnabled ? 'mailbox.enabled' : 'mailbox.disabled',
    targetType: 'mailbox',
    targetId: id,
    targetLabel: snap.data()?.email || id,
    actorId: uid,
    actorName: callerSnap.data()?.name || callerSnap.data()?.email || uid,
  });

  return NextResponse.json({ success: true });
}
