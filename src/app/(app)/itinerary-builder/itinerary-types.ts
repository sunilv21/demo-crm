import type { ItinerarySuggestionsOutput } from '@/ai/flows/itinerary-suggestions';

// Shared, non-server types & constants for the itinerary builder. Lives in a
// plain client/server-safe module so the form can import the initial state
// without violating Next's "use server"/exports rules.

export type ItineraryFormValues = {
  destination: string;
  preferences: string;
  travellerName?: string;
  startDate?: string;
  endDate?: string;
  partySize?: string;
  referenceCode?: string;
};

export type ItineraryState = {
  form: ItineraryFormValues;
  error?: string;
  itinerary?: ItinerarySuggestionsOutput;
};

export const initialItineraryState: ItineraryState = {
  form: {
    destination: '',
    preferences: '',
    travellerName: '',
    startDate: '',
    endDate: '',
    partySize: '',
    referenceCode: '',
  },
};

export type HotelRow = {
  id: string;
  name: string;
  stars: number;
  category: string;
  roomType: string;
  priceInr: string;
  recommended: boolean;
};

export const emptyHotel = (): HotelRow => ({
  id: Math.random().toString(36).slice(2, 11),
  name: '',
  stars: 4,
  category: 'Premium · 4 Star',
  roomType: 'Deluxe Room',
  priceInr: '',
  recommended: false,
});
