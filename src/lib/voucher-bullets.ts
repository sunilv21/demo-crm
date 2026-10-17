// Turns free text into a bullet array without requiring the agent to
// manually break it into one point per line — real pasted T&C text (e.g.
// straight from a hotel's email/PDF) arrives as one giant paragraph, often
// using inline bullet markers glued to the next word rather than real line
// breaks. Priority: explicit line breaks > inline bullet markers (tried in
// order below) > sentence boundaries — each tried only if the previous one
// didn't find real structure.
//
// Shared by the .docx voucher (src/app/actions/voucher-docx.ts) and the PDF
// voucher (src/app/actions/voucher-pdf.tsx) so both formats bullet the same
// hotel T&C/notes text identically.
export function linesToBullets(text?: string): string[] {
  const raw = (text || '').trim();
  if (!raw) return [];
  const byLine = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine.flatMap(splitOneLine);
  return splitOneLine(raw);
}

// Candidate inline bullet markers, most to least distinctive. Each requires
// the character right after the marker to start a real word (a capital
// letter, for the dash/numbered/lettered forms) so ordinary prose —
// hyphenated words ("check-in"), decimals ("3.5"), times ("12.30") — never
// gets mistaken for a list.
const INLINE_MARKERS: RegExp[] = [
  // "*Point", "* Point", "•Point" — asterisk/bullet-dot markers.
  /(?:^|\s)[*•]\s*(?=\S)/,
  // "- Point", "– Point", "— Point" — dash markers (needs a space after,
  // unlike the hyphen in "check-in").
  /(?:^|\s)[-–—]\s+(?=[A-Z0-9])/,
  // "1. Point", "2) Point", "a. Point", "b) Point" — numbered/lettered lists.
  /(?:^|\s)(?:\d{1,2}|[a-zA-Z])[.)]\s*(?=[A-Za-z])/,
];

function splitOneLine(text: string): string[] {
  // Only treat a marker as real list structure once it shows up at least
  // twice — a single "*" or "-" is more likely emphasis/a stray dash.
  for (const marker of INLINE_MARKERS) {
    const hits = text.match(new RegExp(marker.source, 'g')) || [];
    if (hits.length >= 2) {
      return text.split(marker).map((s) => s.trim()).filter(Boolean);
    }
  }
  // Otherwise fall back to sentence boundaries.
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
