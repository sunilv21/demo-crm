import { NextResponse } from 'next/server';

// Normalized country shape consumed by the `useCountries` hook.
export interface NormalizedCountry {
  name: { common: string; official: string };
  cca2: string;
  callingCodes: string[];
  demonyms: { f: string; m: string } | null;
}

const API_BASE = 'https://api.restcountries.com/countries/v5';
const PAGE_LIMIT = 100; // max objects per request on the current plan

// Cache the (large, rarely-changing) country list for a day. `force-static`
// + revalidate keeps the upstream key off the client and avoids re-fetching
// 250+ countries on every page load.
export const revalidate = 86400;

function normalize(obj: any): NormalizedCountry | null {
  const common = obj?.names?.common;
  const cca2 = obj?.codes?.alpha_2;
  if (!common || !cca2) return null;

  const eng = obj?.demonyms?.eng;
  return {
    name: { common, official: obj?.names?.official ?? common },
    cca2,
    callingCodes: Array.isArray(obj?.calling_codes) ? obj.calling_codes : [],
    demonyms: eng?.m || eng?.f ? { m: eng.m ?? eng.f, f: eng.f ?? eng.m } : null,
  };
}

export async function GET() {
  const apiKey = process.env.RESTCOUNTRIES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'RESTCOUNTRIES_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  try {
    const all: NormalizedCountry[] = [];
    let offset = 0;
    let more = true;

    // The v5 API paginates; loop until `meta.more` is false.
    while (more) {
      const res = await fetch(`${API_BASE}?limit=${PAGE_LIMIT}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate },
      });

      if (!res.ok) {
        throw new Error(`Upstream country API returned ${res.status}`);
      }

      const json = await res.json();
      const objects: any[] = json?.data?.objects ?? [];
      const meta = json?.data?.meta;

      for (const o of objects) {
        const n = normalize(o);
        if (n) all.push(n);
      }

      more = Boolean(meta?.more) && objects.length > 0;
      offset += PAGE_LIMIT;

      // Safety stop in case `more` never flips.
      if (offset > 1000) break;
    }

    all.sort((a, b) => a.name.common.localeCompare(b.name.common));

    return NextResponse.json({ countries: all });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to fetch country data' },
      { status: 502 }
    );
  }
}
