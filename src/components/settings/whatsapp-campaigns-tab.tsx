'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Megaphone, PlusCircle } from 'lucide-react';
import type { WhatsAppCampaign } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { NewWhatsAppCampaignDialog } from '@/components/whatsapp-campaigns/new-whatsapp-campaign-dialog';
import { WhatsAppCampaignDetailDialog } from '@/components/whatsapp-campaigns/whatsapp-campaign-detail-dialog';
import { processWhatsAppCampaignNow } from '@/lib/whatsapp-campaign-client';

const STATUS_VARIANT: Record<WhatsAppCampaign['status'], string> = {
  paused: '',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const AUTO_POLL_INTERVAL_MS = 20_000;

// Mirrors src/components/settings/campaigns-tab.tsx (email), plus an
// auto-poll: whatsapp_web sends go through the local bridge process, which
// only this machine can reach, so unlike email there's no scheduled Cloud
// Function backing sends up — this tab has to nudge the queue itself while
// it's open. Silent on failure (no toast) — same "background sync doesn't
// spam toasts" convention as the Inbox tab's auto-refresh.
export function WhatsAppCampaignsTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<WhatsAppCampaign | null>(null);

  const campaignsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'whatsapp_campaigns'), orderBy('createdAt', 'desc'));
  }, [firestore]);
  const { data: campaigns, isLoading } = useCollection<WhatsAppCampaign>(campaignsQuery);

  const list = campaigns || [];
  const runningIds = list.filter((c) => c.status === 'running').map((c) => c.id);
  const runningKey = runningIds.join(',');

  useEffect(() => {
    if (!user || runningIds.length === 0) return;
    function processAll() {
      for (const id of runningIds) {
        processWhatsAppCampaignNow(user!, id).catch(() => {});
      }
    }
    // Fire immediately (e.g. right after starting/resuming a campaign, or
    // reopening this tab with one already running) rather than waiting out
    // the first interval tick — setInterval alone only fires after the
    // delay, never on register.
    processAll();
    const interval = setInterval(processAll, AUTO_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // runningIds is derived fresh each render; runningKey is its stable
    // dependency so this doesn't restart the interval every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, runningKey]);

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => setIsNewOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      <NewWhatsAppCampaignDialog open={isNewOpen} onOpenChange={setIsNewOpen} />
      {selectedCampaign && (
        <WhatsAppCampaignDetailDialog
          campaign={selectedCampaign}
          open={!!selectedCampaign}
          onOpenChange={(open) => !open && setSelectedCampaign(null)}
        />
      )}

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              list.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedCampaign(c)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                        <Megaphone className="h-4 w-4 text-muted-foreground" />
                      </div>
                      {c.name}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className={STATUS_VARIANT[c.status]}>{c.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.sentCount} sent · {c.failedCount} failed / {c.totalRecipients} total
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : ''}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!isLoading && list.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            <p>No campaigns yet. Create one to send a bulk WhatsApp message to clients or leads.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
