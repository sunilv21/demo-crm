'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';
import { EmailBodyFrame } from './email-body-frame';
import type { EmailLog, CampaignRecipient } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';

const QUERY_LIMIT = 300;

interface SentItem {
  id: string;
  source: 'transactional' | 'campaign';
  to: string;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  bodyPreview: string;
  mailboxEmail: string;
  date: any;
}

export function SentTab() {
  const firestore = useFirestore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const logsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'email_logs'),
      where('status', '==', 'sent'),
      orderBy('createdAt', 'desc'),
      limit(QUERY_LIMIT)
    );
  }, [firestore]);
  const { data: logs, isLoading: logsLoading } = useCollection<EmailLog>(logsQuery);

  const recipientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'campaign_recipients'),
      where('status', '==', 'sent'),
      orderBy('sentAt', 'desc'),
      limit(QUERY_LIMIT)
    );
  }, [firestore]);
  const { data: recipients, isLoading: recipientsLoading } = useCollection<CampaignRecipient>(recipientsQuery);

  const isLoading = logsLoading || recipientsLoading;

  const items = useMemo<SentItem[]>(() => {
    const fromLogs: SentItem[] = (logs || []).map((l) => ({
      id: `log:${l.id}`,
      source: 'transactional',
      to: l.to.join(', '),
      subject: l.subject,
      bodyHtml: l.bodyHtml ?? null,
      bodyText: l.bodyText ?? null,
      bodyPreview: l.bodyPreview,
      mailboxEmail: l.mailboxEmail,
      date: l.createdAt,
    }));
    const fromCampaigns: SentItem[] = (recipients || []).map((r) => ({
      id: `campaign:${r.id}`,
      source: 'campaign',
      to: r.email,
      subject: r.sentSubject || '(no subject)',
      bodyHtml: r.sentBodyHtml ?? null,
      bodyText: null,
      bodyPreview: r.sentBodyHtml ? r.sentBodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '',
      mailboxEmail: '',
      date: r.sentAt,
    }));
    return [...fromLogs, ...fromCampaigns].sort((a, b) => {
      const aMs = a.date?.toMillis ? a.date.toMillis() : 0;
      const bMs = b.date?.toMillis ? b.date.toMillis() : 0;
      return bMs - aMs;
    });
  }, [logs, recipients]);

  const selectedItem = items.find((i) => i.id === selectedId) || null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
      <Card className="border rounded-lg overflow-hidden">
        <ScrollArea className="h-[520px]">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 border-b space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          {!isLoading && items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Nothing sent yet.</div>
          )}
          {!isLoading &&
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  'w-full text-left p-3 border-b hover:bg-muted/50 transition-colors',
                  selectedId === item.id && 'bg-muted'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate font-medium">{item.to}</span>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {item.source === 'campaign' ? 'Campaign' : 'Direct'}
                  </Badge>
                </div>
                <div className="text-sm truncate">{item.subject}</div>
                <div className="text-xs text-muted-foreground truncate">{item.bodyPreview}</div>
              </button>
            ))}
        </ScrollArea>
      </Card>

      <Card className="border rounded-lg p-4 min-h-[520px]">
        {!selectedItem ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <div className="text-center">
              <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Select a sent email to read it.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">{selectedItem.subject}</h3>
              <p className="text-sm text-muted-foreground">
                To {selectedItem.to}
                {selectedItem.mailboxEmail && ` · From ${selectedItem.mailboxEmail}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedItem.date?.toDate ? selectedItem.date.toDate().toLocaleString() : 'Unknown date'}
              </p>
            </div>
            {selectedItem.bodyHtml ? (
              <div className="border-t pt-3">
                <EmailBodyFrame html={selectedItem.bodyHtml} />
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm border-t pt-3">
                {selectedItem.bodyText || selectedItem.bodyPreview || '(no content saved)'}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
