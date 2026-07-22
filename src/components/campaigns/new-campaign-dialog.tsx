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
import { Loader2 } from 'lucide-react';
import { CampaignRecipientPicker, type PickedRecipient } from '@/components/campaigns/campaign-recipient-picker';
import type { EmailTemplate, Mailbox } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, addDoc, writeBatch, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { logAuditClient } from '@/lib/audit-log-client';

interface NewCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RECIPIENT_CHUNK_SIZE = 450; // Firestore batch limit is 500 — stay under it

export function NewCampaignDialog({ open, onOpenChange }: NewCampaignDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [recipients, setRecipients] = useState<PickedRecipient[]>([]);
  const [templateId, setTemplateId] = useState('none');
  const [mailboxId, setMailboxId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [minDelaySeconds, setMinDelaySeconds] = useState(5);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(30);
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    if (!mailboxId && mailboxes && mailboxes.length > 0) {
      const def = mailboxes.find((m) => m.isDefault) ?? mailboxes[0];
      setMailboxId(def.id);
    }
  }, [mailboxes, mailboxId]);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    if (id === 'none') return;
    const t = (templates || []).find((tpl) => tpl.id === id);
    if (!t) return;
    // Copy the raw {{tokens}} as-is — each recipient's copy is rendered
    // individually at send time (src/lib/campaign-queue-core.ts).
    setSubject(t.subject);
    setBody(t.bodyHtml);
  }

  function resetForm() {
    setName('');
    setRecipients([]);
    setTemplateId('none');
    setSubject('');
    setBody('');
    setMinDelaySeconds(5);
    setMaxDelaySeconds(30);
    setSendMode('now');
    setScheduledDateTime('');
  }

  async function handleSave(status: 'paused' | 'running') {
    if (!user || !firestore || isSaving) return;
    if (!name.trim() || recipients.length === 0 || !subject.trim() || !body.trim() || !mailboxId) {
      toast({ variant: 'destructive', title: 'Missing details', description: 'Name, recipients, subject, body, and mailbox are all required.' });
      return;
    }
    if (sendMode === 'later' && !scheduledDateTime) {
      toast({ variant: 'destructive', title: 'Missing schedule time', description: 'Pick a date/time or switch to Send Now.' });
      return;
    }
    if (maxDelaySeconds < minDelaySeconds) {
      toast({ variant: 'destructive', title: 'Invalid delay range', description: 'Max delay must be ≥ min delay.' });
      return;
    }

    setIsSaving(true);
    try {
      const startMs = sendMode === 'now' ? Date.now() : new Date(scheduledDateTime).getTime();
      let cursor = startMs;
      const scheduled = recipients.map((r, i) => {
        if (i > 0) {
          const delaySec = minDelaySeconds + Math.random() * (maxDelaySeconds - minDelaySeconds);
          cursor += delaySec * 1000;
        }
        return { ...r, scheduledSendAt: Timestamp.fromMillis(cursor) };
      });

      const campaignRef = await addDoc(collection(firestore, 'campaigns'), {
        name: name.trim(),
        subject,
        bodyHtml: body,
        mailboxId,
        minDelaySeconds,
        maxDelaySeconds,
        scheduledStartAt: Timestamp.fromMillis(startMs),
        status,
        totalRecipients: scheduled.length,
        sentCount: 0,
        failedCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
        updatedBy: user.uid,
      });

      for (let i = 0; i < scheduled.length; i += RECIPIENT_CHUNK_SIZE) {
        const batch = writeBatch(firestore);
        for (const r of scheduled.slice(i, i + RECIPIENT_CHUNK_SIZE)) {
          const recRef = doc(collection(firestore, 'campaign_recipients'));
          batch.set(recRef, {
            campaignId: campaignRef.id,
            recipientType: r.type,
            recipientId: r.id,
            email: r.email,
            name: r.name,
            status: 'pending',
            attempts: 0,
            scheduledSendAt: r.scheduledSendAt,
            lastError: null,
            messageId: null,
            unsubscribeToken: crypto.randomUUID(),
            sentAt: null,
            createdAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }

      if (status === 'running') {
        logAuditClient(firestore, {
          action: 'campaign.started',
          targetType: 'campaign',
          targetId: campaignRef.id,
          targetLabel: name.trim(),
          actorId: user.uid,
          actorName: user.displayName || user.email || user.uid,
          metadata: { totalRecipients: scheduled.length },
        });
      }

      toast({
        title: status === 'running' ? 'Campaign started' : 'Campaign saved',
        description: `${scheduled.length} recipient(s) queued.`,
      });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not create campaign', description: err?.message || 'Please try again.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSaving) onOpenChange(o); }}>
      <DialogContent className="md:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label>Campaign Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Dubai Offer" />
          </div>

          <div>
            <Label className="mb-2 block">1. Recipients</Label>
            <CampaignRecipientPicker onSelectionChange={setRecipients} />
          </div>

          <div className="space-y-4">
            <Label className="block">2. Compose</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Send From *</Label>
                <Select value={mailboxId} onValueChange={setMailboxId}>
                  <SelectTrigger><SelectValue placeholder="Select mailbox" /></SelectTrigger>
                  <SelectContent>
                    {(mailboxes || []).map((m) => <SelectItem key={m.id} value={m.id}>{m.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start from Template</Label>
                <Select value={templateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(templates || []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Use {{customer_name}}, {{company}}..." />
            </div>
            <div className="space-y-1.5">
              <Label>Body *</Label>
              <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Dear {{customer_name}}, ..." />
              <p className="text-xs text-muted-foreground">An unsubscribe link is appended automatically to every send.</p>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="block">3. Schedule &amp; Pacing</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>When</Label>
                <Select value={sendMode} onValueChange={(v) => setSendMode(v as 'now' | 'later')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Send Now</SelectItem>
                    <SelectItem value="later">Schedule for later</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sendMode === 'later' && (
                <div className="space-y-1.5">
                  <Label>Start Date/Time</Label>
                  <Input type="datetime-local" value={scheduledDateTime} onChange={(e) => setScheduledDateTime(e.target.value)} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Min Delay Between Sends (seconds)</Label>
                <Input type="number" min={0} value={minDelaySeconds} onChange={(e) => setMinDelaySeconds(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max Delay Between Sends (seconds)</Label>
                <Input type="number" min={0} value={maxDelaySeconds} onChange={(e) => setMaxDelaySeconds(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-20 -mx-6 -mb-4 border-t bg-background px-6 py-4 gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button type="button" variant="secondary" onClick={() => handleSave('paused')} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save without Starting
          </Button>
          <Button type="button" onClick={() => handleSave('running')} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
