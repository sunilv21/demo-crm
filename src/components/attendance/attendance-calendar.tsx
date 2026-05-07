'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STATUS_META, dayOfWeek, type DayCell } from '@/lib/attendance';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AttendanceCalendar({
  cells,
  monthLabel,
  goPrev,
  goNext,
}: {
  cells: DayCell[];
  monthLabel: string;
  goPrev?: () => void;
  goNext?: () => void;
}) {
  if (cells.length === 0) return null;
  const firstWeekday = dayOfWeek(cells[0].date);
  const padding = Array.from({ length: firstWeekday });

  return (
    <Card className="h-full">
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
              return (
                <div
                  key={cell.date}
                  title={tooltip}
                  className={`h-9 rounded border flex flex-col items-center justify-center ${meta.cls}`}
                >
                  <div className="text-xs font-medium leading-none">{day}</div>
                  <div className={`mt-0.5 h-1 w-1 rounded-full ${meta.dot}`} />
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground justify-center">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <div key={key} className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                <span>{meta.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
