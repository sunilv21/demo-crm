'use client';

import { useState } from 'react';
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
import type { Campaign } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { NewCampaignDialog } from '@/components/campaigns/new-campaign-dialog';
import { CampaignDetailDialog } from '@/components/campaigns/campaign-detail-dialog';

const STATUS_VARIANT: Record<Campaign['status'], string> = {
  paused: '',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

export function CampaignsTab() {
  const firestore = useFirestore();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const campaignsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'campaigns'), orderBy('createdAt', 'desc'));
  }, [firestore]);
  const { data: campaigns, isLoading } = useCollection<Campaign>(campaignsQuery);

  const list = campaigns || [];

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => setIsNewOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      <NewCampaignDialog open={isNewOpen} onOpenChange={setIsNewOpen} />
      {selectedCampaign && (
        <CampaignDetailDialog
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
            <p>No campaigns yet. Create one to send a bulk email to clients or leads.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
