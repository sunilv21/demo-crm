'use server';

/**
 * @fileOverview Extracts a structured travel quotation (trip summary, dual
 * hotel options, tours/transfers, day-by-day programme, inclusions/
 * exclusions, notes, cost comparison, hotel differences) from raw pasted
 * itinerary text — a supplier email, WhatsApp message, or rough draft. Uses
 * Genkit/Gemini; see itinerary-format-extract-nvidia.ts for the NVIDIA NIM
 * alternative and itinerary-format-schema.ts for the schema/rules both share.
 *
 * Unlike itinerarySuggestionsFlow (which composes original travel-magazine
 * prose from a destination + preferences), this flow is EXTRACTIVE: it must
 * not invent hotel names, prices, or dates that aren't in the source text.
 * Missing fields come back blank/empty rather than fabricated, so the agent
 * can see at a glance what still needs to be filled in by hand.
 *
 * Extraction runs as five smaller per-SectionKey calls (see
 * itinerary-format-schema.ts's SECTION_KEYS) rather than one big call, so the
 * caller can show real section-by-section progress instead of a single
 * all-or-nothing wait.
 *
 * A 'use server' file may only export async functions as values (type-only
 * exports are exempt) — the schema/constants live in itinerary-format-schema
 * precisely so this file's only value export can be extractItineraryFormatSection.
 */

import { ai } from '@/ai/genkit';
import {
  ExtractInputSchema,
  EXTRACTION_RULES,
  SECTION_FOCUS,
  SectionSchemas,
  DaysThinkingSchema,
  type SectionKey,
  type SectionOutput,
} from './itinerary-format-schema';
import type { ItineraryFormatExtractInput } from './itinerary-format-schema';
import { normalizeItineraryText } from './itinerary-format-utils';

const sectionPrompts = {
  meta: ai.definePrompt({
    name: 'itineraryFormatExtractPrompt_meta',
    input: { schema: ExtractInputSchema },
    output: { schema: SectionSchemas.meta },
    prompt: `${EXTRACTION_RULES}\n\n${SECTION_FOCUS.meta}\n\nRaw itinerary text:\n{{{rawText}}}\n`,
  }),
  hotels: ai.definePrompt({
    name: 'itineraryFormatExtractPrompt_hotels',
    input: { schema: ExtractInputSchema },
    output: { schema: SectionSchemas.hotels },
    prompt: `${EXTRACTION_RULES}\n\n${SECTION_FOCUS.hotels}\n\nRaw itinerary text:\n{{{rawText}}}\n`,
  }),
  flights: ai.definePrompt({
    name: 'itineraryFormatExtractPrompt_flights',
    input: { schema: ExtractInputSchema },
    output: { schema: SectionSchemas.flights },
    prompt: `${EXTRACTION_RULES}\n\n${SECTION_FOCUS.flights}\n\nRaw itinerary text:\n{{{rawText}}}\n`,
  }),
  tours: ai.definePrompt({
    name: 'itineraryFormatExtractPrompt_tours',
    input: { schema: ExtractInputSchema },
    output: { schema: SectionSchemas.tours },
    prompt: `${EXTRACTION_RULES}\n\n${SECTION_FOCUS.tours}\n\nRaw itinerary text:\n{{{rawText}}}\n`,
  }),
  // Uses DaysThinkingSchema (not SectionSchemas.days) — its `reasoning` field
  // ahead of `days` gets the model to work out day boundaries as an explicit
  // step before committing to the final array (see DAYS_THINK_INSTRUCTIONS in
  // itinerary-format-schema.ts). callSectionWithRetry strips `reasoning`
  // before returning, so callers still only ever see SectionOutput['days'].
  days: ai.definePrompt({
    name: 'itineraryFormatExtractPrompt_days',
    input: { schema: ExtractInputSchema },
    output: { schema: DaysThinkingSchema },
    prompt: `${EXTRACTION_RULES}\n\n${SECTION_FOCUS.days}\n\nRaw itinerary text:\n{{{rawText}}}\n`,
  }),
  extras: ai.definePrompt({
    name: 'itineraryFormatExtractPrompt_extras',
    input: { schema: ExtractInputSchema },
    output: { schema: SectionSchemas.extras },
    prompt: `${EXTRACTION_RULES}\n\n${SECTION_FOCUS.extras}\n\nRaw itinerary text:\n{{{rawText}}}\n`,
  }),
} as const;

// Same transient-error retry as itinerarySuggestionsFlow (503/429/504 from a
// rate-limited Gemini backend usually clear within a couple of attempts).
// MAX_ATTEMPTS at 4 (not 3): live testing against the current default model
// (gemini-3.1-flash-lite's neighbors were 503ing ~2 times out of 3 during a
// demand spike) showed a request can need a few tries before one lands.
async function callSectionWithRetry<K extends SectionKey>(section: K, input: ItineraryFormatExtractInput): Promise<SectionOutput[K]> {
  const RETRY_STATUSES = new Set([429, 503, 504]);
  const MAX_ATTEMPTS = 4;
  const normalized = normalizeItineraryText(input.rawText);
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { output } = await sectionPrompts[section]({ rawText: normalized });
      if (!output) throw new Error('The extraction model returned no structured output.');
      // The days prompt's output also carries a `reasoning` scratchpad —
      // drop it here so every section uniformly resolves to SectionOutput[K].
      const clean = section === 'days' ? { days: (output as { days: unknown }).days } : output;
      return clean as SectionOutput[K];
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.code ?? err?.detail?.error?.code;
      const retryable = RETRY_STATUSES.has(status) || status === 'UNAVAILABLE' || status === 'RESOURCE_EXHAUSTED';
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const delayMs = 800 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// Not wrapped in ai.defineFlow: a flow needs one fixed input/output Zod
// schema pair for its tracing/validation, but this dispatches across five
// different section schemas — the per-prompt definePrompt calls above are
// already individually traced, so a wrapping flow adds nothing here.
export async function extractItineraryFormatSection<K extends SectionKey>(
  section: K,
  input: ItineraryFormatExtractInput
): Promise<SectionOutput[K]> {
  return callSectionWithRetry(section, input);
}
