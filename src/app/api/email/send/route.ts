import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/api-auth';
import { decryptSecret } from '@/lib/mailbox-crypto';
import { buildSmtpTransport } from '@/lib/mail-transport';
import type { Mailbox } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SendEmailAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

interface SendEmailBody {
  mailboxId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: SendEmailAttachment[];
  relatedClientId?: string;
  relatedBookingId?: string;
}

/**
 * POST /api/email/send
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Sends via the chosen mailbox's SMTP connection and logs the attempt to
 * email_logs regardless of outcome. Available to admin/manager/agent — the
 * roles that talk to clients day-to-day (mailbox credentials themselves stay
 * admin-only, see src/app/api/settings/mailboxes/*).
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager', 'agent']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const body = (await req.json().catch(() => ({}))) as Partial<SendEmailBody>;
  const { mailboxId, to, cc, bcc, subject, html, text, attachments, relatedClientId, relatedBookingId } = body;

  if (!mailboxId || !to?.length || !subject || (!html && !text)) {
    return NextResponse.json(
      { error: 'mailboxId, to, subject, and a body (html or text) are required.' },
      { status: 400 }
    );
  }

  const db = adminDb();
  const mailboxSnap = await db.doc(`mailboxes/${mailboxId}`).get();
  if (!mailboxSnap.exists) {
    return NextResponse.json({ error: 'Mailbox not found.' }, { status: 404 });
  }
  const mailbox = mailboxSnap.data() as Mailbox;
  if (!mailbox.isEnabled) {
    return NextResponse.json({ error: 'This mailbox is disabled.' }, { status: 400 });
  }

  const [callerSnap] = await Promise.all([db.doc(`users/${uid}`).get()]);
  const sentByName = callerSnap.data()?.name || callerSnap.data()?.email || uid;

  const bodyPreview = (text || html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

  // Same caps as inbox_messages (src/lib/inbox-sync-core.ts) for consistency.
  const BODY_TEXT_CAP = 20_000;
  const BODY_HTML_CAP = 50_000;
  const htmlCapped = html && html.length > BODY_HTML_CAP;
  const textCapped = text && text.length > BODY_TEXT_CAP;

  const logBase = {
    mailboxId,
    mailboxEmail: mailbox.email,
    to,
    cc: cc ?? null,
    bcc: bcc ?? null,
    subject,
    bodyPreview,
    bodyHtml: html ? html.slice(0, BODY_HTML_CAP) : null,
    bodyText: text ? text.slice(0, BODY_TEXT_CAP) : null,
    bodyTruncated: !!(htmlCapped || textCapped),
    sentBy: uid,
    sentByName,
    relatedClientId: relatedClientId ?? null,
    relatedBookingId: relatedBookingId ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    const password = decryptSecret({
      ciphertext: mailbox.passwordCiphertext,
      iv: mailbox.passwordIv,
      authTag: mailbox.passwordAuthTag,
    });
    const transporter = buildSmtpTransport(mailbox, password);
    const info = await transporter.sendMail({
      from: `"${mailbox.displayName}" <${mailbox.email}>`,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType,
      })),
    });

    await db.collection('email_logs').add({
      ...logBase,
      status: 'sent',
      errorMessage: null,
      messageId: info.messageId ?? null,
    });

    return NextResponse.json({ success: true, messageId: info.messageId ?? null });
  } catch (err: any) {
    const message = err?.message || 'Failed to send email.';
    await db.collection('email_logs').add({
      ...logBase,
      status: 'failed',
      errorMessage: message,
      messageId: null,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
