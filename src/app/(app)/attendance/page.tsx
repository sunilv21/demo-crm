'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { PunchCard } from '@/components/attendance/punch-card';
import { AttendanceCalendar, DayDetailPanel } from '@/components/attendance/attendance-calendar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAppUser,
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { Attendance, Holiday, Leave, User as AppUser } from '@/lib/types';
import {
  STATUS_META,
  buildMonthCells,
  formatTimeIST,
  toDate,
  todayIST,
} from '@/lib/attendance';

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export default function AttendancePage() {
  const { authUser, isAdmin } = useAppUser();
  const today = todayIST();
  const [year, month0] = today.split('-').map(Number);
  const [view, setView] = useState({ year, month: Number(month0) });

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

  return (
    <>
      <PageHeader title="Attendance" description="Punch in & out, view your monthly record." />
      <div className="grid gap-6 lg:grid-cols-10">
        <div className="lg:col-span-7">
          {isAdmin ? (
            <Tabs defaultValue="me">
              <TabsList>
                <TabsTrigger value="me">My Calendar</TabsTrigger>
                <TabsTrigger value="team">Team View</TabsTrigger>
              </TabsList>
              <TabsContent value="me">
                <PersonalCalendar
                  userId={authUser?.uid ?? null}
                  year={view.year}
                  month={view.month}
                  goPrev={goPrev}
                  goNext={goNext}
                />
              </TabsContent>
              <TabsContent value="team">
                <TeamView year={view.year} month={view.month} goPrev={goPrev} goNext={goNext} />
              </TabsContent>
            </Tabs>
          ) : (
            <PersonalCalendar
              userId={authUser?.uid ?? null}
              year={view.year}
              month={view.month}
              goPrev={goPrev}
              goNext={goNext}
            />
          )}
        </div>
        <div className="lg:col-span-3">
          <PunchCard />
        </div>
      </div>
    </>
  );
}

