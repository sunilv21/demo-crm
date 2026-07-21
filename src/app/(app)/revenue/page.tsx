'use client';

import { PageHeader } from '@/components/common/page-header';
import { OverviewChart, type MonthlyRevenue } from '@/components/dashboard/overview-chart';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc, query, serverTimestamp, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Booking, Payment, PaymentMode } from '@/lib/types';
import { cn, formatINR, toDateSafe, bookingPaid, PAYMENT_MODE_LABELS } from '@/lib/utils';
import { ledgerFor, newPaymentId, withAddedPayment, withEditedPayment } from '@/lib/payments';
import { AgentExpenses } from '@/components/finance/agent-expenses';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  IndianRupee,
  TrendingUp,
  Percent,
  CalendarClock,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import { useMemo, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BAR_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const bookingRevenue = (b: Booking) => b.total || 0;
const bookingProfit = (b: Booking) =>
  b.profit ?? ((b.total || 0) - (b.supplierCost || 0));
/** Outstanding amount still to collect from the customer. */
const bookingBalance = (b: Booking) =>
  b.balanceAmount ?? Math.max(0, (b.total || 0) - (b.amountPaid || 0));

function pctChange(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function DeltaBadge({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-xs text-muted-foreground">No prior data</span>;
  }
  const up = change >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        up ? 'text-green-600' : 'text-red-600'
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(change)}% vs last month
    </span>
  );
}

