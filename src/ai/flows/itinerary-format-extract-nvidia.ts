'use server';

/**
 * @fileOverview NVIDIA NIM alternative to itineraryFormatExtractSectionFlow
 * (itinerary-format-extract.ts) — same extraction job (raw itinerary text →
 * structured travel quotation), same EXTRACTION_RULES and the exact same
 * per-section Zod schemas, but called directly via the OpenAI-compatible NIM
 * API instead of through Genkit (Genkit has no NVIDIA plugin; NIM speaks the
 * OpenAI chat-completions protocol, so the official `openai` SDK works
 * against it by pointing baseURL at NVIDIA's endpoint).
 *
 * Because this path has no Genkit structured-output support, the JSON shape
 * is described in the prompt instead of enforced by the framework — the
 * response is parsed and then validated against the section's schema, so a
 * malformed or off-shape reply from the model surfaces as a clear error
 * rather than silently reaching the rest of the app.
 *
 * Extraction runs as five smaller per-SectionKey calls (see
 * itinerary-format-schema.ts's SECTION_KEYS) rather than one big call, so the
 * caller can show real section-by-section progress instead of a single
 * all-or-nothing wait.
 */

import OpenAI from 'openai';
import {
  EXTRACTION_RULES,
  SECTION_FOCUS,
  SectionSchemas,
  DaysThinkingSchema,
  type ItineraryFormatExtractInput,
  type SectionKey,
  type SectionOutput,
} from './itinerary-format-schema';
import { normalizeItineraryText } from './itinerary-format-utils';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
// meta/llama-3.1-8b-instruct (and the whole llama-3.1/3.3 + mixtral-8x7b
// family) reached end-of-life on NVIDIA's NIM catalog on 2026-08-26 and now
// 410s on every call — this free-tier key's account only has a small set of
// models actually enabled (most others 404 as "not found for account"), and
// this is the smallest one confirmed working.
const DEFAULT_MODEL = 'meta/llama-3.2-11b-vision-instruct';

// Hand-written to mirror each section's Zod schema field-for-field. Raw chat
// completion has no schema-aware structured output the way Genkit's
// definePrompt does, so the shape has to be spelled out for the model.
const SECTION_JSON_SHAPES: Record<SectionKey, string> = {
  meta: `{
  "meta": {
    "title": "string", "country": "string", "guestName": "string",
    "destinations": "string (comma-separated)", "tagline": "string",
    "dateRangeShort": "string", "duration": "string", "referenceCode": "string",
    "currencyCode": "string — one of INR/USD/EUR/GBP/AED/SGD/THB/VND/MYR/IDR, detected from a symbol (₹→INR, $→USD, €→EUR, £→GBP) or explicit code in the source, or \\"\\" if no currency is evident"
  },
  "tripSummary": [{ "label": "string", "value": "string", "emphasis": true }]
}`,
  hotels: `{
  "hotelOptions": [{
    "label": "string",
    "perPerson": "string — NUMBER ONLY, currency symbol/code stripped off (e.g. source \\"USD 767\\" becomes \\"767\\")",
    "total": "string — NUMBER ONLY, same rule (e.g. \\"1,534\\")",
    "hotels": [{ "city": "string", "hotel": "string", "stars": 4, "room": "string", "checkin": "string", "checkout": "string", "nights": 1 }]
  }],
  "hotelDifferences": [{ "city": "string", "values": ["string (one per hotel option, same order as hotelOptions)"] }]
}`,
  flights: `{
  "flights": [{
    "airline": "string", "flightNo": "string", "from": "string", "to": "string",
    "departure": "string (date + time as written)", "arrival": "string (date + time as written)",
    "travelClass": "string", "baggage": "string"
  }]
}`,
  tours: `{
  "tours": [{ "tour": "string", "basis": "string", "details": "string" }]
}`,
  // "reasoning" is listed BEFORE "days" deliberately — an autoregressive
  // model fills JSON keys in order, so putting the scratchpad first forces
  // it to write out its day-boundary analysis (see DAYS_THINK_INSTRUCTIONS
  // in itinerary-format-schema.ts) before it commits to the final array,
  // rather than jumping straight to extraction.
  days: `{
  "reasoning": "string — think step by step here FIRST: list the days you've identified (number/date/place) and a one-line summary of what belongs to each",
  "days": [{
    "num": "string (e.g. \\"01\\")", "date": "string", "weekday": "string", "place": "string", "title": "string",
    "items": [{ "type": "transfer|checkin|attraction|explore|plain|optional|meals|flight|note", "label": "string", "text": "string" }]
  }]
}`,
  extras: `{
  "inclusions": ["string"],
  "exclusions": ["string"],
  "notes": [{ "label": "string", "text": "string" }],
  "costComparison": { "componentLabel": "string", "componentSub": "string", "footnote": "string" }
}`,
};

