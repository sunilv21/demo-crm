// Data model for the "Other Format" itinerary — a structured travel quotation
// (trip summary, one or more hotel options with per-person/total pricing,
// tours & transfers, a day-by-day programme of typed/coloured line items,
// inclusions/exclusions, notes, a cost comparison, and a hotel-differences
// summary).
//
// This is a SEPARATE data model from the Brochure tab's AI-narrative
// ItineraryState (itinerary-types.ts) — nothing is shared between the two.
// It mirrors the shape produced by build_itinerary_skytours.js (the sample
// .docx generator script), so the same object can drive both the on-screen
// preview and the real .docx export.

export const newId = () => Math.random().toString(36).slice(2, 11);

// Extraction runs as five smaller per-section AI calls instead of one big
// call, so the UI can show real progress as each section's data actually
// arrives. Kept here (a plain client-safe module) rather than in the
// AI-flow schema file, which pulls in server-only 'genkit' — the flow files
// mirror this same literal list, see itinerary-format-schema.ts's
// SECTION_KEYS.
export const OF_SECTION_KEYS = ['meta', 'hotels', 'flights', 'tours', 'days', 'extras'] as const;
export type OFSectionKey = (typeof OF_SECTION_KEYS)[number];
export const OF_SECTION_LABELS: Record<OFSectionKey, string> = {
  meta: 'Trip details & summary',
  hotels: 'Hotel options',
  flights: 'Flights',
  tours: 'Tours & transfers',
  days: 'Day-by-day programme',
  extras: 'Inclusions, notes & cost comparison',
};

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

// Visual representations of the same OFItinerary data/content — a rendering
// preference, not part of the document's actual content, so it isn't a field
// on OFItinerary itself (see usePersistedState('...template') in
// other-format-panel.tsx). 'classic' is the original navy-banner/table look
// (other-format-panel.tsx's OtherFormatPreview, itinerary-docx.ts); 'modern'
// is a card/block layout (OtherFormatPreviewModern, itinerary-docx-
// modern.ts) — same brand colors and letterhead, different surface treatment
// (white bordered cards instead of solid navy bars). 'branded' is a Word-
// export-only variant (itinerary-docx-branded.ts) with a stronger royal-
// blue/orange palette — it has no dedicated preview or PDF yet, both of
// those fall back to the Modern look for this template (see
// other-format-panel.tsx and itinerary-pdf.tsx).
export const OF_TEMPLATES = ['classic', 'modern', 'branded'] as const;
export type OFTemplate = (typeof OF_TEMPLATES)[number];

export type OFHotelOption = {
  id: string;
  label: string; // "Option 1", "Option 2", …
  perPerson: string; // numeric amount only, e.g. "767" — currency is the one
  // itinerary-wide OFItinerary.currency, not typed in per field.
  total: string; // e.g. "1,534"
  hotels: OFHotelRow[];
  image?: string; // data URL of an uploaded photo — Branded template only,
  // shown on both the Hotel Accommodation card and the Package Pricing card
  // for this same option (they render from the same hotelOptions array).
};

// One currency for the whole document — set once (manually, or auto-detected
// off the pasted text during extraction) rather than typed per price field,
// so every price in the itinerary (hotel options, cost comparison) reads in
// the same currency instead of drifting between USD/INR/etc. mid-document.
export const OF_CURRENCIES = [
  { code: 'INR', symbol: '₹' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'AED', symbol: 'AED' },
  { code: 'SGD', symbol: 'S$' },
  { code: 'THB', symbol: '฿' },
  { code: 'VND', symbol: '₫' },
  { code: 'MYR', symbol: 'RM' },
  { code: 'IDR', symbol: 'Rp' },
] as const;
export type OFCurrencyCode = (typeof OF_CURRENCIES)[number]['code'];
export const OF_CURRENCY_SYMBOL: Record<OFCurrencyCode, string> = Object.fromEntries(
  OF_CURRENCIES.map((c) => [c.code, c.symbol])
) as Record<OFCurrencyCode, string>;
export const DEFAULT_OF_CURRENCY: OFCurrencyCode = 'INR';

// perPerson/total are stored as whatever digits were typed/extracted (e.g.
// "43453", no separators) — this adds currency-appropriate thousands
// grouping for DISPLAY only (INR groups as lakh/crore — 1,23,456; everything
// else as 123,456), without touching the stored value. Non-numeric input
// (a rare hand-typed edge case) is shown exactly as typed rather than
// mangled. Shared by every preview/export surface (classic + modern,
// on-screen + .docx) so formatting can't drift between them.
export function formatOfAmount(value: string, currency: OFCurrencyCode): string {
  if (!value) return '';
  const n = Number(value.replace(/,/g, ''));
  if (Number.isNaN(n)) return value;
  return n.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US');
}
export function formatOfMoney(value: string, currency: OFCurrencyCode): string {
  if (!value) return '';
  return `${OF_CURRENCY_SYMBOL[currency] || ''}${formatOfAmount(value, currency)}`;
}

export type OFTourRow = { id: string; tour: string; basis: string; details: string };

// A dedicated flight row — mirrors OFHotelRow's role: hotels get their own
// structured list rather than staying as unstructured day-item lines, and
// flights now get the same treatment (previously a flight was only ever a
// free-text 'flight'-type OFDayItem inside a day's programme).
export type OFFlightRow = {
  id: string;
  airline: string; // e.g. "IndiGo"
  flightNo: string; // e.g. "6E-123"
  from: string; // departure city/airport, e.g. "Delhi (DEL)"
  to: string; // arrival city/airport, e.g. "Da Nang (DAD)"
  departure: string; // date + time as written in the source, e.g. "15 Jun, 10:30"
  arrival: string; // date + time as written in the source, e.g. "15 Jun, 14:45"
  travelClass: string; // e.g. "Economy". Named travelClass, not class (reserved word).
  baggage: string; // e.g. "20kg checked + 7kg cabin"
};

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

// One value per hotel option, aligned by index to OFItinerary.hotelOptions —
// so the row/column shape stays in sync however many options there are.
export type OFHotelDifferenceRow = { id: string; city: string; values: string[] };

export type OFCostComparison = {
  componentLabel: string; // e.g. "6N/7D — Bana Hills + HCMC + Phu Quoc"
  componentSub: string; // e.g. "4★ Hotels + Breakfast + All Transfers + All Tours"
  footnote: string; // the "* Cost is in USD..." exclusions line
};

export type OFItinerary = {
  meta: OFMeta;
  currency: OFCurrencyCode; // universal — applies to every price in the document
  tripSummary: OFTripSummaryRow[];
  hotelOptions: OFHotelOption[]; // one or more — the cost comparison and
  // hotel-differences tables render one column per option.
  flights: OFFlightRow[];
  tours: OFTourRow[];
  days: OFDayPlan[];
  inclusions: string[];
  exclusions: string[];
  notes: OFNoteItem[];
  costComparison: OFCostComparison;
  hotelDifferences: OFHotelDifferenceRow[];
  // Uploaded destination photos, keyed by the trimmed destination name as it
  // appears in meta.destinations — Branded template's Destination Highlights
  // cards only. Not an array because meta.destinations itself is a single
  // comma-separated string, not a list of rows with ids.
  destinationImages: Record<string, string>;
};

export function emptyOtherFormatItinerary(): OFItinerary {
  return {
    currency: DEFAULT_OF_CURRENCY,
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
    flights: [],
    tours: [],
    days: [],
    inclusions: [],
    exclusions: [],
    notes: [],
    costComparison: { componentLabel: '', componentSub: '', footnote: '' },
    hotelDifferences: [],
    destinationImages: {},
  };
}
