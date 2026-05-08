import type { Attendance, AttendanceStatus, Leave } from './types';

export const IST_TZ = 'Asia/Kolkata';

export const DEFAULT_WORK_START = '09:30';
export const DEFAULT_WORK_END = '18:30';
export const DEFAULT_GRACE_MINUTES = 15;
export const AUTO_LOGOUT_HOUR_IST = 21;

export const LEAVE_QUOTAS = {
  casual: 12,
  sick: 8,
  earned: 12,
  lop: Infinity,
} as const;

export const DEFAULT_MONTHLY_LEAVE_CAP = 2;

export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ }).format(new Date());
}

export function dateToIST(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ }).format(date);
}

export function formatTimeIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export function parseHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

export function minutesSinceMidnightIST(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

export function isLatePunchIn(
  punchIn: Date,
  workStartTime: string,
  graceMinutes: number,
): boolean {
  const { h, m } = parseHHMM(workStartTime);
  const startWithGrace = h * 60 + m + graceMinutes;
  return minutesSinceMidnightIST(punchIn) > startWithGrace;
}

export function isEarlyPunchOut(punchOut: Date, workEndTime: string): boolean {
  const { h, m } = parseHHMM(workEndTime);
  return minutesSinceMidnightIST(punchOut) < h * 60 + m;
}

export function workMinutesBetween(punchIn: Date, punchOut: Date): number {
  return Math.max(0, Math.round((punchOut.getTime() - punchIn.getTime()) / 60000));
}

export function computeStatus(record: {
  punchIn?: any;
  punchOut?: any;
  punchInLate: boolean;
  punchOutEarly: boolean;
  workStartTime: string;
  workEndTime: string;
}): AttendanceStatus {
  if (!record.punchIn) return 'absent';
  const start = parseHHMM(record.workStartTime);
  const end = parseHHMM(record.workEndTime);
  const expectedMinutes = end.h * 60 + end.m - (start.h * 60 + start.m);
  const punchIn = toDate(record.punchIn);
  const punchOut = record.punchOut ? toDate(record.punchOut) : null;
  if (punchOut) {
    const worked = workMinutesBetween(punchIn, punchOut);
    if (worked < expectedMinutes / 2) return 'half-day';
  }
  return record.punchInLate ? 'late' : 'present';
}

export function toDate(value: any): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return new Date(0);
}

export function monthDates(year: number, month: number): string[] {
  const out: string[] = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const mm = String(month).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    out.push(`${year}-${mm}-${dd}`);
  }
  return out;
}

export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function isSunday(dateStr: string): boolean {
  return dayOfWeek(dateStr) === 0;
}

export interface DayCell {
  date: string;
  status: AttendanceStatus;
  attendance?: Attendance;
  leave?: Leave;
}

export function buildMonthCells(
  year: number,
  month: number,
  attendance: Attendance[],
  leaves: Leave[],
  holidaysSet: Set<string>,
  monthlyLeaveCap?: number,
): DayCell[] {
  const dates = monthDates(year, month);
  const attMap = new Map(attendance.map((a) => [a.date, a]));
  const todayStr = todayIST();
  const cap = monthlyLeaveCap ?? Infinity;
  let approvedNonLopLeavesUsed = 0;

  return dates.map((date) => {
    // Sundays count as holidays — no work, no deduction.
    if (holidaysSet.has(date) || isSunday(date)) {
      return { date, status: 'holiday' as AttendanceStatus };
    }

    const att = attMap.get(date);
    if (att) {
      return { date, status: att.status, attendance: att };
    }

    const approvedLeave = leaves.find(
      (l) => l.status === 'approved' && date >= l.startDate && date <= l.endDate,
    );
    if (approvedLeave) {
      // LOP is always treated as a deductible 'leave' record (handled in payroll).
      if (approvedLeave.type === 'lop') {
        return { date, status: 'leave', leave: approvedLeave };
      }
      // Apply monthly cap to paid leaves: first N stay as paid leave, the rest
      // flip to 'absent' so they get deducted in payroll.
      approvedNonLopLeavesUsed += 1;
      if (approvedNonLopLeavesUsed <= cap) {
        return { date, status: 'leave', leave: approvedLeave };
      }
      return { date, status: 'absent' };
    }

    if (date < todayStr) return { date, status: 'absent' };
    if (date === todayStr) return { date, status: 'present' };
    return { date, status: 'upcoming' };
  });
}

export const STATUS_META: Record<AttendanceStatus, { label: string; cls: string; dot: string }> = {
  present: {
    label: 'Present',
    cls: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
  },
  late: {
    label: 'Late',
    cls: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dot: 'bg-yellow-500',
  },
  'half-day': {
    label: 'Half Day',
    cls: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
  },
  absent: {
    label: 'Absent',
    cls: 'bg-red-100 text-red-800 border-red-200',
    dot: 'bg-red-500',
  },
  leave: {
    label: 'Leave',
    cls: 'bg-blue-100 text-blue-800 border-blue-200',
    dot: 'bg-blue-500',
  },
  holiday: {
    label: 'Holiday',
    cls: 'bg-gray-100 text-gray-700 border-gray-200',
    dot: 'bg-gray-400',
  },
  upcoming: {
    label: 'Upcoming',
    cls: 'bg-transparent text-muted-foreground border-dashed',
    dot: 'bg-transparent',
  },
};

export function daysBetween(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000)) + 1;
}

export function approvedLeaveDaysInMonth(
  leaves: Leave[],
  year: number,
  month: number,
  type?: 'casual' | 'sick' | 'earned' | 'lop',
): number {
  const cells = monthDates(year, month);
  let count = 0;
  for (const date of cells) {
    if (
      leaves.some(
        (l) =>
          l.status === 'approved' &&
          (type ? l.type === type : true) &&
          date >= l.startDate &&
          date <= l.endDate,
      )
    ) {
      count += 1;
    }
  }
  return count;
}

