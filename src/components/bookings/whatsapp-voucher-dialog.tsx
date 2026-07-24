'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, FileText } from 'lucide-react';
import type { Booking, Client, WhatsAppAccount } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { sendWhatsAppVoucher } from '@/lib/whatsapp-client';

interface WhatsAppVoucherDialogProps {
  booking: Booking;
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Voucher-over-WhatsApp only works for the two providers that fetch media
// from a URL (Twilio, Meta Cloud API) — whatsapp_web has no such flow wired
// up yet, so it's filtered out here rather than surfaced as a dead-end option.
const SUPPORTED_PROVIDERS: WhatsAppAccount['provider'][] = ['twilio', 'meta_cloud'];

export function WhatsAppVoucherDialog({ booking, client, open, onOpenChange }: WhatsAppVoucherDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const accountsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'whatsapp_accounts'), where('status', '==', 'connected'));
  }, [firestore]);
  const { data: allAccounts } = useCollection<WhatsAppAccount>(accountsQuery);
  const accounts = (allAccounts || []).filter((a) => SUPPORTED_PROVIDERS.includes(a.provider));

  useEffect(() => {
    if (!open) return;
    setTo(client?.phone || '');
    setMessage(`Hi ${client?.name || booking.clientName || ''}, please find your booking voucher attached.`);
  }, [open, client, booking]);

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      const def = accounts.find((a) => a.isDefault) ?? accounts[0];
      setAccountId(def.id);
    }
  }, [accounts, accountId]);

  async function handleSend() {
    if (!user || !to.trim() || !accountId || isSending) return;
    setIsSending(true);
    try {
      await sendWhatsAppVoucher(user, {
        accountId,
        to: to.trim(),
        bookingId: booking.id,
        caption: message.trim() || undefined,
      });
      toast({ title: 'Voucher sent', description: `Voucher sent to ${to.trim()} on WhatsApp.` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Send failed', description: err?.message || 'Please try again.' });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-lg w-[95vw]">
        <DialogHeader>
          <DialogTitle>Send Voucher via WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+91 98xxxxxxx" />
            {!client?.phone && (
              <p className="text-xs text-muted-foreground">This client has no saved phone number — enter one to send.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Send From</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select WhatsApp number" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label} ({a.phoneNumber || a.twilioWhatsAppFrom})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">No connected Twilio/Meta WhatsApp account is available.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional caption sent with the voucher..." />
          </div>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Hotel booking voucher (.docx)
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>Cancel</Button>
          <Button type="button" onClick={handleSend} disabled={isSending || !to.trim() || !accountId}>
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
