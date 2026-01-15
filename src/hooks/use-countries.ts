'use client';

import { useState, useEffect } from 'react';
import { type CountryCode } from 'libphonenumber-js';

export interface Country {
  name: {
    common: string;
    official: string;
  };
  cca2: CountryCode;
  idd: {
    root: string;
    suffixes: string[];
  };
  demonyms: {
    eng: {
      f: string;
      m: string;
    }
  }
}

export type CountryInfo = {
  label: string;
  value: CountryCode;
};

export function useCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchCountries() {
      try {
        const response = await fetch('https://restcountries.com/v3.1/all?fields=name,idd,demonyms,cca2');
        if (!response.ok) {
          throw new Error('Failed to fetch country data');
        }
        const data: Country[] = await response.json();
        
        const sortedData = data.sort((a, b) => {
            const aName = a.name.common;
            const bName = b.name.common;
            if (aName < bName) return -1;
            if (aName > bName) return 1;
            return 0;
        });

        setCountries(sortedData);
      } catch (err: any) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCountries();
  }, []);

  const countryNames = countries.map(c => c.name.common).sort();
  
  const countryOptions: CountryInfo[] = countries
    .filter(c => c.cca2)
    .map(c => ({
        label: c.name.common,
        value: c.cca2
    }))
    .sort((a,b) => a.label.localeCompare(b.label));

  const nationalities = [...new Set(countries
    .filter(c => c.demonyms)
    .flatMap(c => [c.demonyms.eng.m, c.demonyms.eng.f])
    .filter(Boolean))
  ].sort();

  return { countries, countryNames, countryOptions, nationalities, isLoading, error };
}
