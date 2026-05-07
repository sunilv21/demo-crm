'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import {
  useAppUser,
  useAuth,
  useDoc,
  useFirestore,
  useMemoFirebase,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase';
import type { Attendance } from '@/lib/types';
import {
  AUTO_LOGOUT_HOUR_IST,
  DEFAULT_GRACE_MINUTES,
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  IST_TZ,
  computeStatus,
  isEarlyPunchOut,
  isLatePunchIn,
  todayIST,
  toDate,
  workMinutesBetween,
} from '@/lib/attendance';

/**
 * Renders nothing. Mounted inside <AppUserProvider>:
 *   1. Auto-creates today's attendance doc on first sign-in/page load (auto
 *      punch-in). Idempotent — re-runs are no-ops once a doc exists.
 *   2. Schedules a 9 PM IST sign-out + auto-punch-out for whoever is still
 *      logged in.
 *
 * IMPORTANT: this component uses a single-doc GET (not a collection LIST)
 * to look up today's record. The doc id is the deterministic compound
 * `${uid}_${YYYY-MM-DD}`, which lets us avoid `useCollection` and the
 * query-aware list rule evaluation entirely.
 */
export function AutoLogoutWatcher() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { authUser, appUser, isLoading: appUserLoading } = useAppUser();
  const { toast } = useToast();
  const today = todayIST();

  const ready = !!firestore && !!authUser && !appUserLoading;
  const docId = ready ? `${authUser!.uid}_${today}` : null;

  const todayDocRef = useMemoFirebase(
    () => (ready ? doc(firestore!, 'attendance', docId!) : null),
    [ready, firestore, docId],
  );

  const { data: todayRecord, isLoading: todayLoading } =
    useDoc<Attendance>(todayDocRef);

  // -------------------------------------------------------------------------
  // Auto punch-in on sign-in.
  // -------------------------------------------------------------------------
  const punchedInForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !firestore || !authUser) return;
    if (todayLoading) return; // wait until we know whether today's doc exists
    if (todayRecord) return; // already punched in
    const sessionKey = `${authUser.uid}:${today}`;
    if (punchedInForRef.current === sessionKey) return;
    punchedInForRef.current = sessionKey;

    const punchIn = new Date();
    const workStart = appUser?.workStartTime ?? DEFAULT_WORK_START;
    const workEnd = appUser?.workEndTime ?? DEFAULT_WORK_END;
    const grace = appUser?.lateGraceMinutes ?? DEFAULT_GRACE_MINUTES;
    const punchInLate = isLatePunchIn(punchIn, workStart, grace);
    const ref = doc(firestore, 'attendance', `${authUser.uid}_${today}`);
    setDocumentNonBlocking(
      ref,
      {
        userId: authUser.uid,
        userName:
          appUser?.name ||
          authUser.displayName ||
          authUser.email ||
          'Unknown',
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false },
    );
  }, [ready, firestore, authUser, appUser, todayRecord, todayLoading, today]);

  // -------------------------------------------------------------------------
  // 9 PM IST auto sign-out + auto punch-out.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!auth || !authUser) return;

    function msUntilCutoffIST(): number {
      const now = new Date();
      const istNow = new Date(now.toLocaleString('en-US', { timeZone: IST_TZ }));
      const cutoff = new Date(istNow);
      cutoff.setHours(AUTO_LOGOUT_HOUR_IST, 0, 0, 0);
      let diff = cutoff.getTime() - istNow.getTime();
      if (diff <= 0) diff += 24 * 60 * 60 * 1000;
      return diff;
    }

    const ms = msUntilCutoffIST();
    const id = setTimeout(async () => {
      if (todayRecord && firestore && !todayRecord.punchOut) {
        const punchOut = new Date();
        const punchInDate = toDate(todayRecord.punchIn);
        const earlyOut = isEarlyPunchOut(punchOut, todayRecord.workEndTime);
        const minutes = workMinutesBetween(punchInDate, punchOut);
        const status = computeStatus({
          ...todayRecord,
          punchOut: Timestamp.fromDate(punchOut),
          punchOutEarly: earlyOut,
        } as any);
        updateDocumentNonBlocking(doc(firestore, 'attendance', todayRecord.id), {
          punchOut: Timestamp.fromDate(punchOut),
          punchOutEarly: earlyOut,
          autoLoggedOut: true,
          workMinutes: minutes,
          status,
          updatedAt: serverTimestamp(),
        });
      }
      toast({
        title: 'Auto sign-out',
        description: 'You have been signed out at end of shift.',
      });
      try {
        await signOut(auth);
      } finally {
        router.push('/login');
      }
    }, ms);

    return () => clearTimeout(id);
  }, [auth, authUser, firestore, todayRecord, router, toast]);

  return null;
}
