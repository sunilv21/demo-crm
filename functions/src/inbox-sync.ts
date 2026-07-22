// Scheduled IMAP poller — mirrors reconcileAttendance's onSchedule shape in
// index.ts. Polls every enabled mailbox's INBOX for new messages and mirrors
// metadata into Firestore inbox_messages.
//
// This duplicates the sync logic in src/lib/inbox-sync-core.ts (used by the
// on-demand "Refresh" API route in the Next.js app) — Cloud Functions and
// the Next.js app are separate deployable units with no shared code today.
// Keep the two in sync if either changes.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptSecret, MAILBOX_ENCRYPTION_KEY } from './mailbox-crypto';

const FIRST_SYNC_MESSAGE_LIMIT = 50;
const MAX_MESSAGES_PER_RUN = 200;
const BODY_TEXT_CAP = 20_000;
const BODY_HTML_CAP = 50_000;
const SNIPPET_CAP = 200;
const CONCURRENCY = 3;

function makeSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > SNIPPET_CAP ? collapsed.slice(0, SNIPPET_CAP) + '…' : collapsed;
}

function cap(text: string, max: number): { value: string; truncated: boolean } {
  if (text.length <= max) return { value: text, truncated: false };
  return { value: text.slice(0, max), truncated: true };
}

interface MailboxDoc {
  email: string;
  isEnabled: boolean;
  syncState: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  passwordCiphertext: string;
  passwordIv: string;
  passwordAuthTag: string;
  lastSeenUid: number | null;
  lastSeenUidValidity: number | null;
}

async function syncOneMailbox(mailboxId: string): Promise<void> {
  const db = getFirestore();
  const mailboxRef = db.doc(`mailboxes/${mailboxId}`);
  const snap = await mailboxRef.get();
  if (!snap.exists) return;
  const mailbox = snap.data() as MailboxDoc;
  if (!mailbox.isEnabled || mailbox.syncState === 'syncing') return;

  await mailboxRef.update({ syncState: 'syncing' });

  let client: ImapFlow | undefined;
  try {
    const password = decryptSecret({
      ciphertext: mailbox.passwordCiphertext,
      iv: mailbox.passwordIv,
      authTag: mailbox.passwordAuthTag,
    });
    client = new ImapFlow({
      host: mailbox.imapHost,
      port: mailbox.imapPort,
      secure: mailbox.imapSecure,
      auth: { user: mailbox.username, pass: password },
      logger: false,
    });
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    let maxUid = mailbox.lastSeenUid ?? 0;
    let newCount = 0;
    try {
      const mailboxInfo = client.mailbox;
      if (!mailboxInfo || typeof mailboxInfo === 'boolean') {
        throw new Error('Could not open INBOX.');
      }
      const uidValidity = Number(mailboxInfo.uidValidity);
      const exists = mailboxInfo.exists;
      const uidValidityChanged =
        mailbox.lastSeenUidValidity != null && mailbox.lastSeenUidValidity !== uidValidity;
      const isFirstSync = mailbox.lastSeenUid == null || uidValidityChanged;

      let range = '';
      if (isFirstSync) {
        if (exists > 0) {
          const startSeq = Math.max(1, exists - FIRST_SYNC_MESSAGE_LIMIT + 1);
          range = `${startSeq}:*`;
        }
      } else {
        range = `${mailbox.lastSeenUid! + 1}:*`;
      }

      if (range && exists > 0) {
        let fetched = 0;
        for await (const msg of client.fetch(
          range,
          { uid: true, envelope: true, source: true, flags: true },
          { uid: !isFirstSync }
        )) {
          if (fetched >= MAX_MESSAGES_PER_RUN) break;
          if (!isFirstSync && msg.uid <= (mailbox.lastSeenUid ?? 0)) continue;

          const parsed = msg.source ? await simpleParser(msg.source) : null;
          const bodyTextRaw = parsed?.text ?? '';
          const bodyHtmlRaw = typeof parsed?.html === 'string' ? parsed.html : null;
          const bodyText = cap(bodyTextRaw, BODY_TEXT_CAP);
          const bodyHtml = bodyHtmlRaw ? cap(bodyHtmlRaw, BODY_HTML_CAP) : null;

          const attachmentsMeta = (parsed?.attachments ?? []).map((a) => ({
            filename: a.filename ?? 'attachment',
            size: a.size ?? 0,
            contentType: a.contentType ?? 'application/octet-stream',
          }));

          const fromAddr = parsed?.from?.value?.[0];
          const toAddrs = parsed?.to
            ? ('value' in parsed.to ? parsed.to.value : []).map((t) => ({
                name: t.name ?? '',
                address: t.address ?? '',
              }))
            : [];

          const docId = `${mailboxId}_${uidValidity}_${msg.uid}`;
          await db.doc(`inbox_messages/${docId}`).set(
            {
              mailboxId,
              mailboxEmail: mailbox.email,
              folder: 'INBOX',
              uid: msg.uid,
              uidValidity,
              messageIdHeader: parsed?.messageId ?? '',
              from: { name: fromAddr?.name ?? '', address: fromAddr?.address ?? '' },
              to: toAddrs,
              subject: parsed?.subject ?? '(no subject)',
              snippet: makeSnippet(bodyTextRaw || bodyHtmlRaw || ''),
              bodyText: bodyText.value,
              bodyHtml: bodyHtml?.value ?? null,
              bodyTruncated: bodyText.truncated || (bodyHtml?.truncated ?? false),
              hasAttachments: attachmentsMeta.length > 0,
              attachmentsMeta,
              date: parsed?.date ? Timestamp.fromDate(parsed.date) : FieldValue.serverTimestamp(),
              isRead: msg.flags?.has('\\Seen') ?? false,
              syncedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          if (msg.uid > maxUid) maxUid = msg.uid;
          newCount += 1;
          fetched += 1;
        }
      }

      await mailboxRef.update({
        syncState: 'idle',
        syncError: null,
        lastSyncedAt: FieldValue.serverTimestamp(),
        lastSeenUid: maxUid,
        lastSeenUidValidity: uidValidity,
      });
      logger.info('syncInboxes: mailbox synced', { mailboxId, newCount });
    } finally {
      lock.release();
    }
  } catch (err: any) {
    const message = err?.message || 'IMAP sync failed.';
    await mailboxRef.update({ syncState: 'error', syncError: message });
    logger.error('syncInboxes: mailbox sync failed', { mailboxId, error: message });
  } finally {
    try {
      await client?.logout();
    } catch {
      // already closed
    }
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export const syncInboxes = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
    secrets: [MAILBOX_ENCRYPTION_KEY],
  },
  async () => {
    const db = getFirestore();
    const enabledSnap = await db.collection('mailboxes').where('isEnabled', '==', true).get();
    if (enabledSnap.empty) {
      logger.info('syncInboxes: no enabled mailboxes');
      return;
    }
    const mailboxIds = enabledSnap.docs.map((d) => d.id);
    await runWithConcurrency(mailboxIds, CONCURRENCY, syncOneMailbox);
    logger.info(`syncInboxes: ran for ${mailboxIds.length} mailbox(es)`);
  }
);
