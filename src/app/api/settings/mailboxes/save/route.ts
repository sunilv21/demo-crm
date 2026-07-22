import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { encryptSecret } from '@/lib/mailbox-crypto';
import { logAudit } from '@/lib/audit-log';
import type { MailboxProvider } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SaveMailboxBody {
  mailboxId?: string;
  email: string;
  displayName: string;
  provider: MailboxProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password?: string; // blank on edit = keep existing
  isDefault: boolean;
  isEnabled: boolean;
}

/**
 * POST /api/settings/mailboxes/save
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Creates or updates a mailbox connection. The password is encrypted here
 * (server-side, AES-256-GCM) before it ever touches Firestore — the client
 * never receives it back. On edit, an empty password means "keep the
 * existing one."
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const body = (await req.json().catch(() => ({}))) as Partial<SaveMailboxBody>;
  const {
    mailboxId,
    email,
    displayName,
    provider,
    imapHost,
    imapPort,
    imapSecure,
    smtpHost,
    smtpPort,
    smtpSecure,
    username,
    password,
    isDefault,
    isEnabled,
  } = body;

  if (
    !email ||
    !displayName ||
    !provider ||
    !imapHost ||
    !imapPort ||
    !smtpHost ||
    !smtpPort ||
    !username
  ) {
    return NextResponse.json({ error: 'Missing required mailbox fields.' }, { status: 400 });
  }

  const db = adminDb();
  const isEdit = !!mailboxId;
  const ref = isEdit ? db.doc(`mailboxes/${mailboxId}`) : db.collection('mailboxes').doc();

  let passwordFields: { passwordCiphertext: string; passwordIv: string; passwordAuthTag: string; passwordKeyVersion: number };
  if (password) {
    const enc = encryptSecret(password);
    passwordFields = {
      passwordCiphertext: enc.ciphertext,
      passwordIv: enc.iv,
      passwordAuthTag: enc.authTag,
      passwordKeyVersion: 1,
    };
  } else {
    if (!isEdit) {
      return NextResponse.json({ error: 'Password is required for a new mailbox.' }, { status: 400 });
    }
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: 'Mailbox not found.' }, { status: 404 });
    }
    const data = existing.data()!;
    passwordFields = {
      passwordCiphertext: data.passwordCiphertext,
      passwordIv: data.passwordIv,
      passwordAuthTag: data.passwordAuthTag,
      passwordKeyVersion: data.passwordKeyVersion ?? 1,
    };
  }

  const batch = db.batch();

  if (isDefault) {
    const others = await db.collection('mailboxes').where('isDefault', '==', true).get();
    for (const doc of others.docs) {
      if (doc.id !== ref.id) batch.update(doc.ref, { isDefault: false });
    }
  }

  const now = FieldValue.serverTimestamp();
  batch.set(
    ref,
    {
      email,
      displayName,
      provider,
      imapHost,
      imapPort,
      imapSecure: !!imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure: !!smtpSecure,
      username,
      ...passwordFields,
      isDefault: !!isDefault,
      isEnabled: isEnabled !== false,
      syncState: 'idle',
      ...(isEdit ? {} : { lastSeenUid: null, lastSeenUidValidity: null, lastSyncedAt: null }),
      updatedAt: now,
      updatedBy: uid,
      ...(isEdit ? {} : { createdAt: now, createdBy: uid }),
    },
    { merge: true }
  );

  await batch.commit();

  // Only log creation, not every edit — see src/lib/audit-log.ts for scope.
  if (!isEdit) {
    const callerSnap = await db.doc(`users/${uid}`).get();
    await logAudit({
      action: 'mailbox.created',
      targetType: 'mailbox',
      targetId: ref.id,
      targetLabel: email,
      actorId: uid,
      actorName: callerSnap.data()?.name || callerSnap.data()?.email || uid,
    });
  }

  return NextResponse.json({ success: true, id: ref.id });
}
