'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageCircle, PlusCircle, MoreHorizontal, Trash2, Power, RefreshCw, Loader2, Settings2, Copy } from 'lucide-react';
import type { WhatsAppAccount, WhatsAppMetaSettings, WhatsAppProvider } from '@/lib/types';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  createWhatsAppAccount,
  reconnectWhatsAppAccount,
  disconnectWhatsAppAccount,
  deleteWhatsAppAccount,
  saveMetaWebhookSettings,
} from '@/lib/whatsapp-client';

const STATUS_LABEL: Record<WhatsAppAccount['status'], string> = {
  pending_qr: 'Scan QR to connect',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

const PROVIDER_LABEL: Record<WhatsAppProvider, string> = {
  whatsapp_web: 'Personal/Business (QR)',
  twilio: 'Twilio',
  meta_cloud: 'Meta Cloud API',
};

export function WhatsAppAccountsTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [provider, setProvider] = useState<WhatsAppProvider>('meta_cloud');
  const [label, setLabel] = useState('');
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [pairingAccountId, setPairingAccountId] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<WhatsAppAccount | null>(null);

  const accountsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'whatsapp_accounts'), orderBy('label', 'asc'));
  }, [firestore]);
  const { data: accounts, isLoading } = useCollection<WhatsAppAccount>(accountsQuery);

  function canSubmit() {
    if (!label.trim()) return false;
    if (provider === 'twilio') return !!(twilioSid.trim() && twilioToken.trim() && twilioFrom.trim());
    if (provider === 'meta_cloud') return !!(metaPhoneId.trim() && metaToken.trim());
    return true;
  }

  async function handleCreate() {
    if (!user || !canSubmit()) return;
    setIsCreating(true);
    try {
      const result = await createWhatsAppAccount(
        user,
        provider === 'twilio'
          ? { provider, label: label.trim(), accountSid: twilioSid.trim(), authToken: twilioToken.trim(), whatsappFrom: twilioFrom.trim() }
          : provider === 'meta_cloud'
            ? { provider, label: label.trim(), phoneNumberId: metaPhoneId.trim(), wabaId: metaWabaId.trim() || undefined, accessToken: metaToken.trim() }
            : { provider, label: label.trim() }
      );
      if (provider === 'whatsapp_web') {
        setPairingAccountId(result.id);
      } else {
        toast({ title: 'Connected', description: `${label.trim()} is ready to use.` });
        closeAddDialog(false);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to connect', description: err?.message });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleReconnect(account: WhatsAppAccount) {
    if (!user) return;
    // Open straight into the QR view rather than waiting for the API call
    // to resolve — otherwise the dialog would flash the "Add Number" label
    // form for a moment first, since pairingAccountId would still be null.
    setPairingAccountId(account.id);
    setIsAddOpen(true);
    setReconnectingId(account.id);
    try {
      await reconnectWhatsAppAccount(user, account.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message });
      closeAddDialog(false);
    } finally {
      setReconnectingId(null);
    }
  }

  async function handleDisconnect(account: WhatsAppAccount) {
    if (!user) return;
    try {
      await disconnectWhatsAppAccount(user, account.id);
      toast({ title: 'Disconnected', description: `${account.label} has been logged out.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message });
    }
  }

  async function handleDelete() {
    if (!user || !accountToDelete) return;
    try {
      await deleteWhatsAppAccount(user, accountToDelete.id);
      toast({ variant: 'destructive', title: 'Account removed', description: `${accountToDelete.label} has been deleted.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message });
    } finally {
      setAccountToDelete(null);
    }
  }

  function openAddDialog(p: WhatsAppProvider) {
    setProvider(p);
    setIsAddOpen(true);
  }

  function closeAddDialog(open: boolean) {
    if (!open) {
      setIsAddOpen(false);
      setLabel('');
      setTwilioSid('');
      setTwilioToken('');
      setTwilioFrom('');
      setMetaPhoneId('');
      setMetaWabaId('');
      setMetaToken('');
      setPairingAccountId(null);
    }
  }

  const list = accounts || [];

  return (
    <div className="space-y-4">
      {list.some((a) => a.provider === 'whatsapp_web') && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            Personal/business numbers connect over an unofficial protocol (not WhatsApp's sanctioned Business API) —
            sending at high volume or in a bot-like pattern risks WhatsApp banning the number. Use for normal
            conversational volume.
          </span>
        </div>
      )}

      <MetaSettingsCard />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => openAddDialog('meta_cloud')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Connect Meta Number
        </Button>
        <Button variant="outline" onClick={() => openAddDialog('twilio')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Connect Twilio
        </Button>
        <Button variant="outline" onClick={() => openAddDialog('whatsapp_web')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Link Personal/Business (QR)
        </Button>

        <Dialog open={isAddOpen} onOpenChange={(open) => (open ? setIsAddOpen(true) : closeAddDialog(false))}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {pairingAccountId ? 'Scan to connect' : `Connect ${PROVIDER_LABEL[provider]}`}
              </DialogTitle>
            </DialogHeader>
            {!pairingAccountId ? (
              <>
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label htmlFor="wa-label" className="text-xs text-muted-foreground">Label</Label>
                    <Input
                      id="wa-label"
                      placeholder="e.g. Sales — Rahul's number"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {provider === 'twilio' && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="wa-twilio-sid" className="text-xs text-muted-foreground">Account SID</Label>
                        <Input id="wa-twilio-sid" placeholder="ACxxxxxxxx..." value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="wa-twilio-token" className="text-xs text-muted-foreground">Auth Token</Label>
                        <Input id="wa-twilio-token" type="password" value={twilioToken} onChange={(e) => setTwilioToken(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="wa-twilio-from" className="text-xs text-muted-foreground">
                          WhatsApp-enabled number
                        </Label>
                        <Input
                          id="wa-twilio-from"
                          placeholder="+14155238886"
                          value={twilioFrom}
                          onChange={(e) => setTwilioFrom(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {provider === 'meta_cloud' && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="wa-meta-phone" className="text-xs text-muted-foreground">Phone Number ID</Label>
                        <Input id="wa-meta-phone" value={metaPhoneId} onChange={(e) => setMetaPhoneId(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="wa-meta-waba" className="text-xs text-muted-foreground">WABA ID (optional)</Label>
                        <Input id="wa-meta-waba" value={metaWabaId} onChange={(e) => setMetaWabaId(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="wa-meta-token" className="text-xs text-muted-foreground">Access Token</Label>
                        <Input id="wa-meta-token" type="password" value={metaToken} onChange={(e) => setMetaToken(e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => closeAddDialog(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={isCreating || !canSubmit()}>
                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {provider === 'whatsapp_web' ? 'Start Pairing' : 'Connect'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <PairingQrView accountId={pairingAccountId} onDone={() => closeAddDialog(false)} />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <ConfirmDeleteDialog
        open={!!accountToDelete}
        onOpenChange={(open) => !open && setAccountToDelete(null)}
        onConfirm={handleDelete}
        confirmText={accountToDelete?.label || ''}
        description={
          <>
            This will log out and delete <span className="font-semibold text-foreground">{accountToDelete?.label}</span>.
            Prior chat history is kept for reference.
          </>
        }
      />

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Connected</TableHead>
              <TableHead className="w-[56px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><MoreHorizontal className="h-4 w-4 ml-auto" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div>{a.label}</div>
                        <div className="text-sm text-muted-foreground">{a.phoneNumber || '—'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{PROVIDER_LABEL[a.provider]}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge
                        variant="secondary"
                        className={a.status === 'connected' ? 'bg-green-100 text-green-800 border-green-200 w-fit' : 'w-fit'}
                      >
                        {STATUS_LABEL[a.status]}
                      </Badge>
                      {a.status === 'error' && a.connectionError && (
                        <span className="text-xs text-destructive" title={a.connectionError}>{a.connectionError}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.lastConnectedAt?.toDate ? a.lastConnectedAt.toDate().toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open account actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {a.provider === 'whatsapp_web' && a.status !== 'connected' && (
                          <DropdownMenuItem
                            onSelect={() => handleReconnect(a)}
                            disabled={reconnectingId === a.id}
                          >
                            <RefreshCw className={`mr-2 h-4 w-4 ${reconnectingId === a.id ? 'animate-spin' : ''}`} />
                            Reconnect
                          </DropdownMenuItem>
                        )}
                        {a.provider === 'whatsapp_web' && a.status === 'connected' && (
                          <DropdownMenuItem onSelect={() => handleDisconnect(a)}>
                            <Power className="mr-2 h-4 w-4" />Disconnect
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onSelect={() => setAccountToDelete(a)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!isLoading && list.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            <p>No WhatsApp numbers connected yet. Add one to chat with clients from the CRM.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// Live QR view for a single account being paired — listens to the account
// doc's `qr` field (written by the Cloud Run bridge) and swaps to a success
// state once `status` flips to 'connected'.
function PairingQrView({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const firestore = useFirestore();
  const accountRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'whatsapp_accounts', accountId) : null),
    [firestore, accountId]
  );
  const { data: account } = useDoc<WhatsAppAccount>(accountRef);

  if (account?.status === 'connected') {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm font-medium">Connected as {account.phoneNumber}</p>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  if (account?.status === 'error') {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-destructive">{account.connectionError || 'Pairing failed.'}</p>
        <Button variant="outline" onClick={onDone}>Close</Button>
      </div>
    );
  }

  return (
    <div className="py-4 flex flex-col items-center gap-3">
      {account?.qr ? (
        <Image src={account.qr} alt="WhatsApp QR code" width={256} height={256} unoptimized />
      ) : (
        <div className="h-64 w-64 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating QR code…
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center">
        Open WhatsApp on the phone → Settings → Linked Devices → Link a Device, then scan this code.
      </p>
    </div>
  );
}

// Global Meta Cloud API webhook settings (App Secret + verify token) — one
// Meta App backs every connected WABA/number, so this isn't per-account.
// Configured here rather than via env vars so it can change without a
// redeploy. Only shown to admins.
function MetaSettingsCard() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin } = useAppUser();
  const { toast } = useToast();
  const [appSecret, setAppSecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const settingsRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'whatsapp_settings', 'meta_cloud') : null),
    [firestore]
  );
  const { data: settings } = useDoc<WhatsAppMetaSettings>(settingsRef);

  if (!isAdmin) return null;

  const webhookUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp/meta` : '/api/webhooks/whatsapp/meta';

  async function handleSave() {
    if (!user) return;
    setIsSaving(true);
    try {
      const result = await saveMetaWebhookSettings(user, { appSecret: appSecret.trim() || undefined });
      setAppSecret('');
      toast({ title: 'Meta settings saved', description: `Verify token: ${result.verifyToken}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err?.message });
    } finally {
      setIsSaving(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast({ title: 'Copied' });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" />Meta Cloud API Webhook</CardTitle>
        <CardDescription>
          Enter these two values in Meta App Dashboard → WhatsApp → Configuration, so incoming messages reach the CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Callback URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={() => copy(webhookUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Verify Token</Label>
          <div className="flex gap-2">
            <Input readOnly value={settings?.verifyToken || 'Not generated yet — save once to create one'} className="font-mono text-xs" />
            {settings?.verifyToken && (
              <Button type="button" variant="outline" size="icon" onClick={() => copy(settings.verifyToken)}>
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-meta-app-secret" className="text-xs text-muted-foreground">
            App Secret {settings?.appSecretCiphertext && <span className="text-green-600">(configured)</span>}
          </Label>
          <Input
            id="wa-meta-app-secret"
            type="password"
            placeholder={settings?.appSecretCiphertext ? 'Leave blank to keep the current one' : 'From App Dashboard → Settings → Basic'}
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
