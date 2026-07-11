'use client';

import { useMemo, useState } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { FinanceAccount, FinanceTransaction, Booking, User as StaffUser } from '@/lib/types';
import { FINANCE_COLLECTIONS, accountBalance, sumIncome, sumExpense, inMonth, thisMonthISO, bookingPaymentsAsTransactions, bookingAgentId } from '@/lib/finance';
import { formatINR, formatINRCompact } from '@/lib/utils';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ResponsiveContainer, ComposedChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const live = (t: FinanceTransaction) => t.status !== 'cancelled';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The app's validated categorical theme (used in fixed order, never cycled).
const CHART = (n: number) => `hsl(var(--chart-${(n % 5) + 1}))`;
const INCOME_C = 'hsl(var(--chart-2))';
const EXPENSE_C = 'hsl(var(--chart-4))';
const typeLabel = (s: string) => (s === 'car' ? 'Transfer' : s.charAt(0).toUpperCase() + s.slice(1));

function groupSum(txns: FinanceTransaction[], keyFn: (t: FinanceTransaction) => string) {
  const m = new Map<string, number>();
  txns.forEach((t) => { const k = keyFn(t) || '—'; m.set(k, (m.get(k) || 0) + (t.amount || 0)); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function FinanceReportsPage() {
  const firestore = useFirestore();
  const [month, setMonth] = useState(thisMonthISO());

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings } = useCollection<Booking>(bookingsQuery);
  const txns = useMemo(
    () => [...(transactions ?? []), ...bookingPaymentsAsTransactions(bookings ?? [])],
    [transactions, bookings]
  );
  const monthTxns = useMemo(() => txns.filter((t) => live(t) && inMonth(month)(t)), [txns, month]);

  const income = sumIncome(monthTxns);
  const expense = sumExpense(monthTxns);
  const byCategory = useMemo(() => groupSum(monthTxns.filter((t) => t.type === 'expense'), (t) => t.categoryName ?? 'Uncategorised'), [monthTxns]);
  const bySupplier = useMemo(() => groupSum(monthTxns.filter((t) => t.type === 'expense' && t.supplierName), (t) => t.supplierName ?? ''), [monthTxns]);

  // Collections grouped by the type of the booking they came from.
  const bookingType = useMemo(() => new Map((bookings ?? []).map((b) => [b.id, b.bookingType || 'other'])), [bookings]);
  const byBookingType = useMemo(
    () => groupSum(
      monthTxns.filter((t) => t.type === 'income' && t.bookingId),
      (t) => String(bookingType.get(t.bookingId ?? '') ?? 'other'),
    ),
    [monthTxns, bookingType],
  );
  const cap = (s: string) => (s === 'car' ? 'Transfer' : s.charAt(0).toUpperCase() + s.slice(1));

  const usersQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'users') : null), [firestore]);
  const { data: users } = useCollection<StaffUser>(usersQuery);
  const userName = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.name || u.email?.split('@')[0] || 'User'])), [users]);
  const userRole = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.role])), [users]);

  const year = month.slice(0, 4);

  // Monthly income/expense across the selected year (drives the line chart).
  const monthly = useMemo(() => MONTHS.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const mtx = txns.filter((t) => live(t) && inMonth(key)(t));
    return { name, income: sumIncome(mtx), expense: sumExpense(mtx) };
  }), [txns, year]);

  // Forecast: trailing 3-month average of the months that have activity.
  const forecast = useMemo(() => {
    const withData = monthly.filter((m) => m.income > 0 || m.expense > 0);
    const recent = withData.slice(-3);
    const avg = (k: 'income' | 'expense') => recent.length ? Math.round(recent.reduce((s, m) => s + m[k], 0) / recent.length) : 0;
    return { income: avg('income'), expense: avg('expense') };
  }, [monthly]);

  // Line-chart data: 12 actual months + 2 projected (dashed) months.
  const flowData = useMemo(() => {
    const lastIdx = monthly.reduce((acc, m, i) => (m.income > 0 || m.expense > 0 ? i : acc), -1);
    const rows: any[] = monthly.map((m, i) => ({
      name: m.name, income: m.income, expense: m.expense,
      projInc: i === lastIdx ? m.income : null, projExp: i === lastIdx ? m.expense : null,
    }));
    if (lastIdx >= 0) {
      rows.push({ name: '+1', income: null, expense: null, projInc: forecast.income, projExp: forecast.expense });
      rows.push({ name: '+2', income: null, expense: null, projInc: forecast.income, projExp: forecast.expense });
    }
    return rows;
  }, [monthly, forecast]);

  // Collections by the owning sales agent for the year.
  const bookingById = useMemo(() => new Map((bookings ?? []).map((b) => [b.id, b])), [bookings]);
  const byAgent = useMemo(() => {
    const yearTxns = txns.filter((t) => live(t) && t.type === 'income' && t.bookingId && String(t.date).slice(0, 4) === year);
    const m = new Map<string, number>();
    yearTxns.forEach((t) => {
      const b = bookingById.get(t.bookingId ?? '');
      const uid = b ? bookingAgentId(b, (id) => userRole.get(id)) : null;
      if (!uid) return;
      m.set(uid, (m.get(uid) || 0) + (t.amount || 0));
    });
    return [...m.entries()]
      .map(([uid, value]) => ({ name: userName.get(uid) || 'Unknown', value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [txns, year, bookingById, userName, userRole]);

  const pieData = byBookingType.map(([k, v]) => ({ name: typeLabel(k), value: v }));

  return (
    <>
      <PageHeader title="Reports" description="Monthly cash-flow summary, expenses by category and supplier." />

      <div className="bg-card border rounded-lg p-4 mb-6 flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[180px]" />
        </div>
      </div>

      <div className="grid gap-4 mb-8 sm:grid-cols-3">
        <StatCard title="Collection (Income)" value={formatINR(income)} variant="success" />
        <StatCard title="Expenses" value={formatINR(expense)} variant="danger" />
        <StatCard title="Net" value={formatINR(income - expense)} variant={income - expense >= 0 ? 'success' : 'warning'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Collections by booking type</CardTitle>
            {byBookingType.length > 0 && (
              <p className="text-sm text-muted-foreground">Most collection came from <span className="font-medium text-foreground">{cap(byBookingType[0][0])}</span> ({formatINR(byBookingType[0][1])}).</p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Booking type</TableHead><TableHead className="text-right">Collected</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
              <TableBody>
                {byBookingType.map(([k, v]) => {
                  const totalTyped = byBookingType.reduce((s, [, x]) => s + x, 0) || 1;
                  return (
                    <TableRow key={k}>
                      <TableCell className="capitalize">{cap(k)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(v)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{Math.round((v / totalTyped) * 100)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {byBookingType.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No booking collections this month.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Expenses by category</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {byCategory.map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="text-right font-medium">{formatINR(v)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
            {byCategory.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No expenses this month.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Supplier payments</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {bySupplier.map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="text-right font-medium">{formatINR(v)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
            {bySupplier.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No supplier payments this month.</div>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Account balances (current)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
              <TableBody>
                {(accounts ?? []).filter((a) => a.status !== 'inactive').map((a) => (
                  <TableRow key={a.id}><TableCell>{a.name}</TableCell><TableCell className="text-right font-semibold">{formatINR(accountBalance(a, txns))}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Charts, share & forecast (bottom) ---------------- */}
      <div className="mt-8 space-y-6">
        <h2 className="text-lg font-semibold tracking-tight">Trends, share &amp; forecast</h2>

        {/* Cash-flow line chart with 2-month projection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash flow — {year}</CardTitle>
            <CardDescription>Monthly income vs expense; the dashed lines project the next 2 months from the trailing 3-month average.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={flowData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={(v) => formatINRCompact(Number(v))} tickLine={false} axisLine={false} width={60} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v: any, n: any) => [formatINR(Number(v) || 0), n]}
                  contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" name="Income" stroke={INCOME_C} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="expense" name="Expense" stroke={EXPENSE_C} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="projInc" name="Projected income" stroke={INCOME_C} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="projExp" name="Projected expense" stroke={EXPENSE_C} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-2 text-sm text-muted-foreground">
              Projected next month ≈ <span className="font-medium text-green-600">{formatINR(forecast.income)}</span> collected ·{' '}
              <span className="font-medium text-red-600">{formatINR(forecast.expense)}</span> spent.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pie — collection share by booking type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Collection share by booking type</CardTitle>
              <CardDescription>Share of this month's booking collections.</CardDescription>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={290}>
                  <PieChart>
                    <Pie
                      data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={55} outerRadius={100} paddingAngle={2}
                      label={(e: any) => `${e.name} ${Math.round((e.percent || 0) * 100)}%`} labelLine={false}
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={CHART(i)} stroke="hsl(var(--background))" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [formatINR(Number(v) || 0), n]} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="p-10 text-center text-sm text-muted-foreground">No booking collections this month.</div>}
            </CardContent>
          </Card>

          {/* Bar — agent collections */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agent performance — {year}</CardTitle>
              <CardDescription>Top agents by amount collected this year.</CardDescription>
            </CardHeader>
            <CardContent>
              {byAgent.length > 0 ? (
                <ResponsiveContainer width="100%" height={290}>
                  <BarChart data={byAgent} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={(v) => formatINRCompact(Number(v))} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip formatter={(v: any) => [formatINR(Number(v) || 0), 'Collected']} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', fontSize: 12 }} />
                    <Bar dataKey="value" name="Collected" fill={CHART(0)} radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="p-10 text-center text-sm text-muted-foreground">No agent collections this year.</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
