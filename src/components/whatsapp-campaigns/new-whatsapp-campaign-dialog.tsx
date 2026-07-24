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
import { WhatsAppCampaignRecipientPicker, type PickedWhatsAppRecipient } from '@/components/whatsapp-campaigns/whatsapp-campaign-recipient-picker';
import type { WhatsAppAccount, WhatsAppTemplate } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, addDoc, writeBatch, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { logAuditClient } from '@/lib/audit-log-client';
import { renderWhatsAppTemplate } from '@/lib/whatsapp-template';
import { processWhatsAppCampaignNow } from '@/lib/whatsapp-campaign-client';

interface NewWhatsAppCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RECIPIENT_CHUNK_SIZE = 450; // Firestore batch limit is 500 — stay under it

// Mirrors src/components/campaigns/new-campaign-dialog.tsx (email) — same
// recipient-picker + random-delay-pacing pattern, swapping mailbox/subject/
// HTML for a WhatsApp account + plain-text body.
export function NewWhatsAppCampaignDialog({ open, onOpenChange }: NewWhatsAppCampaignDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [recipients, setRecipients] = useState<PickedWhatsAppRecipient[]>([]);
  const [accountId, setAccountId] = useState('');
  const [templateId, setTemplateId] = useState('none');
  const [body, setBody] = useState('');
  const [minDelaySeconds, setMinDelaySeconds] = useState(10);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(60);
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const accountsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'whatsapp_accounts'), where('status', '==', 'connected'));
  }, [firestore]);
  const { data: accounts } = useCollection<WhatsAppAccount>(accountsQuery);

  const templatesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'whatsapp_templates'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: templates } = useCollection<WhatsAppTemplate>(templatesQuery);

  useEffect(() => {
    if (!accountId && accounts && accounts.length > 0) {
      const def = accounts.find((a) => a.isDefault) ?? accounts[0];
      setAccountId(def.id);
    }
  }, [accounts, accountId]);

  const selectedAccount = (accounts || []).find((a) => a.id === accountId);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    if (id === 'none') return;
    const t = (templates || []).find((tpl) => tpl.id === id);
    if (!t) return;
    setBody(t.body);
  }

  function resetForm() {
    setName('');
    setRecipients([]);
    setTemplateId('none');
    setBody('');
    setMinDelaySeconds(10);
    setMaxDelaySeconds(60);
    setSendMode('now');
    setScheduledDateTime('');
  }

  async function handleSave(status: 'paused' | 'running') {
    if (!user || !firestore || isSaving) return;
    if (!name.trim() || recipients.length === 0 || !body.trim() || !accountId) {
      toast({ variant: 'destructive', title: 'Missing details', description: 'Name, recipients, message, and a WhatsApp number are all required.' });
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

      const campaignRef = await addDoc(collection(firestore, 'whatsapp_campaigns'), {
        name: name.trim(),
        body,
        accountId,
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
          const recRef = doc(collection(firestore, 'whatsapp_campaign_recipients'));
          batch.set(recRef, {
            campaignId: campaignRef.id,
            recipientType: r.type,
            recipientId: r.id,
            phone: r.phone,
            name: r.name,
            status: 'pending',
            attempts: 0,
            scheduledSendAt: r.scheduledSendAt,
            lastError: null,
            sentBody: null,
            sentAt: null,
            createdAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }

      if (status === 'running') {
        logAuditClient(firestore, {
          action: 'whatsapp_campaign.started',
          targetType: 'whatsapp_campaign',
          targetId: campaignRef.id,
          targetLabel: name.trim(),
          actorId: user.uid,
          actorName: user.displayName || user.email || user.uid,
          metadata: { totalRecipients: scheduled.length },
        });
        // The first recipient's scheduledSendAt is "now" for an immediate
        // send — kick the queue right away instead of waiting for the
        // Campaigns tab's 20s auto-poll to get to it.
        if (sendMode === 'now') {
          processWhatsAppCampaignNow(user, campaignRef.id).catch(() => {});
        }
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
          <DialogTitle>New WhatsApp Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label>Campaign Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Dubai Offer" />
          </div>

          <div>
            <Label className="mb-2 block">1. Recipients</Label>
            <WhatsAppCampaignRecipientPicker onSelectionChange={setRecipients} />
          </div>

          <div className="space-y-4">
            <Label className="block">2. Compose</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Send From *</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select a connected WhatsApp number" /></SelectTrigger>
                  <SelectContent>
                    {(accounts || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.label} — {a.phoneNumber}</SelectItem>
                    ))}
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
            {selectedAccount?.provider === 'whatsapp_web' && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <span>
                  This number connects over an unofficial protocol (not WhatsApp&apos;s sanctioned Business API) —
                  sending bulk/bot-like marketing messages risks WhatsApp banning it. Use generous delays below and
                  keep recipient counts modest, or prefer a Twilio/Meta Cloud API number for larger sends.
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Message *</Label>
              <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{customer_name}}, ..." />
              <p className="text-xs text-muted-foreground">Plain text only — use {'{{customer_name}}'} to personalize.</p>
            </div>
            {body.trim() && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Preview {recipients[0] ? `(as ${recipients[0].name} would see it)` : '(using a sample name)'}
                </Label>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  {renderWhatsAppTemplate(body, recipients[0]?.name || 'John Doe')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Only {'{{customer_name}}'} is replaced — anything else in double braces is sent exactly as typed.
                </p>
              </div>
            )}
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
            <p className="text-xs text-muted-foreground">
              Messages only go out while the Campaigns tab is open in a browser (it polls for due sends) — there&apos;s
              no background server for this yet.
            </p>
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
