'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DocumentReference,
  Timestamp,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import type { Attendance, AttendanceBreak, BreakSource } from '@/lib/types';
import {
  HEARTBEAT_BACKFILL_GAP_MS,
  HEARTBEAT_INTERVAL_MS,
  toDate,
  workMinutesBetween,
} from '@/lib/attendance';

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
      /** Fires when OS reports the user has been idle past the desktop's
       * idle threshold (no mouse/keyboard). Provides the idle start timestamp. */
      onIdle?: (cb: (idleStartedAtMs: number) => void) => void;
      onActive?: (cb: () => void) => void;
      offIdle?: () => void;
      offActive?: () => void;
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
  /** Live elapsed seconds for the currently-open break, or 0. Ticks every second. */
  currentBreakElapsedSeconds: number;
  breaks: AttendanceBreak[];
  closedBreakMinutes: number; // sum of ALL closed break durations
  totalBreakMinutes: number; // closed + currently-open elapsed (all sources)
  // Per-source breakdowns — closed totals + live elapsed when that source is active:
  manualMinutes: number;
  personalMinutes: number;
  awayMinutes: number;
  capMinutes: number;
  remainingCapMinutes: number; // 0 if over
  isOverCap: boolean;
  /** Open a manual break. No-op if already on break or punched out. */
  startBreak: () => Promise<void>;
  /** Open a personal time block. Same accounting as a break. */
  startPersonal: () => Promise<void>;
  /** Close the open break/personal/away period. No-op if none open. */
  endBreak: () => Promise<void>;
}

