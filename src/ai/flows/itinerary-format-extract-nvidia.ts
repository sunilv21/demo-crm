'use server';

/**
 * @fileOverview NVIDIA NIM alternative to itineraryFormatExtractFlow
 * (itinerary-format-extract.ts) — same extraction job (raw itinerary text →
 * structured travel quotation), same EXTRACTION_RULES and the exact same
 * Zod output schema, but called directly via the OpenAI-compatible NIM API
 * instead of through Genkit (Genkit has no NVIDIA plugin; NIM speaks the
 * OpenAI chat-completions protocol, so the official `openai` SDK works
 * against it by pointing baseURL at NVIDIA's endpoint).
 *
 * Because this path has no Genkit structured-output support, the JSON shape
 * is described in the prompt instead of enforced by the framework — the
 * response is parsed and then validated against ExtractOutputSchema, so a
 * malformed or off-shape reply from the model surfaces as a clear error
 * rather than silently reaching the rest of the app.
 */

import OpenAI from 'openai';
import {
  ExtractOutputSchema,
  EXTRACTION_RULES,
  type ItineraryFormatExtractInput,
  type ItineraryFormatExtractOutput,
} from './itinerary-format-schema';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct';

// Hand-written to mirror ExtractOutputSchema field-for-field. Raw chat
// completion has no schema-aware structured output the way Genkit's
// definePrompt does, so the shape has to be spelled out for the model.
const JSON_SHAPE = `{
  "meta": {
    "title": "string", "country": "string", "guestName": "string",
    "destinations": "string (comma-separated)", "tagline": "string",
    "dateRangeShort": "string", "duration": "string", "referenceCode": "string"
  },
  "tripSummary": [{ "label": "string", "value": "string", "emphasis": true }],
  "hotelOptions": [{
    "label": "string", "perPerson": "string", "total": "string",
    "hotels": [{ "city": "string", "hotel": "string", "stars": 4, "room": "string", "checkin": "string", "checkout": "string", "nights": 1 }]
  }],
  "tours": [{ "tour": "string", "basis": "string", "details": "string" }],
  "days": [{
    "num": "string (e.g. \\"01\\")", "date": "string", "weekday": "string", "place": "string", "title": "string",
    "items": [{ "type": "transfer|checkin|attraction|explore|plain|optional|meals|flight|note", "label": "string", "text": "string" }]
  }],
  "inclusions": ["string"],
  "exclusions": ["string"],
  "notes": [{ "label": "string", "text": "string" }],
  "costComparison": { "componentLabel": "string", "componentSub": "string", "footnote": "string" },
  "hotelDifferences": [{ "city": "string", "opt1": "string", "opt2": "string" }]
}`;

// "emphasis" is genuinely optional (omit it rather than guess false); every
// other field must be present, using "" / [] / 0 when the source doesn't say.
const SYSTEM_PROMPT = `${EXTRACTION_RULES}

Respond with ONLY a single valid JSON object matching this exact shape — no markdown code fences, no commentary, no extra keys, no trailing text before or after the JSON:
${JSON_SHAPE}`;

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// Thrown for conditions worth one retry (flaky/malformed JSON from a single
// generation) as opposed to permanent config problems (missing API key),
// which should fail immediately rather than retry three times pointlessly.
class RetryableExtractError extends Error {}

async function callNvidiaOnce(rawText: string, model: string, apiKey: string): Promise<ItineraryFormatExtractOutput> {
  const client = new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
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

  const validated = ExtractOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new RetryableExtractError(`NVIDIA model response did not match the expected shape: ${validated.error.issues[0]?.message ?? 'unknown validation error'}`);
  }
  return validated.data;
}

export async function extractItineraryFormatViaNvidia(
  input: ItineraryFormatExtractInput
): Promise<ItineraryFormatExtractOutput> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured. Add it to .env (get one free at build.nvidia.com) to use the NVIDIA extraction model.');
  }
  const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;

  const HTTP_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callNvidiaOnce(input.rawText, model, apiKey);
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
