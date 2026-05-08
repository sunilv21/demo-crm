'use client';

import { ChevronLeft, ChevronRight, Coffee, LogIn, LogOut, MonitorOff, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  STATUS_META,
  dayOfWeek,
  formatDateLong,
  formatTimeIST,
  toDate,
  type DayCell,
} from '@/lib/attendance';
import { AdminDayEditDialog } from '@/components/attendance/admin-day-edit-dialog';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AttendanceCalendar({
  cells,
  monthLabel,
  goPrev,
  goNext,
  selectedDate,
  onSelectDate,
}: {
  cells: DayCell[];
  monthLabel: string;
  goPrev?: () => void;
  goNext?: () => void;
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
}) {
  if (cells.length === 0) return null;
  const firstWeekday = dayOfWeek(cells[0].date);
  const padding = Array.from({ length: firstWeekday });
  const clickable = !!onSelectDate;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{monthLabel}</CardTitle>
        {goPrev && goNext && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-0.5 font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {padding.map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {cells.map((cell) => {
              const day = Number(cell.date.slice(-2));
              const meta = STATUS_META[cell.status];
              const tooltip = `${cell.date}: ${meta.label}${
                cell.attendance?.punchInLate ? ' (late)' : ''
              }${cell.attendance?.punchOutEarly ? ' (early out)' : ''}`;
              const isSelected = selectedDate === cell.date;
              const cellClass = `h-9 rounded border flex flex-col items-center justify-center ${meta.cls}${
                isSelected ? ' ring-2 ring-primary ring-offset-1' : ''
              }${clickable ? ' cursor-pointer hover:opacity-80 transition' : ''}`;
              const inner = (
                <>
                  <div className="text-xs font-medium leading-none">{day}</div>
                  <div className={`mt-0.5 h-1 w-1 rounded-full ${meta.dot}`} />
                </>
              );
              if (clickable) {
                return (
                  <button
                    key={cell.date}
                    type="button"
                    title={tooltip}
                    onClick={() => onSelectDate?.(cell.date)}
                    className={cellClass}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <div key={cell.date} title={tooltip} className={cellClass}>
                  {inner}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground justify-center">
            {Object.entries(STATUS_META)
              .filter(([key]) => key !== 'upcoming')
              .map(([key, meta]) => (
                <div key={key} className="flex items-center gap-1">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${meta.dot}`}
                  />
                  <span>{meta.label}</span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Detail panel for a single day. Shows punch in/out, gross, breaks, away,
 * active hours, and the per-break log. Used below the calendar — admin sees
 * an employee's day, employee sees their own.
 *
 * Pass `admin` to surface an Edit / Mark Present button for that day.
 */
export function DayDetailPanel({
  cell,
  admin,
}: {
  cell: DayCell | null;
  admin?: {
    userId: string;
    userName: string;
    workStartTime?: string;
    workEndTime?: string;
    lateGraceMinutes?: number;
  };
}) {
  if (!cell) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Click a date on the calendar to see details.
        </CardContent>
      </Card>
    );
  }

  const meta = STATUS_META[cell.status];
  const att = cell.attendance;
  const grossMin = att?.workMinutes ?? 0;
  const breakMin = att?.breakMinutes ?? 0;
  const activeMin = Math.max(0, grossMin - breakMin);

  const breaks = (att?.breaks ?? []).filter((b) => b.end);
  const manualBreaks = breaks.filter((b) => b.source === 'manual');
  const personalBreaks = breaks.filter((b) => b.source === 'personal');
  const lockBreaks = breaks.filter((b) => b.source === 'screen-lock');
  const manualMin = manualBreaks.reduce((s, b) => s + (b.durationMinutes ?? 0), 0);
  const personalMin = personalBreaks.reduce((s, b) => s + (b.durationMinutes ?? 0), 0);
  const awayMin = lockBreaks.reduce((s, b) => s + (b.durationMinutes ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-3">
        <CardTitle className="text-base">{formatDateLong(cell.date)}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={`${meta.cls} capitalize`}>{meta.label}</Badge>
          {admin && cell.status !== 'holiday' && cell.status !== 'upcoming' && (
            <AdminDayEditDialog
              date={cell.date}
              userId={admin.userId}
              userName={admin.userName}
              workStartTime={admin.workStartTime}
              workEndTime={admin.workEndTime}
              lateGraceMinutes={admin.lateGraceMinutes}
              attendance={att ?? null}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!att && cell.status !== 'leave' && (
          <p className="text-sm text-muted-foreground">
            {cell.status === 'absent'
              ? 'No attendance recorded for this day.'
              : cell.status === 'holiday'
                ? 'Company holiday or week-off.'
                : 'No record yet.'}
          </p>
        )}

        {cell.leave && (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <span className="font-medium capitalize">{cell.leave.type} leave</span>
            {cell.leave.reason && (
              <span className="text-muted-foreground"> — {cell.leave.reason}</span>
            )}
          </div>
        )}

        {att && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <LogIn className="h-3 w-3" /> Punch In
                </div>
                <div className="mt-0.5 font-medium">
                  {att.punchIn ? formatTimeIST(toDate(att.punchIn)) : '—'}
                  {att.punchInLate && (
                    <span className="ml-1 text-xs text-yellow-700">(late)</span>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <LogOut className="h-3 w-3" /> Punch Out
                </div>
                <div className="mt-0.5 font-medium">
                  {att.punchOut ? formatTimeIST(toDate(att.punchOut)) : '—'}
                  {att.punchOutEarly && (
                    <span className="ml-1 text-xs text-yellow-700">(early)</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Gross</div>
                <div className="mt-0.5 font-medium">
                  {grossMin ? `${Math.floor(grossMin / 60)}h ${grossMin % 60}m` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Active</div>
                <div className="mt-0.5 font-medium text-green-700">
                  {grossMin ? `${Math.floor(activeMin / 60)}h ${activeMin % 60}m` : '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded border bg-orange-50 border-orange-200 px-3 py-2">
                <div className="flex items-center gap-1 text-xs text-orange-800">
                  <Coffee className="h-3 w-3" /> Break
                </div>
                <div className="mt-0.5 font-medium text-orange-900">
                  {manualMin}m · {manualBreaks.length}×
                </div>
              </div>
              <div className="rounded border bg-blue-50 border-blue-200 px-3 py-2">
                <div className="flex items-center gap-1 text-xs text-blue-800">
                  <Phone className="h-3 w-3" /> Personal
                </div>
                <div className="mt-0.5 font-medium text-blue-900">
                  {personalMin}m · {personalBreaks.length}×
                </div>
              </div>
              <div className="rounded border bg-purple-50 border-purple-200 px-3 py-2">
                <div className="flex items-center gap-1 text-xs text-purple-800">
                  <MonitorOff className="h-3 w-3" /> Away
                </div>
                <div className="mt-0.5 font-medium text-purple-900">
                  {awayMin}m · {lockBreaks.length}×
                </div>
              </div>
            </div>

            {breaks.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Break log</div>
                <ul className="text-sm divide-y rounded border">
                  {breaks
                    .sort(
                      (a, b) =>
                        toDate(a.start).getTime() - toDate(b.start).getTime(),
                    )
                    .map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="flex items-center gap-2">
                          {b.source === 'screen-lock' ? (
                            <MonitorOff className="h-3 w-3 text-purple-700" />
                          ) : b.source === 'personal' ? (
                            <Phone className="h-3 w-3 text-blue-700" />
                          ) : (
                            <Coffee className="h-3 w-3 text-orange-700" />
                          )}
                          <span>
                            {formatTimeIST(toDate(b.start))} →{' '}
                            {formatTimeIST(toDate(b.end))}
                          </span>
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {b.durationMinutes ?? 0} min
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
