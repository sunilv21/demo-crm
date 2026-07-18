// Data model for the "Other Format" itinerary — a structured travel quotation
// (trip summary, dual hotel options with per-person/total pricing, tours &
// transfers, a day-by-day programme of typed/coloured line items, inclusions/
// exclusions, notes, a cost comparison, and a hotel-differences summary).
//
// This is a SEPARATE data model from the Brochure tab's AI-narrative
// ItineraryState (itinerary-types.ts) — nothing is shared between the two.
// It mirrors the shape produced by build_itinerary_skytours.js (the sample
// .docx generator script), so the same object can drive both the on-screen
// preview and the real .docx export.

export const newId = () => Math.random().toString(36).slice(2, 11);

// Fixed company letterhead info for the Other Format .docx export — matches
// the reference letterhead (logo + name + address + contact line). Not
// user-editable per document, same spirit as the Brochure tab's BrandStrip.
export const AGENCY = {
  name: 'Sky Tours & Visa Consultant',
  address: '2nd Floor, Orbit Mall, 282, Near C-21 Mall, Indore, Madhya Pradesh – 452010',
  email: 'tours@skyvisa.in',
  phones: ['+91 85168 63796', '+91 88275 81621', '+91 88272 22177'],
} as const;

export type OFMeta = {
  title: string; // cover headline, e.g. "VIETNAM HOLIDAY — 4 Star"
  country: string; // e.g. "Vietnam"
  guestName: string; // e.g. "Ms. Nupur"
  destinations: string; // comma-separated chips, e.g. "Bana Hills, Ho Chi Minh City, Phu Quoc Island"
  tagline: string; // italic line under the destination chips
  dateRangeShort: string; // running-header date range, e.g. "15–21 Jun 2026"
  duration: string; // e.g. "6N/7D"
  referenceCode: string;
};

export type OFTripSummaryRow = { id: string; label: string; value: string; emphasis?: boolean };

export type OFHotelRow = {
  id: string;
  city: string;
  hotel: string;
  stars: number; // 1–5, rendered as repeated ★
  room: string;
  checkin: string;
  checkout: string;
  nights: number;
};

export type OFHotelOption = {
  id: string;
  label: string; // "Option 1", "Option 2"
  perPerson: string; // free text so currency can be typed in, e.g. "USD 767"
  total: string; // e.g. "USD 1,534"
  hotels: OFHotelRow[];
};

export type OFTourRow = { id: string; tour: string; basis: string; details: string };

export type OFDayItemType =
  | 'transfer'
  | 'checkin'
  | 'attraction'
  | 'explore'
  | 'plain'
  | 'optional'
  | 'meals'
  | 'flight'
  | 'note';

export const OF_DAY_ITEM_LABELS: Record<OFDayItemType, string> = {
  transfer: 'Transfer',
  checkin: 'Hotel Check-in',
  attraction: 'Attraction',
  explore: 'Explore / Sightseeing',
  plain: 'Plain note',
  optional: 'Optional (at own cost)',
  meals: 'Meals',
  flight: 'Flight',
  note: 'Important note',
};

// A day-item's `label` is the bold/coloured lead phrase (a hotel name, an
// attraction name); `text` is the rest of the description. Every item type
// uses the same two fields — simpler to build a form around than the sample
// script's per-type field shapes (pre/hotel/post etc.) while keeping the
// same visual vocabulary (icon + colour + shading per type).
export type OFDayItem = { id: string; type: OFDayItemType; label: string; text: string };

export type OFDayPlan = {
  id: string;
  num: string; // "01"
  date: string; // "15 June 2026"
  weekday: string; // "Monday"
  place: string; // "Da Nang / Bana Hills"
  title: string;
  items: OFDayItem[];
};

export type OFNoteItem = { id: string; label: string; text: string };

export type OFHotelDifferenceRow = { id: string; city: string; opt1: string; opt2: string };

export type OFCostComparison = {
  componentLabel: string; // e.g. "6N/7D — Bana Hills + HCMC + Phu Quoc"
  componentSub: string; // e.g. "4★ Hotels + Breakfast + All Transfers + All Tours"
  footnote: string; // the "* Cost is in USD..." exclusions line
};

export type OFItinerary = {
  meta: OFMeta;
  tripSummary: OFTripSummaryRow[];
  hotelOptions: [OFHotelOption, OFHotelOption]; // fixed at 2 — the cost
  // comparison and hotel-differences tables are structurally opt1-vs-opt2.
  tours: OFTourRow[];
  days: OFDayPlan[];
  inclusions: string[];
  exclusions: string[];
  notes: OFNoteItem[];
  costComparison: OFCostComparison;
  hotelDifferences: OFHotelDifferenceRow[];
};

export function emptyOtherFormatItinerary(): OFItinerary {
  return {
    meta: {
      title: '',
      country: '',
      guestName: '',
      destinations: '',
      tagline: '',
      dateRangeShort: '',
      duration: '',
      referenceCode: '',
    },
    tripSummary: [],
    hotelOptions: [
      { id: newId(), label: 'Option 1', perPerson: '', total: '', hotels: [] },
      { id: newId(), label: 'Option 2', perPerson: '', total: '', hotels: [] },
    ],
    tours: [],
    days: [],
    inclusions: [],
    exclusions: [],
    notes: [],
    costComparison: { componentLabel: '', componentSub: '', footnote: '' },
    hotelDifferences: [],
  };
}
