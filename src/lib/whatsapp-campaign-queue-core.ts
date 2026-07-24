// Server-only. Processes one batch of due WhatsApp campaign recipients —
// mirrors src/lib/campaign-queue-core.ts (email). Random delay + retry are
// achieved entirely through data (scheduledSendAt per recipient), not by
// sleeping in-process, so this works identically whether triggered by the
// on-demand "Process Now" route or the client-side auto-poll (see
// src/components/settings/whatsapp-campaigns-tab.tsx — there's no scheduled
// Cloud Function for this one, since whatsapp_web sends go through the local
// bridge process that only this machine can reach).

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { sendViaTwilio, sendViaMeta } from '@/lib/whatsapp-send';
import { bridgeSendMessage } from '@/lib/whatsapp-bridge-client';
import { renderWhatsAppTemplate } from '@/lib/whatsapp-template';
import type { WhatsAppAccount, WhatsAppCampaign, WhatsAppCampaignRecipient } from '@/lib/types';

const RETRY_BACKOFF_MINUTES = [2, 5, 10]; // indexed by (attempts - 1)
const MAX_ATTEMPTS = 3;

export interface ProcessBatchResult {
  processed: number;
  sent: number;
  failed: number;
}

export async function processWhatsAppCampaignBatch(campaignId: string, batchSize = 20): Promise<ProcessBatchResult> {
  const db = adminDb();
  const campaignRef = db.doc(`whatsapp_campaigns/${campaignId}`);
  const campaignSnap = await campaignRef.get();
  if (!campaignSnap.exists) return { processed: 0, sent: 0, failed: 0 };
  const campaign = campaignSnap.data() as WhatsAppCampaign;
  if (campaign.status !== 'running') return { processed: 0, sent: 0, failed: 0 };

  const accountSnap = await db.doc(`whatsapp_accounts/${campaign.accountId}`).get();
  if (!accountSnap.exists) return { processed: 0, sent: 0, failed: 0 };
  const account = { id: accountSnap.id, ...accountSnap.data() } as WhatsAppAccount;
  if (account.status !== 'connected') return { processed: 0, sent: 0, failed: 0 };

  const dueSnap = await db
    .collection('whatsapp_campaign_recipients')
    .where('campaignId', '==', campaignId)
    .where('scheduledSendAt', '<=', Timestamp.now())
    .orderBy('scheduledSendAt', 'asc')
    .limit(batchSize * 2)
    .get();

  const due = dueSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as WhatsAppCampaignRecipient)
    .filter((r) => r.status === 'pending' || r.status === 'retrying')
    .slice(0, batchSize);

  if (due.length === 0) return { processed: 0, sent: 0, failed: 0 };

  let sentDelta = 0;
  let failedDelta = 0;

  for (const recipient of due) {
    const recipientRef = db.doc(`whatsapp_campaign_recipients/${recipient.id}`);
    await recipientRef.update({ status: 'processing' });

    const body = renderWhatsAppTemplate(campaign.body, recipient.name);
    const campaignMeta = { campaignId, campaignRecipientId: recipient.id };

    try {
      if (account.provider === 'twilio') {
        await sendViaTwilio(account, recipient.phone, body, undefined, undefined, campaignMeta);
      } else if (account.provider === 'meta_cloud') {
        await sendViaMeta(account, recipient.phone, body, undefined, campaignMeta);
      } else {
        await bridgeSendMessage(account.id, recipient.phone, body, campaignMeta);
      }
      await recipientRef.update({
        status: 'sent',
        sentAt: FieldValue.serverTimestamp(),
        sentBody: body,
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
