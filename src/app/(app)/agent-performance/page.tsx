'use client';

import { useMemo, useState } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useCollection, useCollectionOnce, useMemoFirebase } from '@/firebase';
import type { Booking, User as StaffUser } from '@/lib/types';
import { formatINR } from '@/lib/utils';
import { bookingAgentId } from '@/lib/finance';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, User } from 'lucide-react';

const bookingProfit = (b: Booking) => b.profit ?? ((b.total || 0) - (b.supplierCost || 0));
const bookingPaidAmt = (b: Booking) => b.amountPaid ?? (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
const bookingBalance = (b: Booking) => b.balanceAmount ?? Math.max(0, (b.total || 0) - bookingPaidAmt(b));

type Row = {
  id: string; name: string; role?: string;
  bookings: number; revenue: number; profit: number; collected: number; pending: number;
};

export default function AgentPerformancePage() {
  const firestore = useFirestore();
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings, isLoading } = useCollectionOnce<Booking>(bookingsQuery);
  const usersQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'users') : null), [firestore]);
  const { data: users } = useCollection<StaffUser>(usersQuery);

  const [range, setRange] = useState<'all' | 'month' | 'year'>('all');

  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const yearKey = now.toISOString().slice(0, 4);
    const inRange = (b: Booking) => {
      if (range === 'all') return true;
      const created = b.createdAt?.toDate ? b.createdAt.toDate() : (b.startDate ? new Date(b.startDate) : null);
      if (!created) return false;
      const iso = created.toISOString();
      return range === 'month' ? iso.slice(0, 7) === monthKey : iso.slice(0, 4) === yearKey;
    };

    const map = new Map<string, Row>();
    (bookings ?? []).forEach((b) => {
      if (b.status === 'cancelled' || !inRange(b)) return;
      // Credit the owning sales agent (agentId), falling back to the creator when
      // they're an agent. Employee-created, agent-priced bookings credit the agent.
      const key = bookingAgentId(b, (uid) => userById.get(uid)?.role);
      if (!key) return;
      const u = userById.get(key);
      const row = map.get(key) ?? {
        id: key, name: u?.name || 'Unknown', role: u?.role,
        bookings: 0, revenue: 0, profit: 0, collected: 0, pending: 0,
      };
      row.bookings += 1;
      row.revenue += b.total || 0;
      row.profit += bookingProfit(b);
      row.collected += bookingPaidAmt(b);
      row.pending += bookingBalance(b);
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [bookings, userById, range]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, profit: acc.profit + r.profit, collected: acc.collected + r.collected, pending: acc.pending + r.pending }),
    { revenue: 0, profit: 0, collected: 0, pending: 0 },
  ), [rows]);

  const top = rows[0];

  return (
    <>
      <PageHeader title="Agent Performance" description="Who is performing — bookings, revenue, collections and profit by agent.">
        <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="year">This year</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Revenue" value={isLoading ? '…' : formatINR(totals.revenue)} variant="warning" />
        <StatCard title="Total Profit" value={isLoading ? '…' : formatINR(totals.profit)} variant="success" />
        <StatCard title="Collected" value={isLoading ? '…' : formatINR(totals.collected)} />
        <StatCard title="Pending" value={isLoading ? '…' : formatINR(totals.pending)} variant={totals.pending > 0 ? 'danger' : 'default'} />
      </div>

      {top && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50/50">
          <CardContent className="flex items-center gap-3 p-4">
            <Trophy className="h-6 w-6 text-yellow-600" />
            <div>
              <p className="text-sm text-muted-foreground">Top performer{range !== 'all' ? ` (${range === 'month' ? 'this month' : 'this year'})` : ''}</p>
              <p className="font-semibold">{top.name} — {formatINR(top.revenue)} across {top.bookings} booking{top.bookings > 1 ? 's' : ''}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border rounded-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-center">Bookings</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border"><AvatarFallback><User className="h-4 w-4 text-muted-foreground" /></AvatarFallback></Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          {i === 0 && <Trophy className="h-3.5 w-3.5 text-yellow-600" />}{r.name}
                        </div>
                        {r.role && <Badge variant="secondary" className="mt-0.5 text-xs capitalize font-normal">{r.role}</Badge>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{r.bookings}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(r.revenue)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatINR(r.collected)}</TableCell>
                  <TableCell className={`text-right ${r.pending > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{formatINR(r.pending)}</TableCell>
                  <TableCell className="text-right font-medium">{formatINR(r.profit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && rows.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No booking activity in this period.</div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
