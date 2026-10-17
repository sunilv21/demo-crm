// Owns one whatsapp-web.js Client per connected account and keeps its state
// mirrored onto whatsapp_accounts/{accountId} + whatsapp_messages, matching
// the shape src/lib/whatsapp-send.ts already writes for the Twilio/Meta
// providers so the CRM's chat UI doesn't need to care which provider a
// message came from.

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import { adminDb } from './firebase-admin';

const GROUP_POLL_INTERVAL_MS = 10_000;
// How many of a group's most recent messages to look at each poll — cheap
// (already-synced in-memory data, no network call), generous enough that a
// short bridge outage or a burst of messages doesn't outrun it.
const GROUP_POLL_RECENT_COUNT = 10;

function normalizeDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

// chatId (the JID) isn't a readable phone number for LID-based contacts, so
// the chat UI needs a real name/number to display instead of a raw id.
// Contact.number is NOT reliable for this — for LID-primary contacts it
// holds the LID digits, not a real phone. The trustworthy source is
// Contact.id itself: when WhatsApp has this contact linked to a real number
// (e.g. they're saved in the connected phone's contacts), Contact.id is the
// phone-based "<digits>@c.us" JID even though we looked the contact up by
// its "@lid" id — that's also the more reliable address to actually send
// to, so callers should prefer canonicalJid over whatever jid they started
// with once a real one is known.
async function resolveContactInfo(
  client: Client,
  jid: string
): Promise<{ contactName: string | null; contactPhone: string | null; canonicalJid: string }> {
  try {
    const contact = await client.getContactById(jid);
    const contactName = contact?.name || contact?.pushname || contact?.shortName || null;
    const hasPhoneId = contact?.id?.server === 'c.us' && !!contact.id.user;
    const canonicalJid = hasPhoneId ? contact!.id._serialized : jid;
    const contactPhone = hasPhoneId ? normalizeDigits(contact!.id.user) : null;
    return { contactName, contactPhone, canonicalJid };
  } catch {
    return { contactName: null, contactPhone: null, canonicalJid: jid };
  }
}

// whatsapp-web.js's own getChatById()/getChats() build a full Chat model
// that, for a group, calls into a group-metadata refresh + participant
// LID-migration step (window.WWebJS.getChatModel → toPn(...) internally) —
// that step throws for at least some groups on this WhatsApp Web version,
// which took down the *entire* chat lookup (not just the name) since
// whatsapp-web.js has no partial-failure path there. Reading the title
// directly out of WhatsApp's in-memory chat collection sidesteps that
// broken step entirely — same data, none of the group-metadata refresh.
async function getGroupName(client: Client, jid: string): Promise<string | null> {
  try {
    if (!client.pupPage) return null;
    return await client.pupPage.evaluate((chatId: string) => {
      const chat = (window as any).require('WAWebCollections').Chat.get(chatId);
      return chat ? chat.formattedTitle || chat.name || null : null;
    }, jid);
  } catch {
    return null;
  }
}

// Shared by sendMessage/sendMediaMessage — resolves whatever `to` a caller
// hands in (a group JID, an existing chat's JID, or a bare phone number for
// a brand-new chat) into the actual JID to send to, plus a display name. A
// group JID is a Chat, not a Contact — resolveContactInfo()'s
// getContactById() call isn't meaningful for one, so groups short-circuit
// before ever reaching it.
async function resolveSendTarget(
  client: Client,
  to: string
): Promise<{ canonicalJid: string; contactName: string | null; contactPhone: string | null; isGroup: boolean }> {
  if (to.endsWith('@g.us')) {
    const contactName = await getGroupName(client, to);
    return { canonicalJid: to, contactName, contactPhone: null, isGroup: true };
  }

  // `to` is either an existing chat's JID (replying — the CRM passes back
  // whatever chatId a prior message was stored under, @c.us or @lid) or a
  // bare phone number (starting a brand new chat). Only the latter needs
  // resolving to a JID at all — re-deriving a phone number from an existing
  // LID JID and looking THAT up as a number fails ("No LID for user"), which
  // is what broke replies before this.
  let candidateJid: string;
  if (to.includes('@')) {
    candidateJid = to;
  } else {
    const numberId = await client.getNumberId(normalizeDigits(to));
    if (!numberId) {
      throw new Error('This phone number is not on WhatsApp.');
    }
    candidateJid = numberId._serialized;
  }

  // Whichever JID we now have, prefer the contact's real phone-based one if
  // WhatsApp has it mapped — more reliable to send to than a "@lid" id, and
  // self-heals old chats that were stored under "@lid" before this.
  const { contactName, contactPhone, canonicalJid } = await resolveContactInfo(client, candidateJid);
  return { canonicalJid, contactName, contactPhone, isGroup: false };
}

