'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, FinanceSupplier, ExpenseCategory, PaymentMethodDoc, FinanceTransaction } from '@/lib/types';
import { FINANCE_COLLECTIONS, DEFAULT_OUT_METHODS, DEFAULT_EXPENSE_CATEGORIES, todayISO, matchesMonth } from '@/lib/finance';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MonthSelect } from '@/components/finance/month-select';
import { useGlobalMonthFilter } from '@/components/finance/global-month-filter-provider';
import { AgentExpenseReview } from '@/components/finance/agent-expense-review';
import { ArrowUpCircle, Pencil } from 'lucide-react';

const NONE = '__none__';

export default function MoneyOutPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { month: globalMonth } = useGlobalMonthFilter();

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const suppliersQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.suppliers) : null), [firestore]);
  const { data: suppliers } = useCollection<FinanceSupplier>(suppliersQuery);
  const catsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.categories) : null), [firestore]);
  const { data: catDocs } = useCollection<ExpenseCategory>(catsQuery);
  const methodsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.methods) : null), [firestore]);
  const { data: methodDocs } = useCollection<PaymentMethodDoc>(methodsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);
  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s.name])), [suppliers]);
  const accById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);

  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const walletAccounts = useMemo(() => activeAccounts.filter((a) => a.type === 'wallet'), [activeAccounts]);
  const categories = useMemo(() => {
    const custom = (catDocs ?? []).filter((c) => c.active !== false).map((c) => c.name);
    return custom.length ? custom : DEFAULT_EXPENSE_CATEGORIES;
  }, [catDocs]);
  const methods = useMemo(() => {
    const custom = (methodDocs ?? []).filter((m) => m.direction !== 'incoming' && m.active !== false).map((m) => m.name);
    return custom.length ? custom : DEFAULT_OUT_METHODS;
  }, [methodDocs]);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState(DEFAULT_OUT_METHODS[0]);
  const [supplierId, setSupplierId] = useState(NONE);
  const [category, setCategory] = useState(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [depositToWalletId, setDepositToWalletId] = useState(NONE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyMonth, setHistoryMonth] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('all');

  const chooseAccount = (v: string) => {
    setAccountId(v);
    // Can't deposit a wallet into itself — clear a now-invalid selection.
    if (v === depositToWalletId) setDepositToWalletId(NONE);
  };

  const expenses = useMemo(() => {
    const list = (transactions ?? []).filter(
      (t) =>
        t.type === 'expense' && t.status !== 'cancelled' && matchesMonth(t.date, historyMonth) && matchesMonth(t.date, globalMonth)
        && (filterAccountId === 'all' || t.accountId === filterAccountId)
    );
    const sorted = list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return historyMonth || globalMonth ? sorted : sorted.slice(0, 25);
  }, [transactions, historyMonth, filterAccountId, globalMonth]);

  const reset = () => { setAmount(''); setReference(''); setRemarks(''); setSupplierId(NONE); setDepositToWalletId(NONE); };

  const submit = async () => {
    if (isSubmitting) return;
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!accountId) { toast({ variant: 'destructive', title: 'Select an account' }); return; }
    if (!firestore) return;
    const supplier = supplierId !== NONE ? (suppliers ?? []).find((s) => s.id === supplierId) : undefined;
    // Paying out of a wallet that was already funded (and expensed) at
    // deposit time — don't count this draw-down as a second expense.
    const fromWallet = activeAccounts.find((a) => a.id === accountId)?.type === 'wallet';
    setIsSubmitting(true);
    try {
      await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
        type: 'expense', amount: amt, date, accountId, paymentMethod: method,
        toAccountId: depositToWalletId !== NONE ? depositToWalletId : null,
        excludeFromExpenseTotal: fromWallet,
        supplierId: supplier?.id ?? null, supplierName: supplier?.name ?? null,
        categoryName: category, categoryId: null,
        reference: reference.trim() || null, remarks: remarks.trim() || null,
        status: 'completed',
        createdAt: serverTimestamp(), createdBy: user?.uid ?? null,
        createdByName: user?.displayName || user?.email?.split('@')[0] || 'Staff',
        updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      toast({ title: 'Payment recorded', description: `${formatINR(amt)} paid out.` });
      reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit: correct or fill in details on an already-recorded expense.
  const [editTarget, setEditTarget] = useState<FinanceTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSupplierId, setEditSupplierId] = useState(NONE);
  const [editMethod, setEditMethod] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const openEdit = (t: FinanceTransaction) => {
    setEditTarget(t);
    setEditAmount(String(t.amount || 0));
    setEditDate(t.date || todayISO());
    setEditAccountId(t.accountId || '');
    setEditCategory(t.categoryName || categories[0]);
    setEditSupplierId(t.supplierId || NONE);
    setEditMethod(t.paymentMethod || methods[0]);
    setEditReference(t.reference || '');
    setEditRemarks(t.remarks || '');
  };

  const submitEdit = async () => {
    if (isEditing) return;
    const t = editTarget;
    if (!t || !firestore) return;
    const amt = Math.round(Number(editAmount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!editAccountId) { toast({ variant: 'destructive', title: 'Select an account' }); return; }
    const supplier = editSupplierId !== NONE ? (suppliers ?? []).find((s) => s.id === editSupplierId) : undefined;
    setIsEditing(true);
    try {
      updateDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.transactions, t.id), {
        status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      const createdByName = user?.displayName || user?.email?.split('@')[0] || 'Staff';
      await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
        type: 'expense', amount: amt, date: editDate, accountId: editAccountId, paymentMethod: editMethod,
        toAccountId: t.toAccountId ?? null,
        excludeFromExpenseTotal: t.excludeFromExpenseTotal ?? false,
        supplierId: supplier?.id ?? null, supplierName: supplier?.name ?? null,
        categoryName: editCategory, categoryId: null,
        reference: editReference.trim() || null, remarks: editRemarks.trim() || null,
        status: 'completed', source: t.source ?? 'manual',
        createdAt: serverTimestamp(), createdBy: user?.uid ?? null, createdByName,
        updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
      });
      toast({ title: 'Expense corrected', description: `Updated to ${formatINR(amt)}.` });
      setEditTarget(null);
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <>
      <PageHeader title="Money Out" description="Record an expense or supplier payment, and review agent-logged expenses." />
      <Tabs defaultValue="record">
        <TabsList>
          <TabsTrigger value="record">Record Expense</TabsTrigger>
          <TabsTrigger value="agent">Agent Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="record" className="mt-4">
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
              <Label>From account *</Label>
              <Select value={accountId} onValueChange={chooseAccount}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Supplier / Payee (optional)</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  // Suggest the supplier's linked account if one isn't already
                  // picked — never overrides a value already chosen.
                  if (!accountId) {
                    const linked = v !== NONE ? (suppliers ?? []).find((s) => s.id === v)?.linkedAccountId : undefined;
                    if (linked) chooseAccount(linked);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
            {walletAccounts.some((a) => a.id !== accountId) && (
              <div className="space-y-1">
                <Label>Deposit into wallet (optional)</Label>
                <Select value={depositToWalletId} onValueChange={setDepositToWalletId}>
                  <SelectTrigger><SelectValue placeholder="Not a wallet top-up" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not a wallet top-up</SelectItem>
                    {walletAccounts.filter((a) => a.id !== accountId).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Funds a supplier/portal wallet balance — still counts as an expense now; paying a booking cost out of that wallet later won&apos;t be counted again.</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / bill no." />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={!accountId || !amount || isSubmitting}>
              <ArrowUpCircle className="mr-2 h-4 w-4" />Record Money Out
            </Button>
          </div>
          {activeAccounts.length === 0 && (
            <p className="text-sm text-yellow-700">Create an account first (Finance → Accounts) before recording payments.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border rounded-lg mt-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Recent Expenses</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterAccountId} onValueChange={setFilterAccountId}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="From account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any account</SelectItem>
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
                <TableHead>Category</TableHead>
                <TableHead>Supplier / Payee</TableHead>
                <TableHead>From account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{t.date ? format(new Date(t.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">{t.categoryName || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.supplierName || (t.supplierId ? supplierById.get(t.supplierId) : null) || t.remarks || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <Link href={`/finance/transactions?account=${t.accountId}`} className="text-primary hover:underline">
                      {accById.get(t.accountId) ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-red-600">{formatINR(t.amount || 0)}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" aria-label="Edit" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {expenses.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No expenses match these filters.</div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="agent" className="mt-4">
          <AgentExpenseReview />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit expense</DialogTitle>
            <DialogDescription>
              Correct or fill in any detail — this cancels the original entry and records a corrected one in its place.
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
              <Label className="text-xs">From account *</Label>
              <Select value={editAccountId} onValueChange={setEditAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Supplier / Payee</Label>
              <Select value={editSupplierId} onValueChange={setEditSupplierId}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
            <div className="space-y-1">
              <Label className="text-xs">Reference</Label>
              <Input value={editReference} onChange={(e) => setEditReference(e.target.value)} placeholder="Txn / bill no." />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Remarks</Label>
              <Textarea rows={2} value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} />
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
