'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { FinanceAccount, FinanceTransaction, Booking } from '@/lib/types';
import {
  FINANCE_COLLECTIONS, accountBalance, accountBalanceLabel, totalBalance, isCashAccount,
  sumIncome, sumExpense, onDate, inMonth, todayISO, thisMonthISO, ACCOUNT_TYPE_LABELS,
  bookingPaymentsAsTransactions, matchesMonth, uptoMonth,
} from '@/lib/finance';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MonthSelect } from '@/components/finance/month-select';
import { useGlobalMonthFilter } from '@/components/finance/global-month-filter-provider';
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Landmark } from 'lucide-react';

export default function FinanceDashboardPage() {
  const firestore = useFirestore();
  const [month, setMonth] = useState(thisMonthISO());
  const { month: globalMonth } = useGlobalMonthFilter();
  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts, isLoading } = useCollection<FinanceAccount>(accountsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings } = useCollection<Booking>(bookingsQuery);
  // Manual finance transactions + income derived from client-booking payments.
  // NOTE: agent-logged expenses are intentionally NOT included — they are pending
  // reimbursements and only become a company expense when finance reimburses the
  // agent (which posts a real finance transaction from an account).
  const txns = useMemo(
    () => [
      ...(transactions ?? []),
      ...bookingPaymentsAsTransactions(bookings ?? []),
    ],
    [transactions, bookings]
  );
  const active = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);

  // Cash/Bank/Total are point-in-time balances — when a month is selected
  // (either this page's own selector or the sidebar's global one), they're
  // replayed as of the END of that month instead of "right now", by summing
  // only transactions dated on or before it. Local `month` wins when both are
  // set; an empty selection on both means "no cutoff" (today's live balance).
  const asOfMonth = month || globalMonth;
  const balanceTxns = useMemo(
    () => (asOfMonth ? txns.filter(uptoMonth(asOfMonth)) : txns),
    [txns, asOfMonth]
  );
  const cashAcc = totalBalance(active.filter(isCashAccount), balanceTxns);
  const bankAcc = totalBalance(active, balanceTxns) - cashAcc;
  // Money not tied to a finance account yet: booking collections (income) and
  // agent-logged expenses (out). Netted and split by how it moved — cash-mode
  // to Cash, everything else to Bank/Wallet.
  const undep = balanceTxns.filter((t) => t.status !== 'cancelled' && !t.accountId && (t.type === 'income' || t.type === 'expense'));
  const signed = (t: FinanceTransaction) => (t.type === 'income' ? 1 : -1) * (t.amount || 0);
  const isCashMethod = (t: FinanceTransaction) => (t.paymentMethod || '').toLowerCase() === 'cash';
  const cashUndep = undep.filter(isCashMethod).reduce((s, t) => s + signed(t), 0);
  const otherUndep = undep.reduce((s, t) => s + signed(t), 0) - cashUndep;
  const cash = cashAcc + cashUndep;
  const bank = bankAcc + otherUndep;
  const total = cash + bank;
  // Total Expenses is a flow (a sum over time), so it scopes to the selected
  // month when one is set — otherwise it's the all-time total, as before.
  const totalExpenses = sumExpense(txns, (t) => matchesMonth(t.date, globalMonth));
  const today = todayISO();
  const todayIn = sumIncome(txns, onDate(today));
  const todayOut = sumExpense(txns, onDate(today));
  // Global (sidebar) month filter ANDs on top of this page's own month
  // selector — an empty globalMonth ('All months') is a no-op.
  const matchesGlobal = (dateISO?: string) => matchesMonth(dateISO, globalMonth);
  const monthIn = sumIncome(txns, (t) => (month ? inMonth(month)(t) : true) && matchesGlobal(t.date));
  const monthOut = sumExpense(txns, (t) => (month ? inMonth(month)(t) : true) && matchesGlobal(t.date));
  const monthLabel = month ? format(new Date(`${month}-01`), 'MMMM yyyy') : 'selected period';
  const globalMonthLabel = globalMonth ? format(new Date(`${globalMonth}-01`), 'MMMM yyyy') : '';
  const asOfLabel = asOfMonth ? format(new Date(`${asOfMonth}-01`), 'MMMM yyyy') : '';

  const recent = useMemo(
    () => [...txns].filter((t) => matchesMonth(t.date, month) && matchesMonth(t.date, globalMonth)).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8),
    [txns, month, globalMonth]
  );

  const money = (n: number) => (isLoading ? '…' : formatINR(n));

  return (
    <>
      <PageHeader title="Finance Dashboard" description="Company cash flow at a glance.">
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelect value={month} onChange={setMonth} placeholder="All months" />
          <Button asChild><Link href="/finance/money-in"><ArrowDownCircle className="mr-2 h-4 w-4" />Money In</Link></Button>
          <Button variant="outline" asChild><Link href="/finance/money-out"><ArrowUpCircle className="mr-2 h-4 w-4" />Money Out</Link></Button>
          <Button variant="outline" asChild><Link href="/finance/transfers"><ArrowLeftRight className="mr-2 h-4 w-4" />Transfer</Link></Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={asOfLabel ? `Total Available Balance — as of ${asOfLabel}` : 'Total Available Balance'} value={money(total)} variant="success" />
        <StatCard title={asOfLabel ? `Cash Balance — as of ${asOfLabel}` : 'Cash Balance'} value={money(cash)} />
        <StatCard title={asOfLabel ? `Bank / Wallet — as of ${asOfLabel}` : 'Bank / Wallet Balance'} value={money(bank)} />
        <StatCard title={globalMonthLabel ? `Total Expenses — ${globalMonthLabel}` : 'Total Expenses'} value={money(totalExpenses)} variant="danger" />
      </div>
      <div className="grid gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Today's Collection" value={money(todayIn)} variant="success" />
        <StatCard title="Today's Expenses" value={money(todayOut)} variant="danger" />
        <StatCard title={month ? `Collection — ${monthLabel}` : 'Collection — all time'} value={money(monthIn)} variant="warning" />
        <StatCard title={month ? `Expenses — ${monthLabel}` : 'Expenses — all time'} value={money(monthOut)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account balances */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Accounts{asOfLabel ? ` — as of ${asOfLabel}` : ''}</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/finance/accounts">Manage</Link></Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {active.map((a) => {
                  const bal = accountBalance(a, balanceTxns);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <Link href={`/finance/transactions?account=${a.id}`} className="flex items-center gap-2 text-primary hover:underline">
                          <Landmark className="h-4 w-4 text-muted-foreground" />{a.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ACCOUNT_TYPE_LABELS[a.type]}</TableCell>
                      <TableCell className={`text-right font-semibold ${bal < 0 ? 'text-red-600' : ''}`}>{accountBalanceLabel(a, bal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!isLoading && active.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No accounts yet. <Link href="/finance/accounts" className="underline">Create one</Link>.</div>
            )}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent transactions</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/finance/transactions">View all</Link></Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Date</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((t) => (
                  <TableRow key={t.id} className={t.status === 'cancelled' ? 'opacity-50' : ''}>
                    <TableCell className="text-sm">{t.date ? format(new Date(t.date), 'dd MMM') : '—'}</TableCell>
                    <TableCell className="text-sm">
                      {t.type === 'transfer' ? (
                        <span className="text-blue-700">
                          Transfer ·{' '}
                          <Link href={`/finance/transactions?account=${t.accountId}`} className="hover:underline">{accName.get(t.accountId)}</Link>
                          {' → '}
                          <Link href={`/finance/transactions?account=${t.toAccountId}`} className="hover:underline">{accName.get(t.toAccountId ?? '')}</Link>
                        </span>
                      ) : (
                        <>
                          {t.clientName || t.supplierName || t.categoryName || (
                            <Link href={`/finance/transactions?account=${t.accountId}`} className="text-primary hover:underline">{accName.get(t.accountId) || '—'}</Link>
                          )}
                          {t.toAccountId && (
                            <span className="text-muted-foreground">
                              {' → '}
                              <Link href={`/finance/transactions?account=${t.toAccountId}`} className="hover:underline">{accName.get(t.toAccountId) ?? '—'}</Link>
                            </span>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${t.type === 'income' ? 'text-green-600' : t.type === 'expense' ? 'text-red-600' : ''}`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{formatINR(t.amount || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isLoading && recent.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
