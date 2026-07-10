'use client';

import { useMemo, useState } from 'react';
import { collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, FinanceTransaction } from '@/lib/types';
import { FINANCE_COLLECTIONS, accountBalance, todayISO } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight } from 'lucide-react';

export default function TransfersPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);

  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const txns = transactions ?? [];

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [remarks, setRemarks] = useState('');

  const fromAcc = activeAccounts.find((a) => a.id === fromId);

  const submit = () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!fromId || !toId) { toast({ variant: 'destructive', title: 'Select both accounts' }); return; }
    if (fromId === toId) { toast({ variant: 'destructive', title: 'Choose two different accounts' }); return; }
    if (!firestore) return;
    addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
      type: 'transfer', amount: amt, date, accountId: fromId, toAccountId: toId,
      remarks: remarks.trim() || null, status: 'completed',
      createdAt: serverTimestamp(), createdBy: user?.uid ?? null,
      createdByName: user?.displayName || user?.email?.split('@')[0] || 'Staff',
      updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    });
    toast({ title: 'Transfer recorded', description: `${formatINR(amt)} moved between accounts.` });
    setAmount(''); setRemarks('');
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
              {fromAcc && <p className="text-xs text-muted-foreground">Balance: {formatINR(accountBalance(fromAcc, txns))}</p>}
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
            <Button onClick={submit} disabled={!fromId || !toId || !amount}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />Record Transfer
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
