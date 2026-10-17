'use client';

import type { Booking } from '@/lib/types';
import { buildDetailEntries, bookingReference, formatBookingDates, paxCount, flightHotelSummary } from '@/lib/booking-details';
import { isPackageComponent, isPackagePrimary, packageComponentsOf, packagePrimaryOf, packageAwareProfit } from '@/lib/booking-package';
import { bookingPaid, formatINR } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plane, Flag, Bed, Car, Stamp, Package } from 'lucide-react';

const ItineraryIcon = ({ type }: { type?: string }) => {
  switch (type) {
    case 'flight': return <Plane className="h-4 w-4 text-muted-foreground" />;
    case 'hotel': return <Bed className="h-4 w-4 text-muted-foreground" />;
    case 'car': return <Car className="h-4 w-4 text-muted-foreground" />;
    case 'activity': return <Flag className="h-4 w-4 text-muted-foreground" />;
    case 'visa': return <Stamp className="h-4 w-4 text-muted-foreground" />;
    default: return null;
  }
};

const typeLabel = (type?: string) =>
  type === 'car' ? 'Transfer' : type ? type.charAt(0).toUpperCase() + type.slice(1) : 'N/A';

const statusBadgeClass = (status?: string) =>
  status === 'confirmed'
    ? 'bg-green-100 text-green-800 border-green-200'
    : status === 'pending' || status === 'hold'
    ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
    : status === 'blocked'
    ? 'bg-orange-100 text-orange-800 border-orange-200'
    : status === 'cancelled'
    ? 'bg-red-100 text-red-800 border-red-200'
    : '';

const statusLabel = (status?: string) =>
  status === 'hold' || status === 'pending' ? 'Hold' : status === 'blocked' ? 'Blocked' : status;

export function BookingDetailsDialog({
  booking,
  onOpenChange,
  canViewRevenue,
  allBookings = [],
}: {
  booking: Booking | null;
  onOpenChange: (open: boolean) => void;
  canViewRevenue: boolean;
  allBookings?: Booking[];
}) {
  if (!booking) return null;
  const ref = bookingReference(booking);
  const entries = buildDetailEntries(booking);
  const pax = paxCount(booking);
  const paid = bookingPaid(booking);
  const balance = Math.max(0, (booking.total || 0) - paid);
  const profit = packageAwareProfit(booking, allBookings);
  const isComponent = isPackageComponent(booking);
  const primary = packagePrimaryOf(booking, allBookings);
  const components = isPackagePrimary(booking) ? packageComponentsOf(booking, allBookings) : [];

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ItineraryIcon type={booking.bookingType} />
            {typeLabel(booking.bookingType)} — {booking.clientName || 'Unknown Client'}
            <Badge variant="secondary" className={statusBadgeClass(booking.status)}>
              {statusLabel(booking.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          {ref && (
            <div className="min-w-0">
              <span className="text-muted-foreground">{ref.label}: </span>
              <span className="font-medium">{ref.value}</span>
            </div>
          )}
          <div className="min-w-0">
            <span className="text-muted-foreground">Dates: </span>
            <span className="font-medium">{formatBookingDates(booking)}</span>
          </div>
          {(booking.bookingPortal || booking.supplierName) && (
            <div className="min-w-0">
              <span className="text-muted-foreground">Portal: </span>
              <span className="font-medium">{booking.bookingPortal || booking.supplierName}</span>
            </div>
          )}
          {pax > 0 && (
            <div className="min-w-0">
              <span className="text-muted-foreground">Pax: </span>
              <span className="font-medium">{pax}</span>
            </div>
          )}
        </div>

        {isComponent && (
          <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" />
            <span>
              Part of a package — priced under{' '}
              <span className="font-medium">
                {primary ? `${typeLabel(primary.bookingType)} (${flightHotelSummary(primary) !== '—' ? flightHotelSummary(primary) : `BK-${primary.id.slice(-5)}`})` : 'another booking'}
              </span>. This booking has no price of its own.
            </span>
          </div>
        )}
        {components.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" />
            <span>
              This booking&apos;s price covers {components.length} other booking{components.length === 1 ? '' : 's'} in the package:{' '}
              {components.map((c, i) => (
                <span key={c.id} className="font-medium">
                  {i > 0 && ', '}
                  {typeLabel(c.bookingType)}
                </span>
              ))}.
            </span>
          </div>
        )}

        {canViewRevenue && !isComponent && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Customer Price</p>
              <p className="font-semibold">{formatINR(booking.total || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cost</p>
              <p className="font-semibold">{formatINR(booking.supplierCost || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Profit</p>
              <p className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatINR(profit)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balance Due</p>
              <p className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatINR(balance)}</p>
            </div>
          </div>
        )}

        {booking.remarks && (
          <div className="text-sm">
            <span className="text-muted-foreground">Remarks: </span>
            <span className="break-words">{booking.remarks}</span>
          </div>
        )}

        {entries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 rounded-md bg-muted/40 p-3 text-sm">
            {entries.map((entry, i) => {
              if (entry.isTable && Array.isArray(entry.value)) {
                const cols = entry.columns ?? [
                  { key: 'from', label: 'From' },
                  { key: 'to', label: 'To' },
                  { key: 'date', label: 'Date' },
                ];
                return (
                  <div key={`${entry.label}-${i}`} className="col-span-2 sm:col-span-4">
                    <span className="text-muted-foreground font-medium">{entry.label}: </span>
                    <table className="mt-2 w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          {cols.map((c) => (
                            <th key={c.key} className="py-1 px-2 text-xs text-muted-foreground font-medium">{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entry.value.map((row: any, idx: number) => (
                          <tr key={idx} className="border-b border-border/50 last:border-0">
                            {cols.map((c) => (
                              <td key={c.key} className="py-1 px-2">{row[c.key]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              return (
                <div key={`${entry.label}-${i}`} className="min-w-0">
                  <span className="text-muted-foreground">{entry.label}: </span>
                  <span className="text-foreground break-words">{entry.value}</span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
