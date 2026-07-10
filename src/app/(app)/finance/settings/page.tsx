'use client';

import { useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { ExpenseCategory, PaymentMethodDoc } from '@/lib/types';
import { FINANCE_COLLECTIONS, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_IN_METHODS, DEFAULT_OUT_METHODS } from '@/lib/finance';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Power } from 'lucide-react';

export default function FinanceSettingsPage() {
  const firestore = useFirestore();
  const { user } = useUser();

  const catsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.categories) : null), [firestore]);
  const { data: categories } = useCollection<ExpenseCategory>(catsQuery);
  const methodsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.methods) : null), [firestore]);
  const { data: methods } = useCollection<PaymentMethodDoc>(methodsQuery);

  const [catName, setCatName] = useState('');
  const [methodName, setMethodName] = useState('');
  const [methodDir, setMethodDir] = useState<'incoming' | 'outgoing'>('incoming');

  const addCategory = () => {
    if (!firestore || !catName.trim()) return;
    addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.categories), {
      name: catName.trim(), active: true, createdAt: serverTimestamp(), createdBy: user?.uid ?? null, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    });
    setCatName('');
  };
  const toggleCategory = (c: ExpenseCategory) => {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.categories, c.id), { active: c.active === false, updatedAt: serverTimestamp() }, { merge: true });
  };

  const addMethod = () => {
    if (!firestore || !methodName.trim()) return;
    addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.methods), {
      name: methodName.trim(), direction: methodDir, active: true, createdAt: serverTimestamp(), createdBy: user?.uid ?? null, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    });
    setMethodName('');
  };
  const toggleMethod = (m: PaymentMethodDoc) => {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.methods, m.id), { active: m.active === false, updatedAt: serverTimestamp() }, { merge: true });
  };

  return (
    <>
      <PageHeader title="Finance Settings" description="Configure expense categories and payment methods." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expense Categories</CardTitle>
            <CardDescription>Used when recording Money Out. Defaults apply until you add your own.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="New category" value={catName} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
              <Button onClick={addCategory} disabled={!catName.trim()}><PlusCircle className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(categories ?? []).length === 0 && DEFAULT_EXPENSE_CATEGORIES.map((c) => (
                <Badge key={c} variant="secondary">{c} <span className="ml-1 text-muted-foreground">(default)</span></Badge>
              ))}
              {(categories ?? []).map((c) => (
                <button key={c.id} onClick={() => toggleCategory(c)} className="focus:outline-none">
                  <Badge variant="secondary" className={c.active === false ? 'opacity-50' : ''}>
                    {c.name}{c.active === false && <span className="ml-1"><Power className="inline h-3 w-3" /></span>}
                  </Badge>
                </button>
              ))}
            </div>
            {(categories ?? []).length > 0 && <p className="text-xs text-muted-foreground">Click a category to deactivate/reactivate it.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
            <CardDescription>Incoming (Money In) and outgoing (Money Out) methods. Defaults apply until you add your own.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="New method" value={methodName} onChange={(e) => setMethodName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMethod()} />
              <Select value={methodDir} onValueChange={(v) => setMethodDir(v as 'incoming' | 'outgoing')}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">Incoming</SelectItem>
                  <SelectItem value="outgoing">Outgoing</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addMethod} disabled={!methodName.trim()}><PlusCircle className="h-4 w-4" /></Button>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Incoming</p>
              <div className="flex flex-wrap gap-2">
                {(methods ?? []).filter((m) => m.direction === 'incoming').length === 0 && DEFAULT_IN_METHODS.map((m) => <Badge key={m} variant="secondary">{m} <span className="ml-1 text-muted-foreground">(default)</span></Badge>)}
                {(methods ?? []).filter((m) => m.direction === 'incoming').map((m) => (
                  <button key={m.id} onClick={() => toggleMethod(m)} className="focus:outline-none"><Badge variant="secondary" className={m.active === false ? 'opacity-50' : ''}>{m.name}</Badge></button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Outgoing</p>
              <div className="flex flex-wrap gap-2">
                {(methods ?? []).filter((m) => m.direction === 'outgoing').length === 0 && DEFAULT_OUT_METHODS.map((m) => <Badge key={m} variant="secondary">{m} <span className="ml-1 text-muted-foreground">(default)</span></Badge>)}
                {(methods ?? []).filter((m) => m.direction === 'outgoing').map((m) => (
                  <button key={m.id} onClick={() => toggleMethod(m)} className="focus:outline-none"><Badge variant="secondary" className={m.active === false ? 'opacity-50' : ''}>{m.name}</Badge></button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
