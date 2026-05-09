import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

initializeApp();

interface AdminResetPasswordData {
  uid: string;
  newPassword: string;
}

/**
 * Direct password reset by an admin.
 *
 * Caller must:
 *   - be authenticated
 *   - have role === 'admin' in /users/{caller.uid}
 *
 * Then we use Firebase Admin SDK to set the target user's password directly,
 * no current-password required (only an admin operation can do this).
 */
export const adminResetPassword = onCall<AdminResetPasswordData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  // Verify caller is admin via their /users/{uid} doc.
  const callerSnap = await getFirestore()
    .doc(`users/${request.auth.uid}`)
    .get();

  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can reset passwords.');
  }

  const { uid, newPassword } = request.data ?? ({} as AdminResetPasswordData);
  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'Target uid is required.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError(
      'invalid-argument',
      'New password must be at least 6 characters.',
    );
  }

  try {
    await getAuth().updateUser(uid, { password: newPassword });
  } catch (err: any) {
    throw new HttpsError(
      'internal',
      err?.message || 'Failed to update password.',
    );
  }

  return { success: true };
});

// ---------------------------------------------------------------------------
// Scheduled attendance reconciliation.
//
// Catches the worst case the client-side mechanisms can't:
//   "User punched in, never opened the app again."
//
// Runs every 10 minutes. For each attendance doc with `punchOut == null`:
//   • If the doc's date is older than yesterday → force-close at workEnd of
//     that day (or last `lastActiveAt`, whichever is later, but never beyond
//     workEnd).
//   • If today and lastActiveAt is older than STALE_THRESHOLD_MIN → close
//     any open break and force-punch-out at lastActiveAt. Treats the gap as
//     Away time the same way the client does.
//
// Marks autoLoggedOut: true and recomputes workMinutes / breakMinutes /
// activeMinutes / status so payroll and the calendar render correctly.
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_MIN = 30; // close today's record if no heartbeat in 30 min

interface BreakDoc {
  id: string;
  start: Timestamp;
  end: Timestamp | null;
  source: 'manual' | 'screen-lock' | 'personal';
  durationMinutes?: number;
}

interface AttendanceDoc {
  userId: string;
  date: string; // YYYY-MM-DD (IST)
  punchIn: Timestamp;
  punchOut: Timestamp | null;
  workStartTime?: string;
  workEndTime?: string;
  lateGraceMinutes?: number;
  punchInLate?: boolean;
  punchOutEarly?: boolean;
  breaks?: BreakDoc[];
  breakMinutes?: number;
  workMinutes?: number;
  activeMinutes?: number;
  status?: string;
  lastActiveAt?: Timestamp;
}

function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

function diffMinutes(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

/** Build the workEnd Date for a given YYYY-MM-DD + HH:MM time, in IST. */
function workEndDate(dateIso: string, workEndTime: string): Date {
  const [h, m] = workEndTime.split(':').map(Number);
  // Construct the IST-local datetime, then translate to UTC. We work in
  // ISO strings so DST/ambiguity isn't an issue — IST is UTC+5:30 always.
  const [y, mo, d] = dateIso.split('-').map(Number);
  // Date treated as IST: subtract IST offset (5h30m) to get UTC.
  const utcMs = Date.UTC(y, mo - 1, d, h - 5, m - 30, 0, 0);
  return new Date(utcMs);
}

function computeStatus(att: {
  workMinutes: number;
  workStartTime?: string;
  workEndTime?: string;
  punchInLate?: boolean;
}): string {
  const expected = (() => {
    const ws = att.workStartTime ?? '09:30';
    const we = att.workEndTime ?? '18:30';
    const [wsh, wsm] = ws.split(':').map(Number);
    const [weh, wem] = we.split(':').map(Number);
    return weh * 60 + wem - (wsh * 60 + wsm);
  })();
  if (att.workMinutes < expected / 2) return 'half-day';
  if (att.punchInLate) return 'late';
  return 'present';
}

export const reconcileAttendance = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
  },
  async () => {
    const db = getFirestore();
    const today = todayIST();

    const openSnap = await db
      .collection('attendance')
      .where('punchOut', '==', null)
      .get();

    if (openSnap.empty) {
      logger.info('reconcileAttendance: no open records');
      return;
    }

    const now = new Date();
    let closed = 0;

    for (const docSnap of openSnap.docs) {
      const att = docSnap.data() as AttendanceDoc;
      const ref = docSnap.ref;
      const isToday = att.date === today;
      const lastActiveAt = att.lastActiveAt?.toDate() ?? att.punchIn?.toDate();
      if (!lastActiveAt) continue;

      // Skip today's record if heartbeat is fresh — user is actively working.
      if (isToday && diffMinutes(lastActiveAt, now) < STALE_THRESHOLD_MIN) {
        continue;
      }

      // Determine the effective punchOut moment.
      //   - For a stale "today" record: use lastActiveAt.
      //   - For an old record: cap at workEnd of that day, never extend past it.
      const workEnd = workEndDate(att.date, att.workEndTime ?? '18:30');
      let effectivePunchOut = lastActiveAt;
      if (!isToday) {
        // Use the LATER of (lastActiveAt, workEnd) but never go beyond workEnd.
        effectivePunchOut = lastActiveAt.getTime() > workEnd.getTime()
          ? workEnd
          : lastActiveAt;
        // If both are absurdly early (e.g. they punched in but had no
        // heartbeat updates at all), still cap at workEnd.
        if (effectivePunchOut < workEnd && diffMinutes(effectivePunchOut, workEnd) > 60) {
          // Trust lastActiveAt — they walked away mid-day, system shouldn't
          // claim they worked till closing.
        }
      }

      // Reconcile breaks: close any open break at lastActiveAt.
      const breaks: BreakDoc[] = (att.breaks ?? []).map((b) => {
        if (b.end) return b;
        const startMs = b.start.toDate().getTime();
        const endMs = effectivePunchOut.getTime();
        const durationMinutes = Math.max(
          0,
          Math.round((endMs - startMs) / 60000),
        );
        return {
          ...b,
          end: Timestamp.fromDate(effectivePunchOut),
          durationMinutes,
        };
      });

      const breakMinutes = breaks
        .filter((b) => b.end)
        .reduce((s, b) => s + (b.durationMinutes ?? 0), 0);

      const punchInDate = att.punchIn.toDate();
      const workMinutes = diffMinutes(punchInDate, effectivePunchOut);
      const activeMinutes = Math.max(0, workMinutes - breakMinutes);
      const status = computeStatus({
        workMinutes,
        workStartTime: att.workStartTime,
        workEndTime: att.workEndTime,
        punchInLate: att.punchInLate,
      });
      const punchOutEarly = effectivePunchOut < workEnd;

      await ref.update({
        punchOut: Timestamp.fromDate(effectivePunchOut),
        punchOutEarly,
        autoLoggedOut: true,
        breaks,
        breakMinutes,
        workMinutes,
        activeMinutes,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      closed += 1;
      logger.info('reconcileAttendance: closed', {
        userId: att.userId,
        date: att.date,
        workMinutes,
        breakMinutes,
      });
    }

    logger.info(`reconcileAttendance: ${closed} records reconciled`);
  },
);