// Shared by the real-time 'message' event and the group poll fallback below
// — writes one inbound group message doc. `timestampMs`, when given (the
// poll path has WhatsApp's own send time available), is used instead of
// "now" so a message caught late by the poll still sorts into its correct
// place in the thread.
async function recordInboundGroupMessage(
  client: Client,
  accountId: string,
  params: { from: string; to: string | null; author: string | null; body: string; timestampMs?: number }
): Promise<void> {
  const groupName = await getGroupName(client, params.from);
  const sender = params.author ? await resolveContactInfo(client, params.author) : null;
  const timestamp = params.timestampMs ? Timestamp.fromMillis(params.timestampMs) : FieldValue.serverTimestamp();

  await adminDb()
    .collection('whatsapp_messages')
    .add({
      accountId,
      chatId: params.from,
      direction: 'inbound',
      from: params.from,
      to: params.to,
      body: params.body,
      isGroup: true,
      groupName,
      senderJid: params.author,
      senderName: sender?.contactName ?? null,
      senderPhone: sender?.contactPhone ?? null,
      isRead: false,
      timestamp,
      syncedAt: FieldValue.serverTimestamp(),
    });
}

class ClientManager {
  private clients = new Map<string, Client>();
  // WhatsApp message ids already written to Firestore, per account — shared
  // between the real-time listener and the poll fallback so a message
  // caught by one is never duplicated by the other. In-memory only (reset
  // on bridge restart): a handful of possible re-checks around a restart
  // boundary is a fine trade for not persisting/growing this forever.
  private seenGroupMessageIds = new Map<string, Set<string>>();
  private groupPollTimers = new Map<string, ReturnType<typeof setInterval>>();

