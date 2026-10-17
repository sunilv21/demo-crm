'use client';

import { COUNTRIES } from '@/lib/countries';
import type { CountryCode } from 'libphonenumber-js';

export type { CountryData as Country } from '@/lib/countries';

export type CountryInfo = {
  label: string;
  value: CountryCode;
};

export function useCountries() {
  const countries = COUNTRIES;

  const countryNames = countries.map(c => c.name.common).sort();

  const countryOptions: CountryInfo[] = countries
    .filter(c => c.cca2)
    .map(c => ({ label: c.name.common, value: c.cca2 }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const nationalities = [...new Set(
    countries
      .filter(c => c.demonyms)
      .flatMap(c => [c.demonyms!.m, c.demonyms!.f])
      .filter(Boolean)
  )].sort();

  return { countries, countryNames, countryOptions, nationalities, isLoading: false, error: null };
}
