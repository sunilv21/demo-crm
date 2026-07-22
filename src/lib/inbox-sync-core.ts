// Server-only. Polls one mailbox's INBOX over IMAP and mirrors new message
// metadata into Firestore `inbox_messages`. Used by the on-demand "Refresh"
// API route (src/app/api/settings/mailboxes/[id]/sync/route.ts).
//
// NOTE: Cloud Functions (functions/src/inbox-sync.ts, the scheduled poller)
// is a separate deployable unit with its own node_modules and cannot import
// from src/. It carries its own copy of this same logic — keep the two in
// sync if either changes.

import { simpleParser } from 'mailparser';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { decryptSecret } from '@/lib/mailbox-crypto';
import { buildImapClient } from '@/lib/mail-transport';
import type { Mailbox } from '@/lib/types';

const FIRST_SYNC_MESSAGE_LIMIT = 50;
const MAX_MESSAGES_PER_RUN = 200;
const BODY_TEXT_CAP = 20_000;
const BODY_HTML_CAP = 50_000;
const SNIPPET_CAP = 200;

function makeSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > SNIPPET_CAP ? collapsed.slice(0, SNIPPET_CAP) + '…' : collapsed;
}

function cap(text: string, max: number): { value: string; truncated: boolean } {
  if (text.length <= max) return { value: text, truncated: false };
  return { value: text.slice(0, max), truncated: true };
}

export interface SyncResult {
  ok: boolean;
  newCount: number;
  error?: string;
}

/**
 * Syncs one mailbox's INBOX. Safe to call repeatedly — upserts by a
 * deterministic doc id, so re-fetching an already-synced UID is a no-op.
 */
export async function syncOneMailbox(mailboxId: string): Promise<SyncResult> {
  const db = adminDb();
  const mailboxRef = db.doc(`mailboxes/${mailboxId}`);
  const snap = await mailboxRef.get();
  if (!snap.exists) return { ok: false, newCount: 0, error: 'Mailbox not found.' };

  const mailbox = { id: snap.id, ...snap.data() } as Mailbox;
  if (!mailbox.isEnabled) return { ok: false, newCount: 0, error: 'Mailbox is disabled.' };
  if (mailbox.syncState === 'syncing') return { ok: false, newCount: 0, error: 'Sync already in progress.' };

  await mailboxRef.update({ syncState: 'syncing' });

  let client: import('imapflow').ImapFlow | undefined;
  try {
    const password = decryptSecret({
      ciphertext: mailbox.passwordCiphertext,
      iv: mailbox.passwordIv,
      authTag: mailbox.passwordAuthTag,
    });
    client = buildImapClient(mailbox, password);
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    let newCount = 0;
    let maxUid = mailbox.lastSeenUid ?? 0;
    try {
      const mailboxInfo = client.mailbox;
      if (!mailboxInfo || typeof mailboxInfo === 'boolean') {
        throw new Error('Could not open INBOX.');
      }
      const uidValidity = Number(mailboxInfo.uidValidity);
      const exists = mailboxInfo.exists;

      // UIDVALIDITY changed since last sync (mailbox was rebuilt server-side)
      // — the old lastSeenUid no longer means anything, restart from scratch.
      const uidValidityChanged =
        mailbox.lastSeenUidValidity != null && mailbox.lastSeenUidValidity !== uidValidity;
      const isFirstSync = mailbox.lastSeenUid == null || uidValidityChanged;

      let range: string;
      if (isFirstSync) {
        if (exists === 0) {
          range = '';
        } else {
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
          // On a first sync we fetched by sequence number, so we may see UIDs
          // we've already imported in a prior partial run — skip, not an error.
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
      return { ok: true, newCount };
    } finally {
      lock.release();
    }
  } catch (err: any) {
    const message = err?.message || 'IMAP sync failed.';
    await mailboxRef.update({ syncState: 'error', syncError: message });
    return { ok: false, newCount: 0, error: message };
  } finally {
    try {
      await client?.logout();
    } catch {
      // connection may already be closed — nothing to do
    }
  }
}
