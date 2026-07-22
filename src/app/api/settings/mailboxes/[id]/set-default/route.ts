import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/settings/mailboxes/[id]/set-default
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Sets this mailbox as the default (used to pre-select the Inbox tab and as
 * the default "from" account) and clears isDefault on every other mailbox.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const { id } = await params;
  const db = adminDb();
  const ref = db.doc(`mailboxes/${id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Mailbox not found.' }, { status: 404 });
  }

  const others = await db.collection('mailboxes').where('isDefault', '==', true).get();
  const batch = db.batch();
  for (const doc of others.docs) {
    if (doc.id !== id) batch.update(doc.ref, { isDefault: false });
  }
  batch.update(ref, { isDefault: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
  await batch.commit();

  return NextResponse.json({ success: true });
}
