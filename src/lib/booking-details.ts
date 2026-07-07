import type { Booking } from "@/lib/types";

export const DETAIL_LABELS: Record<string, string> = {
  airline: "Airline",
  pnr: "PNR",
  departureAirport: "From",
  arrivalAirport: "To",
  cabinClass: "Class",
  hotelName: "Hotel",
  hotelBookingId: "Booking ID",
  city: "City",
  country: "Country",
  roomType: "Room",
  rooms: "Rooms",
  guests: "Guests",
  rentalCompany: "Company",
  vehicleType: "Vehicle",
  pickupLocation: "Pickup",
  dropLocation: "Drop",
  driverName: "Driver",
  driverContact: "Driver Contact",
  activityName: "Activity",
  location: "Location",
  supplierName: "Supplier",
  voucherNumber: "Voucher",
  adults: "Adults",
  children: "Children",
  infants: "Infants",
  pickupPoint: "Pickup Point",
  activityDate: "Date",
  activityTime: "Time",
  bookingName: "Name",
  referenceNumber: "Reference",
  supplier: "Supplier",
  description: "Description",
};

// The real-world reference for a booking (PNR / hotel booking id / voucher / …),
// preferred over the app-generated document id when available.
export function bookingReference(booking: Booking): { label: string; value: string } | null {
  const d = (booking.bookingDetails || {}) as Record<string, any>;
  switch (booking.bookingType) {
    case "flight":
      return d.pnr ? { label: "PNR", value: String(d.pnr) } : null;
    case "hotel":
      return d.hotelBookingId ? { label: "Booking ID", value: String(d.hotelBookingId) } : null;
    case "activity":
      return d.voucherNumber ? { label: "Voucher", value: String(d.voucherNumber) } : null;
    case "other":
      return d.referenceNumber ? { label: "Reference", value: String(d.referenceNumber) } : null;
    default:
      return null;
  }
}

// Collect the type-specific details (plus a few top-level flight fields) for display.
export function buildDetailEntries(booking: Booking): { label: string; value: string | any[]; isTable?: boolean }[] {
  const entries: { label: string; value: string | any[]; isTable?: boolean }[] = [];
  const d = (booking.bookingDetails || {}) as Record<string, any>;

  Object.keys(d).forEach((key) => {
    const v = d[key];
    if (v === undefined || v === null || v === "") return;
    // Skip individual departure/arrival airports for multicity bookings since they're shown in the sectors table
    if (booking.isMultiCity && (key === 'departureAirport' || key === 'arrivalAirport')) return;
    entries.push({ label: DETAIL_LABELS[key] || key, value: String(v) });
  });

  if (booking.bookingPortal) entries.push({ label: "Portal", value: booking.bookingPortal });
  if (booking.isOneWay) entries.push({ label: "Trip", value: "One Way" });
  if (booking.hasLayover && booking.layoverAirport)
    entries.push({ label: "Layover", value: booking.layoverAirport });
  if (booking.isMultiCity && booking.sectors?.length) {
    entries.push({
      label: "Sectors",
      value: booking.sectors
        .map((s) => ({
          from: s.origin || '',
          to: s.destination || '',
          date: s.departure ? new Date(s.departure).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        }))
        .filter((s) => s.from || s.to),
      isTable: true,
    });
  }

  return entries;
}
