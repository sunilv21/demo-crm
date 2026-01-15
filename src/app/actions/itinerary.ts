'use server';

import { itinerarySuggestions, ItinerarySuggestionsOutput } from '@/ai/flows/itinerary-suggestions';
import { z } from 'zod';

const formSchema = z.object({
  destination: z.string().min(2, {
    message: 'Destination must be at least 2 characters.',
  }),
  preferences: z.string().min(10, {
    message: 'Preferences must be at least 10 characters.',
  }),
});

export type ItineraryState = {
  form: {
    destination: string;
    preferences: string;
  };
  error?: string;
  itinerary?: ItinerarySuggestionsOutput;
};

export async function getItinerary(
  prevState: ItineraryState,
  formData: FormData
): Promise<ItineraryState> {
  const validatedFields = formSchema.safeParse({
    destination: formData.get('destination'),
    preferences: formData.get('preferences'),
  });

  const form = {
    destination: formData.get('destination') as string,
    preferences: formData.get('preferences') as string,
  };
  
  if (!validatedFields.success) {
    return {
      form,
      error: validatedFields.error.flatten().fieldErrors.destination?.[0] || validatedFields.error.flatten().fieldErrors.preferences?.[0]
    };
  }

  try {
    const result = await itinerarySuggestions(validatedFields.data);
    return {
      form,
      itinerary: result,
    };
  } catch (e: any) {
    return {
      form,
      error: e.message || 'An unknown error occurred.',
    };
  }
}
