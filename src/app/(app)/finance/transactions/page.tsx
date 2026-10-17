'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { FinanceAccount, FinanceTransaction, FinanceTxnType, Booking } from '@/lib/types';
import { FINANCE_COLLECTIONS, bookingPaymentsAsTransactions, isDerivedTxn, accountBalance, accountBalanceLabel, matchesMonth } from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MonthSelect } from '@/components/finance/month-select';
import { useGlobalMonthFilter } from '@/components/finance/global-month-filter-provider';
import { MoreHorizontal, Ban, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, X } from 'lucide-react';

const TYPE_META: Record<FinanceTxnType, { label: string; cls: string; sign: string }> = {
  income: { label: 'Income', cls: 'bg-green-100 text-green-800 border-green-200', sign: '+' },
  expense: { label: 'Expense', cls: 'bg-red-100 text-red-800 border-red-200', sign: '−' },
  transfer: { label: 'Transfer', cls: 'bg-blue-100 text-blue-800 border-blue-200', sign: '' },
};

export default function TransactionsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { month: globalMonth } = useGlobalMonthFilter();

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions, isLoading } = useCollection<FinanceTransaction>(txnsQuery);
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings } = useCollection<Booking>(bookingsQuery);
  const allTxns = useMemo(
    () => [...(transactions ?? []), ...bookingPaymentsAsTransactions(bookings ?? [])],
    [transactions, bookings]
  );

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Arriving here via an account link (e.g. "click an account name to see
  // its transactions") pre-selects that account's filter. Read straight from
  // the URL (not useSearchParams()) to avoid forcing a Suspense boundary —
  // same approach used by the public intake page's ?org= param.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('account');
    if (id) setAccountFilter(id);
  }, []);

  const filteredAccount = accountFilter !== 'all' ? (accounts ?? []).find((a) => a.id === accountFilter) : undefined;
  const filteredAccountBalance = filteredAccount ? accountBalance(filteredAccount, transactions ?? []) : 0;

  // Picking a month fills From/To with that month's range — either can still
  // be tweaked afterward for a custom range (same pattern as Reconciliation's
  // filter bar).
  const onMonthChange = (m: string) => {
    setMonth(m);
    if (!m) { setDateFrom(''); setDateTo(''); return; }
    const [y, mo] = m.split('-').map(Number);
    const lastDay = new Date(y, mo, 0).getDate();
    setDateFrom(`${m}-01`);
    setDateTo(`${m}-${String(lastDay).padStart(2, '0')}`);
  };
  const clearDateFilters = () => { setMonth(''); setDateFrom(''); setDateTo(''); };

  const rows = useMemo(() => {
    let list = [...allTxns];
    if (typeFilter !== 'all') list = list.filter((t) => t.type === typeFilter);
    if (accountFilter !== 'all') list = list.filter((t) => t.accountId === accountFilter || t.toAccountId === accountFilter);
    if (dateFrom) list = list.filter((t) => (t.date || '') >= dateFrom);
    if (dateTo) list = list.filter((t) => (t.date || '') <= dateTo);
    if (globalMonth) list = list.filter((t) => matchesMonth(t.date, globalMonth));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.clientName ?? '').toLowerCase().includes(q) ||
        (t.supplierName ?? '').toLowerCase().includes(q) ||
        (t.categoryName ?? '').toLowerCase().includes(q) ||
        (t.reference ?? '').toLowerCase().includes(q) ||
        (t.remarks ?? '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [allTxns, typeFilter, accountFilter, dateFrom, dateTo, search, globalMonth]);

  const cancel = (t: FinanceTransaction) => {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.transactions, t.id),
      { status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null }, { merge: true });
    toast({ title: 'Transaction cancelled', description: 'Removed from balances (kept for the record).' });
  };

  return (
    <>
      <PageHeader title="Transactions" description="Every income, expense and transfer in one ledger." />

      {filteredAccount && (
        <div className="bg-card border rounded-lg p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Showing transactions for</p>
            <p className="text-lg font-semibold">{filteredAccount.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Current balance</p>
            <p className={`text-lg font-bold ${filteredAccountBalance < 0 ? 'text-red-600' : ''}`}>
              {accountBalanceLabel(filteredAccount, filteredAccountBalance)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-lg p-4 mb-6 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3">
          <Input placeholder="Search party, reference, remarks…" className="flex-1" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All accounts</SelectItem>
              {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Month</Label>
            <MonthSelect value={month} onChange={onMonthChange} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setMonth(''); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setMonth(''); }} />
          </div>
          {(month || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearDateFilters}>
              <X className="mr-1 h-3.5 w-3.5" />Clear dates
            </Button>
          )}
        </div>
      </div>

      <Card className="border rounded-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Party / details</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && rows.map((t) => {
                const meta = TYPE_META[t.type];
                const Icon = t.type === 'income' ? ArrowDownCircle : t.type === 'expense' ? ArrowUpCircle : ArrowLeftRight;
                const cancelled = t.status === 'cancelled';
                return (
                  <TableRow key={t.id} className={cancelled ? 'opacity-50' : ''}>
                    <TableCell>{t.date ? format(new Date(t.date), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell><Badge variant="secondary" className={`gap-1 ${meta.cls}`}><Icon className="h-3 w-3" />{meta.label}</Badge></TableCell>
                    <TableCell className="text-sm">
                      {t.toAccountId
                        ? <>{accName.get(t.accountId) ?? '—'} <span className="text-muted-foreground">→</span> {accName.get(t.toAccountId) ?? '—'}</>
                        : (accName.get(t.accountId) ?? '—')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.clientName || t.supplierName || t.categoryName || t.remarks || '—'}
                      {t.paymentMethod && <span className="text-muted-foreground"> · {t.paymentMethod}</span>}
                      {t.reference && <span className="text-muted-foreground"> · {t.reference}</span>}
                      {t.source === 'booking' && <Badge variant="secondary" className="ml-2 bg-sky-100 text-sky-800 border-sky-200">Booking</Badge>}
                      {t.source === 'agent' && <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 border-amber-200">Agent expense</Badge>}
                      {cancelled && <Badge variant="secondary" className="ml-2">Cancelled</Badge>}
                    </TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${t.type === 'income' ? 'text-green-600' : t.type === 'expense' ? 'text-red-600' : ''}`}>
                      {meta.sign}{formatINR(t.amount || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {!cancelled && !isDerivedTxn(t) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Transaction actions"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive" onSelect={() => cancel(t)}>
                              <Ban className="mr-2 h-4 w-4" />Cancel (reverse)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!isLoading && rows.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No transactions match.</div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
