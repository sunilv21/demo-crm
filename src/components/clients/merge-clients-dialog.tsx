'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, GitMerge, Loader2 } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type CompareClient = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string | null;
  createdAt: string | null;
  assignedEmployees: string[];
  organizationId: string | null;
  counts: Record<string, number>;
};

type DryRunResult = {
  dryRun: true;
  blocked: boolean;
  blockingReasons: string[];
  survivor: { id: string; name: string };
  duplicate: { id: string; name: string };
  counts: Record<string, number>;
  fieldMerges: {
    assignedEmployeesAdded: string[];
    requiredDocumentsCollisions: string[];
    requiredDocumentsAdded: string[];
    activePackageResolution: 'none' | 'keptSurvivor' | 'copiedFromDuplicate' | 'conflict';
    companionsAdded: number;
    visaHistoryAdded: number;
    previousTripsAdded: number;
    tripDestinationsAdded: number;
  };
};

interface MergeClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: { id: string; name: string }[];
  onMerged: () => void;
}

const COUNT_LABELS: Record<string, string> = {
  bookings: 'Bookings',
  customer_logs: 'Activity logs',
  follow_ups: 'Follow-ups',
  finance_transactions: 'Finance transactions',
  leads: 'Converted leads',
  campaign_recipients: 'Campaign entries',
  email_logs: 'Email logs',
  itineraries: 'Saved itineraries',
};

function totalCount(counts: Record<string, number>) {
  return Object.values(counts).reduce((s, n) => s + n, 0);
}

