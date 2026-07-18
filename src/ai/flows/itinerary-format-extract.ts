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
 * A 'use server' file may only export async functions as values (type-only
 * exports are exempt) — the schema/constants live in itinerary-format-schema
 * precisely so this file's only value export can be extractItineraryFormat.
 */

import { ai } from '@/ai/genkit';
import { ExtractInputSchema, ExtractOutputSchema, EXTRACTION_RULES } from './itinerary-format-schema';
import type { ItineraryFormatExtractInput, ItineraryFormatExtractOutput } from './itinerary-format-schema';

export async function extractItineraryFormat(input: ItineraryFormatExtractInput): Promise<ItineraryFormatExtractOutput> {
  return itineraryFormatExtractFlow(input);
}

const prompt = ai.definePrompt({
  name: 'itineraryFormatExtractPrompt',
  input: { schema: ExtractInputSchema },
  output: { schema: ExtractOutputSchema },
  prompt: `${EXTRACTION_RULES}

Raw itinerary text:
{{{rawText}}}
`,
});

// Same transient-error retry as itinerarySuggestionsFlow (503/429/504 from a
// rate-limited Gemini backend usually clear within a couple of attempts).
async function callPromptWithRetry(input: ItineraryFormatExtractInput) {
  const RETRY_STATUSES = new Set([429, 503, 504]);
  const MAX_ATTEMPTS = 3;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { output } = await prompt(input);
      return output!;
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

const itineraryFormatExtractFlow = ai.defineFlow(
  {
    name: 'itineraryFormatExtractFlow',
    inputSchema: ExtractInputSchema,
    outputSchema: ExtractOutputSchema,
  },
  async (input) => callPromptWithRetry(input)
);
