'use server';

import { itinerarySuggestions } from '@/ai/flows/itinerary-suggestions';
import { z } from 'zod';
import type {
  ItineraryFormValues,
  ItineraryState,
} from '@/app/(app)/itinerary-builder/itinerary-types';

const formSchema = z.object({
  destination: z.string().min(2, {
    message: 'Destination must be at least 2 characters.',
  }),
  preferences: z.string().min(10, {
    message: 'Preferences must be at least 10 characters.',
  }),
  travellerName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  partySize: z.string().optional(),
  referenceCode: z.string().optional(),
});

export async function getItinerary(
  prevState: ItineraryState,
  formData: FormData
): Promise<ItineraryState> {
  const raw: ItineraryFormValues = {
    destination: (formData.get('destination') as string) ?? '',
    preferences: (formData.get('preferences') as string) ?? '',
    travellerName: (formData.get('travellerName') as string) ?? '',
    startDate: (formData.get('startDate') as string) ?? '',
    endDate: (formData.get('endDate') as string) ?? '',
    partySize: (formData.get('partySize') as string) ?? '',
    referenceCode: (formData.get('referenceCode') as string) ?? '',
  };

  const validated = formSchema.safeParse(raw);
  if (!validated.success) {
    const fe = validated.error.flatten().fieldErrors;
    return {
      form: raw,
      error:
        fe.destination?.[0] ||
        fe.preferences?.[0] ||
        'Please check the form inputs.',
    };
  }

  try {
    const result = await itinerarySuggestions({
      destination: validated.data.destination,
      preferences: validated.data.preferences,
    });
    return { form: raw, itinerary: result };
  } catch (e: any) {
    // Map known transient Gemini errors to friendly copy. Anything else falls
    // through to its raw message.
    const status = e?.status ?? e?.code ?? e?.detail?.error?.code;
    if (
      status === 503 ||
      status === 429 ||
      status === 504 ||
      status === 'UNAVAILABLE' ||
      status === 'RESOURCE_EXHAUSTED'
    ) {
      return {
        form: raw,
        error:
          'The AI model is temporarily busy (high demand). We already retried a couple of times — please try again in a moment.',
      };
    }
    return { form: raw, error: e?.message || 'An unknown error occurred.' };
  }
}
