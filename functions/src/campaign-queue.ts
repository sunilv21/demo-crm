// Scheduled bulk-campaign queue processor — mirrors reconcileAttendance's
// onSchedule shape in index.ts. Runs every minute, processes whichever
// campaign_recipients are due (scheduledSendAt <= now) for each currently
// 'running' campaign.
//
// This duplicates the logic in src/lib/campaign-queue-core.ts (used by the
// on-demand "Process Now" API route in the Next.js app) — Cloud Functions
// and the Next.js app are separate deployable units with no shared code
// today, same reality as inbox-sync.ts. Keep the two in sync if either
// changes. APP_URL and the COMPANY_NAME constant below must also match
// src/lib/company.ts and the root .env — both build the identical
// unsubscribe link/footer regardless of which path processes a batch.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { decryptSecret, MAILBOX_ENCRYPTION_KEY } from './mailbox-crypto';

const RETRY_BACKOFF_MINUTES = [2, 5, 10];
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;
// Keep in sync with src/lib/company.ts's COMPANY.name.
const COMPANY_NAME = 'Sky Tours & Visa Consultant.';

interface MailboxDoc {
  displayName: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  isEnabled: boolean;
  passwordCiphertext: string;
  passwordIv: string;
  passwordAuthTag: string;
}

interface CampaignDoc {
  status: string;
  mailboxId: string;
  subject: string;
  bodyHtml: string;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
}

interface RecipientDoc {
  status: string;
  attempts?: number;
  name: string;
  email: string;
  unsubscribeToken: string;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? '');
}

function unsubscribeFooter(token: string): string {
  const base = process.env.APP_URL || '';
  const url = `${base}/api/email/unsubscribe?token=${token}`;
  return `<p style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:12px;color:#888">Don't want these emails? <a href="${url}">Unsubscribe</a></p>`;
}

async function processOneCampaign(campaignId: string, campaign: CampaignDoc): Promise<void> {
  const db = getFirestore();
  const campaignRef = db.doc(`campaigns/${campaignId}`);

  const mailboxSnap = await db.doc(`mailboxes/${campaign.mailboxId}`).get();
  if (!mailboxSnap.exists) return;
  const mailbox = mailboxSnap.data() as MailboxDoc;
  if (!mailbox.isEnabled) return;

  const dueSnap = await db
    .collection('campaign_recipients')
    .where('campaignId', '==', campaignId)
    .where('scheduledSendAt', '<=', Timestamp.now())
    .orderBy('scheduledSendAt', 'asc')
    .limit(BATCH_SIZE * 2)
    .get();

  const due = dueSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as RecipientDoc) }))
    .filter((r) => r.status === 'pending' || r.status === 'retrying')
    .slice(0, BATCH_SIZE);

  if (due.length === 0) return;

  const password = decryptSecret({
    ciphertext: mailbox.passwordCiphertext,
    iv: mailbox.passwordIv,
    authTag: mailbox.passwordAuthTag,
  });
  const transporter = nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpSecure,
    auth: { user: mailbox.username, pass: password },
  });

  let sentDelta = 0;
  let failedDelta = 0;

  for (const recipient of due) {
    const recipientRef = db.doc(`campaign_recipients/${recipient.id}`);
    await recipientRef.update({ status: 'processing' });

    const vars = { customer_name: recipient.name, company: COMPANY_NAME };
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

  logger.info('processCampaigns: batch processed', { campaignId, sent: sentDelta, failed: failedDelta });
}

export const processCampaigns = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
    secrets: [MAILBOX_ENCRYPTION_KEY],
  },
  async () => {
    const db = getFirestore();
    const runningSnap = await db.collection('campaigns').where('status', '==', 'running').get();
    if (runningSnap.empty) return;

    for (const doc of runningSnap.docs) {
      try {
        await processOneCampaign(doc.id, doc.data() as CampaignDoc);
      } catch (err: any) {
        logger.error('processCampaigns: campaign failed', { campaignId: doc.id, error: err?.message });
      }
    }
  }
);
