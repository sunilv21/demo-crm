'use client';

import { useMemo, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { AgentExpense, FinanceAccount } from '@/lib/types';
import { FINANCE_COLLECTIONS, UNIFIED_METHODS, todayISO } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Wallet } from 'lucide-react';

type AgentGroup = { uid: string; name: string; pending: AgentExpense[]; reimbursed: AgentExpense[]; pendingTotal: number; reimbursedTotal: number };

export function AgentExpenseReview() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const expQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.agentExpenses) : null), [firestore]);
  const { data: expenses, isLoading } = useCollection<AgentExpense>(expQuery);
  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);

  const groups = useMemo<AgentGroup[]>(() => {
    const m = new Map<string, AgentGroup>();
    (expenses ?? []).forEach((e) => {
      const uid = e.createdBy || '—';
      const g = m.get(uid) ?? { uid, name: e.createdByName || 'Agent', pending: [], reimbursed: [], pendingTotal: 0, reimbursedTotal: 0 };
      if (e.reimbursed) { g.reimbursed.push(e); g.reimbursedTotal += e.amount || 0; }
      else { g.pending.push(e); g.pendingTotal += e.amount || 0; }
      m.set(uid, g);
    });
    return [...m.values()].sort((a, b) => b.pendingTotal - a.pendingTotal);
  }, [expenses]);

  const pendingTotal = groups.reduce((s, g) => s + g.pendingTotal, 0);
  const reimbursedTotal = groups.reduce((s, g) => s + g.reimbursedTotal, 0);

  const [target, setTarget] = useState<AgentGroup | null>(null);
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState(UNIFIED_METHODS[0]);
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);

  const openReimburse = (g: AgentGroup) => {
    setAccountId(activeAccounts[0]?.id ?? '');
    setMethod(UNIFIED_METHODS[0]);
    setDate(todayISO());
    setTarget(g);
  };

  const confirmReimburse = async () => {
    if (!firestore || !user || !target) return;
    if (!accountId) { toast({ variant: 'destructive', title: 'Select an account to pay from' }); return; }
    setSubmitting(true);
    try {
      // 1) Post the company expense (this is what counts in company expenses).
      const ref = await addDoc(collection(firestore, FINANCE_COLLECTIONS.transactions), {
        type: 'expense', amount: target.pendingTotal, date, accountId,
        categoryName: 'Agent Reimbursement', supplierName: target.name,
        remarks: `Reimbursed ${target.pending.length} expense(s) to ${target.name}`,
        paymentMethod: method, status: 'completed', source: 'manual',
        createdAt: serverTimestamp(), createdBy: user.uid,
        createdByName: user.displayName || user.email?.split('@')[0] || 'Finance',
        updatedAt: serverTimestamp(), updatedBy: user.uid,
      });
      // 2) Mark each of the agent's pending expenses as reimbursed.
      target.pending.forEach((e) => {
        setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.agentExpenses, e.id), {
          reimbursed: true, reimbursedAt: date, reimbursedTxnId: ref.id, updatedAt: serverTimestamp(), updatedBy: user.uid,
        }, { merge: true });
      });
      toast({ title: 'Reimbursed', description: `${formatINR(target.pendingTotal)} paid to ${target.name} — now a company expense.` });
      setTarget(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Reimbursement failed', description: err?.message ?? 'Try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const allRows = useMemo(() => [...(expenses ?? [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [expenses]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Pending reimbursement" value={formatINR(pendingTotal)} variant={pendingTotal > 0 ? 'warning' : 'default'} />
        <StatCard title="Reimbursed (company expense)" value={formatINR(reimbursedTotal)} variant="danger" />
      </div>

      <p className="text-sm text-muted-foreground">
        Agent expenses are <strong>pending reimbursements</strong> — they are <strong>not</strong> counted in company expenses until you
        reimburse the agent below. Reimbursing posts one expense from the chosen account.
      </p>

      {/* Per-agent pending, with reimburse action */}
      <Card className="border rounded-lg">
        <CardHeader><CardTitle className="text-base">By agent</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Already reimbursed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && groups.map((g) => (
                <TableRow key={g.uid}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-right font-semibold text-yellow-700">{formatINR(g.pendingTotal)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatINR(g.reimbursedTotal)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" disabled={g.pendingTotal <= 0} onClick={() => openReimburse(g)}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />Reimburse
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && groups.length === 0 && <div className="p-8 text-center text-muted-foreground">No agent expenses yet.</div>}
        </CardContent>
      </Card>

      {/* Full list with status */}
      <Card className="border rounded-lg">
        <CardHeader><CardTitle className="text-base">All agent expenses</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Agent</TableHead><TableHead>Category</TableHead>
                <TableHead>Spent on</TableHead><TableHead>Paid by</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{e.date ? format(new Date(e.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">{e.createdByName || 'Agent'}</TableCell>
                  <TableCell className="text-sm">{e.category || '—'}</TableCell>
                  <TableCell className="text-sm">{e.purpose || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.paymentMethod || '—'}</TableCell>
                  <TableCell>
                    {e.reimbursed
                      ? <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Reimbursed</Badge>
                      : <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatINR(e.amount || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {allRows.length === 0 && <div className="p-8 text-center text-muted-foreground">No agent expenses yet.</div>}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Reimburse {target?.name}</DialogTitle>
            <DialogDescription>
              Pay back {formatINR(target?.pendingTotal ?? 0)} for {target?.pending.length} expense(s). This posts a company expense from the selected account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Pay from account *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNIFIED_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={confirmReimburse} disabled={submitting || !accountId || (target?.pendingTotal ?? 0) <= 0}>
              {submitting ? 'Processing…' : `Reimburse ${formatINR(target?.pendingTotal ?? 0)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
