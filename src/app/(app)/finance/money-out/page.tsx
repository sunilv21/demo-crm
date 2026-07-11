'use client';

import { useMemo, useState } from 'react';
import { collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, FinanceSupplier, ExpenseCategory, PaymentMethodDoc } from '@/lib/types';
import { FINANCE_COLLECTIONS, DEFAULT_OUT_METHODS, DEFAULT_EXPENSE_CATEGORIES, todayISO } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentExpenseReview } from '@/components/finance/agent-expense-review';
import { ArrowUpCircle } from 'lucide-react';

const NONE = '__none__';

export default function MoneyOutPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const suppliersQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.suppliers) : null), [firestore]);
  const { data: suppliers } = useCollection<FinanceSupplier>(suppliersQuery);
  const catsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.categories) : null), [firestore]);
  const { data: catDocs } = useCollection<ExpenseCategory>(catsQuery);
  const methodsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.methods) : null), [firestore]);
  const { data: methodDocs } = useCollection<PaymentMethodDoc>(methodsQuery);

  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
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

  const reset = () => { setAmount(''); setReference(''); setRemarks(''); setSupplierId(NONE); };

  const submit = () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    if (!accountId) { toast({ variant: 'destructive', title: 'Select an account' }); return; }
    if (!firestore) return;
    const supplier = supplierId !== NONE ? (suppliers ?? []).find((s) => s.id === supplierId) : undefined;
    addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
      type: 'expense', amount: amt, date, accountId, paymentMethod: method,
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
              <Select value={accountId} onValueChange={setAccountId}>
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
              <Select value={supplierId} onValueChange={setSupplierId}>
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
            <Button onClick={submit} disabled={!accountId || !amount}>
              <ArrowUpCircle className="mr-2 h-4 w-4" />Record Money Out
            </Button>
          </div>
          {activeAccounts.length === 0 && (
            <p className="text-sm text-yellow-700">Create an account first (Finance → Accounts) before recording payments.</p>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="agent" className="mt-4">
          <AgentExpenseReview />
        </TabsContent>
      </Tabs>
    </>
  );
}