export function useBreakManager({
  attendanceRecord,
  attendanceDocRef,
  capMinutes,
}: UseBreakManagerArgs): BreakManager {
  // Re-render every second so the live break counter ticks visibly.
  // We only run the fast tick while a break is open — otherwise idle at 30s.
  const [, setTick] = useState(0);
  const breaks = (attendanceRecord?.breaks ?? []) as AttendanceBreak[];
  const hasOpenBreak = breaks.some((b) => !b.end);
  useEffect(() => {
    const id = setInterval(
      () => setTick((n) => n + 1),
      hasOpenBreak ? 1000 : 30 * 1000,
    );
    return () => clearInterval(id);
  }, [hasOpenBreak]);

  const currentBreak = breaks.find((b) => !b.end);

  const closedBreakMinutes = useMemo(() => {
    return breaks
      .filter((b) => b.end)
      .reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0);
  }, [breaks]);

  const sumBy = (source: AttendanceBreak['source']) =>
    breaks
      .filter((b) => b.end && b.source === source)
      .reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0);

  const closedManualMinutes = useMemo(() => sumBy('manual'), [breaks]);
  const closedPersonalMinutes = useMemo(() => sumBy('personal'), [breaks]);
  const closedAwayMinutes = useMemo(() => sumBy('screen-lock'), [breaks]);

  // Live elapsed for the currently-open break (recomputes each tick via setTick).
  const currentBreakElapsedSeconds = currentBreak
    ? Math.max(0, Math.floor((Date.now() - toDate(currentBreak.start).getTime()) / 1000))
    : 0;
  const openElapsed = Math.floor(currentBreakElapsedSeconds / 60);

  // Per-source totals fold the live open break in so the matching counter
  // ticks while a user is on that break.
  const liveAddFor = (source: BreakSource) =>
    currentBreak?.source === source ? openElapsed : 0;
  const manualMinutes = closedManualMinutes + liveAddFor('manual');
  const personalMinutes = closedPersonalMinutes + liveAddFor('personal');
  const awayMinutes = closedAwayMinutes + liveAddFor('screen-lock');

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
  const startPersonal = () => startBreak('personal');

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
  // Heartbeat — write lastActiveAt while the app is open and the user is
  // punched in. Server-side gaps in this stamp are how we detect "user closed
  // the app and walked away."
  //
  // Each tick also acts as a sleep / suspend detector: if the wall clock
  // advanced significantly more than HEARTBEAT_INTERVAL_MS since the last
  // tick, the JS event loop was paused — laptop sleep, lid close, OS
  // throttling — and we backfill an Away break covering the gap.
  // -------------------------------------------------------------------------
  // Refs to read latest state from inside the heartbeat closure without
  // re-subscribing the interval each render.
  const breaksRef = useRef(breaks);
  breaksRef.current = breaks;
  const writeBreaksRef = useRef<(next: AttendanceBreak[]) => Promise<void>>(writeBreaks);
  writeBreaksRef.current = writeBreaks;
  const lastBeatLocalMsRef = useRef<number | null>(null);

  // Allowed wall-clock gap between heartbeats before we treat it as a sleep.
  const SLEEP_DETECT_GAP_MS = HEARTBEAT_INTERVAL_MS + HEARTBEAT_BACKFILL_GAP_MS;

  useEffect(() => {
    if (!attendanceRecord || !attendanceDocRef) return;
    if (attendanceRecord.punchOut) return;
    let cancelled = false;
    lastBeatLocalMsRef.current = null; // reset on record change

    const beat = async () => {
      if (cancelled || !attendanceDocRef) return;
      const nowMs = Date.now();
      const lastBeat = lastBeatLocalMsRef.current;
      lastBeatLocalMsRef.current = nowMs;

      // Sleep / suspend detection: gap between wall-clock ticks.
      if (lastBeat != null && nowMs - lastBeat > SLEEP_DETECT_GAP_MS) {
        const liveBreaks = breaksRef.current;
        // Skip if a break is already open — that one already covers this gap,
        // and we must not have two open breaks at once.
        if (!liveBreaks.some((b) => !b.end)) {
          const startDate = new Date(lastBeat);
          const endDate = new Date(nowMs);
          const durationMinutes = workMinutesBetween(startDate, endDate);
          if (durationMinutes > 0) {
            const sleepBreak: AttendanceBreak = {
              id: uuid(),
              start: Timestamp.fromDate(startDate),
              end: Timestamp.fromDate(endDate),
              source: 'screen-lock',
              durationMinutes,
            };
            try {
              await writeBreaksRef.current([...liveBreaks, sleepBreak]);
            } catch {
              // best-effort — next tick retries detection if the write failed
            }
          }
        }
      }

      try {
        await updateDoc(attendanceDocRef, { lastActiveAt: serverTimestamp() });
      } catch {
        // Tolerate transient permission/network errors — next tick will retry.
      }
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [attendanceRecord?.id, attendanceRecord?.punchOut, attendanceDocRef]);

  // -------------------------------------------------------------------------
  // Heartbeat-gap reconciliation.
  // On record load (per record id), if the previous lastActiveAt is older
  // than HEARTBEAT_BACKFILL_GAP_MS, insert a screen-lock break covering the
  // gap. This catches "punched in, closed the app, came back hours later."
  // -------------------------------------------------------------------------
  const reconciledForRecordRef = useRef<string | null>(null);
  useEffect(() => {
    if (!attendanceRecord || !attendanceDocRef) return;
    if (attendanceRecord.punchOut) return;
    if (reconciledForRecordRef.current === attendanceRecord.id) return;
    reconciledForRecordRef.current = attendanceRecord.id;

    const lastActiveAt = attendanceRecord.lastActiveAt
      ? toDate(attendanceRecord.lastActiveAt)
      : null;
    if (!lastActiveAt) return;
    const now = new Date();
    const gapMs = now.getTime() - lastActiveAt.getTime();
    if (gapMs < HEARTBEAT_BACKFILL_GAP_MS) return;
    // Skip if there is already an open break — that one already covers the gap
    // (and writing a second open break would be invalid).
    if (breaks.some((b) => !b.end)) return;

    const durationMinutes = workMinutesBetween(lastActiveAt, now);
    if (durationMinutes <= 0) return;
    const gapBreak: AttendanceBreak = {
      id: uuid(),
      start: Timestamp.fromDate(lastActiveAt),
      end: Timestamp.fromDate(now),
      source: 'screen-lock',
      durationMinutes,
    };
    void writeBreaks([...breaks, gapBreak]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceRecord?.id, attendanceRecord?.punchOut]);

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
      // If the idle handler already opened a window with an earlier start
      // timestamp, keep it — overwriting with `Date.now()` would lose any
      // idle minutes that preceded the explicit lock.
      const now = Date.now();
      if (lockStartedAtRef.current == null || lockStartedAtRef.current > now) {
        lockStartedAtRef.current = now;
      }
    };

    const handleUnlock = async () => {
      const lockStart = lockStartedAtRef.current;
      lockStartedAtRef.current = null;
      if (!lockStart) return;
      const nowMs = Date.now();
      const elapsedMs = nowMs - lockStart;
      // Mark the heartbeat as up-to-date so the sleep-detect path doesn't also
      // log a break for the same gap when the next heartbeat fires.
      lastBeatLocalMsRef.current = nowMs;
      if (elapsedMs < SHORT_LOCK_THRESHOLD_MS) return; // brief lock, ignore
      // Open a break that covers the lock period.
      if (!attendanceDocRef) return;
      const startDate = new Date(lockStart);
      const endDate = new Date(nowMs);
      const durationMinutes = workMinutesBetween(startDate, endDate);
      // Skip if there's somehow already an open break (manual one going).
      if (breaksRef.current.some((b) => !b.end)) return;
      const lockBreak: AttendanceBreak = {
        id: uuid(),
        start: Timestamp.fromDate(startDate),
        end: Timestamp.fromDate(endDate),
        source: 'screen-lock',
        durationMinutes,
      };
      await writeBreaksRef.current([...breaksRef.current, lockBreak]);
    };

    // OS idle handler — same accounting as a screen-lock. The Electron main
    // process tracks idle time and emits `idle` (with the timestamp the OS
    // reports the user went idle) and `active` events.
    const handleIdle = (idleStartedAtMs: number) => {
      // Don't overwrite an already-running lock window.
      if (lockStartedAtRef.current == null) {
        lockStartedAtRef.current = idleStartedAtMs;
      }
    };
    const handleActive = () => {
      handleUnlock();
    };

    // Prefer Electron native events when available.
    const electron = window.electronAPI;
    if (electron?.onScreenLock && electron?.onScreenUnlock) {
      electron.onScreenLock(handleLock);
      electron.onScreenUnlock(handleUnlock);
      electron.onIdle?.(handleIdle);
      electron.onActive?.(handleActive);
      return () => {
        electron.offScreenLock?.();
        electron.offScreenUnlock?.();
        electron.offIdle?.();
        electron.offActive?.();
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
    currentBreakElapsedSeconds,
    breaks,
    closedBreakMinutes,
    totalBreakMinutes,
    manualMinutes,
    personalMinutes,
    awayMinutes,
    capMinutes,
    remainingCapMinutes,
    isOverCap,
    startBreak: startManualBreak,
    startPersonal,
    endBreak,
  };
}
