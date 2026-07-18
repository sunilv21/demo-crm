'use server';

import { extractItineraryFormat } from '@/ai/flows/itinerary-format-extract';
import { newId, type OFItinerary } from '@/app/(app)/itinerary-builder/other-format-types';

export type ExtractOtherFormatResult = { data: OFItinerary } | { error: string };

/**
 * Paste-and-extract entry point for the Other Format tab: sends raw pasted
 * itinerary text through itineraryFormatExtractFlow and maps the AI's
 * (id-less) output onto OFItinerary, assigning fresh ids for the editable
 * form's row keys. The AI is instructed to extract, not invent — see
 * itinerary-format-extract.ts for why fields come back blank rather than
 * fabricated when the source doesn't mention them.
 */
export async function extractOtherFormatItinerary(rawText: string): Promise<ExtractOtherFormatResult> {
  if (!rawText || rawText.trim().length < 20) {
    return { error: 'Paste some itinerary text first — at least a couple of sentences.' };
  }

  try {
    const out = await extractItineraryFormat({ rawText });

    // The schema allows 1 or 2 hotel options (the AI shouldn't invent a
    // second one that doesn't exist in the source); the form and the cost
    // comparison / hotel-differences tables need exactly 2 slots, so pad
    // with an empty "Option 2" when the source only described one option.
    const [first, second] = out.hotelOptions;
    const hotelOptions: [OFItinerary['hotelOptions'][0], OFItinerary['hotelOptions'][1]] = [
      {
        id: newId(),
        label: first?.label || 'Option 1',
        perPerson: first?.perPerson || '',
        total: first?.total || '',
        hotels: (first?.hotels || []).map((h) => ({ ...h, id: newId() })),
      },
      {
        id: newId(),
        label: second?.label || 'Option 2',
        perPerson: second?.perPerson || '',
        total: second?.total || '',
        hotels: (second?.hotels || []).map((h) => ({ ...h, id: newId() })),
      },
    ];

    const data: OFItinerary = {
      meta: out.meta,
      tripSummary: out.tripSummary.map((r) => ({ ...r, id: newId() })),
      hotelOptions,
      tours: out.tours.map((t) => ({ ...t, id: newId() })),
      days: out.days.map((d) => ({
        ...d,
        id: newId(),
        items: d.items.map((it) => ({ ...it, id: newId() })),
      })),
      inclusions: out.inclusions,
      exclusions: out.exclusions,
      notes: out.notes.map((n) => ({ ...n, id: newId() })),
      costComparison: out.costComparison,
      hotelDifferences: out.hotelDifferences.map((h) => ({ ...h, id: newId() })),
    };

    return { data };
  } catch (e: any) {
    const status = e?.status ?? e?.code ?? e?.detail?.error?.code;
    if (status === 503 || status === 429 || status === 504 || status === 'UNAVAILABLE' || status === 'RESOURCE_EXHAUSTED') {
      return { error: 'The AI model is temporarily busy (high demand). We already retried a couple of times — please try again in a moment.' };
    }
    return { error: e?.message || 'Could not extract an itinerary from that text.' };
  }
}
