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
import type { Booking } from '@/lib/types';
import { cn, formatINR, formatINRCompact, toDateSafe } from '@/lib/utils';
import {
  IndianRupee,
  TrendingUp,
  Percent,
  Receipt,
  CalendarClock,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  CheckCircle2,
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
  // Single total amount received from the client (as typed).
  const [collectAmount, setCollectAmount] = useState('');

  const openCollect = (group: { clientName: string; balance: number; bookings: Booking[] }) => {
    setCollectAmount(String(group.balance));
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
    for (const b of ordered) {
      if (remaining <= 0) break;
      const balance = bookingBalance(b);
      if (balance <= 0) continue;
      const received = Math.min(remaining, balance);
      const newPaid = (b.amountPaid || 0) + received;
      const newBalance = Math.max(0, (b.total || 0) - newPaid);
      remaining -= received;
      applied += received;
      updateDocumentNonBlocking(doc(firestore, 'bookings', b.id), {
        amountPaid: newPaid,
        balanceAmount: newBalance,
        paymentStatus: newBalance <= 0 ? 'paid' : 'partial',
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

  // Revenue is private to each agent — only ever read the bookings they own.
  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore || !canViewRevenue || !authUser) return null;
    return query(collection(firestore, 'bookings'), where('createdBy', '==', authUser.uid));
  }, [firestore, canViewRevenue, authUser]);

  const { data: bookings, isLoading: isLoadingBookings } = useCollection<Booking>(bookingsQuery);

  const stats = useMemo(() => {
    const confirmed = (bookings ?? []).filter((b) => b.status === 'confirmed');

    // Attach the creation date (revenue is attributed to the created month).
    const withDate = confirmed.map((b) => ({ b, date: toDateSafe(b.createdAt) }));

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
    const avgValue = yearCount ? yearRevenue / yearCount : 0;

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

    // Recent confirmed bookings by creation date.
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
      avgValue,
      thisMonthRevenue,
      lastMonthRevenue,
      thisMonthProfit,
      lastMonthProfit,
      thisMonthLabel,
      lastMonthLabel,
      pendingCollections,
      pendingClients,
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={`Revenue in ${year}`}
          value={formatINR(stats.yearRevenue)}
          icon={IndianRupee}
          isLoading={isLoading}
          variant="warning"
          description={`${stats.yearCount} confirmed booking${stats.yearCount === 1 ? '' : 's'}`}
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
          title="Avg. Booking Value"
          value={formatINRCompact(stats.avgValue)}
          icon={Receipt}
          isLoading={isLoading}
          description={`Across ${year}`}
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
            <CardDescription>Confirmed bookings with an outstanding customer balance in {year}</CardDescription>
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
          emptyLabel="No confirmed bookings yet."
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
          <CardTitle>Recent Confirmed Bookings</CardTitle>
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
                      No confirmed bookings in {year}.
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
    </>
  );
}