export function MergeClientsDialog({ open, onOpenChange, candidates, onMerged }: MergeClientsDialogProps) {
  const { user } = useUser();
  const { toast } = useToast();

  const [compareData, setCompareData] = useState<CompareClient[] | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [pendingDuplicateIds, setPendingDuplicateIds] = useState<string[]>([]);
  const [currentDuplicateId, setCurrentDuplicateId] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [loadingDryRun, setLoadingDryRun] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const reset = () => {
    setCompareData(null);
    setSurvivorId(null);
    setPendingDuplicateIds([]);
    setCurrentDuplicateId(null);
    setDryRunResult(null);
    setConfirmText('');
  };

  const candidateIdsKey = candidates.map((c) => c.id).join(',');

  useEffect(() => {
    if (!open || !user) {
      reset();
      return;
    }
    let cancelled = false;
    setLoadingCompare(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/clients/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ compareIds: candidates.map((c) => c.id) }),
        });
        const result = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setCompareData(result.clients || []);
          if (result.clients?.length) {
            const best = [...result.clients].sort(
              (a: CompareClient, b: CompareClient) => totalCount(b.counts) - totalCount(a.counts)
            )[0];
            setSurvivorId(best.id);
          }
        } else {
          toast({ variant: 'destructive', title: 'Could not load comparison', description: result.error });
        }
      } catch (err: any) {
        if (!cancelled) toast({ variant: 'destructive', title: 'Could not load comparison', description: err?.message });
      } finally {
        if (!cancelled) setLoadingCompare(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, candidateIdsKey]);

  const startDryRun = async (survivor: string, duplicate: string) => {
    if (!user || !duplicate) return;
    setCurrentDuplicateId(duplicate);
    setDryRunResult(null);
    setConfirmText('');
    setLoadingDryRun(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/clients/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ survivorId: survivor, duplicateId: duplicate, dryRun: true }),
      });
      const result = await res.json();
      if (res.ok) {
        setDryRunResult(result);
      } else {
        toast({ variant: 'destructive', title: 'Could not preview merge', description: result.error });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not preview merge', description: err?.message });
    } finally {
      setLoadingDryRun(false);
    }
  };

  const proceedToPreview = () => {
    if (!survivorId || !compareData) return;
    const others = compareData.filter((c) => c.id !== survivorId).map((c) => c.id);
    setPendingDuplicateIds(others);
    startDryRun(survivorId, others[0]);
  };

  const duplicateName = dryRunResult?.duplicate.name || '';
  const confirmMatches =
    confirmText.trim().length > 0 && confirmText.trim().toLowerCase() === duplicateName.trim().toLowerCase();

  const executeMerge = async () => {
    if (!user || !survivorId || !currentDuplicateId || !confirmMatches || isMerging) return;
    setIsMerging(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/clients/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ survivorId, duplicateId: currentDuplicateId }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Merge failed', description: result.error });
        return;
      }
      toast({
        title: result.partialSuccess ? 'Merge mostly complete' : 'Clients merged',
        description: result.partialSuccess ? result.message : `"${duplicateName}" was merged into the kept client.`,
      });
      const remaining = pendingDuplicateIds.filter((id) => id !== currentDuplicateId);
      setPendingDuplicateIds(remaining);
      onMerged();
      if (remaining.length > 0) {
        startDryRun(survivorId, remaining[0]);
      } else {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Merge failed', description: err?.message });
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isMerging) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge duplicate clients
          </DialogTitle>
          <DialogDescription>
            Pick which record to keep. Everything else — bookings, logs, follow-ups, and more — moves onto it, and
            the other record is permanently deleted.
          </DialogDescription>
        </DialogHeader>

        {loadingCompare && <div className="py-8 text-center text-sm text-muted-foreground">Loading client details…</div>}

        {!loadingCompare && compareData && !dryRunResult && !loadingDryRun && (
          <div className="space-y-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${compareData.length}, minmax(0, 1fr))` }}>
              {compareData.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSurvivorId(c.id)}
                  className={`text-left rounded-lg border p-3 space-y-1.5 transition-colors ${
                    survivorId === c.id ? 'border-primary ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.name}</span>
                    {survivorId === c.id && <Badge>Keep</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">{c.phone}</div>
                  {c.email && <div className="text-sm text-muted-foreground truncate">{c.email}</div>}
                  <div className="text-xs text-muted-foreground">
                    {c.createdAt ? `Added ${format(new Date(c.createdAt), 'dd MMM yyyy')}` : ''}
                  </div>
                  <div className="pt-1 text-xs space-y-0.5">
                    {Object.entries(c.counts)
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => (
                        <div key={k}>
                          {COUNT_LABELS[k] || k}: <span className="font-medium">{n}</span>
                        </div>
                      ))}
                    {totalCount(c.counts) === 0 && <div className="text-muted-foreground italic">No related records</div>}
                  </div>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={proceedToPreview} disabled={!survivorId}>Continue</Button>
            </DialogFooter>
          </div>
        )}

        {loadingDryRun && <div className="py-8 text-center text-sm text-muted-foreground">Checking what will move…</div>}

        {dryRunResult && !loadingDryRun && (
          <div className="space-y-4">
            {dryRunResult.blocked ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Can&apos;t merge yet</AlertTitle>
                <AlertDescription>{dryRunResult.blockingReasons.join(' ')}</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="text-sm">
                  Merging <span className="font-semibold">{dryRunResult.duplicate.name}</span> into{' '}
                  <span className="font-semibold">{dryRunResult.survivor.name}</span> will move:
                </div>
                <ul className="text-sm space-y-1 rounded-md border p-3">
                  {Object.entries(dryRunResult.counts)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => (
                      <li key={k}>{n} {COUNT_LABELS[k] || k}</li>
                    ))}
                  {totalCount(dryRunResult.counts) === 0 && (
                    <li className="text-muted-foreground italic">No related records to move</li>
                  )}
                </ul>
                {(dryRunResult.fieldMerges.requiredDocumentsCollisions.length > 0 ||
                  dryRunResult.fieldMerges.activePackageResolution === 'copiedFromDuplicate') && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    {dryRunResult.fieldMerges.requiredDocumentsCollisions.length > 0 && (
                      <p>
                        Document(s) with the same name on both records will keep the kept client&apos;s version:{' '}
                        {dryRunResult.fieldMerges.requiredDocumentsCollisions.join(', ')}.
                      </p>
                    )}
                    {dryRunResult.fieldMerges.activePackageResolution === 'copiedFromDuplicate' && (
                      <p>The kept client will inherit the other record&apos;s active package.</p>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="merge-confirm-input" className="text-sm text-muted-foreground">
                    Type <span className="font-semibold text-foreground">{duplicateName}</span> to confirm permanently
                    deleting that record
                  </Label>
                  <Input
                    id="merge-confirm-input"
                    autoComplete="off"
                    value={confirmText}
                    placeholder={duplicateName}
                    onChange={(e) => setConfirmText(e.target.value)}
                  />
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>Cancel</Button>
              {!dryRunResult.blocked && (
                <Button variant="destructive" onClick={executeMerge} disabled={!confirmMatches || isMerging}>
                  {isMerging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Merge
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
