// Owns one whatsapp-web.js Client per connected account and keeps its state
// mirrored onto whatsapp_accounts/{accountId} + whatsapp_messages, matching
// the shape src/lib/whatsapp-send.ts already writes for the Twilio/Meta
// providers so the CRM's chat UI doesn't need to care which provider a
// message came from.

import { FieldValue } from 'firebase-admin/firestore';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import { adminDb } from './firebase-admin';

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

class ClientManager {
  private clients = new Map<string, Client>();

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
    });

    client.on('auth_failure', async (message) => {
      await accountRef.set({ status: 'error', connectionError: message || 'Authentication failed.' }, { merge: true });
      this.clients.delete(accountId);
    });

    client.on('disconnected', async () => {
      await accountRef.set({ status: 'disconnected', qr: null }, { merge: true });
      await client.destroy().catch(() => {});
      this.clients.delete(accountId);
    });

    client.on('message', async (msg) => {
      if (msg.fromMe) return; // outbound messages are recorded by sendMessage() below
      // WhatsApp's own status updates/broadcast traffic and group chats show
      // up on this same event but aren't a 1:1 conversation with a contact —
      // the UI has no concept of either, so they'd otherwise render as a
      // "chat" with a meaningless id and no real content.
      if (msg.from === 'status@broadcast' || msg.from.endsWith('@g.us') || msg.isStatus) return;

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
          to: msg.to,
          body: msg.body,
          contactName,
          contactPhone,
          isRead: false,
          timestamp: FieldValue.serverTimestamp(),
          syncedAt: FieldValue.serverTimestamp(),
        });
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

  async disconnect(accountId: string): Promise<void> {
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

    // `to` is either an existing chat's JID (replying — the CRM passes back
    // whatever chatId a prior message was stored under, @c.us or @lid) or a
    // bare phone number (starting a brand new chat). Only the latter needs
    // resolving to a JID at all — re-deriving a phone number from an
    // existing LID JID and looking THAT up as a number fails ("No LID for
    // user"), which is what broke replies before this.
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

    // Whichever JID we now have, prefer the contact's real phone-based one
    // if WhatsApp has it mapped — more reliable to send to than a "@lid" id,
    // and self-heals old chats that were stored under "@lid" before this.
    const { contactName, contactPhone, canonicalJid } = await resolveContactInfo(client, candidateJid);
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
        contactName,
        contactPhone,
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
}

export const clientManager = new ClientManager();
