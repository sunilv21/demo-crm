'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { Clock, Coffee, LogIn, LogOut, Loader2, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useAppUser,
  useDoc,
  useFirestore,
  useMemoFirebase,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase';
import type { Attendance } from '@/lib/types';
import {
  DEFAULT_GRACE_MINUTES,
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  STATUS_META,
  computeStatus,
  formatTimeIST,
  isEarlyPunchOut,
  isLatePunchIn,
  todayIST,
  toDate,
  workMinutesBetween,
} from '@/lib/attendance';
import { useBreakManager } from '@/components/attendance/use-break-manager';

const DEFAULT_DAILY_BREAK_CAP_MINUTES = 40;

export function PunchCard() {
  const firestore = useFirestore();
  const { authUser, appUser, isLoading: appUserLoading } = useAppUser();
  const { toast } = useToast();
  const [now, setNow] = useState<Date>(new Date());
  const [submitting, setSubmitting] = useState(false);
  const today = todayIST();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  const ready = !!firestore && !!authUser && !appUserLoading;
  const docId = ready ? `${authUser!.uid}_${today}` : null;

  const todayDocRef = useMemoFirebase(
    () => (ready ? doc(firestore!, 'attendance', docId!) : null),
    [ready, firestore, docId],
  );

  const { data: todayRecord, isLoading } = useDoc<Attendance>(todayDocRef);

  const breakManager = useBreakManager({
    attendanceRecord: todayRecord,
    attendanceDocRef: todayDocRef,
    capMinutes: appUser?.dailyBreakCapMinutes ?? DEFAULT_DAILY_BREAK_CAP_MINUTES,
  });

  const workStart = appUser?.workStartTime ?? DEFAULT_WORK_START;
  const workEnd = appUser?.workEndTime ?? DEFAULT_WORK_END;
  const grace = appUser?.lateGraceMinutes ?? DEFAULT_GRACE_MINUTES;

  const punchInTime = todayRecord ? toDate(todayRecord.punchIn) : null;
  const punchOutTime = todayRecord?.punchOut ? toDate(todayRecord.punchOut) : null;

  const elapsedMinutes = useMemo(() => {
    if (!punchInTime) return 0;
    const end = punchOutTime ?? now;
    return workMinutesBetween(punchInTime, end);
  }, [punchInTime, punchOutTime, now]);

  const handlePunchIn = async () => {
    if (!firestore || !authUser || !appUser) return;
    setSubmitting(true);
    const id = `${authUser.uid}_${today}`;
    const ref = doc(firestore, 'attendance', id);
    // Idempotent: never overwrite an existing day record. If they already
    // punched in today (and logged out + back in), keep the original time.
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        toast({
          title: 'Already punched in',
          description: 'Your earlier punch-in is still active.',
        });
        setSubmitting(false);
        return;
      }
    } catch {
      setSubmitting(false);
      return;
    }
    const punchIn = new Date();
    const punchInLate = isLatePunchIn(punchIn, workStart, grace);
    try {
      await setDoc(ref, {
        userId: authUser.uid,
        userName: appUser.name || authUser.email || 'Unknown',
        date: today,
        punchIn: Timestamp.fromDate(punchIn),
        punchOut: null,
        workStartTime: workStart,
        workEndTime: workEnd,
        lateGraceMinutes: grace,
        punchInLate,
        punchOutEarly: false,
        autoLoggedOut: false,
        status: punchInLate ? 'late' : 'present',
        breaks: [],
        breakMinutes: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({
        title: punchInLate ? 'Punched in (Late)' : 'Punched in',
        description: `Welcome! Logged in at ${formatTimeIST(punchIn)}.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Punch in failed', description: err?.message });
    }
    setSubmitting(false);
  };

  const handlePunchOut = async () => {
    if (!firestore || !todayRecord) return;
    if (breakManager.isOnBreak) {
      toast({ title: 'End your break first', description: 'Resume work before punching out.' });
      return;
    }
    setSubmitting(true);
    const punchOut = new Date();
    const ref = doc(firestore, 'attendance', todayRecord.id);
    const punchInDate = toDate(todayRecord.punchIn);
    const earlyOut = isEarlyPunchOut(punchOut, todayRecord.workEndTime);
    const workMinutes = workMinutesBetween(punchInDate, punchOut);
    const breakMinutes = breakManager.closedBreakMinutes;
    const activeMinutes = Math.max(0, workMinutes - breakMinutes);
    const updated = {
      ...todayRecord,
      punchOut: Timestamp.fromDate(punchOut),
      punchOutEarly: earlyOut,
      workMinutes,
    };
    const status = computeStatus(updated as any);
    updateDocumentNonBlocking(ref, {
      punchOut: Timestamp.fromDate(punchOut),
      punchOutEarly: earlyOut,
      workMinutes,
      breakMinutes,
      activeMinutes,
      status,
      updatedAt: serverTimestamp(),
    });
    toast({
      title: earlyOut ? 'Punched out (Early)' : 'Punched out',
      description: `Worked ${Math.floor(workMinutes / 60)}h ${workMinutes % 60}m today.`,
    });
    setSubmitting(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const status = todayRecord?.status ?? 'absent';
  const meta = STATUS_META[status];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Today's Attendance
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            Shift {workStart} – {workEnd} IST
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="grid gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Status</div>
            {todayRecord ? (
              breakManager.isOnBreak ? (
                <Badge className="mt-1 bg-orange-100 text-orange-800 border-orange-200">
                  On Break
                </Badge>
              ) : (
                <Badge className={`mt-1 ${meta.cls} capitalize`}>{meta.label}</Badge>
              )
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">Not punched in</div>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Punch In</div>
            <div className="mt-1 text-sm font-medium">
              {punchInTime ? formatTimeIST(punchInTime) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {punchOutTime ? 'Punch Out' : 'Elapsed'}
            </div>
            <div className="mt-1 text-sm font-medium">
              {punchOutTime
                ? formatTimeIST(punchOutTime)
                : punchInTime
                  ? `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`
                  : '—'}
            </div>
          </div>
          {todayRecord && (
            <div>
              <div className="text-xs text-muted-foreground">
                Break {breakManager.capMinutes > 0 && `(${breakManager.capMinutes}m cap)`}
              </div>
              <div className="mt-1 text-sm font-medium">
                {breakManager.totalBreakMinutes}m used
                {breakManager.capMinutes > 0 && (
                  <span
                    className={`ml-2 text-xs ${
                      breakManager.isOverCap ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {breakManager.isOverCap
                      ? `Over by ${breakManager.totalBreakMinutes - breakManager.capMinutes}m`
                      : `${breakManager.remainingCapMinutes}m left`}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!todayRecord && (
            <Button onClick={handlePunchIn} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Punch In
            </Button>
          )}
          {todayRecord && !punchOutTime && (
            <>
              {breakManager.isOnBreak ? (
                <Button
                  onClick={() => breakManager.endBreak()}
                  variant="outline"
                  className="border-orange-300"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume Work
                </Button>
              ) : (
                <Button
                  onClick={() => breakManager.startBreak()}
                  variant="outline"
                  disabled={submitting}
                >
                  <Coffee className="mr-2 h-4 w-4" />
                  Take Break
                </Button>
              )}
              <Button
                onClick={handlePunchOut}
                disabled={submitting || breakManager.isOnBreak}
                variant="default"
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Punch Out
              </Button>
            </>
          )}
          {todayRecord && punchOutTime && (
            <Badge variant="secondary" className="self-center">
              Done for the day
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
