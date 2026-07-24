'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Mail, Paperclip, CircleAlert, Loader2 } from 'lucide-react';
import { EmailBodyFrame } from './email-body-frame';
import type { Mailbox, InboxMessage } from '@/lib/types';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  useUser,
  setDocumentNonBlocking,
} from '@/firebase';
import { collection, query, orderBy, where, doc, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { syncMailboxNow } from '@/lib/mailbox-client';
import { cn } from '@/lib/utils';

export function InboxTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const mailboxesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'mailboxes'), where('isEnabled', '==', true));
  }, [firestore]);
  const { data: mailboxes, isLoading: mailboxesLoading } = useCollection<Mailbox>(mailboxesQuery);

  useEffect(() => {
    if (!selectedMailboxId && mailboxes && mailboxes.length > 0) {
      const def = mailboxes.find((m) => m.isDefault) ?? mailboxes[0];
      setSelectedMailboxId(def.id);
    }
  }, [mailboxes, selectedMailboxId]);

  const selectedMailbox = useMemo(
    () => (mailboxes || []).find((m) => m.id === selectedMailboxId) || null,
    [mailboxes, selectedMailboxId]
  );

  const messagesQuery = useMemoFirebase(() => {
    if (!firestore || !selectedMailboxId) return null;
    return query(
      collection(firestore, 'inbox_messages'),
      where('mailboxId', '==', selectedMailboxId),
      orderBy('date', 'desc'),
      limit(300)
    );
  }, [firestore, selectedMailboxId]);
  const { data: messages, isLoading: messagesLoading } = useCollection<InboxMessage>(messagesQuery);

  const selectedMessage = useMemo(
    () => (messages || []).find((m) => m.id === selectedMessageId) || null,
    [messages, selectedMessageId]
  );

  async function runSync(opts: { silent?: boolean } = {}) {
    if (!user || !selectedMailboxId) return;
    if (!opts.silent) setIsSyncing(true);
    try {
      const result = await syncMailboxNow(user, selectedMailboxId);
      if (!opts.silent) {
        toast({ title: 'Inbox refreshed', description: `${result.newCount} new message(s).` });
      }
    } catch (err: any) {
      if (opts.silent) {
        // Auto-refresh runs unattended every minute — log instead of toasting
        // so a broken mailbox connection doesn't spam a toast every 60s.
        console.error('Auto inbox sync failed', err);
      } else {
        toast({ variant: 'destructive', title: 'Refresh failed', description: err?.message });
      }
    } finally {
      if (!opts.silent) setIsSyncing(false);
    }
  }

  function handleRefresh() {
    return runSync();
  }

  // Auto-refresh the selected mailbox every 1 minute while this tab is open,
  // in addition to the manual Refresh button.
  useEffect(() => {
    if (!user || !selectedMailboxId) return;
    const intervalId = setInterval(() => {
      runSync({ silent: true });
    }, 60_000);
    return () => clearInterval(intervalId);
  }, [user, selectedMailboxId]);

  function openMessage(message: InboxMessage) {
    setSelectedMessageId(message.id);
    if (!message.isRead && firestore) {
      setDocumentNonBlocking(doc(firestore, 'inbox_messages', message.id), { isRead: true }, { merge: true });
    }
  }

  if (!mailboxesLoading && (!mailboxes || mailboxes.length === 0)) {
    return (
      <div className="text-center p-12 text-muted-foreground">
        <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No enabled mailboxes yet. Connect one under Email Accounts to see its inbox here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={selectedMailboxId} onValueChange={setSelectedMailboxId}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Select a mailbox" />
            </SelectTrigger>
            <SelectContent>
              {(mailboxes || []).map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMailbox?.syncState === 'syncing' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0" title="Sync in progress">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Syncing
            </span>
          )}
          {selectedMailbox?.syncState === 'error' && (
            <span
              className="flex items-center gap-1 text-xs text-destructive shrink-0"
              title={selectedMailbox.syncError || 'Sync failed'}
            >
              <CircleAlert className="h-3.5 w-3.5" />
              Sync error
            </span>
          )}
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isSyncing || !selectedMailboxId}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isSyncing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <Card className="border rounded-lg overflow-hidden">
          <ScrollArea className="h-[520px]">
            {messagesLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 border-b space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              ))}
            {!messagesLoading && (messages || []).length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No messages synced yet.</div>
            )}
            {!messagesLoading &&
              (messages || []).map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMessage(m)}
                  className={cn(
                    'w-full text-left p-3 border-b hover:bg-muted/50 transition-colors',
                    selectedMessageId === m.id && 'bg-muted',
                    !m.isRead && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm truncate', !m.isRead && 'font-semibold')}>
                      {m.from.name || m.from.address}
                    </span>
                    {m.hasAttachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </div>
                  <div className={cn('text-sm truncate', !m.isRead && 'font-medium')}>{m.subject}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.snippet}</div>
                </button>
              ))}
          </ScrollArea>
        </Card>

        <Card className="border rounded-lg p-4 min-h-[520px]">
          {!selectedMessage ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Select a message to read it.
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold">{selectedMessage.subject}</h3>
                <p className="text-sm text-muted-foreground">
                  From {selectedMessage.from.name || selectedMessage.from.address} &lt;{selectedMessage.from.address}&gt;
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedMessage.date?.toDate ? selectedMessage.date.toDate().toLocaleString() : 'Unknown date'}
                </p>
              </div>
              {selectedMessage.bodyHtml ? (
                <div className="border-t pt-3">
                  <EmailBodyFrame html={selectedMessage.bodyHtml} />
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm border-t pt-3">
                  {selectedMessage.bodyText || '(no plain-text body)'}
                </div>
              )}
              {selectedMessage.bodyTruncated && (
                <p className="text-xs text-muted-foreground italic">Message truncated for storage.</p>
              )}
              {selectedMessage.hasAttachments && (selectedMessage.attachmentsMeta?.length ?? 0) > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Attachments</p>
                  <ul className="text-sm space-y-1">
                    {selectedMessage.attachmentsMeta!.map((a, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-muted-foreground">
                        <Paperclip className="h-3.5 w-3.5" />
                        {a.filename} ({Math.round(a.size / 1024)} KB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
