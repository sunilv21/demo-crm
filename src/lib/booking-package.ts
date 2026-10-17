import type { Booking } from '@/lib/types';

/** True when this booking's price lives on a different (primary) booking in its package. */
export function isPackageComponent(b: Pick<Booking, 'packageGroupId' | 'packageIsPrimary'>): boolean {
  return !!b.packageGroupId && !b.packageIsPrimary;
}

/** True when this booking carries the real price for its package. */
export function isPackagePrimary(b: Pick<Booking, 'packageGroupId' | 'packageIsPrimary'>): boolean {
  return !!b.packageGroupId && !!b.packageIsPrimary;
}

/** The other bookings sharing `booking`'s package (excluding itself). */
export function packageSiblingsOf(booking: Pick<Booking, 'id' | 'packageGroupId'>, allBookings: Booking[]): Booking[] {
  if (!booking.packageGroupId) return [];
  return allBookings.filter((b) => b.id !== booking.id && b.packageGroupId === booking.packageGroupId);
}

/** The non-primary bookings in `primary`'s package (what its price covers). */
export function packageComponentsOf(primary: Pick<Booking, 'id' | 'packageGroupId'>, allBookings: Booking[]): Booking[] {
  return packageSiblingsOf(primary, allBookings).filter((b) => !b.packageIsPrimary);
}

/** The primary booking of `booking`'s package (undefined if it has none, or IS the primary). */
export function packagePrimaryOf(booking: Pick<Booking, 'id' | 'packageGroupId' | 'packageIsPrimary'>, allBookings: Booking[]): Booking | undefined {
  if (!booking.packageGroupId || booking.packageIsPrimary) return undefined;
  return allBookings.find((b) => b.packageGroupId === booking.packageGroupId && b.packageIsPrimary);
}

/** Profit credited to `booking`, package-aware. A package primary's profit is the whole
 * package price minus its OWN cost and every component's real cost — a component itself
 * always shows 0 (its price lives on the primary). An ordinary non-package booking is
 * unaffected — same total-minus-cost (or manual `profit` override) as before. */
export function packageAwareProfit(booking: Booking, allBookings: Booking[]): number {
  if (isPackageComponent(booking)) return 0;
  if (isPackagePrimary(booking)) {
    const componentsCost = packageComponentsOf(booking, allBookings).reduce((s, c) => s + (c.supplierCost || 0), 0);
    return (booking.total || 0) - (booking.supplierCost || 0) - componentsCost;
  }
  return booking.profit ?? ((booking.total || 0) - (booking.supplierCost || 0));
}
