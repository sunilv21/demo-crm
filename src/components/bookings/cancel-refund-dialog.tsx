'use client';

import { useEffect, useState } from 'react';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { Booking, PaymentMode } from '@/lib/types';
import { bookingPaid, formatINR, PAYMENT_MODE_LABELS } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { XCircle, RotateCcw, CheckCircle2 } from 'lucide-react';

const MODES: PaymentMode[] = ['cash', 'upi', 'card', 'bank', 'cheque', 'other'];
const todayISO = () => new Date().toISOString().slice(0, 10);

export function CancelRefundDialog({
  booking,
  onOpenChange,
}: {
  booking: Booking | null;
  onOpenChange: (open: boolean) => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const isCancelled = booking?.status === 'cancelled';
  const paid = booking ? bookingPaid(booking) : 0;

  const [reason, setReason] = useState('');
  const [charges, setCharges] = useState('0');
  const [refund, setRefund] = useState('0');
  const [refundEdited, setRefundEdited] = useState(false);
  // Refund-processing fields.
  const [refundMode, setRefundMode] = useState<PaymentMode>('bank');
  const [refundRef, setRefundRef] = useState('');
  const [refundDate, setRefundDate] = useState(todayISO());

  // Seed the form whenever a booking is opened.
  useEffect(() => {
    if (!booking) return;
    setReason(booking.cancellationReason ?? '');
    const c = booking.cancellationCharges ?? 0;
    setCharges(String(c));
    setRefund(String(booking.refundAmount ?? Math.max(0, bookingPaid(booking) - c)));
    setRefundEdited(false);
    setRefundMode(booking.refundMode ?? 'bank');
    setRefundRef(booking.refundReference ?? '');
    setRefundDate(booking.refundedAt ?? todayISO());
  }, [booking]);

  // Keep refund = paid − charges until the user overrides it manually.
  useEffect(() => {
    if (refundEdited) return;
    const c = Math.max(0, Number(charges) || 0);
    setRefund(String(Math.max(0, paid - c)));
  }, [charges, paid, refundEdited]);

  if (!booking) return null;

  const chargesNum = Math.max(0, Number(charges) || 0);
  const refundNum = Math.max(0, Number(refund) || 0);

  const write = (fields: Record<string, any>) => {
    if (!firestore) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', booking.id), {
      ...fields,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid ?? null,
    });
  };

  const handleCancel = () => {
    write({
      status: 'cancelled',
      cancellationReason: reason.trim() || null,
      cancelledAt: todayISO(),
      cancellationCharges: chargesNum,
      refundAmount: refundNum,
      refundStatus: refundNum > 0 ? 'pending' : 'processed',
    });
    toast({
      variant: 'destructive',
      title: 'Booking cancelled',
      description: refundNum > 0 ? `${formatINR(refundNum)} refund marked pending.` : 'No refund due.',
    });
    onOpenChange(false);
  };

  const handleSaveDetails = () => {
    write({
      cancellationReason: reason.trim() || null,
      cancellationCharges: chargesNum,
      refundAmount: refundNum,
      refundStatus: booking.refundStatus === 'processed' ? 'processed' : refundNum > 0 ? 'pending' : 'processed',
    });
    toast({ title: 'Refund details updated' });
    onOpenChange(false);
  };

  const handleMarkProcessed = () => {
    write({
      refundStatus: 'processed',
      refundedAt: refundDate || todayISO(),
      refundMode,
      refundReference: refundRef.trim() || null,
      refundAmount: refundNum,
      cancellationCharges: chargesNum,
    });
    toast({ title: 'Refund processed', description: `${formatINR(refundNum)} refunded to ${booking.clientName}.` });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCancelled ? <RotateCcw className="h-5 w-5" /> : <XCircle className="h-5 w-5 text-destructive" />}
            {isCancelled ? 'Refund' : 'Cancel Booking'} — {booking.clientName}
          </DialogTitle>
          <DialogDescription>
            {isCancelled
              ? 'This booking is cancelled. Track the refund owed to the customer.'
              : 'Cancelling records the refund owed to the customer from what they have paid.'}
          </DialogDescription>
        </DialogHeader>

        {/* Money summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Paid by customer</p>
            <p className="text-lg font-bold text-green-600">{formatINR(paid)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Cancellation charge</p>
            <p className="text-lg font-bold">{formatINR(chargesNum)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Refund due</p>
            <p className="text-lg font-bold text-blue-600">{formatINR(refundNum)}</p>
          </div>
        </div>

        {isCancelled && (
          <div>
            <Badge
              className={
                booking.refundStatus === 'processed'
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : 'bg-yellow-100 text-yellow-800 border-yellow-200'
              }
            >
              {booking.refundStatus === 'processed' ? 'Refund processed' : 'Refund pending'}
            </Badge>
            {booking.refundStatus === 'processed' && booking.refundedAt && (
              <span className="ml-2 text-sm text-muted-foreground">
                on {booking.refundedAt} via {PAYMENT_MODE_LABELS[booking.refundMode ?? 'bank']}
                {booking.refundReference ? ` · ${booking.refundReference}` : ''}
              </span>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Cancellation reason</Label>
            <Textarea rows={2} value={reason} placeholder="Why is this booking being cancelled?" onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Cancellation charge (₹)</Label>
              <Input type="number" min={0} value={charges} onChange={(e) => setCharges(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Refund amount (₹)</Label>
              <Input
                type="number"
                min={0}
                value={refund}
                onChange={(e) => { setRefundEdited(true); setRefund(e.target.value); }}
              />
            </div>
          </div>
        </div>

        {/* Mark-processed section (only for a cancelled booking with a pending refund) */}
        {isCancelled && booking.refundStatus !== 'processed' && refundNum > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-sm font-medium">Record the refund payout</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mode</Label>
                <Select value={refundMode} onValueChange={(v) => setRefundMode(v as PaymentMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference</Label>
                <Input value={refundRef} placeholder="Txn / UTR no." onChange={(e) => setRefundRef(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!isCancelled ? (
            <Button variant="destructive" onClick={handleCancel}>
              <XCircle className="mr-2 h-4 w-4" /> Cancel Booking
            </Button>
          ) : booking.refundStatus === 'processed' ? (
            <Button onClick={handleSaveDetails}>Save changes</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleSaveDetails}>Save details</Button>
              {refundNum > 0 && (
                <Button onClick={handleMarkProcessed}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark refund processed
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
