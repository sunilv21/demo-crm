import type { ItineraryFormatExtractOutput } from './itinerary-format-schema';

export function normalizeItineraryText(rawText: string): string {
  if (!rawText) return '';

  return rawText
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\u2028|\u2029/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/(^|\n)\s*[-*•]\s*/g, '$1• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function looksLikeSparseExtraction(output: ItineraryFormatExtractOutput): boolean {
  const hasAnyContent =
    output.meta.title.trim().length > 0 ||
    output.meta.country.trim().length > 0 ||
    output.meta.destinations.trim().length > 0 ||
    output.tripSummary.some((row) => row.value.trim().length > 0) ||
    output.hotelOptions.some((option) => option.perPerson.trim().length > 0 || option.total.trim().length > 0 || option.hotels.length > 0) ||
    output.tours.length > 0 ||
    output.days.some((day) => day.title.trim().length > 0 || day.place.trim().length > 0 || day.items.length > 0) ||
    output.inclusions.length > 0 ||
    output.exclusions.length > 0 ||
    output.notes.length > 0;

  if (!hasAnyContent) {
    return true;
  }

  return (
    output.days.length === 0 &&
    output.hotelOptions.every((option) => !option.perPerson && !option.total && option.hotels.length === 0) &&
    output.tripSummary.every((row) => !row.value) &&
    output.tours.length === 0 &&
    output.inclusions.length === 0 &&
    output.exclusions.length === 0 &&
    output.notes.length === 0
  );
}
