'use client';

import { useMemo, useState } from 'react';
import { collection, doc, query, serverTimestamp, where } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { AgentExpense } from '@/lib/types';
import { FINANCE_COLLECTIONS, DEFAULT_EXPENSE_CATEGORIES, UNIFIED_METHODS, todayISO } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Receipt } from 'lucide-react';

export function AgentExpenses() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const q = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, FINANCE_COLLECTIONS.agentExpenses), where('createdBy', '==', user.uid)) : null),
    [firestore, user]
  );
  const { data: expenses, isLoading } = useCollection<AgentExpense>(q);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [purpose, setPurpose] = useState('');
  const [payee, setPayee] = useState('');
  const [method, setMethod] = useState(UNIFIED_METHODS[0]);

  const rows = useMemo(
    () => [...(expenses ?? [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [expenses]
  );
  const total = rows.reduce((s, e) => s + (e.amount || 0), 0);

  const add = () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!firestore || !user) return;
    addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.agentExpenses), {
      amount: amt, date, category, purpose: purpose.trim() || null, payee: payee.trim() || null, paymentMethod: method,
      createdAt: serverTimestamp(), createdBy: user.uid,
      createdByName: user.displayName || user.email?.split('@')[0] || 'Agent',
      updatedAt: serverTimestamp(), updatedBy: user.uid,
    });
    toast({ title: 'Expense added', description: `${formatINR(amt)} recorded.` });
    setAmount(''); setPurpose(''); setPayee('');
  };

  const remove = (id: string) => {
    if (!firestore) return;
    deleteDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.agentExpenses, id));
    toast({ title: 'Expense removed' });
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> My Expenses</CardTitle>
        <CardDescription>Log what you spend on the business — it flows into the company Finance module. Total this list: <span className="font-medium text-foreground">{formatINR(total)}</span></CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Amount (₹) *</Label>
            <Input type="number" min={0} value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category (what for)</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{DEFAULT_EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Spent on / description</Label>
            <Input value={purpose} placeholder="e.g. Client passport courier" onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Where / paid to</Label>
            <Input value={payee} placeholder="e.g. Blue Dart" onChange={(e) => setPayee(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Paid by</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNIFIED_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-3">
            <Button onClick={add} disabled={!amount}><PlusCircle className="mr-2 h-4 w-4" />Add Expense</Button>
          </div>
        </div>

        {/* List */}
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Spent on</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{e.date ? format(new Date(e.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">{e.category || '—'}</TableCell>
                  <TableCell className="text-sm">{e.purpose || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.payee || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.paymentMethod || '—'}</TableCell>
                  <TableCell className="text-right font-medium text-red-600">{formatINR(e.amount || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete expense" onClick={() => remove(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && rows.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No expenses logged yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
