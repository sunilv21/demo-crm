'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import {
  useAppUser,
  useAuth,
  useDoc,
  useFirestore,
  useMemoFirebase,
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
 *   2. Schedules an end-of-shift sign-out + auto-punch-out for whoever is
 *      still logged in (cutoff = AUTO_LOGOUT_HOUR_IST, currently 20:00 IST).
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
  // Idempotent — re-running for any reason (re-login, hot reload, useDoc
  // race) reads the doc first and ONLY writes if it doesn't exist. The
  // original punchIn timestamp is preserved across the entire day.
  const punchedInForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !firestore || !authUser) return;
    if (todayLoading) return; // wait until we know whether today's doc exists
    if (todayRecord) return; // useDoc says it already exists — done
    const sessionKey = `${authUser.uid}:${today}`;
    if (punchedInForRef.current === sessionKey) return;
    punchedInForRef.current = sessionKey;

    (async () => {
      const ref = doc(firestore, 'attendance', `${authUser.uid}_${today}`);
      // Server-authoritative existence check before write.
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) return;
      } catch {
        // If the read failed for some reason, bail out rather than risk
        // overwriting an existing record we couldn't see.
        return;
      }
      const punchIn = new Date();
      const workStart = appUser?.workStartTime ?? DEFAULT_WORK_START;
      const workEnd = appUser?.workEndTime ?? DEFAULT_WORK_END;
      const grace = appUser?.lateGraceMinutes ?? DEFAULT_GRACE_MINUTES;
      const punchInLate = isLatePunchIn(punchIn, workStart, grace);
      try {
        await setDoc(ref, {
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
          breaks: [],
          breakMinutes: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        // If a competing write happened between our get and set, that's fine —
        // the other client created the record and we should leave it alone.
        console.warn('Auto punch-in skipped:', err);
      }
    })();
  }, [ready, firestore, authUser, appUser, todayRecord, todayLoading, today]);

  // -------------------------------------------------------------------------
  // End-of-shift auto sign-out + auto punch-out (default 8 PM IST).
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
      // Surface the auto sign-out via an OS notification — when the desktop
      // app is minimized to the tray, the in-app toast is invisible, so the
      // user would otherwise have no idea they were punched out.
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          if (Notification.permission === 'granted') {
            new Notification('Sky Visa CRM — auto sign-out', {
              body: 'End of shift reached. You have been signed out and punched out.',
            });
          } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              new Notification('Sky Visa CRM — auto sign-out', {
                body: 'End of shift reached. You have been signed out and punched out.',
              });
            }
          }
        } catch {
          // best-effort — Notification API may be unavailable in some shells
        }
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
