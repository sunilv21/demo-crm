'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, Client, PaymentMethodDoc, FinanceTransaction, Booking } from '@/lib/types';
import { FINANCE_COLLECTIONS, DEFAULT_IN_METHODS, todayISO, bookingPaymentsAsTransactions, isDerivedTxn, matchesMonth } from '@/lib/finance';
import { withReconciledPayment, withReconciledPaymentEdit } from '@/lib/payments';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonthSelect } from '@/components/finance/month-select';
import { useGlobalMonthFilter } from '@/components/finance/global-month-filter-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowDownCircle, Link2, Pencil, Search } from 'lucide-react';

const NONE = '__none__';

export default function MoneyInPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { month: globalMonth } = useGlobalMonthFilter();

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const clientsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'clients') : null), [firestore]);
  const { data: clients } = useCollection<Client>(clientsQuery);
  const methodsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.methods) : null), [firestore]);
  const { data: methodDocs } = useCollection<PaymentMethodDoc>(methodsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings } = useCollection<Booking>(bookingsQuery);

  const [historyMonth, setHistoryMonth] = useState('');
  const [search, setSearch] = useState('');

  // All money received: manual finance income + collections derived from bookings.
  const receipts = useMemo(() => {
    const income = [
      ...(transactions ?? []).filter((t) => t.type === 'income'),
      ...bookingPaymentsAsTransactions(bookings ?? []),
    ].filter((t) => t.status !== 'cancelled' && matchesMonth(t.date, historyMonth) && matchesMonth(t.date, globalMonth));
    const term = search.trim().toLowerCase();
    const filtered = term ? income.filter((t) => (t.clientName || '').toLowerCase().includes(term)) : income;
    const sorted = filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return historyMonth || term || globalMonth ? sorted : sorted.slice(0, 25);
  }, [transactions, bookings, historyMonth, search, globalMonth]);
  const accById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);

  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const methods = useMemo(() => {
    const custom = (methodDocs ?? []).filter((m) => m.direction !== 'outgoing' && m.active !== false).map((m) => m.name);
    return custom.length ? custom : DEFAULT_IN_METHODS;
  }, [methodDocs]);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState(DEFAULT_IN_METHODS[0]);
  const [clientId, setClientId] = useState(NONE);
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => { setAmount(''); setReference(''); setRemarks(''); setClientId(NONE); };

  const submit = async () => {
    if (isSubmitting) return;
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!accountId) { toast({ variant: 'destructive', title: 'Select an account' }); return; }
    if (!firestore) return;
    const client = clientId !== NONE ? (clients ?? []).find((c) => c.id === clientId) : undefined;
    setIsSubmitting(true);
    try {
      await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
        type: 'income', amount: amt, date, accountId, paymentMethod: method,
        clientId: client?.id ?? null, clientName: client?.name ?? null,
        reference: reference.trim() || null, remarks: remarks.trim() || null,
        status: 'completed',
        createdAt: serverTimestamp(), createdBy: user?.uid ?? null,
        createdByName: user?.displayName || user?.email?.split('@')[0] || 'Staff',
        updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      toast({ title: 'Money received', description: `${formatINR(amt)} added to the account.` });
      reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reconcile: turn an "Undeposited" booking-collection row into a real
  // finance_transactions doc in a chosen account, and stamp financeTxnId
  // back onto the booking's payment so it stops being derived.
  const [reconcileTarget, setReconcileTarget] = useState<FinanceTransaction | null>(null);
  const [reconcileAccountId, setReconcileAccountId] = useState('');
  const [isReconciling, setIsReconciling] = useState(false);

  const openReconcile = (t: FinanceTransaction) => { setReconcileTarget(t); setReconcileAccountId(''); };

  const submitReconcile = async () => {
    if (isReconciling) return;
    const t = reconcileTarget;
    if (!t || !firestore || !reconcileAccountId || !t.bookingId || !t.bookingPaymentId) return;
    const booking = (bookings ?? []).find((b) => b.id === t.bookingId);
    if (!booking) { toast({ variant: 'destructive', title: 'Booking not found' }); return; }
    setIsReconciling(true);
    try {
      const createdByName = user?.displayName || user?.email?.split('@')[0] || 'Staff';
      const txnRef = await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
        type: 'income', amount: t.amount, date: t.date, accountId: reconcileAccountId,
        clientId: t.clientId ?? null, clientName: t.clientName ?? null,
        bookingId: t.bookingId, bookingPaymentId: t.bookingPaymentId,
        paymentMethod: t.paymentMethod ?? null, reference: t.reference ?? null,
        remarks: 'Reconciled booking payment', status: 'completed', source: 'booking',
        createdAt: serverTimestamp(), createdBy: user?.uid ?? null, createdByName,
        updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      if (!txnRef) { toast({ variant: 'destructive', title: 'Failed to reconcile' }); return; }
      updateDocumentNonBlocking(
        doc(firestore, 'bookings', t.bookingId),
        withReconciledPayment(booking, t.bookingPaymentId, txnRef.id)
      );
      toast({ title: 'Reconciled', description: `${formatINR(t.amount || 0)} moved into the account.` });
      setReconcileTarget(null);
    } finally {
      setIsReconciling(false);
    }
  };

  // Edit: correct an already-recorded payment (manual entry or reconciled
  // booking collection) later. Finance transactions are append-only, so this
  // cancels the original and records a corrected one in its place — if the
  // row came from a booking, the booking's own payment ledger is updated to
  // match and re-pointed at the new transaction.
  const [editTarget, setEditTarget] = useState<FinanceTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [editMethod, setEditMethod] = useState('');
  const [editReference, setEditReference] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const openEdit = (t: FinanceTransaction) => {
    setEditTarget(t);
    setEditAmount(String(t.amount || 0));
    setEditDate(t.date || todayISO());
    setEditAccountId(t.accountId || '');
    setEditMethod(t.paymentMethod || methods[0]);
    setEditReference(t.reference || '');
  };

  const submitEdit = async () => {
    if (isEditing) return;
    const t = editTarget;
    if (!t || !firestore) return;
    const amt = Math.round(Number(editAmount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!editAccountId) { toast({ variant: 'destructive', title: 'Select an account' }); return; }
    setIsEditing(true);
    try {
      updateDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.transactions, t.id), {
        status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      const createdByName = user?.displayName || user?.email?.split('@')[0] || 'Staff';
      const newTxnRef = await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
        type: 'income', amount: amt, date: editDate, accountId: editAccountId, paymentMethod: editMethod,
        clientId: t.clientId ?? null, clientName: t.clientName ?? null,
        bookingId: t.bookingId ?? null, bookingPaymentId: t.bookingPaymentId ?? null,
        reference: editReference.trim() || null, remarks: t.remarks ?? null,
        status: 'completed', source: t.source ?? 'manual',
        createdAt: serverTimestamp(), createdBy: user?.uid ?? null, createdByName,
        updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      if (!newTxnRef) { toast({ variant: 'destructive', title: 'Failed to save correction' }); return; }
      if (t.bookingId && t.bookingPaymentId) {
        const booking = (bookings ?? []).find((b) => b.id === t.bookingId);
        if (booking) {
          const bookingRef = doc(firestore, 'bookings', t.bookingId);
          const bookingUpdate = withReconciledPaymentEdit(
            booking, t.bookingPaymentId,
            { amount: amt, date: editDate, reference: editReference.trim() || undefined },
            newTxnRef.id
          );
          try {
            await updateDoc(bookingRef, { ...bookingUpdate, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
          } catch (error) {
            console.error(`[Firestore] updateDoc failed at ${bookingRef.path}:`, error);
            errorEmitter.emit(
              'permission-error',
              new FirestorePermissionError({ path: bookingRef.path, operation: 'update', requestResourceData: bookingUpdate })
            );
            toast({
              variant: 'destructive',
              title: 'Transaction corrected, but booking not updated',
              description: 'The finance record was fixed, but the booking's payment ledger failed to update. Contact an admin.',
            });
            return;
          }
        }
      }
      toast({ title: 'Payment corrected', description: `Updated to ${formatINR(amt)}.` });
      setEditTarget(null);
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <>
      <PageHeader title="Money In" description="Record money received into a company account." />
      <Card className="max-w-2xl border rounded-lg">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Amount (₹) *</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Into account *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Client (optional)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / receipt no." />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={!accountId || !amount || isSubmitting}>
              <ArrowDownCircle className="mr-2 h-4 w-4" />Record Money In
            </Button>
          </div>
          {activeAccounts.length === 0 && (
            <p className="text-sm text-yellow-700">Create an account first (Finance → Accounts) before recording money.</p>
          )}
        </CardContent>
      </Card>

      {/* Payments received — manual entries + collections from client bookings */}
      <Card className="border rounded-lg mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Payments received</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client name..."
                className="pl-9 h-9 w-56"
              />
            </div>
            <MonthSelect value={historyMonth} onChange={setHistoryMonth} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Into account</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{t.date ? format(new Date(t.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">
                    {t.clientName || '—'}
                    {isDerivedTxn(t) && <Badge variant="secondary" className="ml-2 bg-sky-100 text-sky-800 border-sky-200">Booking</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.paymentMethod || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.accountId ? (
                      <Link href={`/finance/transactions?account=${t.accountId}`} className="text-primary hover:underline">
                        {accById.get(t.accountId) ?? '—'}
                      </Link>
                    ) : 'Undeposited'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={t.reference || undefined}>{t.reference || '—'}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">{formatINR(t.amount || 0)}</TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    {isDerivedTxn(t) && !t.accountId && t.bookingPaymentId && (
                      <Button size="sm" variant="outline" onClick={() => openReconcile(t)}>
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />Reconcile
                      </Button>
                    )}
                    {!isDerivedTxn(t) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" aria-label="Edit" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {receipts.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              {search.trim()
                ? `No payments found for "${search.trim()}".`
                : `No payments received ${historyMonth ? 'in this period' : 'yet'}.`}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reconcileTarget} onOpenChange={(open) => !open && setReconcileTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile payment</DialogTitle>
            <DialogDescription>
              Move {reconcileTarget ? formatINR(reconcileTarget.amount || 0) : ''} collected from{' '}
              {reconcileTarget?.clientName || 'this client'} into a company account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Deposit into account *</Label>
            <Select value={reconcileAccountId} onValueChange={setReconcileAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileTarget(null)}>Cancel</Button>
            <Button onClick={submitReconcile} disabled={!reconcileAccountId || isReconciling}>Reconcile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit payment</DialogTitle>
            <DialogDescription>
              Correct the amount, date, account, method or reference — this cancels the original entry and records a corrected one in its place.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount (₹) *</Label>
              <Input type="number" min={0} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account *</Label>
              <Select value={editAccountId} onValueChange={setEditAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Select value={editMethod} onValueChange={setEditMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Reference</Label>
              <Input value={editReference} onChange={(e) => setEditReference(e.target.value)} placeholder="Txn / receipt no." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={!editAccountId || !editAmount || isEditing}>Save correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
