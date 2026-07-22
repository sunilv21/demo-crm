'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Loader2, Paperclip } from 'lucide-react';
import type { Booking, Client, EmailTemplate, Mailbox } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { sendEmail } from '@/lib/mailbox-client';
import { renderTemplate } from '@/lib/email-template';
import { COMPANY } from '@/lib/company';

interface EmailVoucherDialogProps {
  booking: Booking;
  client: Client | null;
  attachment: { base64: string; filename: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VOUCHER_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function EmailVoucherDialog({ booking, client, attachment, open, onOpenChange }: EmailVoucherDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [mailboxId, setMailboxId] = useState('');
  const [templateId, setTemplateId] = useState('none');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  const mailboxesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'mailboxes'), where('isEnabled', '==', true));
  }, [firestore]);
  const { data: mailboxes } = useCollection<Mailbox>(mailboxesQuery);

  const templatesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'email_templates'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: templates } = useCollection<EmailTemplate>(templatesQuery);

  const variables = useMemo(
    () => ({
      customer_name: client?.name || booking.clientName || '',
      booking_id: booking.id,
      destination: booking.destination || '',
      start_date: booking.startDate || '',
      end_date: booking.endDate || '',
      company: COMPANY.name,
    }),
    [client, booking]
  );

  // Reset per-booking fields each time the dialog is opened for a booking.
  useEffect(() => {
    if (!open) return;
    setTo(client?.email || '');
    setTemplateId('none');
    setSubject(`Your booking voucher — ${booking.id}`);
    setBody('');
  }, [open, client, booking.id]);

  useEffect(() => {
    if (!mailboxId && mailboxes && mailboxes.length > 0) {
      const def = mailboxes.find((m) => m.isDefault) ?? mailboxes[0];
      setMailboxId(def.id);
    }
  }, [mailboxes, mailboxId]);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    if (id === 'none') return;
    const template = (templates || []).find((t) => t.id === id);
    if (!template) return;
    setSubject(renderTemplate(template.subject, variables));
    setBody(renderTemplate(template.bodyHtml, variables));
  }

  async function handleSend() {
    if (!user || !to.trim() || !mailboxId || isSending) return;
    setIsSending(true);
    try {
      await sendEmail(user, {
        mailboxId,
        to: [to.trim()],
        subject,
        html: body || undefined,
        text: body ? undefined : ' ',
        attachments: [{ filename: attachment.filename, contentBase64: attachment.base64, contentType: VOUCHER_MIME }],
        relatedClientId: client?.id,
        relatedBookingId: booking.id,
      });
      toast({ title: 'Email sent', description: `Voucher sent to ${to.trim()}.` });
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
          <DialogTitle>Email Voucher</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
            {!client?.email && (
              <p className="text-xs text-muted-foreground">This client has no saved email — enter one to send.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Send From</Label>
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger><SelectValue placeholder="Select mailbox" /></SelectTrigger>
                <SelectContent>
                  {(mailboxes || []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(templates || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Dear guest, please find your booking voucher attached..." />
          </div>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            {attachment.filename}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>Cancel</Button>
          <Button type="button" onClick={handleSend} disabled={isSending || !to.trim() || !mailboxId}>
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
