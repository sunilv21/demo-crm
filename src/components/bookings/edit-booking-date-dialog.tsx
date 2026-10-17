'use client';

import { useEffect, useState } from 'react';
import type { Booking } from '@/lib/types';
import { bookingMadeDateISO } from '@/lib/booking-details';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function EditBookingDateDialog({
  open, onOpenChange, booking, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: Booking | null;
  onSubmit: (date: string) => void;
}) {
  const [date, setDate] = useState('');
  useEffect(() => {
    if (open && booking) setDate(bookingMadeDateISO(booking));
  }, [open, booking]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct booking date</DialogTitle>
          <DialogDescription>
            {booking ? `Fix the date shown for ${booking.clientName}'s booking — for example, if it was entered into the system late.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Booking date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (date) { onSubmit(date); onOpenChange(false); } }} disabled={!date}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