/** Horizontal ranked breakdown (booking type / destination). */
function BreakdownList({
  title,
  description,
  rows,
  emptyLabel,
}: {
  title: string;
  description: string;
  rows: { label: string; value: number }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
        {rows.map((row, i) => (
          <div key={row.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium capitalize truncate pr-2">{row.label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{formatINR(row.value)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(3, (row.value / max) * 100)}%`,
                  backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function RevenuePage() {
  const firestore = useFirestore();
  const { canViewRevenue, authUser, isLoading: isUserLoading } = useAppUser();
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  // Month selected for the comparison cards (0-11).
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [collectTarget, setCollectTarget] = useState<{
    clientName: string;
    balance: number;
    bookings: Booking[];
  } | null>(null);
  // Single total amount received from the client (as typed), plus payment meta.
  const [collectAmount, setCollectAmount] = useState('');
  const [collectDate, setCollectDate] = useState(new Date().toISOString().slice(0, 10));
  const [collectMode, setCollectMode] = useState<PaymentMode>('cash');
  const [collectRef, setCollectRef] = useState('');

  const openCollect = (group: { clientName: string; balance: number; bookings: Booking[] }) => {
    setCollectAmount(String(group.balance));
    setCollectDate(new Date().toISOString().slice(0, 10));
    setCollectMode('cash');
    setCollectRef('');
    setCollectTarget(group);
  };

  // What we'll actually apply, clamped to the client's outstanding total.
  const collectingTotal = collectTarget
    ? Math.min(Math.max(0, Number(collectAmount) || 0), collectTarget.balance)
    : 0;

  const saveCollection = () => {
    if (!firestore || !authUser || !collectTarget) return;
    let remaining = collectingTotal;
    if (remaining <= 0) {
      toast({
        title: 'Nothing recorded',
        description: 'Enter an amount greater than zero to record a collection.',
        variant: 'destructive',
      });
      return;
    }

    // Allocate the received amount across the client's bookings, oldest first.
    const ordered = [...collectTarget.bookings].sort(
      (a, b) => (toDateSafe(a.createdAt)?.getTime() ?? 0) - (toDateSafe(b.createdAt)?.getTime() ?? 0)
    );

    let applied = 0;
    const payDate = collectDate || new Date().toISOString().slice(0, 10);
    for (const b of ordered) {
      if (remaining <= 0) break;
      const balance = bookingBalance(b);
      if (balance <= 0) continue;
      const received = Math.min(remaining, balance);
      remaining -= received;
      applied += received;
      // Record as a ledger entry so it shows up in the booking's Payments view.
      const payment: Payment = {
        id: newPaymentId(),
        amount: received,
        date: payDate,
        mode: collectMode,
        reference: collectRef.trim() || 'Collection',
        createdAt: new Date().toISOString(),
        createdBy: authUser.uid,
        createdByName: authUser.displayName || authUser.email?.split('@')[0] || 'Staff',
      };
      updateDocumentNonBlocking(doc(firestore, 'bookings', b.id), {
        ...withAddedPayment(b, payment),
        updatedAt: serverTimestamp(),
        updatedBy: authUser.uid,
      });
    }

    toast({
      title: 'Collection recorded',
      description: `${formatINR(applied)} collected from ${collectTarget.clientName}.`,
    });
    setCollectTarget(null);
  };

  // Correct a recorded collection (amount / date / method / reference) after
  // the fact — covers fat-finger entry mistakes on the collect flow.
  const [editTarget, setEditTarget] = useState<{
    bookingId: string;
    paymentId: string;
    clientName: string;
    amount: string;
    date: string;
    mode: PaymentMode;
    reference: string;
    maxAmount: number;
  } | null>(null);

  const openEditPayment = (p: {
    bookingId: string;
    paymentId: string;
    clientName: string;
    date: string;
    mode: PaymentMode;
    amount: number;
    reference: string;
  }) => {
    const b = (bookings ?? []).find((x) => x.id === p.bookingId);
    const balance = b ? bookingBalance(b) : 0;
    setEditTarget({
      bookingId: p.bookingId,
      paymentId: p.paymentId,
      clientName: p.clientName,
      amount: String(p.amount),
      date: p.date || new Date().toISOString().slice(0, 10),
      mode: p.mode,
      reference: p.reference,
      // Room to increase the amount: current value plus whatever's still outstanding.
      maxAmount: balance + p.amount,
    });
  };

  const saveEditPayment = () => {
    if (!firestore || !authUser || !editTarget) return;
    const b = (bookings ?? []).find((x) => x.id === editTarget.bookingId);
    if (!b) return;
    const amt = Math.round(Number(editTarget.amount) || 0);
    if (amt <= 0) {
      toast({ variant: 'destructive', title: 'Enter a valid amount', description: 'Amount must be greater than zero.' });
      return;
    }
    if (amt > editTarget.maxAmount) {
      toast({
        variant: 'destructive',
        title: 'Amount too high',
        description: `Cannot exceed ${formatINR(editTarget.maxAmount)} for this booking.`,
      });
      return;
    }
    updateDocumentNonBlocking(doc(firestore, 'bookings', b.id), {
      ...withEditedPayment(b, editTarget.paymentId, {
        amount: amt,
        date: editTarget.date || undefined,
        mode: editTarget.mode,
        reference: editTarget.reference.trim() || undefined,
      }),
      updatedAt: serverTimestamp(),
      updatedBy: authUser.uid,
    });
    toast({ title: 'Collection updated', description: `${formatINR(amt)} recorded for ${editTarget.clientName}.` });
    setEditTarget(null);
  };

  // Revenue is private to each agent — only ever read the bookings they own.
  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore || !canViewRevenue || !authUser) return null;
    return query(collection(firestore, 'bookings'), where('createdBy', '==', authUser.uid));
  }, [firestore, canViewRevenue, authUser]);

  const { data: bookings, isLoading: isLoadingBookings } = useCollection<Booking>(bookingsQuery);

  const stats = useMemo(() => {
    // Count every booking (hold, confirmed, draft, pending...) except cancelled.
    const countable = (bookings ?? []).filter((b) => b.status !== 'cancelled');

    // Attach the creation date (revenue is attributed to the created month).
    const withDate = countable.map((b) => ({ b, date: toDateSafe(b.createdAt) }));

    // Comparison period: the selected month (within the selected year) vs the
    // month immediately before it (wrapping into the prior year for January).
    const selMonth = selectedMonth;
    const selYear = year;
    const prevMonth = selMonth === 0 ? 11 : selMonth - 1;
    const prevYear = selMonth === 0 ? selYear - 1 : selYear;

    const inMonth = (date: Date | null, m: number, y: number) =>
      !!date && date.getMonth() === m && date.getFullYear() === y;

    const forYear = withDate.filter(({ date }) => date && date.getFullYear() === year);

    const yearRevenue = forYear.reduce((s, { b }) => s + bookingRevenue(b), 0);
    const yearProfit = forYear.reduce((s, { b }) => s + bookingProfit(b), 0);
    const yearCount = forYear.length;
    const margin = yearRevenue ? Math.round((yearProfit / yearRevenue) * 100) : 0;

    const selMonthBookings = withDate.filter(({ date }) => inMonth(date, selMonth, selYear));
    const prevMonthBookings = withDate.filter(({ date }) => inMonth(date, prevMonth, prevYear));
    const thisMonthRevenue = selMonthBookings.reduce((s, { b }) => s + bookingRevenue(b), 0);
    const lastMonthRevenue = prevMonthBookings.reduce((s, { b }) => s + bookingRevenue(b), 0);
    const thisMonthProfit = selMonthBookings.reduce((s, { b }) => s + bookingProfit(b), 0);
    const lastMonthProfit = prevMonthBookings.reduce((s, { b }) => s + bookingProfit(b), 0);
    const thisMonthLabel = `${MONTHS[selMonth]} ${selYear}`;
    const lastMonthLabel = `${MONTHS[prevMonth]} ${prevYear}`;

    // Bookings that still have money to collect, grouped into one row per client
    // so the balance shown is the client's combined outstanding, not per booking.
    const pendingBookings = forYear
      .map(({ b, date }) => ({ b, date, balance: bookingBalance(b) }))
      .filter(({ balance }) => balance > 0);
    const pendingCollections = pendingBookings.reduce((s, r) => s + r.balance, 0);

    // Money actually received this year, plus a recent-collections feed.
    const totalCollected = forYear.reduce((s, { b }) => s + bookingPaid(b), 0);
    const recentPayments = forYear
      .flatMap(({ b }) =>
        ledgerFor(b).map((p) => ({
          id: `${b.id}:${p.id}`,
          bookingId: b.id,
          paymentId: p.id,
          clientName: b.clientName || '—',
          date: p.date,
          mode: p.mode,
          amount: p.amount,
          reference: p.reference || '',
        }))
      )
      .filter((r) => r.amount > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 8);

    const clientMap = new Map<
      string,
      { clientName: string; balance: number; bookings: Booking[]; date: Date | null }
    >();
    for (const { b, date, balance } of pendingBookings) {
      const key = b.clientId || b.clientName || b.id;
      const existing = clientMap.get(key);
      if (existing) {
        existing.balance += balance;
        existing.bookings.push(b);
        if (date && (!existing.date || date > existing.date)) existing.date = date;
      } else {
        clientMap.set(key, { clientName: b.clientName || '—', balance, bookings: [b], date });
      }
    }
    const pendingClients = [...clientMap.values()].sort((a, b) => b.balance - a.balance);

    // Per-client revenue roll-up: our cost, customer price and profit, plus
    // outstanding balance so a collection can be triggered from the same row.
    const clientRevenueMap = new Map<
      string,
      {
        clientName: string;
        bookings: Booking[];
        ourCost: number;
        customerPrice: number;
        profit: number;
        balance: number;
        date: Date | null;
      }
    >();
    for (const { b, date } of forYear) {
      const key = b.clientId || b.clientName || b.id;
      const ourCost = b.supplierCost || 0;
      const customerPrice = bookingRevenue(b);
      const profit = bookingProfit(b);
      const balance = bookingBalance(b);
      const existing = clientRevenueMap.get(key);
      if (existing) {
        existing.bookings.push(b);
        existing.ourCost += ourCost;
        existing.customerPrice += customerPrice;
        existing.profit += profit;
        existing.balance += balance;
        if (date && (!existing.date || date > existing.date)) existing.date = date;
      } else {
        clientRevenueMap.set(key, {
          clientName: b.clientName || '—',
          bookings: [b],
          ourCost,
          customerPrice,
          profit,
          balance,
          date,
        });
      }
    }
    const clientRevenue = [...clientRevenueMap.values()].sort((a, b) => b.customerPrice - a.customerPrice);

    // Monthly chart for the selected year.
    const monthly: MonthlyRevenue[] = MONTHS.map((name, i) => {
      const rows = forYear.filter(({ date }) => date && date.getMonth() === i);
      return {
        name,
        total: rows.reduce((s, { b }) => s + bookingRevenue(b), 0),
        profit: rows.reduce((s, { b }) => s + bookingProfit(b), 0),
      };
    });

    // Breakdowns for the selected year.
    const byType = new Map<string, number>();
    const byDestination = new Map<string, number>();
    for (const { b } of forYear) {
      const type = (b.bookingType || 'other').toString();
      byType.set(type, (byType.get(type) || 0) + bookingRevenue(b));
      const dest = (b.destination || 'Unspecified').toString();
      byDestination.set(dest, (byDestination.get(dest) || 0) + bookingRevenue(b));
    }
    const toRows = (m: Map<string, number>, limit: number) =>
      [...m.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);

    // Recent bookings by creation date.
    const recent = [...forYear]
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
      .slice(0, 8);

    const years = Array.from(
      new Set(
        withDate
          .map(({ date }) => date?.getFullYear())
          .filter((y): y is number => typeof y === 'number')
      )
    );
    const currentYear = now.getFullYear();
    if (!years.includes(currentYear)) years.push(currentYear);
    years.sort((a, b) => b - a);

    return {
      yearRevenue,
      yearProfit,
      yearCount,
      margin,
      thisMonthRevenue,
      lastMonthRevenue,
      thisMonthProfit,
      lastMonthProfit,
      thisMonthLabel,
      lastMonthLabel,
      pendingCollections,
      pendingClients,
      clientRevenue,
      totalCollected,
      recentPayments,
      monthly,
      typeRows: toRows(byType, 5),
      destRows: toRows(byDestination, 5),
      recent,
      years,
    };
  }, [bookings, year, selectedMonth, now]);

  const isLoading = isUserLoading || isLoadingBookings;

  if (!isUserLoading && !canViewRevenue) {
    return (
      <>
        <PageHeader title="Revenue" description="Financial performance overview." />
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="rounded-full bg-muted p-3">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Revenue is restricted</p>
              <p className="text-sm text-muted-foreground">
                Revenue and profit figures are only visible to agent accounts.
              </p>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const monthChange = pctChange(stats.thisMonthRevenue, stats.lastMonthRevenue);

  return (
    <>
      <PageHeader title="Revenue" description="Attributed to the month each booking was created.">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {stats.years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <Tabs defaultValue="revenue" className="mt-2">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="expenses">My Expenses</TabsTrigger>
          <TabsTrigger value="clients">Revenue by Clients</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue" className="mt-4">

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={`Revenue in ${year}`}
          value={formatINR(stats.yearRevenue)}
          icon={IndianRupee}
          isLoading={isLoading}
          variant="warning"
          description={`${stats.yearCount} booking${stats.yearCount === 1 ? '' : 's'}`}
        />
        <StatCard
          title={`Profit in ${year}`}
          value={formatINR(stats.yearProfit)}
          icon={TrendingUp}
          isLoading={isLoading}
          variant="success"
          description={`${stats.margin}% average margin`}
        />
        <StatCard
          title="Collected"
          value={formatINR(stats.totalCollected)}
          icon={CheckCircle2}
          isLoading={isLoading}
          variant="success"
          description={`Received in ${year}`}
        />
        <StatCard
          title="Pending Collections"
          value={formatINR(stats.pendingCollections)}
          icon={Wallet}
          isLoading={isLoading}
          variant="danger"
          description="Outstanding balances"
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Monthly comparison</h2>
          <p className="text-sm text-muted-foreground">Compare any month against the one before it.</p>
        </div>
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i)}>
                {m} {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 mt-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stats.thisMonthLabel}</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(stats.thisMonthRevenue)}</div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Profit</span>
              <span className="font-semibold text-green-600">{formatINR(stats.thisMonthProfit)}</span>
            </div>
            <div className="mt-1">
              <DeltaBadge change={monthChange} />
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stats.lastMonthLabel}</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(stats.lastMonthRevenue)}</div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Profit</span>
              <span className="font-semibold text-green-600">{formatINR(stats.lastMonthProfit)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Previous month</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pending Collections</CardTitle>
            <CardDescription>Bookings with an outstanding customer balance in {year}</CardDescription>
          </div>
          <Badge variant="outline" className="text-sm">
            {stats.pendingClients.length} client{stats.pendingClients.length === 1 ? '' : 's'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Bookings</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.pendingClients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      All collections are settled. 🎉
                    </TableCell>
                  </TableRow>
                )}
                {stats.pendingClients.map((group) => (
                  <TableRow key={group.clientName + group.bookings[0].id}>
                    <TableCell className="font-medium">{group.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {group.bookings.length} booking{group.bookings.length === 1 ? '' : 's'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {group.date
                        ? group.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold text-red-600">
                      {formatINR(group.balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openCollect(group)}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Collect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <OverviewChart
          data={stats.monthly}
          isLoading={isLoading}
          title="Monthly Revenue & Profit"
          description={`Bookings created in ${year}, by month`}
          showProfit
          className=""
        />
      </div>

      <div className="grid gap-4 mt-4 lg:grid-cols-2">
        <BreakdownList
          title="Revenue by Booking Type"
          description={`Top categories in ${year}`}
          rows={stats.typeRows}
          emptyLabel="No bookings yet."
        />
        <BreakdownList
          title="Top Destinations"
          description={`Highest earning destinations in ${year}`}
          rows={stats.destRows}
          emptyLabel="No destinations recorded yet."
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent Collections</CardTitle>
          <CardDescription>Latest payments received in {year}. Use Edit to fix a wrongly entered amount, date, method or reference.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No collections recorded in {year}.
                    </TableCell>
                  </TableRow>
                )}
                {stats.recentPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.date
                        ? new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{PAYMENT_MODE_LABELS[p.mode] || p.mode}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-green-600">{formatINR(p.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEditPayment(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent Bookings</CardTitle>
          <CardDescription>Latest revenue booked in {year}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Booked</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No bookings in {year}.
                    </TableCell>
                  </TableRow>
                )}
                {stats.recent.map(({ b, date }) => {
                  const profit = bookingProfit(b);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.clientName || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {b.bookingType || 'other'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {date
                          ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatINR(bookingRevenue(b))}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono tabular-nums',
                          profit >= 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {formatINR(profit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          <AgentExpenses />
        </TabsContent>
        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Revenue by Clients</CardTitle>
                <CardDescription>Total cost, customer price and profit per client in {year}</CardDescription>
              </div>
              <Badge variant="outline" className="text-sm">
                {stats.clientRevenue.length} client{stats.clientRevenue.length === 1 ? '' : 's'}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Bookings</TableHead>
                      <TableHead className="text-right">Total (Our Cost)</TableHead>
                      <TableHead className="text-right">Customer Price</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.clientRevenue.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          No client revenue recorded in {year}.
                        </TableCell>
                      </TableRow>
                    )}
                    {stats.clientRevenue.map((row) => (
                      <TableRow key={row.clientName + row.bookings[0].id}>
                        <TableCell className="font-medium">{row.clientName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.bookings.length} booking{row.bookings.length === 1 ? '' : 's'}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatINR(row.ourCost)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatINR(row.customerPrice)}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono tabular-nums',
                            row.profit >= 0 ? 'text-green-600' : 'text-red-600'
                          )}
                        >
                          {formatINR(row.profit)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono tabular-nums',
                            row.balance > 0 ? 'font-semibold text-red-600' : 'text-muted-foreground'
                          )}
                        >
                          {formatINR(row.balance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.balance > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openCollect({
                                  clientName: row.clientName,
                                  balance: row.balance,
                                  bookings: row.bookings,
                                })
                              }
                            >
                              <CheckCircle2 className="mr-1.5 h-4 w-4" />
                              Collect
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Settled</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!collectTarget} onOpenChange={(open) => !open && setCollectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record collection — {collectTarget?.clientName}</DialogTitle>
            <DialogDescription>
              Enter the total amount received from the client. Enter less than the outstanding balance to record a part
              payment — the remainder stays outstanding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span className="text-muted-foreground">Outstanding balance</span>
              <span className="font-mono font-semibold">{formatINR(collectTarget?.balance ?? 0)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="collect-amount" className="text-xs text-muted-foreground">
                  Amount received
                </Label>
                <Input
                  id="collect-amount"
                  type="number"
                  min={0}
                  max={collectTarget?.balance ?? 0}
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="collect-date" className="text-xs text-muted-foreground">Date</Label>
                <Input
                  id="collect-date"
                  type="date"
                  value={collectDate}
                  onChange={(e) => setCollectDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mode</Label>
                <Select value={collectMode} onValueChange={(v) => setCollectMode(v as PaymentMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['cash', 'upi', 'card', 'bank', 'cheque', 'other'] as PaymentMode[]).map((m) => (
                      <SelectItem key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="collect-ref" className="text-xs text-muted-foreground">Reference (optional)</Label>
                <Input
                  id="collect-ref"
                  value={collectRef}
                  placeholder="Txn / cheque no."
                  onChange={(e) => setCollectRef(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Remaining after this</span>
              <span
                className={cn(
                  'font-mono font-semibold',
                  (collectTarget?.balance ?? 0) - collectingTotal > 0 ? 'text-red-600' : 'text-green-600'
                )}
              >
                {formatINR((collectTarget?.balance ?? 0) - collectingTotal)}
              </span>
            </div>

            {(collectTarget?.bookings.length ?? 0) > 1 && (
              <p className="text-xs text-muted-foreground">
                Applied across {collectTarget?.bookings.length} bookings, oldest first.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectTarget(null)}>
              Cancel
            </Button>
            <Button onClick={saveCollection} disabled={collectingTotal <= 0}>
              Record collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit collection — {editTarget?.clientName}</DialogTitle>
            <DialogDescription>Correct the amount, date, method or reference for this payment.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-amount" className="text-xs text-muted-foreground">
                  Amount received
                </Label>
                <Input
                  id="edit-amount"
                  type="number"
                  min={0}
                  max={editTarget?.maxAmount ?? 0}
                  value={editTarget?.amount ?? ''}
                  onChange={(e) => setEditTarget((t) => (t ? { ...t, amount: e.target.value } : t))}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="edit-date" className="text-xs text-muted-foreground">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editTarget?.date ?? ''}
                  onChange={(e) => setEditTarget((t) => (t ? { ...t, date: e.target.value } : t))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mode</Label>
                <Select
                  value={editTarget?.mode ?? 'cash'}
                  onValueChange={(v) => setEditTarget((t) => (t ? { ...t, mode: v as PaymentMode } : t))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['cash', 'upi', 'card', 'bank', 'cheque', 'other'] as PaymentMode[]).map((m) => (
                      <SelectItem key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-ref" className="text-xs text-muted-foreground">Reference (optional)</Label>
                <Input
                  id="edit-ref"
                  value={editTarget?.reference ?? ''}
                  placeholder="Txn / cheque no."
                  onChange={(e) => setEditTarget((t) => (t ? { ...t, reference: e.target.value } : t))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Max {formatINR(editTarget?.maxAmount ?? 0)} — the booking's balance won't go negative.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={saveEditPayment}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
