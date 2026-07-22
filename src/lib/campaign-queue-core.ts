// Server-only. Processes one batch of due campaign recipients. Shared by
// the on-demand "Process Now" API route and (a duplicated copy of, see
// functions/src/campaign-queue.ts) the scheduled Cloud Function — same
// split as src/lib/inbox-sync-core.ts from Phase 1.
//
// Random delay + retry are achieved entirely through data (scheduledSendAt
// per recipient), not by sleeping in-process — see the Phase 3 plan for why.

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { decryptSecret } from '@/lib/mailbox-crypto';
import { buildSmtpTransport } from '@/lib/mail-transport';
import { renderTemplate } from '@/lib/email-template';
import { COMPANY } from '@/lib/company';
import type { Campaign, CampaignRecipient, Mailbox } from '@/lib/types';

const RETRY_BACKOFF_MINUTES = [2, 5, 10]; // indexed by (attempts - 1)
const MAX_ATTEMPTS = 3;

function unsubscribeFooter(token: string): string {
  const base = process.env.APP_URL || '';
  const url = `${base}/api/email/unsubscribe?token=${token}`;
  return `<p style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:12px;color:#888">Don't want these emails? <a href="${url}">Unsubscribe</a></p>`;
}

export interface ProcessBatchResult {
  processed: number;
  sent: number;
  failed: number;
}

export async function processCampaignBatch(campaignId: string, batchSize = 20): Promise<ProcessBatchResult> {
  const db = adminDb();
  const campaignRef = db.doc(`campaigns/${campaignId}`);
  const campaignSnap = await campaignRef.get();
  if (!campaignSnap.exists) return { processed: 0, sent: 0, failed: 0 };
  const campaign = campaignSnap.data() as Campaign;
  if (campaign.status !== 'running') return { processed: 0, sent: 0, failed: 0 };

  const mailboxSnap = await db.doc(`mailboxes/${campaign.mailboxId}`).get();
  if (!mailboxSnap.exists || !(mailboxSnap.data() as Mailbox).isEnabled) {
    return { processed: 0, sent: 0, failed: 0 };
  }
  const mailbox = mailboxSnap.data() as Mailbox;

  const dueSnap = await db
    .collection('campaign_recipients')
    .where('campaignId', '==', campaignId)
    .where('scheduledSendAt', '<=', Timestamp.now())
    .orderBy('scheduledSendAt', 'asc')
    .limit(batchSize * 2)
    .get();

  const due = dueSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as CampaignRecipient)
    .filter((r) => r.status === 'pending' || r.status === 'retrying')
    .slice(0, batchSize);

  if (due.length === 0) return { processed: 0, sent: 0, failed: 0 };

  const password = decryptSecret({
    ciphertext: mailbox.passwordCiphertext,
    iv: mailbox.passwordIv,
    authTag: mailbox.passwordAuthTag,
  });
  const transporter = buildSmtpTransport(mailbox, password);

  let sentDelta = 0;
  let failedDelta = 0;

  for (const recipient of due) {
    const recipientRef = db.doc(`campaign_recipients/${recipient.id}`);
    await recipientRef.update({ status: 'processing' });

    const vars = { customer_name: recipient.name, company: COMPANY.name };
    const subject = renderTemplate(campaign.subject, vars);
    const html = renderTemplate(campaign.bodyHtml, vars) + unsubscribeFooter(recipient.unsubscribeToken);

    try {
      const info = await transporter.sendMail({
        from: `"${mailbox.displayName}" <${mailbox.email}>`,
        to: recipient.email,
        subject,
        html,
      });
      await recipientRef.update({
        status: 'sent',
        sentAt: FieldValue.serverTimestamp(),
        messageId: info.messageId ?? null,
        sentSubject: subject,
        sentBodyHtml: html,
      });
      sentDelta += 1;
    } catch (err: any) {
      const attempts = (recipient.attempts ?? 0) + 1;
      const message = err?.message || 'Send failed.';
      if (attempts < MAX_ATTEMPTS) {
        const backoffMin = RETRY_BACKOFF_MINUTES[attempts - 1] ?? 10;
        await recipientRef.update({
          status: 'retrying',
          attempts,
          lastError: message,
          scheduledSendAt: Timestamp.fromMillis(Date.now() + backoffMin * 60_000),
        });
      } else {
        await recipientRef.update({ status: 'failed', attempts, lastError: message });
        failedDelta += 1;
      }
    }
  }

  const newSent = campaign.sentCount + sentDelta;
  const newFailed = campaign.failedCount + failedDelta;
  const isDone = newSent + newFailed >= campaign.totalRecipients;
  await campaignRef.update({
    sentCount: newSent,
    failedCount: newFailed,
    ...(isDone ? { status: 'completed' } : {}),
  });

  return { processed: due.length, sent: sentDelta, failed: failedDelta };
}
