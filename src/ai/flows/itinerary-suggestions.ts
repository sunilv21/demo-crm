'use server';

/**
 * @fileOverview AI-powered itinerary suggestion flow.
 *
 * Given a user's preferences and destination, this flow generates personalized travel itinerary suggestions.
 * - itinerarySuggestions - A function that takes user preferences and destination as input and returns itinerary suggestions.
 * - ItinerarySuggestionsInput - The input type for the itinerarySuggestions function.
 * - ItinerarySuggestionsOutput - The return type for the itinerarySuggestions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ItinerarySuggestionsInputSchema = z.object({
  preferences: z
    .string()
    .describe('The client\u0027s preferences for the trip, including interests, budget, and travel style.'),
  destination: z.string().describe('The desired destination for the itinerary.'),
});
export type ItinerarySuggestionsInput = z.infer<typeof ItinerarySuggestionsInputSchema>;

const ActivitySchema = z.object({
    time: z.string().optional().describe("OPTIONAL. Leave blank for a normal day. Only fill in for hard logistics with fixed clock times — flight departures, train times, scheduled tour pickups. NEVER use vague labels like 'Morning' or 'Afternoon'."),
    description: z.string().describe("A short, single-line highlight describing one experience, landmark, or moment of the day — written as prose, NOT as a schedule entry."),
    details: z.string().optional().describe("Optional logistical detail (flight number, hotel address, confirmation code). Omit unless logistically essential."),
});

const DayPlanSchema = z.object({
    day: z.number().describe("The day number of the itinerary (e.g., 1)."),
    title: z.string().describe("A short, evocative title for the day (e.g., 'Arrival in the Garden City', 'Temples & Tea Plantations')."),
    summary: z.string().describe("A FLOWING DAY NARRATIVE of 70–110 words written as travel-magazine prose. Describe what the traveller experiences across the whole day end-to-end — the mood, the landmarks, the textures — in continuous sentences. DO NOT write a time-by-time schedule. DO NOT use bullet points or timestamps inside this field."),
    imageUrl: z.string().url().optional().describe("Optional. Not currently rendered — may be omitted."),
    activities: z.array(ActivitySchema).describe("3–5 KEY HIGHLIGHTS for the day — short descriptive lines, one experience per entry. NOT a timed schedule. Times must be omitted unless the highlight is a hard logistical event (flight, train)."),
});

const ItinerarySuggestionsOutputSchema = z.object({
  destination: z.string().describe("The destination city and country."),
  itinerary: z.array(DayPlanSchema).describe("An array of day-by-day plans for the trip."),
});
export type ItinerarySuggestionsOutput = z.infer<typeof ItinerarySuggestionsOutputSchema>;


export async function itinerarySuggestions(input: ItinerarySuggestionsInput): Promise<ItinerarySuggestionsOutput> {
  return itinerarySuggestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'itinerarySuggestionsPrompt',
  input: {schema: ItinerarySuggestionsInputSchema},
  output: {schema: ItinerarySuggestionsOutputSchema},
  prompt: `You are a senior travel writer at a luxury bespoke travel house. Your job is to compose a DAY-WISE travel narrative — magazine-style — for a printed brochure. The traveller will read each day as a continuous story, not a minute-by-minute schedule.

CRITICAL FORMAT RULES (follow strictly):
1. The "summary" field for each day MUST be 70–110 words of flowing travel-magazine prose. Continuous sentences. NO bullet points. NO times. NO "morning / afternoon / evening". Just elegant narrative — what the traveller sees, tastes, feels, walks through.
2. The "activities" field is a SHORT list of 3–5 KEY HIGHLIGHTS — single-line descriptive moments (a temple visit, a market stroll, a sunset cruise). DO NOT prefix these with times like "9:00 AM" or "Morning". Leave the "time" field BLANK unless the highlight is a true logistical hard event (a flight, a train departure, a fixed pickup) — and even then, use only the exact clock time, not a vague label.
3. "title" is a short, evocative phrase — like a magazine spread title.
4. Do NOT generate an "imageUrl" — the brochure has no images.

Compose a comprehensive day-by-day itinerary that reads like a curated story, suitable for an editorial-luxury printed brochure.

Client Preferences: {{{preferences}}}
Destination: {{{destination}}}
`,
});

// Wraps the prompt call with retry-with-backoff for transient Gemini errors
// (503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED, 504 DEADLINE_EXCEEDED). These are
// surfacing in production right now because gemini-2.5-flash is rate-limited
// during peak hours; a couple of retries usually clear it without bothering
// the user.
async function callPromptWithRetry(input: ItinerarySuggestionsInput) {
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
      const retryable =
        RETRY_STATUSES.has(status) || status === 'UNAVAILABLE' || status === 'RESOURCE_EXHAUSTED';
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const delayMs = 800 * Math.pow(2, attempt - 1); // 800ms, 1.6s
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Re-throw the original error so the caller can produce a clear user-facing
  // message ("model is busy, try again in a moment").
  throw lastErr;
}

const itinerarySuggestionsFlow = ai.defineFlow(
  {
    name: 'itinerarySuggestionsFlow',
    inputSchema: ItinerarySuggestionsInputSchema,
    outputSchema: ItinerarySuggestionsOutputSchema,
  },
  async input => {
    return await callPromptWithRetry(input);
  }
);
