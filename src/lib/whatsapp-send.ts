// Server-only. Sends outbound WhatsApp messages via the two official REST
// APIs (Twilio, Meta Cloud API) and writes the resulting outbound message
// doc itself — for the whatsapp_web provider this is the bridge's job, but
// these two providers have no persistent process, so the API route that
// calls these functions *is* the bridge equivalent.

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { decryptSecret } from '@/lib/mailbox-crypto';
import type { WhatsAppAccount } from '@/lib/types';

// Chat grouping key for these two providers — bare E.164 digits, no prefix.
// (whatsapp_web keeps its own "<digits>@c.us" JID format elsewhere; the chat
// UI treats chatId as an opaque string either way.)
export function normalizeDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

// A document to attach to an outbound message — url must be a publicly
// fetchable link (Twilio/Meta's servers download it directly), which is
// exactly what the signed voucher-file route (src/lib/voucher-link.ts +
// src/app/api/vouchers/[bookingId]/file) exists to provide.
export type OutboundMedia = { url: string; filename: string };

// Set when this send came from a running WhatsApp campaign — tags the
// created message doc so the campaign detail view can join its live
// delivery status (sent/delivered/read, kept current by the same webhook
// pipelines as 1:1 chat) back onto the specific recipient it went to.
export type CampaignMeta = { campaignId: string; campaignRecipientId: string };

async function recordOutboundMessage(params: {
  accountId: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  providerMessageId?: string;
  media?: OutboundMedia;
  campaignMeta?: CampaignMeta;
}): Promise<void> {
  await adminDb()
    .collection('whatsapp_messages')
    .add({
      accountId: params.accountId,
      chatId: params.chatId,
      direction: 'outbound',
      from: params.from,
      to: params.to,
      body: params.body,
      status: 'sent',
      providerMessageId: params.providerMessageId ?? null,
      campaignId: params.campaignMeta?.campaignId ?? null,
      campaignRecipientId: params.campaignMeta?.campaignRecipientId ?? null,
      isRead: true,
      timestamp: FieldValue.serverTimestamp(),
      syncedAt: FieldValue.serverTimestamp(),
      ...(params.media ? { mediaUrl: params.media.url, mediaFilename: params.media.filename } : {}),
    });
}

export async function sendViaTwilio(
  account: WhatsAppAccount,
  to: string,
  body: string,
  // Twilio calls this URL with delivery/read status updates for this
  // specific message. Passed in by the API route (which can see the
  // request's own host) rather than baked in here, so it always points at
  // whichever tunnel/domain is currently live.
  statusCallbackUrl?: string,
  // Document attachment (e.g. a booking voucher) — Twilio downloads it from
  // this URL itself and re-hosts it on WhatsApp's media servers, so `url`
  // must be publicly fetchable. `body` doubles as the media caption.
  media?: OutboundMedia,
  campaignMeta?: CampaignMeta
): Promise<void> {
  if (!account.twilioAccountSid || !account.twilioAuthTokenCiphertext || !account.twilioWhatsAppFrom) {
    throw new Error('This Twilio WhatsApp account is missing its credentials.');
  }
  const authToken = decryptSecret({
    ciphertext: account.twilioAuthTokenCiphertext,
    iv: account.twilioAuthTokenIv!,
    authTag: account.twilioAuthTokenAuthTag!,
  });

  const digits = normalizeDigits(to);
  const basicAuth = Buffer.from(`${account.twilioAccountSid}:${authToken}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${account.twilioAccountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: `whatsapp:+${digits}`,
        From: account.twilioWhatsAppFrom,
        ...(body ? { Body: body } : {}),
        ...(media ? { MediaUrl: media.url } : {}),
        ...(statusCallbackUrl ? { StatusCallback: statusCallbackUrl } : {}),
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Twilio send failed (${res.status}).`);
  }

  await recordOutboundMessage({
    accountId: account.id,
    chatId: digits,
    from: account.twilioWhatsAppFrom.replace('whatsapp:', ''),
    to: digits,
    body,
    providerMessageId: data.sid,
    media,
    campaignMeta,
  });
}

export async function sendViaMeta(
  account: WhatsAppAccount,
  to: string,
  body: string,
  // Document attachment — Meta fetches it from `url` (same requirement as
  // Twilio's MediaUrl above), and `body` (if given) becomes the caption.
  media?: OutboundMedia,
  campaignMeta?: CampaignMeta
): Promise<void> {
  if (!account.metaPhoneNumberId || !account.metaAccessTokenCiphertext) {
    throw new Error('This Meta WhatsApp account is missing its credentials.');
  }
  const accessToken = decryptSecret({
    ciphertext: account.metaAccessTokenCiphertext,
    iv: account.metaAccessTokenIv!,
    authTag: account.metaAccessTokenAuthTag!,
  });

  const digits = normalizeDigits(to);
  const res = await fetch(`https://graph.facebook.com/v21.0/${account.metaPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      media
        ? {
            messaging_product: 'whatsapp',
            to: digits,
            type: 'document',
            document: { link: media.url, filename: media.filename, ...(body ? { caption: body } : {}) },
          }
        : {
            messaging_product: 'whatsapp',
            to: digits,
            type: 'text',
            text: { body },
          }
    ),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Meta send failed (${res.status}).`);
  }

  await recordOutboundMessage({
    accountId: account.id,
    chatId: digits,
    from: account.phoneNumber || account.metaPhoneNumberId,
    to: digits,
    body,
    // Meta returns { messages: [{ id: "wamid...." }] } on success.
    providerMessageId: data.messages?.[0]?.id,
    media,
    campaignMeta,
  });
}
