'use client';

import { useMemo, useState } from 'react';
import { collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, Client, PaymentMethodDoc, FinanceTransaction, Booking } from '@/lib/types';
import { FINANCE_COLLECTIONS, DEFAULT_IN_METHODS, todayISO, bookingPaymentsAsTransactions, isDerivedTxn } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDownCircle } from 'lucide-react';

const NONE = '__none__';

export default function MoneyInPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

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

  // All money received: manual finance income + collections derived from bookings.
  const receipts = useMemo(() => {
    const income = [
      ...(transactions ?? []).filter((t) => t.type === 'income'),
      ...bookingPaymentsAsTransactions(bookings ?? []),
    ].filter((t) => t.status !== 'cancelled');
    return income.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 25);
  }, [transactions, bookings]);
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

  const reset = () => { setAmount(''); setReference(''); setRemarks(''); setClientId(NONE); };

  const submit = () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!accountId) { toast({ variant: 'destructive', title: 'Select an account' }); return; }
    if (!firestore) return;
    const client = clientId !== NONE ? (clients ?? []).find((c) => c.id === clientId) : undefined;
    addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
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
            <Button onClick={submit} disabled={!accountId || !amount}>
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
        <CardHeader><CardTitle className="text-base">Payments received</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Into account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{t.date ? format(new Date(t.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">
                    {t.clientName || t.remarks || '—'}
                    {isDerivedTxn(t) && <Badge variant="secondary" className="ml-2 bg-sky-100 text-sky-800 border-sky-200">Booking</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.paymentMethod || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.accountId ? (accById.get(t.accountId) ?? '—') : 'Undeposited'}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">{formatINR(t.amount || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {receipts.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No payments received yet.</div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
