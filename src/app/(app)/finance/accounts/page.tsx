'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, FinanceAccountType, FinanceTransaction } from '@/lib/types';
import { FINANCE_COLLECTIONS, ACCOUNT_TYPE_LABELS, accountBalance, totalBalance } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreHorizontal, Landmark, Pencil, Power } from 'lucide-react';

const TYPES: FinanceAccountType[] = ['cash', 'petty-cash', 'current', 'savings', 'wallet'];

export default function FinanceAccountsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [editing, setEditing] = useState<FinanceAccount | null>(null);
  const [open, setOpen] = useState(false);

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts, isLoading } = useCollection<FinanceAccount>(accountsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);

  const txns = transactions ?? [];
  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const grandTotal = totalBalance(activeAccounts, txns);

  const startNew = () => { setEditing(null); setOpen(true); };
  const startEdit = (a: FinanceAccount) => { setEditing(a); setOpen(true); };

  const toggleStatus = (a: FinanceAccount) => {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.accounts, a.id),
      { status: a.status === 'inactive' ? 'active' : 'inactive', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null }, { merge: true });
  };

  return (
    <>
      <PageHeader title="Accounts" description="Cash, bank and wallet accounts that hold company money.">
        <Button onClick={startNew}><PlusCircle className="mr-2 h-4 w-4" />New Account</Button>
      </PageHeader>

      <div className="grid gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Available Balance" value={isLoading ? '…' : formatINR(grandTotal)} variant="success" />
        <StatCard title="Accounts" value={isLoading ? '…' : String(activeAccounts.length)} />
      </div>

      <Card className="border rounded-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Bank details</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Current balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && (accounts ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-muted-foreground" />{a.name}</span>
                  </TableCell>
                  <TableCell>{ACCOUNT_TYPE_LABELS[a.type]}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.bankName ? `${a.bankName}${a.accountNumber ? ` · ${a.accountNumber}` : ''}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">{formatINR(a.openingBalance || 0)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(accountBalance(a, txns))}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={a.status === 'inactive' ? '' : 'bg-green-100 text-green-800 border-green-200'}>
                      {a.status === 'inactive' ? 'Inactive' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Account actions"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => startEdit(a)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleStatus(a)}>
                          <Power className="mr-2 h-4 w-4" />{a.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && (accounts ?? []).length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No accounts yet. Create one to start tracking money.</div>
          )}
        </CardContent>
      </Card>

      <AccountDialog open={open} onOpenChange={setOpen} account={editing} onSaved={() => toast({ title: editing ? 'Account updated' : 'Account created' })} />
    </>
  );
}

function AccountDialog({ open, onOpenChange, account, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; account: FinanceAccount | null; onSaved: () => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [name, setName] = useState('');
  const [type, setType] = useState<FinanceAccountType>('cash');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [notes, setNotes] = useState('');

  // Seed on open.
  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setType(account?.type ?? 'cash');
    setBankName(account?.bankName ?? '');
    setAccountNumber(account?.accountNumber ?? '');
    setIfsc(account?.ifsc ?? '');
    setOpeningBalance(String(account?.openingBalance ?? 0));
    setNotes(account?.notes ?? '');
  }, [open, account]);

  const save = () => {
    if (!firestore || !name.trim()) return;
    const payload = {
      name: name.trim(), type,
      bankName: bankName.trim() || null, accountNumber: accountNumber.trim() || null, ifsc: ifsc.trim() || null,
      openingBalance: Math.round(Number(openingBalance) || 0), notes: notes.trim() || null,
      updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    };
    if (account) {
      setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.accounts, account.id), payload, { merge: true });
    } else {
      addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.accounts), {
        ...payload, status: 'active', createdAt: serverTimestamp(), createdBy: user?.uid ?? null,
      });
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw]">
        <DialogHeader><DialogTitle>{account ? 'Edit account' : 'New account'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ICICI Current" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as FinanceAccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Bank name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Opening balance (₹)</Label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Account number</Label><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">IFSC</Label><Input value={ifsc} onChange={(e) => setIfsc(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!name.trim()}>{account ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