// "emphasis" is genuinely optional (omit it rather than guess false); every
// other field must be present, using "" / [] / 0 when the source doesn't say.
const SECTION_SYSTEM_PROMPTS: Record<SectionKey, string> = Object.fromEntries(
  (Object.keys(SECTION_JSON_SHAPES) as SectionKey[]).map((section) => [
    section,
    `${EXTRACTION_RULES}

${SECTION_FOCUS[section]}

Respond with ONLY a single valid JSON object matching this exact shape — no markdown code fences, no commentary, no extra keys, no trailing text before or after the JSON:
${SECTION_JSON_SHAPES[section]}`,
  ])
) as Record<SectionKey, string>;

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// Thrown for conditions worth one retry (flaky/malformed JSON from a single
// generation) as opposed to permanent config problems (missing API key),
// which should fail immediately rather than retry three times pointlessly.
class RetryableExtractError extends Error {}

// maxRetries: 0 — the SDK's own built-in retry (default 2) would otherwise
// stack silently underneath our explicit retry loop in
// extractItineraryFormatSectionViaNvidia below, quietly multiplying how long
// a single "attempt" can take. A capped timeout turns a stalled request into
// a fast, retryable failure instead of the caller just waiting indefinitely.
// meta/llama-3.2-11b-vision-instruct (see DEFAULT_MODEL above) measured
// 40-60s for even a short section on a trivial prompt — a real pasted
// itinerary with a bigger `days`/`extras` payload routinely blew past a
// 60s cap, which is what caused "Request timed out." on exactly those
// heavier sections while the lighter hotels/flights calls kept succeeding.
const REQUEST_TIMEOUT_MS = 120_000;
function nvidiaClient(apiKey: string) {
  return new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
}

async function callNvidiaSectionOnce<K extends SectionKey>(
  section: K,
  rawText: string,
  model: string,
  apiKey: string
): Promise<SectionOutput[K]> {
  const client = nvidiaClient(apiKey);

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    // 'days' gets extra budget for the reasoning scratchpad ahead of the
    // actual array (see SECTION_JSON_SHAPES.days) — without it, a model
    // near its token limit can truncate the real `days` array to make room
    // for reasoning it was told to write first.
    max_tokens: section === 'days' ? 4000 : 3000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SECTION_SYSTEM_PROMPTS[section] },
      { role: 'user', content: rawText },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new RetryableExtractError('NVIDIA model returned an empty response.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    throw new RetryableExtractError('NVIDIA model did not return valid JSON.');
  }

  // 'days' is validated against DaysThinkingSchema (which also accepts the
  // `reasoning` scratchpad key) and then stripped down to just `{ days }` so
  // every section still resolves to SectionOutput[K] uniformly.
  if (section === 'days') {
    const validated = DaysThinkingSchema.safeParse(parsed);
    if (!validated.success) {
      throw new RetryableExtractError(`NVIDIA model response did not match the expected shape: ${validated.error.issues[0]?.message ?? 'unknown validation error'}`);
    }
    return { days: validated.data.days } as SectionOutput[K];
  }

  const validated = SectionSchemas[section].safeParse(parsed);
  if (!validated.success) {
    throw new RetryableExtractError(`NVIDIA model response did not match the expected shape: ${validated.error.issues[0]?.message ?? 'unknown validation error'}`);
  }
  return validated.data as SectionOutput[K];
}

export async function extractItineraryFormatSectionViaNvidia<K extends SectionKey>(
  section: K,
  input: ItineraryFormatExtractInput
): Promise<SectionOutput[K]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured. Add it to .env (get one free at build.nvidia.com) to use the NVIDIA extraction model.');
  }
  const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;
  const normalized = normalizeItineraryText(input.rawText);

  const HTTP_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callNvidiaSectionOnce(section, normalized, model, apiKey);
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.code;
      const retryable = err instanceof RetryableExtractError || HTTP_RETRY_STATUSES.has(status);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const delayMs = 800 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
