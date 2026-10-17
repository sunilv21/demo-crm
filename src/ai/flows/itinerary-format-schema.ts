// Shared schema/rules for the itinerary "Other Format" extraction — used by
// BOTH provider paths (itinerary-format-extract.ts for Gemini/Genkit,
// itinerary-format-extract-nvidia.ts for NVIDIA NIM) so the two are held to
// identical extraction behavior and an identical output shape.
//
// Deliberately NOT a 'use server' file: those may only export async
// functions as values (type-only exports are exempt, but a Zod schema object
// and a plain string constant are real value exports and would break the
// "use server" contract). Plain shared code like this belongs in its own
// undirected module that 'use server' files import from.

import { z } from 'genkit';

export const ExtractInputSchema = z.object({
  rawText: z.string().describe('The raw, possibly messy itinerary text pasted by the agent — a supplier email, WhatsApp message, or draft.'),
});
export type ItineraryFormatExtractInput = z.infer<typeof ExtractInputSchema>;

// A small/free-tier model occasionally returns a star rating as "4" (string),
// 4.5, or omits it — coerce and clamp rather than hard-failing the whole
// extraction over one cosmetic field.
export const HotelRowSchema = z.object({
  city: z.string().catch('').describe('City or region the hotel is in. Empty string if unknown.'),
  hotel: z.string().catch('').describe('Hotel name. Empty string if unknown.'),
  stars: z.coerce.number().catch(4).transform((n) => Math.min(5, Math.max(1, Math.round(n) || 4))).describe('Star rating 1-5. Default 4 if not stated.'),
  room: z.string().catch('').describe('Room type, e.g. "Standard Double". Empty string if unknown.'),
  checkin: z.string().catch('').describe('Check-in date as written in the source, e.g. "15-Jun". Empty string if unknown.'),
  checkout: z.string().catch('').describe('Check-out date as written in the source. Empty string if unknown.'),
  nights: z.coerce.number().catch(0).transform((n) => Math.max(0, Math.round(n) || 0)).describe('Number of nights at this hotel. 0 if unknown.'),
});

export const HotelOptionSchema = z.object({
  label: z.string().catch('').describe('"Option 1" or "Option 2".'),
  perPerson: z.string().catch('').describe('Per-person price as a NUMBER ONLY, exactly as written in the source but with any currency symbol/code stripped off — e.g. the source "USD 767" or "₹63,000" becomes "767" or "63,000". The document uses a single currency throughout (detected separately via meta.currencyCode), so do not repeat it here. Empty string if not mentioned — do not estimate or invent a price.'),
  total: z.string().catch('').describe('Total price as a NUMBER ONLY, same rule as perPerson — strip the currency symbol/code, keep the number exactly as written (e.g. "1,534"). Empty string if not mentioned.'),
  hotels: z.array(HotelRowSchema).catch([]),
});

// Dedicated flight rows — a flight used to only ever surface as a free-text
// 'flight'-type day item; it now gets its own structured list, the same
// role hotels have via HotelRowSchema. As many rows as the source describes
// (one per segment/leg — outbound, inbound, and any internal flights).
export const FlightRowSchema = z.object({
  airline: z.string().catch('').describe('Airline name, e.g. "IndiGo". Empty string if unknown.'),
  flightNo: z.string().catch('').describe('Flight number, e.g. "6E-123". Empty string if unknown.'),
  from: z.string().catch('').describe('Departure city/airport, e.g. "Delhi (DEL)". Empty string if unknown.'),
  to: z.string().catch('').describe('Arrival city/airport, e.g. "Da Nang (DAD)". Empty string if unknown.'),
  departure: z.string().catch('').describe('Departure date + time exactly as written in the source, e.g. "15 Jun, 10:30". Empty string if unknown.'),
  arrival: z.string().catch('').describe('Arrival date + time exactly as written in the source, e.g. "15 Jun, 14:45". Empty string if unknown.'),
  travelClass: z.string().catch('').describe('Cabin class if stated, e.g. "Economy". Empty string if not mentioned.'),
  baggage: z.string().catch('').describe('Baggage allowance if stated, e.g. "20kg checked + 7kg cabin". Empty string if not mentioned.'),
});

// A weaker/free-tier model sometimes drifts off the exact enum (e.g. returns
// "sightseeing" or "hotel" instead of "explore"/"checkin") — falling back to
// 'plain' for anything off-list keeps that one line generic instead of
// failing the entire extraction over a single mislabeled type.
const DAY_ITEM_TYPES = ['transfer', 'checkin', 'attraction', 'explore', 'plain', 'optional', 'meals', 'flight', 'note'] as const;
const DayItemTypeSchema = z
  .enum(DAY_ITEM_TYPES)
  .catch('plain')
  .describe(
    "The kind of line: 'transfer' (airport/hotel transfers), 'checkin' (hotel check-in), " +
      "'attraction' (a named sight/tour), 'explore' (general sightseeing/activity), " +
      "'plain' (a neutral note with no strong emphasis), 'optional' (an at-own-cost add-on), " +
      "'meals' (what meals are included that day), 'flight' (a flight segment), " +
      "'note' (a caveat or logistical warning, e.g. timing subject to change)."
  );

