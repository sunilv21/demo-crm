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

const HotelRowSchema = z.object({
  city: z.string().describe('City or region the hotel is in. Empty string if unknown.'),
  hotel: z.string().describe('Hotel name. Empty string if unknown.'),
  stars: z.number().int().min(1).max(5).describe('Star rating 1-5. Default 4 if not stated.'),
  room: z.string().describe('Room type, e.g. "Standard Double". Empty string if unknown.'),
  checkin: z.string().describe('Check-in date as written in the source, e.g. "15-Jun". Empty string if unknown.'),
  checkout: z.string().describe('Check-out date as written in the source. Empty string if unknown.'),
  nights: z.number().int().min(0).describe('Number of nights at this hotel. 0 if unknown.'),
});

const HotelOptionSchema = z.object({
  label: z.string().describe('"Option 1" or "Option 2".'),
  perPerson: z.string().describe('Per-person price EXACTLY as written in the source, including currency, e.g. "USD 767". Empty string if not mentioned — do not estimate or invent a price.'),
  total: z.string().describe('Total price exactly as written, including currency. Empty string if not mentioned.'),
  hotels: z.array(HotelRowSchema),
});

const DayItemTypeSchema = z
  .enum(['transfer', 'checkin', 'attraction', 'explore', 'plain', 'optional', 'meals', 'flight', 'note'])
  .describe(
    "The kind of line: 'transfer' (airport/hotel transfers), 'checkin' (hotel check-in), " +
      "'attraction' (a named sight/tour), 'explore' (general sightseeing/activity), " +
      "'plain' (a neutral note with no strong emphasis), 'optional' (an at-own-cost add-on), " +
      "'meals' (what meals are included that day), 'flight' (a flight segment), " +
      "'note' (a caveat or logistical warning, e.g. timing subject to change)."
  );

const DayItemSchema = z.object({
  type: DayItemTypeSchema,
  label: z.string().describe('The short bold lead phrase — a hotel name, attraction name, or short heading for this line. Empty string if the line has no natural lead phrase.'),
  text: z.string().describe('The rest of the description for this line.'),
});

const DayPlanSchema = z.object({
  num: z.string().describe('Two-digit day number as a string, e.g. "01", "02".'),
  date: z.string().describe('The date as written in the source, e.g. "15 June 2026". Empty string if unknown.'),
  weekday: z.string().describe('Day of week if stated or inferable from the date, e.g. "Monday". Empty string if unknown.'),
  place: z.string().describe('The city/region this day takes place in.'),
  title: z.string().describe('A short heading for the day, e.g. "Arrival in Da Nang — Bana Hills".'),
  items: z.array(DayItemSchema).describe('One entry per line/bullet/sentence of that day\'s programme, in the order they appear in the source.'),
});

export const ExtractOutputSchema = z.object({
  meta: z.object({
    title: z.string().describe('An overall trip title, e.g. "VIETNAM HOLIDAY — 4 Star". Derive from the destination/theme if the source has no explicit title.'),
    country: z.string().describe('The primary country of travel.'),
    guestName: z.string().describe('The lead traveller/guest name if mentioned. Empty string if not mentioned.'),
    destinations: z.string().describe('Comma-separated list of the destination cities/regions visited, e.g. "Bana Hills, Ho Chi Minh City, Phu Quoc Island".'),
    tagline: z.string().describe('A short evocative one-line summary of trip highlights, if the source supports one. Empty string if none.'),
    dateRangeShort: z.string().describe('The travel date range as written, e.g. "15–21 Jun 2026". Empty string if unknown.'),
    duration: z.string().describe('Nights/Days shorthand, e.g. "6N/7D". Derive from the day count if not explicitly stated.'),
    referenceCode: z.string().describe('A booking/quotation reference code if present. Empty string otherwise.'),
  }),
  tripSummary: z
    .array(z.object({ label: z.string(), value: z.string(), emphasis: z.boolean().optional().describe('true only for a standout row like total package cost') }))
    .describe('Key-value overview rows: prepared for, destinations, dates, duration, group size, hotel category, transfers, tour guide, sightseeing count, package cost, etc. Only include rows the source actually supports.'),
  hotelOptions: z
    .array(HotelOptionSchema)
    .min(1)
    .max(2)
    .describe('One entry per pricing/hotel option mentioned. If the source only describes a single set of hotels with no alternative, return exactly one entry.'),
  tours: z.array(z.object({ tour: z.string(), basis: z.string().describe('e.g. "Private", "Shared", "SIC"'), details: z.string() })),
  days: z.array(DayPlanSchema),
  inclusions: z.array(z.string()).describe('Package inclusions, one string per bullet.'),
  exclusions: z.array(z.string()).describe('Package exclusions, one string per bullet.'),
  notes: z.array(z.object({ label: z.string().describe('Short caps-style label, e.g. "VISA", "CANCELLATION"'), text: z.string() })).describe('Important/fine-print notes: visa requirements, tipping, surcharge periods, cancellation policy, etc.'),
  costComparison: z.object({
    componentLabel: z.string().describe('A one-line label for the package being costed, e.g. "6N/7D — Bana Hills + HCMC + Phu Quoc".'),
    componentSub: z.string().describe('A short sub-description of what the cost covers, e.g. "4★ Hotels + Breakfast + All Transfers + All Tours".'),
    footnote: z.string().describe('The cost-exclusions footnote if the source states what the price excludes, e.g. "* Excludes international airfare, visa, tipping..."'),
  }),
  hotelDifferences: z
    .array(z.object({ city: z.string(), opt1: z.string(), opt2: z.string() }))
    .describe('Only populate if there are genuinely two hotel options with different properties per city.'),
});
export type ItineraryFormatExtractOutput = z.infer<typeof ExtractOutputSchema>;

// Shared verbatim between the Gemini (Genkit, structured-output) and NVIDIA
// (raw chat completion, prompt-described JSON) extraction paths, so the two
// providers are held to identical extraction behavior — only the model
// answering the same instructions differs.
export const EXTRACTION_RULES = `You are a travel-agency operations assistant. Extract a structured travel quotation from the raw itinerary text below.

CRITICAL RULES — this is EXTRACTION, not creative writing:
1. Do NOT invent hotel names, prices, dates, or inclusions that are not present in the source text. If a field is not mentioned, return an empty string ("") or empty array — never guess or estimate.
2. Preserve numbers and currency exactly as written (e.g. if the source says "USD 767", output "USD 767", not a converted or rounded value).
3. Keep the day-by-day items in the same order they appear in the source, one item per distinct sentence/bullet/line.
4. If the source describes only ONE hotel/pricing option (no "Option 1 / Option 2" style alternative), return exactly one entry in hotelOptions — do not fabricate a second option.
5. If information genuinely isn't in the text, prefer leaving a field blank over guessing.`;
