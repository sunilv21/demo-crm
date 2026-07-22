'use client';

import { useEffect, useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Mail, PlusCircle, MoreHorizontal, Pencil, Trash2, Power, Star, RefreshCw } from 'lucide-react';
import type { Mailbox } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { MailboxForm } from '@/components/forms/mailbox-form';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { toggleMailboxEnabled, setDefaultMailbox, deleteMailbox, syncMailboxNow } from '@/lib/mailbox-client';
import { useNotifications } from '@/components/notifications/notification-provider';

const PROVIDER_LABEL: Record<Mailbox['provider'], string> = {
  gmail: 'Gmail',
  outlook: 'Microsoft / Outlook',
  custom: 'Custom',
};

export function EmailAccountsTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMailbox, setEditingMailbox] = useState<Mailbox | null>(null);
  const [mailboxToDelete, setMailboxToDelete] = useState<Mailbox | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const { markMailboxAlertsSeen } = useNotifications();

  useEffect(() => {
    markMailboxAlertsSeen();
    // Only clear on mount — not every render — otherwise a fresh alert
    // firing while this tab happens to be open would be cleared instantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mailboxesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'mailboxes'), orderBy('email', 'asc'));
  }, [firestore]);
  const { data: mailboxes, isLoading } = useCollection<Mailbox>(mailboxesQuery);

  async function handleToggleEnabled(mailbox: Mailbox) {
    if (!user) return;
    try {
      await toggleMailboxEnabled(user, mailbox.id, !mailbox.isEnabled);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message });
    }
  }

  async function handleSetDefault(mailbox: Mailbox) {
    if (!user) return;
    try {
      await setDefaultMailbox(user, mailbox.id);
      toast({ title: 'Default mailbox updated', description: `${mailbox.email} is now the default.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message });
    }
  }

  async function handleSync(mailbox: Mailbox) {
    if (!user) return;
    setSyncingId(mailbox.id);
    try {
      const result = await syncMailboxNow(user, mailbox.id);
      toast({ title: 'Inbox synced', description: `${result.newCount} new message(s) found.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Sync failed', description: err?.message });
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete() {
    if (!user || !mailboxToDelete) return;
    try {
      await deleteMailbox(user, mailboxToDelete.id);
      toast({ variant: 'destructive', title: 'Mailbox removed', description: `${mailboxToDelete.email} has been disconnected.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message });
    } finally {
      setMailboxToDelete(null);
    }
  }

  const list = mailboxes || [];

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Connect Mailbox
            </Button>
          </DialogTrigger>
          <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>Connect a Mailbox</DialogTitle>
            </DialogHeader>
            <MailboxForm onSuccess={() => setIsFormOpen(false)} onCancel={() => setIsFormOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingMailbox} onOpenChange={(open) => !open && setEditingMailbox(null)}>
        <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Edit {editingMailbox?.email}</DialogTitle>
          </DialogHeader>
          {editingMailbox && (
            <MailboxForm
              mailbox={editingMailbox}
              onSuccess={() => setEditingMailbox(null)}
              onCancel={() => setEditingMailbox(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!mailboxToDelete}
        onOpenChange={(open) => !open && setMailboxToDelete(null)}
        onConfirm={handleDelete}
        confirmText={mailboxToDelete?.email || ''}
        description={
          <>
            This will disconnect <span className="font-semibold text-foreground">{mailboxToDelete?.email}</span>.
            Prior sent-mail logs and synced inbox messages are kept for history.
          </>
        }
      />

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mailbox</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Synced</TableHead>
              <TableHead className="w-[56px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><MoreHorizontal className="h-4 w-4 ml-auto" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              list.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          {m.email}
                          {m.isDefault && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        </div>
                        <div className="text-sm text-muted-foreground">{m.displayName}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{PROVIDER_LABEL[m.provider]}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary" className={m.isEnabled ? 'bg-green-100 text-green-800 border-green-200 w-fit' : 'w-fit'}>
                        {m.isEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      {m.syncState === 'error' && (
                        <span className="text-xs text-destructive" title={m.syncError || ''}>Sync error</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.lastSyncedAt?.toDate ? m.lastSyncedAt.toDate().toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open mailbox actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditingMailbox(m)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleSync(m)} disabled={syncingId === m.id}>
                          <RefreshCw className={`mr-2 h-4 w-4 ${syncingId === m.id ? 'animate-spin' : ''}`} />
                          Refresh Inbox
                        </DropdownMenuItem>
                        {!m.isDefault && (
                          <DropdownMenuItem onSelect={() => handleSetDefault(m)}>
                            <Star className="mr-2 h-4 w-4" />Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => handleToggleEnabled(m)}>
                          <Power className="mr-2 h-4 w-4" />{m.isEnabled ? 'Disable' : 'Enable'}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => setMailboxToDelete(m)}>
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
            <p>No mailboxes connected yet. Connect one to send and receive email from the CRM.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
