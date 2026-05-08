'use client';

import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { Attendance, AttendanceStatus } from '@/lib/types';
import {
  DEFAULT_GRACE_MINUTES,
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  formatDateLong,
  isEarlyPunchOut,
  isLatePunchIn,
  toDate,
  workMinutesBetween,
} from '@/lib/attendance';

interface Props {
  date: string;
  userId: string;
  userName: string;
  workStartTime?: string;
  workEndTime?: string;
  lateGraceMinutes?: number;
  attendance?: (Attendance & { id: string }) | null;
  trigger?: React.ReactNode;
}

const STATUS_OPTIONS: AttendanceStatus[] = [
  'present',
  'late',
  'half-day',
  'absent',
];

function combineDateAndTime(dateStr: string, hhmm: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

function formatTimeInput(value: any): string {
  if (!value) return '';
  const d = toDate(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

/**
 * Admin-only dialog that overrides an attendance record for a specific user
 * on a specific date. Can:
 *   - Adjust punch-in / punch-out times
 *   - Force status (e.g. mark someone present who didn't log in)
 *   - Create a record from scratch if none exists
 */
export function AdminDayEditDialog({
  date,
  userId,
  userName,
  workStartTime = DEFAULT_WORK_START,
  workEndTime = DEFAULT_WORK_END,
  lateGraceMinutes = DEFAULT_GRACE_MINUTES,
  attendance,
  trigger,
}: Props) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [punchInTime, setPunchInTime] = useState('');
  const [punchOutTime, setPunchOutTime] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPunchInTime(formatTimeInput(attendance?.punchIn) || workStartTime);
    setPunchOutTime(formatTimeInput(attendance?.punchOut) || '');
    setStatus(
      attendance?.status &&
        STATUS_OPTIONS.includes(attendance.status as AttendanceStatus)
        ? (attendance.status as AttendanceStatus)
        : 'present',
    );
  }, [open, attendance, workStartTime]);

  const handleSave = async () => {
    if (!firestore) return;
    if (!punchInTime) {
      toast({ variant: 'destructive', title: 'Punch in time required' });
      return;
    }
    setSubmitting(true);
    const docId = `${userId}_${date}`;
    const ref = doc(firestore, 'attendance', docId);

    const punchInDate = combineDateAndTime(date, punchInTime);
    const punchOutDate = punchOutTime
      ? combineDateAndTime(date, punchOutTime)
      : null;
    const punchInLate = isLatePunchIn(punchInDate, workStartTime, lateGraceMinutes);
    const punchOutEarly = punchOutDate
      ? isEarlyPunchOut(punchOutDate, workEndTime)
      : false;
    const workMinutes = punchOutDate
      ? workMinutesBetween(punchInDate, punchOutDate)
      : 0;
    const breakMinutes = attendance?.breakMinutes ?? 0;
    const activeMinutes = Math.max(0, workMinutes - breakMinutes);

    try {
      if (attendance) {
        // Update existing record. Admin write — owner-locks don't apply.
        await updateDoc(ref, {
          punchIn: Timestamp.fromDate(punchInDate),
          punchOut: punchOutDate ? Timestamp.fromDate(punchOutDate) : null,
          punchInLate,
          punchOutEarly,
          workMinutes,
          activeMinutes,
          status,
          workStartTime,
          workEndTime,
          lateGraceMinutes,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Create from scratch — admin marking someone present.
        await setDoc(ref, {
          userId,
          userName,
          date,
          punchIn: Timestamp.fromDate(punchInDate),
          punchOut: punchOutDate ? Timestamp.fromDate(punchOutDate) : null,
          workStartTime,
          workEndTime,
          lateGraceMinutes,
          punchInLate,
          punchOutEarly,
          autoLoggedOut: false,
          status,
          breaks: [],
          breakMinutes: 0,
          workMinutes,
          activeMinutes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      toast({
        title: attendance ? 'Attendance updated' : 'Attendance created',
        description: `${userName} · ${formatDateLong(date)} · ${status}`,
      });
      setOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: err?.message ?? 'Could not save attendance.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            {attendance ? 'Edit' : 'Mark Present'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {attendance ? 'Edit attendance' : 'Mark as present'}
          </DialogTitle>
          <DialogDescription>
            {userName} · {formatDateLong(date)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="adminPunchIn">Punch In</Label>
              <Input
                id="adminPunchIn"
                type="time"
                value={punchInTime}
                onChange={(e) => setPunchInTime(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="adminPunchOut">Punch Out</Label>
              <Input
                id="adminPunchOut"
                type="time"
                value={punchOutTime}
                onChange={(e) => setPunchOutTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="adminStatus">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as AttendanceStatus)}
            >
              <SelectTrigger id="adminStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Admin override — replaces whatever the system inferred from the
              punch times. Use sparingly.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {attendance ? 'Save changes' : 'Mark Present'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