// Leaf string/array fields below all get a `.catch()` fallback: a weaker or
// free-tier model occasionally returns null, a number, or an off-shape value
// for a field the source didn't mention, and previously that one slip failed
// Zod validation for the ENTIRE response — forcing a retry (slow) or
// surfacing a raw technical validation dump to the agent (confusing). Falling
// back to '' / [] lets the rest of a mostly-good extraction through intact.
const DayItemSchema = z.object({
  type: DayItemTypeSchema,
  label: z.string().catch('').describe('The short bold lead phrase — a hotel name, attraction name, or short heading for this line. Empty string if the line has no natural lead phrase.'),
  text: z.string().catch('').describe('The rest of the description for this line.'),
});

export const DayPlanSchema = z.object({
  num: z.string().catch('').describe('Two-digit day number as a string, e.g. "01", "02".'),
  date: z.string().catch('').describe('The date as written in the source, e.g. "15 June 2026". Empty string if unknown.'),
  weekday: z.string().catch('').describe('Day of week if stated or inferable from the date, e.g. "Monday". Empty string if unknown.'),
  place: z.string().catch('').describe('The city/region this day takes place in.'),
  title: z.string().catch('').describe('A short heading for the day, e.g. "Arrival in Da Nang — Bana Hills".'),
  items: z.array(DayItemSchema).catch([]).describe('One entry per line/bullet/sentence of that day\'s programme, in the order they appear in the source.'),
});

const DEFAULT_META = { title: '', country: '', guestName: '', destinations: '', tagline: '', dateRangeShort: '', duration: '', referenceCode: '', currencyCode: '' };

// Valid document-wide currency codes, checked downstream (itinerary-
// format.ts) before being applied — kept out of the schema itself as a
// z.enum/union: Gemini's structured-output JSON Schema dialect doesn't
// reliably support that shape, and a bad schema there fails EVERY section's
// extraction (all five share this module), not just meta's. A plain
// `.catch('')` string, like every other free-text field below, is both safer
// and consistent with the rest of this schema.
const OF_CURRENCY_CODES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'VND', 'MYR', 'IDR'] as const;

export const MetaSchema = z.object({
  title: z.string().catch('').describe('An overall trip title, e.g. "VIETNAM HOLIDAY — 4 Star". Derive from the destination/theme if the source has no explicit title.'),
  country: z.string().catch('').describe('The primary country of travel.'),
  guestName: z.string().catch('').describe('The lead traveller/guest name if mentioned. Empty string if not mentioned.'),
  destinations: z.string().catch('').describe('Comma-separated list of the destination cities/regions visited, e.g. "Bana Hills, Ho Chi Minh City, Phu Quoc Island".'),
  tagline: z.string().catch('').describe('A short evocative one-line summary of trip highlights, if the source supports one. Empty string if none.'),
  dateRangeShort: z.string().catch('').describe('The travel date range as written, e.g. "15–21 Jun 2026". Empty string if unknown.'),
  duration: z.string().catch('').describe('Nights/Days shorthand, e.g. "6N/7D". Derive from the day count if not explicitly stated.'),
  referenceCode: z.string().catch('').describe('A booking/quotation reference code if present. Empty string otherwise.'),
  currencyCode: z.string().catch('').describe(
    `The currency used for prices in this document, detected from a symbol or explicit code in the source (₹→INR, $→USD unless context says otherwise, €→EUR, £→GBP, or an explicit code like AED/SGD/THB/VND/MYR/IDR). Output exactly one of ${OF_CURRENCY_CODES.join('/')}, or "" if no currency is evident anywhere in the text — nothing else.`
  ),
}).catch(DEFAULT_META);

export const TripSummaryRowSchema = z.object({
  label: z.string().catch(''),
  value: z.string().catch(''),
  emphasis: z.boolean().optional().catch(undefined).describe('true only for a standout row like total package cost'),
});

export const TourRowSchema = z.object({
  tour: z.string().catch(''),
  basis: z.string().catch('').describe('e.g. "Private", "Shared", "SIC"'),
  details: z.string().catch(''),
});

export const NoteItemSchema = z.object({
  label: z.string().catch('').describe('Short caps-style label, e.g. "VISA", "CANCELLATION"'),
  text: z.string().catch(''),
});

