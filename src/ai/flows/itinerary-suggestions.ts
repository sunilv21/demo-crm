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
    time: z.string().describe("The time for the activity (e.g., '9:00 AM' or 'Afternoon')."),
    description: z.string().describe("A detailed description of the activity, event, or booking (like a flight or hotel check-in)."),
    details: z.string().optional().describe("Additional details like a physical address, booking confirmation number, or flight number."),
});

const DayPlanSchema = z.object({
    day: z.number().describe("The day number of the itinerary (e.g., 1)."),
    title: z.string().describe("A short, catchy title for the day's plan."),
    summary: z.string().describe("A brief summary of the day's activities."),
    imageUrl: z.string().url().describe("A URL for a high-quality image representing the day's main activity or location. Use a real, publicly accessible image URL from a service like Unsplash or Pexels."),
    activities: z.array(ActivitySchema).describe("An array of activities planned for the day."),
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
  prompt: `You are an expert travel agent specializing in creating personalized, visually appealing, and highly detailed travel itineraries.

  Based on the client's preferences and destination, generate a comprehensive, day-by-day travel itinerary. 
  
  For each day, you must provide:
  1.  A short, engaging title.
  2.  A brief summary of the day's plan.
  3.  A stunning, publicly accessible image URL (from Unsplash, Pexels, etc.) that captures the essence of that day.
  4.  A list of activities, including specific times, detailed descriptions, and any relevant information like flight numbers, hotel addresses, or booking references.
  
  Ensure that flight details, hotel check-ins, and other logistical items are treated as activities with appropriate times and details.

  Client Preferences: {{{preferences}}}
  Destination: {{{destination}}}
  `,
});

const itinerarySuggestionsFlow = ai.defineFlow(
  {
    name: 'itinerarySuggestionsFlow',
    inputSchema: ItinerarySuggestionsInputSchema,
    outputSchema: ItinerarySuggestionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
