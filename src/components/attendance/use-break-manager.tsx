'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DocumentReference,
  Timestamp,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import type { Attendance, AttendanceBreak, BreakSource } from '@/lib/types';
import { toDate, workMinutesBetween } from '@/lib/attendance';

const SHORT_LOCK_THRESHOLD_MS = 2 * 60 * 1000; // ignore screen locks < 2 min

function uuid(): string {
  // RFC4122 v4 — small, no deps. Good enough for break ids.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

declare global {
  interface Window {
    electronAPI?: {
      onScreenLock?: (cb: () => void) => void;
      onScreenUnlock?: (cb: () => void) => void;
      offScreenLock?: () => void;
      offScreenUnlock?: () => void;
    };
  }
}

interface UseBreakManagerArgs {
  attendanceRecord: (Attendance & { id: string }) | null | undefined;
  attendanceDocRef: DocumentReference | null;
  capMinutes: number; // 0 means "no cap"
}

export interface BreakManager {
  isOnBreak: boolean;
  currentBreak: AttendanceBreak | undefined;
  breaks: AttendanceBreak[];
  closedBreakMinutes: number; // sum of CLOSED break durations
  totalBreakMinutes: number; // closed + currently-open elapsed
  capMinutes: number;
  remainingCapMinutes: number; // 0 if over
  isOverCap: boolean;
  /** Open a manual break. No-op if already on break or punched out. */
  startBreak: () => Promise<void>;
  /** Close the open break. No-op if no open break. */
  endBreak: () => Promise<void>;
}

export function useBreakManager({
  attendanceRecord,
  attendanceDocRef,
  capMinutes,
}: UseBreakManagerArgs): BreakManager {
  // Re-render every 30s so elapsed counters update.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const breaks = (attendanceRecord?.breaks ?? []) as AttendanceBreak[];
  const currentBreak = breaks.find((b) => !b.end);

  const closedBreakMinutes = useMemo(() => {
    return breaks
      .filter((b) => b.end)
      .reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0);
  }, [breaks]);

  const openElapsed = useMemo(() => {
    if (!currentBreak) return 0;
    return workMinutesBetween(toDate(currentBreak.start), new Date());
  }, [currentBreak]);

  const totalBreakMinutes = closedBreakMinutes + openElapsed;
  const remainingCapMinutes = Math.max(0, capMinutes - totalBreakMinutes);
  const isOverCap = capMinutes > 0 && totalBreakMinutes > capMinutes;
  const isOnBreak = !!currentBreak;

  const writeBreaks = async (next: AttendanceBreak[]) => {
    if (!attendanceDocRef) return;
    const closed = next.filter((b) => b.end);
    const breakMinutes = closed.reduce(
      (sum, b) => sum + (b.durationMinutes ?? 0),
      0,
    );
    await updateDoc(attendanceDocRef, {
      breaks: next,
      breakMinutes,
      updatedAt: serverTimestamp(),
    });
  };

  const startBreak = async (source: BreakSource = 'manual') => {
    if (!attendanceRecord || !attendanceDocRef) return;
    if (attendanceRecord.punchOut) return; // can't break after clock-out
    if (currentBreak) return; // already on break
    const newBreak: AttendanceBreak = {
      id: uuid(),
      start: Timestamp.fromDate(new Date()),
      end: null,
      source,
    };
    await writeBreaks([...breaks, newBreak]);
  };

  // Public manual API always uses 'manual'.
  const startManualBreak = () => startBreak('manual');

  const endBreak = async () => {
    if (!attendanceRecord || !attendanceDocRef) return;
    if (!currentBreak) return;
    const endDate = new Date();
    const startDate = toDate(currentBreak.start);
    const durationMinutes = workMinutesBetween(startDate, endDate);
    const next = breaks.map((b) =>
      b.id === currentBreak.id
        ? {
            ...b,
            end: Timestamp.fromDate(endDate),
            durationMinutes,
          }
        : b,
    );
    await writeBreaks(next);
  };

  // -------------------------------------------------------------------------
  // Screen-lock auto-detection.
  //   Desktop (Electron): exact `lock-screen` / `unlock-screen` events.
  //   Browser: Page Visibility API as best-effort fallback.
  //   Locks shorter than SHORT_LOCK_THRESHOLD_MS are ignored.
  // -------------------------------------------------------------------------
  const lockStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!attendanceRecord) return;
    if (attendanceRecord.punchOut) return;

    const handleLock = () => {
      lockStartedAtRef.current = Date.now();
    };

    const handleUnlock = async () => {
      const lockStart = lockStartedAtRef.current;
      lockStartedAtRef.current = null;
      if (!lockStart) return;
      const elapsedMs = Date.now() - lockStart;
      if (elapsedMs < SHORT_LOCK_THRESHOLD_MS) return; // brief lock, ignore
      // Open a break that covers the lock period.
      if (!attendanceDocRef) return;
      const startDate = new Date(lockStart);
      const endDate = new Date();
      const durationMinutes = workMinutesBetween(startDate, endDate);
      // Skip if there's somehow already an open break (manual one going).
      if (breaks.some((b) => !b.end)) return;
      const lockBreak: AttendanceBreak = {
        id: uuid(),
        start: Timestamp.fromDate(startDate),
        end: Timestamp.fromDate(endDate),
        source: 'screen-lock',
        durationMinutes,
      };
      await writeBreaks([...breaks, lockBreak]);
    };

    // Prefer Electron native events when available.
    const electron = window.electronAPI;
    if (electron?.onScreenLock && electron?.onScreenUnlock) {
      electron.onScreenLock(handleLock);
      electron.onScreenUnlock(handleUnlock);
      return () => {
        electron.offScreenLock?.();
        electron.offScreenUnlock?.();
      };
    }

    // Browser fallback: page visibility.
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleLock();
      else handleUnlock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceRecord?.id, attendanceRecord?.punchOut, breaks.length]);

  return {
    isOnBreak,
    currentBreak,
    breaks,
    closedBreakMinutes,
    totalBreakMinutes,
    capMinutes,
    remainingCapMinutes,
    isOverCap,
    startBreak: startManualBreak,
    endBreak,
  };
}