export const CostComparisonSchema = z.object({
  componentLabel: z.string().catch('').describe('A one-line label for the package being costed, e.g. "6N/7D — Bana Hills + HCMC + Phu Quoc".'),
  componentSub: z.string().catch('').describe('A short sub-description of what the cost covers, e.g. "4★ Hotels + Breakfast + All Transfers + All Tours".'),
  footnote: z.string().catch('').describe('The cost-exclusions footnote if the source states what the price excludes, e.g. "* Excludes international airfare, visa, tipping..."'),
}).catch({ componentLabel: '', componentSub: '', footnote: '' });

export const HotelDifferenceRowSchema = z.object({
  city: z.string().catch(''),
  values: z.array(z.string()).catch([]).describe('One entry per hotel option, in the same order as hotelOptions — the hotel used in that city for that option.'),
});

export const ExtractOutputSchema = z.object({
  meta: MetaSchema,
  tripSummary: z
    .array(TripSummaryRowSchema)
    .catch([])
    .describe('Key-value overview rows: prepared for, destinations, dates, duration, group size, hotel category, transfers, tour guide, sightseeing count, package cost, etc. Only include rows the source actually supports.'),
  hotelOptions: z
    .array(HotelOptionSchema)
    .min(1)
    .max(6)
    .catch([{ label: 'Option 1', perPerson: '', total: '', hotels: [] }])
    .describe('One entry per pricing/hotel option mentioned (not limited to two — extract every distinct option the source describes). If the source only describes a single set of hotels with no alternative, return exactly one entry.'),
  flights: z.array(FlightRowSchema).catch([]).describe('One entry per flight segment/leg mentioned (outbound, inbound, any internal flights) — as many as the source describes.'),
  tours: z.array(TourRowSchema).catch([]),
  days: z.array(DayPlanSchema).catch([]),
  inclusions: z.array(z.string()).catch([]).describe('Package inclusions, one string per bullet.'),
  exclusions: z.array(z.string()).catch([]).describe('Package exclusions, one string per bullet.'),
  notes: z.array(NoteItemSchema).catch([]).describe('Important/fine-print notes: visa requirements, tipping, surcharge periods, cancellation policy, etc.'),
  costComparison: CostComparisonSchema,
  hotelDifferences: z
    .array(HotelDifferenceRowSchema)
    .catch([])
    .describe('Only populate if there are genuinely multiple hotel options with different properties per city.'),
});
export type ItineraryFormatExtractOutput = z.infer<typeof ExtractOutputSchema>;

// ============================================================================
// Section split — extraction is run as several smaller focused calls instead
// of one big one, so the UI can show real per-section progress (a section's
// data lands as soon as its own call resolves) rather than a single
// all-or-nothing wait. Every field in ExtractOutputSchema belongs to exactly
// one section below, so the five together cover the whole shape.
// ============================================================================

export const SECTION_KEYS = ['meta', 'hotels', 'flights', 'tours', 'days', 'extras'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  meta: 'Trip details & summary',
  hotels: 'Hotel options',
  flights: 'Flights',
  tours: 'Tours & transfers',
  days: 'Day-by-day programme',
  extras: 'Inclusions, notes & cost comparison',
};

// What each section should focus on, appended to EXTRACTION_RULES — keeps
// the model's attention on just that slice of the source text even though
// the full rawText is sent every time (later sections, e.g. days, often need
// the whole document for context like recurring hotel/city names).
// The days section is the one agents most often report a bad extraction on:
// suppliers rarely write clean "Day 1 / Day 2" blocks — day boundaries are
// often implied by a new date, a new city, an overnight change, or just a
// paragraph break. A naive line-by-line pass either splits one day across
// two entries or merges two days into one. THINK is spelled out in full
// (not just "extract") deliberately: it's paired with a `reasoning`
// scratchpad field (see DaysThinkingSchema below) that forces the model to
// work out the day boundaries as an explicit step, in writing, before it
// commits to the final `days` array — a plain "do it carefully" instruction
// with no scratchpad to actually reason in is far weaker.
const DAYS_THINK_INSTRUCTIONS = `Extract ONLY: the day-by-day programme, one entry per day with its ordered line items.

This is the hardest section to get right — THINK about the day structure before you extract, don't just scan line by line:
1. Find every day boundary, explicit or implied: a "Day 1/Day 2" marker, a new calendar date, a change of city, a hotel check-in/check-out, or an "overnight in X" phrase all signal a new day even when the source doesn't number it.
2. Decide which day each line belongs to BEFORE extracting it. A transfer written at the end of one day's paragraph but describing the start of the next day's journey belongs to whichever day actually experiences it — don't duplicate it across both, and don't drop it.
3. If a day's activities are split across two paragraphs (e.g. a blank line, then more text about the same date/city), that's still ONE day — merge them into a single entry, not two.
4. If the source truly has fewer explicit days than the trip duration implies (e.g. "Day 1" and "Day 3" mentioned but not "Day 2"), only output the days the source actually describes content for — do not invent a blank Day 2.
5. Use the "reasoning" field to work through steps 1-4 in your own words FIRST — list the days you've identified and a one-line summary of what belongs to each — and only then fill in "days" so it matches that plan exactly.`;

