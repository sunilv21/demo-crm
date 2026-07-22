'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pause, Play, XCircle, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import type { Campaign, CampaignRecipient } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, limit, doc, serverTimestamp, writeBatch, deleteDoc, getDocs } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { processCampaignNow } from '@/lib/campaign-client';
import { logAuditClient } from '@/lib/audit-log-client';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';

interface CampaignDetailDialogProps {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_VARIANT: Record<CampaignRecipient['status'], string> = {
  pending: '',
  processing: 'bg-blue-100 text-blue-800 border-blue-200',
  sent: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  retrying: 'bg-amber-100 text-amber-800 border-amber-200',
  cancelled: '',
};

export function CampaignDetailDialog({ campaign, open, onOpenChange }: CampaignDetailDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recipientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'campaign_recipients'),
      where('campaignId', '==', campaign.id),
      orderBy('scheduledSendAt', 'asc'),
      limit(200)
    );
  }, [firestore, campaign.id]);
  const { data: recipients, isLoading } = useCollection<CampaignRecipient>(recipientsQuery);

  function setStatus(status: Campaign['status']) {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, 'campaigns', campaign.id), { status, updatedAt: serverTimestamp() }, { merge: true });
  }

  function logCampaignAudit(action: 'campaign.paused' | 'campaign.cancelled' | 'campaign.deleted') {
    if (!firestore || !user) return;
    logAuditClient(firestore, {
      action,
      targetType: 'campaign',
      targetId: campaign.id,
      targetLabel: campaign.name,
      actorId: user.uid,
      actorName: user.displayName || user.email || user.uid,
      metadata: { sentCount: campaign.sentCount, failedCount: campaign.failedCount },
    });
  }

  function handlePause() {
    setStatus('paused');
    logCampaignAudit('campaign.paused');
  }

  async function handleCancel() {
    if (!firestore) return;
    setStatus('cancelled');
    logCampaignAudit('campaign.cancelled');
    const toCancel = await getCancelableRecipients();
    for (let i = 0; i < toCancel.length; i += 450) {
      const batch = writeBatch(firestore);
      for (const r of toCancel.slice(i, i + 450)) {
        batch.update(doc(firestore, 'campaign_recipients', r), { status: 'cancelled' });
      }
      await batch.commit();
    }
  }

  async function getCancelableRecipients(): Promise<string[]> {
    // Re-query fresh (not the possibly-stale 200-row display list) so
    // cancel reaches every pending/retrying recipient, not just what's shown.
    if (!firestore) return [];
    const snap = await getDocs(
      query(collection(firestore, 'campaign_recipients'), where('campaignId', '==', campaign.id), where('status', 'in', ['pending', 'retrying']))
    );
    return snap.docs.map((d) => d.id);
  }

  async function handleProcessNow() {
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await processCampaignNow(user, campaign.id);
      toast({ title: 'Batch processed', description: `Sent ${result.sent}, failed ${result.failed} of ${result.processed} due.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Processing failed', description: err?.message || 'Please try again.' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDelete() {
    if (!firestore || isDeleting) return;
    setIsDeleting(true);
    try {
      const snap = await getDocs(query(collection(firestore, 'campaign_recipients'), where('campaignId', '==', campaign.id)));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(firestore);
        for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
        await batch.commit();
      }
      await deleteDoc(doc(firestore, 'campaigns', campaign.id));
      logCampaignAudit('campaign.deleted');
      toast({ variant: 'destructive', title: 'Campaign deleted', description: `"${campaign.name}" and its recipients were removed.` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err?.message || 'Please try again.' });
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>{campaign.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge variant="secondary">{campaign.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {campaign.sentCount} sent · {campaign.failedCount} failed · {campaign.totalRecipients} total
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {campaign.status === 'running' && (
            <Button variant="outline" size="sm" onClick={handlePause}>
              <Pause className="mr-2 h-4 w-4" />Pause
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button variant="outline" size="sm" onClick={() => setStatus('running')}>
              <Play className="mr-2 h-4 w-4" />Resume
            </Button>
          )}
          {(campaign.status === 'running' || campaign.status === 'paused') && (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <XCircle className="mr-2 h-4 w-4" />Cancel
            </Button>
          )}
          {campaign.status === 'running' && (
            <Button variant="outline" size="sm" onClick={handleProcessNow} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Process Now
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-destructive ml-auto" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-2 h-4 w-4" />Delete
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
            {!isLoading && (recipients || []).map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  {r.lastError && <div className="text-xs text-destructive mt-1">{r.lastError}</div>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.attempts}</TableCell>
              </TableRow>
            ))}
            {!isLoading && (recipients || []).length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No recipients.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {(recipients || []).length === 200 && (
          <p className="text-xs text-muted-foreground mt-2">Showing first 200 recipients.</p>
        )}

        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onConfirm={handleDelete}
          confirmText={campaign.name}
          description={
            <>
              This will permanently delete the campaign{' '}
              <span className="font-semibold text-foreground">{campaign.name}</span> and all of its recipient records.
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
