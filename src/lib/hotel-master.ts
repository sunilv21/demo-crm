export type HotelMasterRecord = {
  id: string;
  hotelName: string;
  hotelCode?: string;
  hotelChain?: string;
  starRating?: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  cancellationPolicy?: string;
  termsAndConditions?: string;
  logo?: string;
  active?: boolean;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
};

export function normalizeHotelName(value: string) {
  return value.trim().toLowerCase();
}

export function findHotelNameConflict(hotels: Array<Partial<HotelMasterRecord>>, candidate: string, currentId?: string) {
  const normalized = normalizeHotelName(candidate);
  if (!normalized) return null;

  const duplicate = hotels.find((hotel) => {
    if (!hotel?.hotelName) return false;
    if (hotel.id && currentId && hotel.id === currentId) return false;
    if (hotel.active === false) return false;
    return normalizeHotelName(hotel.hotelName) === normalized;
  });

  return duplicate?.hotelName ?? null;
}
