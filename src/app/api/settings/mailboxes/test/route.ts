import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { decryptSecret } from '@/lib/mailbox-crypto';
import { buildImapClient, buildSmtpTransport } from '@/lib/mail-transport';
import type { Mailbox } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TestMailboxBody {
  mailboxId?: string; // test a saved mailbox (decrypts its stored password)
  // Or test in-flight, not-yet-saved form values:
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  username?: string;
  password?: string;
}

interface ProtocolResult {
  ok: boolean;
  error?: string;
}

const IMAP_TIMEOUT_MS = 10_000;

async function testImap(creds: {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
}, password: string): Promise<ProtocolResult> {
  const client = buildImapClient(creds as any, password);
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP connection timed out.')), IMAP_TIMEOUT_MS)),
    ]);
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'IMAP connection failed.' };
  } finally {
    try {
      await client.logout();
    } catch {
      // already closed
    }
  }
}

async function testSmtp(creds: {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
}, password: string): Promise<ProtocolResult> {
  try {
    const transporter = buildSmtpTransport(creds as any, password);
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'SMTP connection failed.' };
  }
}

/**
 * POST /api/settings/mailboxes/test
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Tests IMAP and SMTP independently, either against a saved mailbox
 * (mailboxId — decrypts the stored password) or against in-flight form
 * values (used before the mailbox has been saved).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => ({}))) as TestMailboxBody;

  let creds: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    username: string;
  };
  let password: string;
  let mailboxRef: FirebaseFirestore.DocumentReference | null = null;

  if (body.mailboxId) {
    mailboxRef = adminDb().doc(`mailboxes/${body.mailboxId}`);
    const snap = await mailboxRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Mailbox not found.' }, { status: 404 });
    }
    const mailbox = snap.data() as Mailbox;
    creds = mailbox;
    password = decryptSecret({
      ciphertext: mailbox.passwordCiphertext,
      iv: mailbox.passwordIv,
      authTag: mailbox.passwordAuthTag,
    });
  } else {
    if (
      !body.imapHost ||
      !body.imapPort ||
      !body.smtpHost ||
      !body.smtpPort ||
      !body.username ||
      !body.password
    ) {
      return NextResponse.json({ error: 'Missing connection details to test.' }, { status: 400 });
    }
    creds = {
      imapHost: body.imapHost,
      imapPort: body.imapPort,
      imapSecure: !!body.imapSecure,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpSecure: !!body.smtpSecure,
      username: body.username,
    };
    password = body.password;
  }

  const [imap, smtp] = await Promise.all([testImap(creds, password), testSmtp(creds, password)]);

  if (mailboxRef) {
    const bothOk = imap.ok && smtp.ok;
    await mailboxRef.update({
      lastTestedAt: FieldValue.serverTimestamp(),
      lastTestStatus: bothOk ? 'success' : 'failed',
      lastTestError: bothOk ? null : [imap.error, smtp.error].filter(Boolean).join(' / '),
    });
  }

  return NextResponse.json({ imap, smtp });
}