function MonthSwitcher({
  year,
  month,
  goPrev,
  goNext,
}: {
  year: number;
  month: number;
  goPrev: () => void;
  goNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={goPrev} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[140px] text-center text-sm font-medium">
        {monthLabel(year, month)}
      </div>
      <Button variant="outline" size="icon" onClick={goNext} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PersonalCalendar({
  userId,
  year,
  month,
  goPrev,
  goNext,
}: {
  userId: string | null;
  year: number;
  month: number;
  goPrev: () => void;
  goNext: () => void;
}) {
  const firestore = useFirestore();
  const { appUser, isLoading: appUserLoading } = useAppUser();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`;

  // Block all queries until auth + profile are fully resolved.
  const ready = !!firestore && !!userId && !appUserLoading;

  const attendanceQuery = useMemoFirebase(() => {
    if (!ready) return null;
    return query(
      collection(firestore!, 'attendance'),
      where('userId', '==', userId),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd),
    );
  }, [ready, firestore, userId, monthStart, monthEnd]);

  const leavesQuery = useMemoFirebase(() => {
    if (!ready) return null;
    return query(collection(firestore!, 'leaves'), where('userId', '==', userId));
  }, [ready, firestore, userId]);

  const holidaysQuery = useMemoFirebase(
    () => (ready ? collection(firestore!, 'holidays') : null),
    [ready, firestore],
  );

  const { data: attendance } = useCollection<Attendance>(attendanceQuery);
  const { data: leaves } = useCollection<Leave>(leavesQuery);
  const { data: holidays } = useCollection<Holiday>(holidaysQuery);

  const cells = useMemo(() => {
    const holidaySet = new Set((holidays ?? []).map((h) => h.date));
    return buildMonthCells(
      year,
      month,
      attendance ?? [],
      leaves ?? [],
      holidaySet,
      appUser?.monthlyLeaveCap,
    );
  }, [year, month, attendance, leaves, holidays, appUser?.monthlyLeaveCap]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Reset selection when the displayed month changes.
  useEffect(() => {
    setSelectedDate(null);
  }, [year, month]);
  const selectedCell = selectedDate
    ? cells.find((c) => c.date === selectedDate) ?? null
    : null;

  return (
    <div className="grid gap-4">
      <AttendanceCalendar
        cells={cells}
        monthLabel={monthLabel(year, month)}
        goPrev={goPrev}
        goNext={goNext}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      {selectedDate && <DayDetailPanel cell={selectedCell} />}
    </div>
  );
}

function TeamView({
  year,
  month,
  goPrev,
  goNext,
}: {
  year: number;
  month: number;
  goPrev: () => void;
  goNext: () => void;
}) {
  const firestore = useFirestore();
  const { authUser, isAdmin, isLoading: appUserLoading } = useAppUser();
  const today = todayIST();
  const [filter, setFilter] = useState<'today' | 'month' | 'detail'>('today');
  const [selectedUser, setSelectedUser] = useState<string | 'all'>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Reset day selection when employee, month, or year changes.
  useEffect(() => {
    setSelectedDate(null);
  }, [selectedUser, year, month]);

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`;

  const ready = !!firestore && !!authUser && isAdmin && !appUserLoading;

  const attQuery = useMemoFirebase(() => {
    if (!ready) return null;
    return query(
      collection(firestore!, 'attendance'),
      where('date', '>=', filter === 'today' ? today : monthStart),
      where('date', '<=', filter === 'today' ? today : monthEnd),
    );
  }, [ready, firestore, filter, today, monthStart, monthEnd]);

  const { data: attendance } = useCollection<Attendance>(attQuery);

  const isUserSelected = selectedUser !== 'all';

  // For the detail calendar shown below when one employee is selected.
  const detailAttQuery = useMemoFirebase(() => {
    if (!ready || !isUserSelected) return null;
    return query(
      collection(firestore!, 'attendance'),
      where('userId', '==', selectedUser),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd),
    );
  }, [ready, firestore, isUserSelected, selectedUser, monthStart, monthEnd]);

  const detailLeavesQuery = useMemoFirebase(() => {
    if (!ready || !isUserSelected) return null;
    return query(collection(firestore!, 'leaves'), where('userId', '==', selectedUser));
  }, [ready, firestore, isUserSelected, selectedUser]);

  const holidaysQuery = useMemoFirebase(
    () => (ready ? collection(firestore!, 'holidays') : null),
    [ready, firestore],
  );

  const { data: detailAttendance } = useCollection<Attendance>(detailAttQuery);
  const { data: detailLeaves } = useCollection<Leave>(detailLeavesQuery);
  const { data: holidays } = useCollection<Holiday>(holidaysQuery);

  // Fetch the selected user's profile so admin overrides honor that user's
  // shift hours (for late / early-out flagging when correcting an entry).
  const selectedUserDocRef = useMemoFirebase(() => {
    if (!ready || !isUserSelected) return null;
    return doc(firestore!, 'users', selectedUser);
  }, [ready, firestore, isUserSelected, selectedUser]);
  const { data: selectedUserDoc } = useDoc<AppUser>(selectedUserDocRef);

  const dropdownUsers = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const a of attendance ?? []) {
      if (!seen.has(a.userId)) {
        seen.set(a.userId, { id: a.userId, name: a.userName || 'Unknown' });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [attendance]);

  const selectedUserName = useMemo(
    () =>
      isUserSelected
        ? dropdownUsers.find((u) => u.id === selectedUser)?.name ??
          attendance?.find((a) => a.userId === selectedUser)?.userName ??
          'Employee'
        : '',
    [isUserSelected, selectedUser, dropdownUsers, attendance],
  );

  const detailCells = useMemo(() => {
    if (!isUserSelected) return [];
    const holidaySet = new Set((holidays ?? []).map((h) => h.date));
    return buildMonthCells(
      year,
      month,
      detailAttendance ?? [],
      detailLeaves ?? [],
      holidaySet,
    );
  }, [isUserSelected, year, month, detailAttendance, detailLeaves, holidays]);

  const filteredAttendance = (attendance ?? []).filter((a) =>
    selectedUser === 'all' ? true : a.userId === selectedUser,
  );

  return (
    <>
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {filter === 'today' ? `Today – ${today}` : monthLabel(year, month)}
          </CardTitle>
          {(filter === 'month' || filter === 'detail') && (
            <MonthSwitcher year={year} month={month} goPrev={goPrev} goNext={goNext} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
              <TabsTrigger value="detail">Full Detail</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {dropdownUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
          {filter === 'detail' ? (
            <FullDetailTable
              attendance={filteredAttendance}
              showEmployee={selectedUser === 'all'}
              onSelectEmployee={setSelectedUser}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Punch In</TableHead>
                  <TableHead>Punch Out</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAttendance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No attendance records for this period.
                    </TableCell>
                  </TableRow>
                )}
                {filteredAttendance.map((a) => {
                  const meta = STATUS_META[a.status];
                  const minutes = a.workMinutes ?? 0;
                  const breakMin = a.breakMinutes ?? 0;
                  const activeMin = Math.max(0, minutes - breakMin);
                  const breakCount = (a.breaks ?? []).filter((b) => b.end).length;
                  return (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedUser(a.userId)}
                    >
                      <TableCell className="font-medium">{a.userName}</TableCell>
                      <TableCell>{a.date}</TableCell>
                      <TableCell>{a.punchIn ? formatTimeIST(toDate(a.punchIn)) : '—'}</TableCell>
                      <TableCell>{a.punchOut ? formatTimeIST(toDate(a.punchOut)) : '—'}</TableCell>
                      <TableCell>
                        {minutes ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : '—'}
                      </TableCell>
                      <TableCell>
                        {breakMin > 0 ? (
                          <span className="text-orange-700">
                            {breakMin}m
                            {breakCount > 1 && ` · ${breakCount}×`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {minutes ? `${Math.floor(activeMin / 60)}h ${activeMin % 60}m` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${meta.cls} capitalize`}>{meta.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {isUserSelected && (
        <div className="mt-6 space-y-6">
          <AttendanceCalendar
            cells={detailCells}
            monthLabel={`${selectedUserName} • ${monthLabel(year, month)}`}
            goPrev={goPrev}
            goNext={goNext}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          {selectedDate && (
            <DayDetailPanel
              cell={detailCells.find((c) => c.date === selectedDate) ?? null}
              admin={{
                userId: selectedUser as string,
                userName: selectedUserName,
                workStartTime: selectedUserDoc?.workStartTime,
                workEndTime: selectedUserDoc?.workEndTime,
                lateGraceMinutes: selectedUserDoc?.lateGraceMinutes,
              }}
            />
          )}
          <BreakBreakdown
            attendance={detailAttendance ?? []}
            userName={selectedUserName}
          />
        </div>
      )}
    </>
  );
}

function BreakBreakdown({
  attendance,
  userName,
}: {
  attendance: Attendance[];
  userName: string;
}) {
  const days = useMemo(
    () =>
      [...attendance]
        .filter((a) => (a.breaks?.length ?? 0) > 0)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [attendance],
  );
  if (days.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{userName} — break log</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.flatMap((day) =>
              (day.breaks ?? [])
                .filter((b) => b.end)
                .map((b) => (
                  <TableRow key={`${day.id}-${b.id}`}>
                    <TableCell>{day.date}</TableCell>
                    <TableCell>{formatTimeIST(toDate(b.start))}</TableCell>
                    <TableCell>{formatTimeIST(toDate(b.end))}</TableCell>
                    <TableCell>{b.durationMinutes ?? 0} min</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          b.source === 'screen-lock'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : b.source === 'personal'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-orange-50 text-orange-800 border-orange-200'
                        }
                      >
                        {b.source === 'screen-lock'
                          ? 'Auto · screen lock'
                          : b.source === 'personal'
                            ? 'Personal'
                            : 'Break'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )),
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FullDetailTable({
  attendance,
  showEmployee,
  onSelectEmployee,
}: {
  attendance: Attendance[];
  showEmployee: boolean;
  onSelectEmployee: (uid: string) => void;
}) {
  const sorted = useMemo(
    () =>
      [...attendance].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (a.userName || '').localeCompare(b.userName || '');
      }),
    [attendance],
  );

  if (sorted.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No attendance records for this month.
      </div>
    );
  }

  const fmtHm = (m: number) =>
    m > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : '—';
  const sumBy = (a: Attendance, source: 'manual' | 'personal' | 'screen-lock') =>
    (a.breaks ?? [])
      .filter((b) => b.end && b.source === source)
      .reduce((s, b) => s + (b.durationMinutes ?? 0), 0);

  // Roll-up totals across all rows (handy for admin at-a-glance).
  const totals = sorted.reduce(
    (acc, a) => {
      const gross = a.workMinutes ?? 0;
      const breakMin = sumBy(a, 'manual');
      const personalMin = sumBy(a, 'personal');
      const awayMin = sumBy(a, 'screen-lock');
      const active = Math.max(0, gross - breakMin - personalMin - awayMin);
      acc.gross += gross;
      acc.break += breakMin;
      acc.personal += personalMin;
      acc.active += active;
      return acc;
    },
    { gross: 0, break: 0, personal: 0, active: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>Employee</TableHead>}
            <TableHead>Date</TableHead>
            <TableHead>Punch In</TableHead>
            <TableHead>Punch Out</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Break</TableHead>
            <TableHead className="text-right">Personal</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a) => {
            const meta = STATUS_META[a.status];
            const gross = a.workMinutes ?? 0;
            const breakMin = sumBy(a, 'manual');
            const personalMin = sumBy(a, 'personal');
            const awayMin = sumBy(a, 'screen-lock');
            const active = Math.max(0, gross - breakMin - personalMin - awayMin);
            return (
              <TableRow
                key={a.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelectEmployee(a.userId)}
              >
                {showEmployee && (
                  <TableCell className="font-medium">{a.userName}</TableCell>
                )}
                <TableCell>{a.date}</TableCell>
                <TableCell>
                  {a.punchIn ? formatTimeIST(toDate(a.punchIn)) : '—'}
                  {a.punchInLate && (
                    <span className="ml-1 text-[10px] text-yellow-700">late</span>
                  )}
                </TableCell>
                <TableCell>
                  {a.punchOut ? formatTimeIST(toDate(a.punchOut)) : '—'}
                  {a.punchOutEarly && (
                    <span className="ml-1 text-[10px] text-yellow-700">early</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{fmtHm(gross)}</TableCell>
                <TableCell className="text-right">
                  {breakMin > 0 ? (
                    <span className="text-orange-700">{breakMin}m</span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {personalMin > 0 ? (
                    <span className="text-blue-700">{personalMin}m</span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right font-medium text-green-700">
                  {fmtHm(active)}
                </TableCell>
                <TableCell>
                  <Badge className={`${meta.cls} capitalize`}>{meta.label}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableBody>
          <TableRow className="bg-muted/40 font-medium">
            <TableCell colSpan={showEmployee ? 4 : 3}>Total</TableCell>
            <TableCell className="text-right">{fmtHm(totals.gross)}</TableCell>
            <TableCell className="text-right text-orange-700">
              {totals.break}m
            </TableCell>
            <TableCell className="text-right text-blue-700">
              {totals.personal}m
            </TableCell>
            <TableCell className="text-right text-green-700">
              {fmtHm(totals.active)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
