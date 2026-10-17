'use server';

import { extractItineraryFormatSection } from '@/ai/flows/itinerary-format-extract';
import { extractItineraryFormatSectionViaNvidia } from '@/ai/flows/itinerary-format-extract-nvidia';
import type { SectionKey, SectionOutput } from '@/ai/flows/itinerary-format-schema';
import {
  newId,
  OF_CURRENCY_SYMBOL,
  type OFCurrencyCode,
  type OFItinerary,
  type OFSectionKey,
} from '@/app/(app)/itinerary-builder/other-format-types';

export type ExtractionProvider = 'gemini' | 'nvidia';

export type ExtractSectionResult = { data: Partial<OFItinerary> } | { error: string };

/**
 * Paste-and-extract entry point for the Other Format tab: sends raw pasted
 * itinerary text through either provider's extraction flow for ONE section
 * at a time (see OF_SECTION_KEYS in other-format-types.ts) and maps that
 * section's AI output onto a partial OFItinerary, assigning fresh ids for
 * the editable form's row keys.
 *
 * The caller (other-format-panel.tsx) fires all five sections and merges
 * each into the itinerary as it resolves — that's what gives the "Extracting…"
 * UI real per-section progress instead of one opaque wait. Both providers are
 * extractive, not generative — see itinerary-format-extract.ts's
 * EXTRACTION_RULES for why fields come back blank rather than fabricated
 * when the source doesn't mention them; both paths are held to the exact
 * same rules and the exact same per-section output schema, so which model
 * answered shouldn't change how the result behaves downstream.
 */
export async function extractOtherFormatItinerarySection(
  rawText: string,
  provider: ExtractionProvider,
  section: OFSectionKey
): Promise<ExtractSectionResult> {
  if (!rawText || rawText.trim().length < 20) {
    return { error: 'Paste some itinerary text first — at least a couple of sentences.' };
  }

  try {
    const key = section as SectionKey;
    const out =
      provider === 'nvidia'
        ? await extractItineraryFormatSectionViaNvidia(key, { rawText })
        : await extractItineraryFormatSection(key, { rawText });

    return { data: toPartialItinerary(section, out) };
  } catch (e: any) {
    const status = e?.status ?? e?.code ?? e?.detail?.error?.code;
    if (status === 503 || status === 429 || status === 504 || status === 'UNAVAILABLE' || status === 'RESOURCE_EXHAUSTED') {
      return { error: 'The AI model is temporarily busy (high demand). We already retried a couple of times — please try again in a moment.' };
    }

    // Guard against ever surfacing a raw Zod/technical dump (long, or shaped
    // like "path":[...] / "code":"...") to the agent — log it for debugging
    // and show actionable guidance instead.
    const message: string = e?.message || '';
    const looksTechnical = message.length > 240 || /"code":|"path":\s*\[|ZodError/i.test(message);
    if (looksTechnical) {
      console.error(`Itinerary extraction (${section}) failed with a technical error:`, e);
      return {
        error: `Could not extract that section — the AI returned data in an unexpected format. Try again, or switch the Model dropdown to the other provider (${provider === 'nvidia' ? 'Gemini' : 'NVIDIA'}).`,
      };
    }
    return { error: message || 'Could not extract that section from the text.' };
  }
}

function toPartialItinerary(section: OFSectionKey, out: SectionOutput[SectionKey]): Partial<OFItinerary> {
  switch (section) {
    case 'meta': {
      const o = out as SectionOutput['meta'];
      // currencyCode rides along on the meta payload purely as a detection
      // signal — it's not one of OFMeta's own display fields, so it's split
      // off here and applied to the itinerary-wide `currency` instead.
      const { currencyCode, ...meta } = o.meta;
      const result: Partial<OFItinerary> = {
        meta,
        tripSummary: o.tripSummary.map((r) => ({ ...r, id: newId() })),
      };
      if (currencyCode && currencyCode in OF_CURRENCY_SYMBOL) {
        result.currency = currencyCode as OFCurrencyCode;
      }
      return result;
    }
    case 'hotels': {
      const o = out as SectionOutput['hotels'];
      const hotelOptions: OFItinerary['hotelOptions'] = o.hotelOptions.map((opt, i) => ({
        id: newId(),
        label: opt.label || `Option ${i + 1}`,
        perPerson: opt.perPerson || '',
        total: opt.total || '',
        hotels: opt.hotels.map((h) => ({ ...h, id: newId() })),
      }));
      // Align each difference row's values to the actual option count, in
      // case the model returns a mismatched-length array.
      const optionCount = hotelOptions.length;
      const hotelDifferences: OFItinerary['hotelDifferences'] = o.hotelDifferences.map((h) => ({
        id: newId(),
        city: h.city,
        values: Array.from({ length: optionCount }, (_, i) => h.values[i] ?? ''),
      }));
      return { hotelOptions, hotelDifferences };
    }
    case 'flights': {
      const o = out as SectionOutput['flights'];
      return { flights: o.flights.map((f) => ({ ...f, id: newId() })) };
    }
    case 'tours': {
      const o = out as SectionOutput['tours'];
      return { tours: o.tours.map((t) => ({ ...t, id: newId() })) };
    }
    case 'days': {
      const o = out as SectionOutput['days'];
      return {
        days: o.days.map((d) => ({
          ...d,
          id: newId(),
          items: d.items.map((it) => ({ ...it, id: newId() })),
        })),
      };
    }
    case 'extras': {
      const o = out as SectionOutput['extras'];
      return {
        inclusions: o.inclusions,
        exclusions: o.exclusions,
        notes: o.notes.map((n) => ({ ...n, id: newId() })),
        costComparison: o.costComparison,
      };
    }
  }
}
