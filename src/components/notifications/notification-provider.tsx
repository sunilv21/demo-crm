'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useAppUser } from '@/firebase/auth/use-app-user';
import { useToast } from '@/hooks/use-toast';
import { playCampaignCompleteChime, playMailboxAlertChime, playNewMailChime, playNewWhatsAppChime } from '@/lib/notification-sound';
import type { Campaign, InboxMessage, Mailbox, WhatsAppMessage } from '@/lib/types';

export interface NotificationContextValue {
  unseenInbox: boolean;
  unseenCampaigns: boolean;
  unseenMailboxAlerts: boolean;
  unseenWhatsApp: boolean;
  markInboxSeen: () => void;
  markCampaignsSeen: () => void;
  markMailboxAlertsSeen: () => void;
  markWhatsAppSeen: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (ctx === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider.');
  }
  return ctx;
}

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const firestore = useFirestore();
  const { role, isLoading: isRoleLoading } = useAppUser();
  const { toast } = useToast();

  const [unseenInbox, setUnseenInbox] = useState(false);
  const [unseenCampaigns, setUnseenCampaigns] = useState(false);
  const [unseenMailboxAlerts, setUnseenMailboxAlerts] = useState(false);
  const [unseenWhatsApp, setUnseenWhatsApp] = useState(false);

  // Roles without inbox_messages/campaigns read access (see canUseEmail() in
  // firestore.rules) must never attach these listeners — they'd just spin on
  // permission-denied errors.
  const canUseEmail = !isRoleLoading && (role === 'admin' || role === 'manager' || role === 'agent');

  useEffect(() => {
    if (!firestore || !canUseEmail) return;

    const messagesQuery = query(
      collection(firestore, 'inbox_messages'),
      orderBy('date', 'desc'),
      limit(50)
    );

    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }

      const added = snapshot
        .docChanges()
        .filter((change) => change.type === 'added')
        .map((change) => change.doc.data() as InboxMessage);

      if (added.length === 0) return;

      playNewMailChime();
      setUnseenInbox(true);

      if (added.length === 1) {
        const message = added[0];
        toast({
          title: 'New email',
          description: `From ${message.from?.name || message.from?.address}: ${message.subject}`,
        });
      } else {
        toast({
          title: 'New email',
          description: `${added.length} new messages arrived.`,
        });
      }
    });

    return () => unsubscribe();
  }, [firestore, canUseEmail, toast]);

  useEffect(() => {
    if (!firestore || !canUseEmail) return;

    const whatsAppQuery = query(
      collection(firestore, 'whatsapp_messages'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(whatsAppQuery, (snapshot) => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }

      const added = snapshot
        .docChanges()
        .filter((change) => change.type === 'added')
        .map((change) => change.doc.data() as WhatsAppMessage)
        .filter((message) => message.direction === 'inbound');

      if (added.length === 0) return;

      playNewWhatsAppChime();
      setUnseenWhatsApp(true);

      if (added.length === 1) {
        const message = added[0];
        toast({
          title: 'New WhatsApp message',
          description: `${message.contactName || message.contactPhone || 'Unknown'}: ${message.body}`,
        });
      } else {
        toast({
          title: 'New WhatsApp messages',
          description: `${added.length} new messages arrived.`,
        });
      }
    });

    return () => unsubscribe();
  }, [firestore, canUseEmail, toast]);

  const campaignStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!firestore || !canUseEmail) return;

    const campaignsQuery = query(
      collection(firestore, 'campaigns'),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );

    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(campaignsQuery, (snapshot) => {
      const statusMap = campaignStatusRef.current;

      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        for (const doc of snapshot.docs) {
          statusMap.set(doc.id, (doc.data() as Campaign).status);
        }
        return;
      }

      for (const doc of snapshot.docs) {
        const campaign = doc.data() as Campaign;
        const previousStatus = statusMap.get(doc.id);
        if (campaign.status === 'completed' && previousStatus !== 'completed') {
          playCampaignCompleteChime();
          setUnseenCampaigns(true);
          toast({
            title: 'Campaign completed',
            description: `"${campaign.name}" finished sending (${campaign.sentCount} sent, ${campaign.failedCount} failed).`,
          });
        }
        statusMap.set(doc.id, campaign.status);
      }
    });

    return () => unsubscribe();
  }, [firestore, canUseEmail, toast]);

  const mailboxSyncStateRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!firestore || !canUseEmail) return;

    // No `where`/`limit` — the mailboxes collection is a handful of docs at
    // most, unlike inbox_messages/campaigns above.
    const mailboxesQuery = collection(firestore, 'mailboxes');

    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(mailboxesQuery, (snapshot) => {
      const stateMap = mailboxSyncStateRef.current;

      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        for (const doc of snapshot.docs) {
          stateMap.set(doc.id, (doc.data() as Mailbox).syncState);
        }
        return;
      }

      for (const doc of snapshot.docs) {
        const mailbox = doc.data() as Mailbox;
        const previousState = stateMap.get(doc.id);
        // Only fire on the transition INTO error — not on every poll cycle
        // while it's still broken.
        if (mailbox.syncState === 'error' && previousState !== 'error') {
          playMailboxAlertChime();
          setUnseenMailboxAlerts(true);
          toast({
            variant: 'destructive',
            title: `${mailbox.email} disconnected`,
            description: mailbox.syncError || 'Mailbox sync is failing — check its connection in Accounts.',
          });
        }
        stateMap.set(doc.id, mailbox.syncState);
      }
    });

    return () => unsubscribe();
  }, [firestore, canUseEmail, toast]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      unseenInbox,
      unseenCampaigns,
      unseenMailboxAlerts,
      unseenWhatsApp,
      markInboxSeen: () => setUnseenInbox(false),
      markCampaignsSeen: () => setUnseenCampaigns(false),
      markMailboxAlertsSeen: () => setUnseenMailboxAlerts(false),
      markWhatsAppSeen: () => setUnseenWhatsApp(false),
    }),
    [unseenInbox, unseenCampaigns, unseenMailboxAlerts, unseenWhatsApp]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
