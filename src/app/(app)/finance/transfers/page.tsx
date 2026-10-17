'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, FinanceTransaction } from '@/lib/types';
import { FINANCE_COLLECTIONS, accountBalance, accountBalanceLabel, todayISO, matchesMonth } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MonthSelect } from '@/components/finance/month-select';
import { useGlobalMonthFilter } from '@/components/finance/global-month-filter-provider';
import { ArrowLeftRight } from 'lucide-react';

export default function TransfersPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { month: globalMonth } = useGlobalMonthFilter();

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);

  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const accById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);
  const txns = transactions ?? [];

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyMonth, setHistoryMonth] = useState('');
  const [filterFromId, setFilterFromId] = useState('all');
  const [filterToId, setFilterToId] = useState('all');

  const transfers = useMemo(
    () => (transactions ?? [])
      .filter((t) =>
        t.type === 'transfer'
        && matchesMonth(t.date, historyMonth)
        && matchesMonth(t.date, globalMonth)
        && (filterFromId === 'all' || t.accountId === filterFromId)
        && (filterToId === 'all' || t.toAccountId === filterToId)
      )
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [transactions, historyMonth, filterFromId, filterToId, globalMonth]
  );

  const fromAcc = activeAccounts.find((a) => a.id === fromId);
  const fromBalance = fromAcc ? accountBalance(fromAcc, txns) : 0;

  const submit = async () => {
    if (isSubmitting) return;
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!fromId || !toId) { toast({ variant: 'destructive', title: 'Select both accounts' }); return; }
    if (fromId === toId) { toast({ variant: 'destructive', title: 'Choose two different accounts' }); return; }
    if (!firestore) return;
    setIsSubmitting(true);
    try {
      await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
        type: 'transfer', amount: amt, date, accountId: fromId, toAccountId: toId,
        remarks: remarks.trim() || null, status: 'completed',
        createdAt: serverTimestamp(), createdBy: user?.uid ?? null,
        createdByName: user?.displayName || user?.email?.split('@')[0] || 'Staff',
        updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      toast({ title: 'Transfer recorded', description: `${formatINR(amt)} moved between accounts.` });
      setAmount(''); setRemarks('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="Internal Transfers" description="Move money between company accounts (no income or expense created)." />
      <Card className="max-w-2xl border rounded-lg">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>From account *</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>{activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              {fromAcc && (
                <p className={`text-xs ${fromBalance < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  Balance: {accountBalanceLabel(fromAcc, fromBalance)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>To account *</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>{activeAccounts.filter((a) => a.id !== fromId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount (₹) *</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={!fromId || !toId || !amount || isSubmitting}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />Record Transfer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border rounded-lg mt-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Recent Transfers</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterFromId} onValueChange={setFilterFromId}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="From account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any from account</SelectItem>
                {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterToId} onValueChange={setFilterToId}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="To account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any to account</SelectItem>
                {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <MonthSelect value={historyMonth} onChange={setHistoryMonth} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => (
                <TableRow key={t.id} className={t.status === 'cancelled' ? 'opacity-50' : ''}>
                  <TableCell className="text-sm">{t.date ? format(new Date(t.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">
                    <Link href={`/finance/transactions?account=${t.accountId}`} className="text-primary hover:underline">
                      {accById.get(t.accountId) ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.toAccountId ? (
                      <Link href={`/finance/transactions?account=${t.toAccountId}`} className="text-primary hover:underline">
                        {accById.get(t.toAccountId) ?? '—'}
                      </Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.remarks || '—'}</TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">{formatINR(t.amount || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {transfers.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No transfers match these filters.</div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