  async connect(accountId: string): Promise<void> {
    if (this.clients.has(accountId)) return;

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: accountId }),
      puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });
    this.clients.set(accountId, client);

    const accountRef = adminDb().doc(`whatsapp_accounts/${accountId}`);

    client.on('qr', async (qr) => {
      const dataUrl = await qrcode.toDataURL(qr);
      await accountRef.set({ status: 'pending_qr', qr: dataUrl, connectionError: null }, { merge: true });
    });

    client.on('ready', async () => {
      await accountRef.set(
        {
          status: 'connected',
          qr: null,
          connectionError: null,
          phoneNumber: client.info?.wid?.user ?? null,
          lastConnectedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      this.startGroupPoll(accountId, client);
    });

    client.on('auth_failure', async (message) => {
      await accountRef.set({ status: 'error', connectionError: message || 'Authentication failed.' }, { merge: true });
      this.stopGroupPoll(accountId);
      this.clients.delete(accountId);
    });

    client.on('disconnected', async () => {
      await accountRef.set({ status: 'disconnected', qr: null }, { merge: true });
      this.stopGroupPoll(accountId);
      await client.destroy().catch(() => {});
      this.clients.delete(accountId);
    });

    client.on('message', async (msg) => {
      try {
        if (msg.fromMe) return; // outbound messages are recorded by sendMessage()/sendMediaMessage() below
        // WhatsApp's own status updates/broadcast traffic show up on this same
        // event but aren't a 1:1 conversation with a contact — the UI has no
        // concept of either, so it'd otherwise render as a "chat" with a
        // meaningless id and no real content.
        if (msg.from === 'status@broadcast' || msg.isStatus) return;

        // Non-text messages (images, stickers, system messages like "X added
        // Y") can have an undefined body — Firestore's Admin SDK throws on an
        // undefined field value, which would otherwise silently drop the
        // whole write.
        const body = msg.body ?? '';

        if (msg.from.endsWith('@g.us')) {
          // Group message: "from" is the group itself, not the person — the
          // actual sender is msg.author. Both the group's name and the
          // sender's contact info are best-effort (fall back to raw ids if
          // lookup fails) so a lookup hiccup never drops the message.
          const msgId = msg.id?._serialized;
          const seen = this.seenGroupMessageIds.get(accountId) ?? new Set<string>();
          this.seenGroupMessageIds.set(accountId, seen);
          if (msgId) seen.add(msgId);
          await recordInboundGroupMessage(client, accountId, {
            from: msg.from,
            to: msg.to ?? null,
            author: msg.author ?? null,
            body,
          });
          return;
        }

        // Prefer the contact's real phone-based JID over whatever this
        // particular message arrived under (WhatsApp can deliver the same
        // contact's messages under "@lid" one time and "@c.us" another) — this
        // is what keeps a conversation in one thread and gives a real reply
        // address instead of a LID-only one.
        const { contactName, contactPhone, canonicalJid } = await resolveContactInfo(client, msg.from);
        await adminDb()
          .collection('whatsapp_messages')
          .add({
            accountId,
            chatId: canonicalJid,
            direction: 'inbound',
            from: canonicalJid,
            to: msg.to ?? null,
            body,
            contactName,
            contactPhone,
            isRead: false,
            timestamp: FieldValue.serverTimestamp(),
            syncedAt: FieldValue.serverTimestamp(),
          });
      } catch (err) {
        // Never let one bad message silently vanish — log it so a future
        // "message didn't show up" report is diagnosable from the bridge's
        // own output instead of needing another debugging round-trip.
        console.error('[message handler] failed to record inbound message:', err, 'from:', msg.from);
      }
    });

    // Delivery/read receipts for messages we sent — without this, every
    // outbound message stays showing a single "sent" check forever even once
    // it's actually delivered/read, which reads as "did this even arrive?".
    client.on('message_ack', async (msg, ack) => {
      if (!msg.fromMe) return;
      const status = ack >= 3 ? 'read' : ack >= 2 ? 'delivered' : ack >= 1 ? 'sent' : null;
      if (!status) return;
      const id = msg.id?._serialized ?? null;
      const col = adminDb().collection('whatsapp_messages');

      let doc = null;
      if (id) {
        const snap = await col.where('accountId', '==', accountId).where('providerMessageId', '==', id).limit(1).get();
        doc = snap.docs[0] ?? null;
      }
      if (!doc) {
        // Neither id nor chatId is reliably shaped on this event (WhatsApp's
        // LID duality shows up here too — msg.to can be a "@lid" form even
        // though we sent to the resolved "@c.us" one, and msg.id often isn't
        // populated at all) — correlate by content on the still-unmatched
        // doc instead. Scoped to this account/direction/body; good enough
        // for a single-operator tool that isn't sending duplicate bodies to
        // different chats within the same second.
        const snap = await col
          .where('accountId', '==', accountId)
          .where('direction', '==', 'outbound')
          .where('body', '==', msg.body)
          .where('providerMessageId', '==', null)
          .get();
        doc = snap.docs.sort((a, b) => (b.data().timestamp?.toMillis?.() ?? 0) - (a.data().timestamp?.toMillis?.() ?? 0))[0] ?? null;
      }
      if (doc) {
        await doc.ref.set({ status, ...(id ? { providerMessageId: id } : {}) }, { merge: true });
      }
    });

    await client.initialize();
  }

  // Fallback for group messages the real-time 'message' event misses —
  // confirmed to happen: WhatsApp Web's own local store had a message that
  // never reached our event listener (its internal isNewMsg flag can mark a
  // message as a resync/backfill rather than a live push, which
  // whatsapp-web.js's page-side hook silently skips notifying about). Since
  // that hook lives deep in whatsapp-web.js's injected bundle, working
  // around it there isn't practical — polling each group's own message list
  // (already-synced in-memory data, no extra network calls) and comparing
  // against what we've already recorded catches anything the event missed.
  private startGroupPoll(accountId: string, client: Client): void {
    this.stopGroupPoll(accountId);
    const timer = setInterval(() => {
      this.pollGroupMessages(accountId, client).catch((err) => {
        console.error('[group poll] failed:', err);
      });
    }, GROUP_POLL_INTERVAL_MS);
    this.groupPollTimers.set(accountId, timer);
  }

  private stopGroupPoll(accountId: string): void {
    const timer = this.groupPollTimers.get(accountId);
    if (timer) {
      clearInterval(timer);
      this.groupPollTimers.delete(accountId);
    }
  }

  private async pollGroupMessages(accountId: string, client: Client): Promise<void> {
    if (!client.pupPage) return;
    const seen = this.seenGroupMessageIds.get(accountId) ?? new Set<string>();
    this.seenGroupMessageIds.set(accountId, seen);

    const recent: Array<{ id: string; from: string; to: string | null; author: string | null; body: string; fromMe: boolean; t: number }> =
      await client.pupPage.evaluate((recentCount: number) => {
        const collections = (window as any).require('WAWebCollections');
        const groups = collections.Chat.getModelsArray().filter((c: any) => c.id?._serialized?.endsWith('@g.us'));
        const out: any[] = [];
        for (const chat of groups) {
          const msgs = chat.msgs?.getModelsArray?.() ?? [];
          for (const m of msgs.slice(-recentCount)) {
            out.push({
              id: m.id?._serialized,
              from: chat.id._serialized,
              to: typeof m.to === 'object' && m.to !== null ? m.to._serialized : (m.to ?? null),
              author: typeof m.author === 'object' && m.author !== null ? m.author._serialized : (m.author ?? null),
              body: m.body ?? '',
              fromMe: !!m.id?.fromMe,
              t: m.t,
            });
          }
        }
        return out;
      }, GROUP_POLL_RECENT_COUNT);

    // First poll after a fresh connect: seed "seen" from whatever's already
    // there instead of processing a group's entire recent history as new —
    // only messages that arrive from here on should surface.
    const isFirstPoll = seen.size === 0;

    for (const m of recent) {
      if (!m.id || m.fromMe || seen.has(m.id)) continue;
      seen.add(m.id);
      if (isFirstPoll) continue;
      try {
        await recordInboundGroupMessage(client, accountId, {
          from: m.from,
          to: m.to,
          author: m.author,
          body: m.body,
          timestampMs: m.t ? m.t * 1000 : undefined,
        });
      } catch (err) {
        console.error('[group poll] failed to record message:', err, 'from:', m.from);
      }
    }
  }

  async disconnect(accountId: string): Promise<void> {
    this.stopGroupPoll(accountId);
    const client = this.clients.get(accountId);
    if (!client) return;
    await client.logout().catch(() => {});
    await client.destroy().catch(() => {});
    this.clients.delete(accountId);
  }

  async sendMessage(
    accountId: string,
    to: string,
    body: string,
    campaignMeta?: { campaignId: string; campaignRecipientId: string }
  ): Promise<{ chatId: string }> {
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error('This WhatsApp account is not connected on the bridge.');
    }

    const { canonicalJid, contactName, contactPhone, isGroup } = await resolveSendTarget(client, to);
    const sent = await client.sendMessage(canonicalJid, body);
    const chatId = sent?.to ?? canonicalJid;

    await adminDb()
      .collection('whatsapp_messages')
      .add({
        accountId,
        chatId,
        direction: 'outbound',
        from: client.info?.wid?.user ?? null,
        to: chatId,
        body,
        ...(isGroup ? { isGroup: true, groupName: contactName } : { contactName, contactPhone }),
        status: 'sent',
        providerMessageId: sent?.id?._serialized ?? null,
        campaignId: campaignMeta?.campaignId ?? null,
        campaignRecipientId: campaignMeta?.campaignRecipientId ?? null,
        isRead: true,
        timestamp: FieldValue.serverTimestamp(),
        syncedAt: FieldValue.serverTimestamp(),
      });

    return { chatId };
  }

  async sendMediaMessage(
    accountId: string,
    to: string,
    media: { base64: string; mimetype: string; filename: string; caption?: string; mediaUrl?: string },
    campaignMeta?: { campaignId: string; campaignRecipientId: string }
  ): Promise<{ chatId: string }> {
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error('This WhatsApp account is not connected on the bridge.');
    }

    const { canonicalJid, contactName, contactPhone, isGroup } = await resolveSendTarget(client, to);
    const messageMedia = new MessageMedia(media.mimetype, media.base64, media.filename);
    const sent = await client.sendMessage(canonicalJid, messageMedia, {
      caption: media.caption,
      sendMediaAsDocument: true,
    });
    const chatId = sent?.to ?? canonicalJid;

    await adminDb()
      .collection('whatsapp_messages')
      .add({
        accountId,
        chatId,
        direction: 'outbound',
        from: client.info?.wid?.user ?? null,
        to: chatId,
        body: media.caption || '',
        ...(isGroup ? { isGroup: true, groupName: contactName } : { contactName, contactPhone }),
        status: 'sent',
        providerMessageId: sent?.id?._serialized ?? null,
        campaignId: campaignMeta?.campaignId ?? null,
        campaignRecipientId: campaignMeta?.campaignRecipientId ?? null,
        // mediaUrl is never fetched by the bridge itself (the file went out
        // as inline bytes above) — it's passed through only so the CRM's own
        // chat history has something to link/download, same attachment chip
        // Twilio/Meta sends already populate.
        ...(media.mediaUrl ? { mediaUrl: media.mediaUrl } : {}),
        mediaFilename: media.filename,
        isRead: true,
        timestamp: FieldValue.serverTimestamp(),
        syncedAt: FieldValue.serverTimestamp(),
      });

    return { chatId };
  }
}

export const clientManager = new ClientManager();