export function approvedLeavesUsedThisYear(leaves: Leave[], type: 'casual' | 'sick' | 'earned'): number {
  const year = new Date().getFullYear();
  return leaves
    .filter((l) => l.status === 'approved' && l.type === type)
    .reduce((acc, l) => {
      const startYear = Number(l.startDate.slice(0, 4));
      if (startYear !== year) return acc;
      return acc + (l.days || daysBetween(l.startDate, l.endDate));
    }, 0);
}

export interface PayrollRow {
  userId: string;
  userName: string;
  email: string;
  role: string;
  baseSalary: number;
  workingDays: number;
  presentDays: number;
  lateCount: number;
  halfDays: number;
  paidLeaves: number;
  lopDays: number;
  absentDays: number;
  lateHalfDayDeductions: number;
  totalBreakMinutes: number;
  breakOverCapMinutes: number;
  breakOverCapDayDeduction: number;
  totalDeductionDays: number;
  payableDays: number;
  netPay: number;
}

export function computePayroll(args: {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    baseSalary?: number;
    monthlyLeaveCap?: number;
    dailyBreakCapMinutes?: number;
    workStartTime?: string;
    workEndTime?: string;
  };
  year: number;
  month: number;
  attendance: Attendance[];
  leaves: Leave[];
  holidays: Set<string>;
}): PayrollRow {
  const { user, year, month, attendance, leaves, holidays } = args;
  const cells = buildMonthCells(
    year,
    month,
    attendance,
    leaves,
    holidays,
    user.monthlyLeaveCap,
  );

  let workingDays = 0;
  let presentDays = 0;
  let lateCount = 0;
  let halfDays = 0;
  let paidLeaves = 0;
  let lopDays = 0;
  let absentDays = 0;
  let totalBreakMinutes = 0;
  let totalOverCapMinutes = 0;

  // For break-cap deductions we need a "shift length in minutes" reference.
  const start = parseHHMM(user.workStartTime ?? DEFAULT_WORK_START);
  const end = parseHHMM(user.workEndTime ?? DEFAULT_WORK_END);
  const expectedShiftMinutes = Math.max(
    1,
    end.h * 60 + end.m - (start.h * 60 + start.m),
  );
  const breakCap = user.dailyBreakCapMinutes ?? 0;

  for (const cell of cells) {
    // Holidays/Sundays are non-working. Future ('upcoming') days haven't
    // happened yet — don't count them in payroll until they do.
    if (cell.status === 'holiday' || cell.status === 'upcoming') continue;
    workingDays += 1;
    switch (cell.status) {
      case 'present':
        presentDays += 1;
        break;
      case 'late':
        presentDays += 1;
        lateCount += 1;
        break;
      case 'half-day':
        halfDays += 1;
        break;
      case 'absent':
        absentDays += 1;
        break;
      case 'leave': {
        if (cell.leave?.type === 'lop') lopDays += 1;
        else paidLeaves += 1;
        break;
      }
    }
    if (cell.attendance) {
      const dayBreakMinutes = cell.attendance.breakMinutes ?? 0;
      totalBreakMinutes += dayBreakMinutes;
      if (breakCap > 0 && dayBreakMinutes > breakCap) {
        totalOverCapMinutes += dayBreakMinutes - breakCap;
      }
    }
  }

  // Convert over-cap break minutes into fractional-day deductions, scaled
  // against the user's expected shift length so a 30 min over-cap on an 8 h
  // shift = 30/480 ≈ 0.0625 day deduction.
  const breakOverCapDayDeduction = totalOverCapMinutes / expectedShiftMinutes;

  const lateHalfDayDeductions = Math.floor(lateCount / 3) * 0.5;
  const totalDeductionDays =
    absentDays +
    lopDays +
    halfDays * 0.5 +
    lateHalfDayDeductions +
    breakOverCapDayDeduction;
  const payableDays = Math.max(0, workingDays - totalDeductionDays);
  const baseSalary = user.baseSalary ?? 0;
  const netPay = workingDays > 0 ? Math.round(baseSalary * (payableDays / workingDays)) : 0;

  return {
    userId: user.id,
    userName: user.name,
    email: user.email,
    role: user.role,
    baseSalary,
    workingDays,
    presentDays,
    lateCount,
    halfDays,
    paidLeaves,
    lopDays,
    absentDays,
    lateHalfDayDeductions,
    totalBreakMinutes,
    breakOverCapMinutes: totalOverCapMinutes,
    breakOverCapDayDeduction,
    totalDeductionDays,
    payableDays,
    netPay,
  };
}

export function rowsToCsv(rows: PayrollRow[], monthLabel: string): string {
  const header = [
    'Name',
    'Email',
    'Role',
    'Base Salary',
    'Working Days',
    'Present',
    'Late',
    'Half Days',
    'Paid Leaves',
    'LOP',
    'Absent',
    'Late ½-day Deductions',
    'Total Break (min)',
    'Over-cap Break (min)',
    'Total Deductions',
    'Payable Days',
    'Net Pay',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.userName),
        csvEscape(r.email),
        r.role,
        r.baseSalary,
        r.workingDays,
        r.presentDays,
        r.lateCount,
        r.halfDays,
        r.paidLeaves,
        r.lopDays,
        r.absentDays,
        r.lateHalfDayDeductions,
        r.totalBreakMinutes,
        r.breakOverCapMinutes,
        r.totalDeductionDays,
        r.payableDays,
        r.netPay,
      ].join(','),
    );
  }
  return `Payroll for ${monthLabel}\n` + lines.join('\n');
}

function csvEscape(value: string): string {
  if (value == null) return '';
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
