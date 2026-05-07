'use client';

import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAppUser,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { Attendance, Holiday, Leave, User as AppUser } from '@/lib/types';
import {
  computePayroll,
  rowsToCsv,
  todayIST,
} from '@/lib/attendance';

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

const inr = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function PayrollPage() {
  const firestore = useFirestore();
  const { authUser, isAdmin, isLoading: appUserLoading } = useAppUser();
  const today = todayIST();
  const [year0, month0] = today.split('-').map(Number);
  const [view, setView] = useState({ year: year0, month: month0 });

  const monthStart = `${view.year}-${String(view.month).padStart(2, '0')}-01`;
  const monthEnd = `${view.year}-${String(view.month).padStart(2, '0')}-31`;

  // Every query below is gated on (authUser && isAdmin) so the listeners
  // don't fire before auth is ready or for any non-admin who somehow
  // reaches this page despite the layout guard.
  const ready = !!firestore && !!authUser && isAdmin && !appUserLoading;

  const usersQuery = useMemoFirebase(
    () => (ready ? collection(firestore!, 'users') : null),
    [ready, firestore],
  );
  const { data: users } = useCollection<AppUser>(usersQuery);

  const attQuery = useMemoFirebase(() => {
    if (!ready) return null;
    return query(
      collection(firestore!, 'attendance'),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd),
    );
  }, [ready, firestore, monthStart, monthEnd]);
  const { data: attendance } = useCollection<Attendance>(attQuery);

  const leavesQuery = useMemoFirebase(
    () => (ready ? collection(firestore!, 'leaves') : null),
    [ready, firestore],
  );
  const { data: leaves } = useCollection<Leave>(leavesQuery);

  const holidaysQuery = useMemoFirebase(
    () => (ready ? collection(firestore!, 'holidays') : null),
    [ready, firestore],
  );
  const { data: holidays } = useCollection<Holiday>(holidaysQuery);

  const rows = useMemo(() => {
    if (!users) return [];
    const holidaySet = new Set((holidays ?? []).map((h) => h.date));
    return users.map((u) =>
      computePayroll({
        user: u,
        year: view.year,
        month: view.month,
        attendance: (attendance ?? []).filter((a) => a.userId === u.id),
        leaves: (leaves ?? []).filter((l) => l.userId === u.id),
        holidays: holidaySet,
      }),
    );
  }, [users, attendance, leaves, holidays, view]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.baseSalary += r.baseSalary;
        acc.netPay += r.netPay;
        return acc;
      },
      { baseSalary: 0, netPay: 0 },
    );
  }, [rows]);

  const goPrev = () => {
    const m = view.month - 1;
    if (m < 1) setView({ year: view.year - 1, month: 12 });
    else setView({ year: view.year, month: m });
  };
  const goNext = () => {
    const m = view.month + 1;
    if (m > 12) setView({ year: view.year + 1, month: 1 });
    else setView({ year: view.year, month: m });
  };

  const downloadCsv = () => {
    const csv = rowsToCsv(rows, monthLabel(view.year, view.month));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${view.year}-${String(view.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Payroll" description="Computed monthly payroll based on attendance.">
        <Button variant="outline" onClick={downloadCsv}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-center justify-end gap-2">
        <Button variant="outline" size="icon" onClick={goPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[140px] text-center text-sm font-medium">
          {monthLabel(view.year, view.month)}
        </div>
        <Button variant="outline" size="icon" onClick={goNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll – {monthLabel(view.year, view.month)}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Working</TableHead>
                <TableHead className="text-right">Present</TableHead>
                <TableHead className="text-right">Late</TableHead>
                <TableHead className="text-right">Half</TableHead>
                <TableHead className="text-right">Paid Leaves</TableHead>
                <TableHead className="text-right">LOP</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Payable</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-6">
                    No employees found.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.userName}</TableCell>
                  <TableCell className="capitalize">{r.role}</TableCell>
                  <TableCell className="text-right">{inr(r.baseSalary)}</TableCell>
                  <TableCell className="text-right">{r.workingDays}</TableCell>
                  <TableCell className="text-right">{r.presentDays}</TableCell>
                  <TableCell className="text-right">{r.lateCount}</TableCell>
                  <TableCell className="text-right">{r.halfDays}</TableCell>
                  <TableCell className="text-right">{r.paidLeaves}</TableCell>
                  <TableCell className="text-right">{r.lopDays}</TableCell>
                  <TableCell className="text-right">{r.absentDays}</TableCell>
                  <TableCell className="text-right">{r.payableDays}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(r.netPay)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">{inr(totals.baseSalary)}</TableCell>
                  <TableCell colSpan={8} />
                  <TableCell className="text-right font-semibold">{inr(totals.netPay)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
