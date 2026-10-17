import type { Booking } from '@/lib/types';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export function PackageCostIndicator({ booking }: { booking: Pick<Booking, 'supplierCost'> }) {
  const hasCost = (booking.supplierCost || 0) > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs italic ${hasCost ? 'text-green-600' : 'text-amber-600'}`}>
      {hasCost ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
      Included in package{hasCost ? ' — cost added' : ' — cost pending'}
    </span>
  );
}