export const SECTION_FOCUS: Record<SectionKey, string> = {
  meta: 'Extract ONLY: overall trip meta (title, country, guest name, destinations, tagline, date range, duration, reference code, detected currency) and the key-value trip summary rows.',
  hotels: 'Extract ONLY: every hotel/pricing option (with per-person/total price and each hotel row), and the hotel-differences table if multiple options genuinely differ by city.',
  flights: 'Extract ONLY: flights, as a dedicated list separate from the day-by-day programme — one entry per flight segment/leg (outbound, inbound, and any internal/connecting flights), with airline, flight number, from/to, departure/arrival date+time, class, and baggage allowance wherever the source states them. Extract every segment the source describes — there is no fixed limit on how many.',
  tours: 'Extract ONLY: the tours & transfers list.',
  days: DAYS_THINK_INSTRUCTIONS,
  extras: 'Extract ONLY: inclusions, exclusions, important notes, and the cost-comparison component label/sub-description/footnote.',
};

export const SectionSchemas = {
  meta: z.object({ meta: MetaSchema, tripSummary: z.array(TripSummaryRowSchema).catch([]) }),
  hotels: z.object({
    hotelOptions: z.array(HotelOptionSchema).min(1).max(6).catch([{ label: 'Option 1', perPerson: '', total: '', hotels: [] }]),
    hotelDifferences: z.array(HotelDifferenceRowSchema).catch([]),
  }),
  flights: z.object({ flights: z.array(FlightRowSchema).catch([]) }),
  tours: z.object({ tours: z.array(TourRowSchema).catch([]) }),
  days: z.object({ days: z.array(DayPlanSchema).catch([]) }),
  extras: z.object({
    inclusions: z.array(z.string()).catch([]),
    exclusions: z.array(z.string()).catch([]),
    notes: z.array(NoteItemSchema).catch([]),
    costComparison: CostComparisonSchema,
  }),
} as const;

export type SectionOutput = {
  meta: z.infer<typeof SectionSchemas.meta>;
  hotels: z.infer<typeof SectionSchemas.hotels>;
  flights: z.infer<typeof SectionSchemas.flights>;
  tours: z.infer<typeof SectionSchemas.tours>;
  days: z.infer<typeof SectionSchemas.days>;
  extras: z.infer<typeof SectionSchemas.extras>;
};

// What the model actually fills in for the 'days' call — a `reasoning`
// scratchpad ahead of `days` in the shape so an autoregressive model writes
// out its day-boundary analysis (see DAYS_THINK_INSTRUCTIONS) before it
// commits to the final array, then the caller discards `reasoning` and
// returns just `{ days }` to match SectionOutput['days'].
export const DaysThinkingSchema = z.object({
  reasoning: z.string().catch('').describe(
    "Scratchpad, not shown to the user: think step by step about day boundaries first — list the days you've identified (number/date/place) and a one-line summary of what belongs to each — THEN fill in `days` to match."
  ),
  days: z.array(DayPlanSchema).catch([]),
});

// Shared verbatim between the Gemini (Genkit, structured-output) and NVIDIA
// (raw chat completion, prompt-described JSON) extraction paths, so the two
// providers are held to identical extraction behavior — only the model
// answering the same instructions differs.
export const EXTRACTION_RULES = `You are a travel-agency operations assistant. Extract a structured travel quotation from the raw itinerary text below.

CRITICAL RULES — this is EXTRACTION, not creative writing:
1. Do NOT invent hotel names, prices, dates, or inclusions that are not present in the source text. If a field is not mentioned, return an empty string ("") or empty array — never guess or estimate.
2. Preserve numbers exactly as written, never converted or rounded — but prices in hotelOptions (perPerson/total) are NUMBER ONLY, with any currency symbol/code stripped off (e.g. source "USD 767" → "767"); the document's one currency is reported separately as meta.currencyCode instead of being repeated on every price.
3. Keep the day-by-day items in the same order they appear in the source, one item per distinct sentence/bullet/line.
4. If the source describes only ONE hotel/pricing option (no "Option 1 / Option 2" style alternative), return exactly one entry in hotelOptions. If it describes three, four, or more options, return one entry per option — do not collapse them into two and do not fabricate options that aren't in the source.
5. If information genuinely isn't in the text, prefer leaving a field blank over guessing.
6. If the source is messy, normalize obvious formatting issues (line breaks, bullet markers, repeated whitespace) before extracting, and preserve the meaning rather than discarding it.`;
