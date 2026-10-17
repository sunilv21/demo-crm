'use server';

// Generates a real, directly-downloadable PDF for the "Other Format"
// itinerary via @react-pdf/renderer — same approach already used for booking
// voucher PDFs (voucher-pdf.tsx) — instead of going through the browser's
// print dialog. Unlike the .docx export, @react-pdf/renderer's View supports
// borderRadius, which is what lets the "modern" template's rounded cards
// actually render as rounded cards here (impossible in Word) while itinerary-
// docx.ts / itinerary-docx-modern.ts (the actual .docx exports) stay exactly
// as they are — this file never touches them.
//
// Pagination: `wrap={false}` on a View keeps it from being split across a
// page (hotel/day cards, table rows); the `break` prop forces a section
// (Day-Wise Itinerary, Inclusions & Exclusions) to start on a fresh page.
// `fixed` elements (the running header/footer below) repeat on every page,
// and the Page's own padding is what gives page 2+ the same top/bottom
// margin as page 1 instead of content butting against the paper edge.

import { Document, Page, View, Text, Image, Svg, Path, Circle, Rect, Line, Defs, LinearGradient, Stop, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';
import { safeFilename } from '@/lib/print';
import {
  AGENCY,
  formatOfMoney,
  type OFItinerary,
  type OFMeta,
  type OFHotelOption,
  type OFDayPlan,
  type OFDayItemType,
  type OFTemplate,
} from '@/app/(app)/itinerary-builder/other-format-types';

const NAVY = '#1B3A63';
const GOLD = '#C8862A';
const LIGHTBLUE = '#D6E6F6';
const PALEBLUE = '#EAF0F8';
const CREAM = '#FDF5E0';
const GREEN = '#2F6B3A';
const RED = '#A33A2E';
const TEXT = '#222222';
const MUTED = '#6B7280';
const BORDER = '#CBD5E1';
const LINK = '#4A86C8';

// public/sky.png is a palette/indexed-color PNG — @react-pdf/renderer's PNG
// decoder renders that corrupted, same issue voucher-pdf.tsx hit. Re-encode
// to standard RGBA once (cached) before handing it to <Image>.
let cachedLogo: Buffer | null = null;
async function loadLogo(): Promise<Buffer> {
  if (!cachedLogo) {
    const raw = fs.readFileSync(path.join(process.cwd(), 'public', 'sky.png'));
    const sharp = (await import('sharp')).default;
    cachedLogo = await sharp(raw).png().toBuffer();
  }
  return cachedLogo;
}

// ============================================================================
// Icons — @react-pdf/renderer's base-14 PDF fonts (Helvetica) can only draw
// glyphs inside WinAnsiEncoding, which doesn't include the icon/star/check
// glyphs used on-screen (✈ ⌂ ▲ ★ ✔ ✘ etc.) — they rendered as nothing in the
// downloaded PDF even though they look fine as HTML text in the browser
// preview. To actually match the on-screen preview (which uses real
// lucide-react SVG icons, not text glyphs), these are the exact same icons'
// path data drawn as vector <Svg>/<Path> — pulled directly from the
// installed lucide-react package (node_modules/lucide-react/dist/esm/icons)
// rather than approximated, so shapes match pixel-for-pixel.
// ============================================================================
type IconShape =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number };

const ICON_SHAPES = {
  arrowRightLeft: [
    { t: 'path', d: 'm16 3 4 4-4 4' }, { t: 'path', d: 'M20 7H4' },
    { t: 'path', d: 'm8 21-4-4 4-4' }, { t: 'path', d: 'M4 17h16' },
  ] as IconShape[],
  bedDouble: [
    { t: 'path', d: 'M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8' },
    { t: 'path', d: 'M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4' },
    { t: 'path', d: 'M12 4v6' }, { t: 'path', d: 'M2 18h20' },
  ] as IconShape[],
  landmark: [
    { t: 'path', d: 'M10 18v-7' },
    { t: 'path', d: 'M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z' },
    { t: 'path', d: 'M14 18v-7' }, { t: 'path', d: 'M18 18v-7' },
    { t: 'path', d: 'M3 22h18' }, { t: 'path', d: 'M6 18v-7' },
  ] as IconShape[],
  compass: [
    { t: 'circle', cx: 12, cy: 12, r: 10 },
    { t: 'path', d: 'm16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z' },
  ] as IconShape[],
  circleOutline: [{ t: 'circle', cx: 12, cy: 12, r: 10 }] as IconShape[],
  circlePlus: [
    { t: 'circle', cx: 12, cy: 12, r: 10 }, { t: 'path', d: 'M8 12h8' }, { t: 'path', d: 'M12 8v8' },
  ] as IconShape[],
  utensils: [
    { t: 'path', d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' },
    { t: 'path', d: 'M7 2v20' },
    { t: 'path', d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' },
  ] as IconShape[],
  plane: [
    { t: 'path', d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z' },
  ] as IconShape[],
  info: [
    { t: 'circle', cx: 12, cy: 12, r: 10 }, { t: 'path', d: 'M12 16v-4' }, { t: 'path', d: 'M12 8h.01' },
  ] as IconShape[],
  hotel: [
    { t: 'rect', x: 4, y: 2, w: 16, h: 20, rx: 2 },
    { t: 'path', d: 'M10 22v-6.57' }, { t: 'path', d: 'M12 11h.01' }, { t: 'path', d: 'M12 7h.01' },
    { t: 'path', d: 'M14 15.43V22' }, { t: 'path', d: 'M15 16a5 5 0 0 0-6 0' },
    { t: 'path', d: 'M16 11h.01' }, { t: 'path', d: 'M16 7h.01' }, { t: 'path', d: 'M8 11h.01' }, { t: 'path', d: 'M8 7h.01' },
  ] as IconShape[],
  mapPinned: [
    { t: 'path', d: 'M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0' },
    { t: 'circle', cx: 12, cy: 8, r: 2 },
    { t: 'path', d: 'M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712' },
  ] as IconShape[],
  calendarRange: [
    { t: 'rect', x: 3, y: 4, w: 18, h: 18, rx: 2 },
    { t: 'path', d: 'M16 2v4' }, { t: 'path', d: 'M3 10h18' }, { t: 'path', d: 'M8 2v4' },
    { t: 'path', d: 'M17 14h-6' }, { t: 'path', d: 'M13 18H7' }, { t: 'path', d: 'M7 14h.01' }, { t: 'path', d: 'M17 18h.01' },
  ] as IconShape[],
  wallet: [
    { t: 'path', d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1' },
    { t: 'path', d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' },
  ] as IconShape[],
  building2: [
    { t: 'path', d: 'M10 12h4' }, { t: 'path', d: 'M10 8h4' }, { t: 'path', d: 'M14 21v-3a2 2 0 0 0-4 0v3' },
    { t: 'path', d: 'M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2' },
    { t: 'path', d: 'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16' },
  ] as IconShape[],
  clipboardList: [
    { t: 'rect', x: 8, y: 2, w: 8, h: 4, rx: 1 },
    { t: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { t: 'path', d: 'M12 11h4' }, { t: 'path', d: 'M12 16h4' }, { t: 'path', d: 'M8 11h.01' }, { t: 'path', d: 'M8 16h.01' },
  ] as IconShape[],
  stickyNote: [
    { t: 'path', d: 'M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z' },
    { t: 'path', d: 'M15 3v5a1 1 0 0 0 1 1h5' },
  ] as IconShape[],
  check: [{ t: 'path', d: 'M20 6 9 17l-5-5' }] as IconShape[],
  x: [{ t: 'path', d: 'M18 6 6 18' }, { t: 'path', d: 'm6 6 12 12' }] as IconShape[],
  star: [{ t: 'path', d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }] as IconShape[],
  // Used by BrandedDocument's trip-overview fact grid.
  mapPin: [
    { t: 'path', d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' },
    { t: 'circle', cx: 12, cy: 10, r: 3 },
  ] as IconShape[],
  calendarDays: [
    { t: 'path', d: 'M8 2v4' }, { t: 'path', d: 'M16 2v4' },
    { t: 'rect', x: 3, y: 4, w: 18, h: 18, rx: 2 },
    { t: 'path', d: 'M3 10h18' },
    { t: 'path', d: 'M8 14h.01' }, { t: 'path', d: 'M12 14h.01' }, { t: 'path', d: 'M16 14h.01' },
    { t: 'path', d: 'M8 18h.01' }, { t: 'path', d: 'M12 18h.01' }, { t: 'path', d: 'M16 18h.01' },
  ] as IconShape[],
  clock: [{ t: 'circle', cx: 12, cy: 12, r: 10 }, { t: 'path', d: 'M12 6v6l4 2' }] as IconShape[],
  users: [
    { t: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { t: 'path', d: 'M16 3.128a4 4 0 0 1 0 7.744' },
    { t: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { t: 'circle', cx: 9, cy: 7, r: 4 },
  ] as IconShape[],
  clipboardCheck: [
    { t: 'rect', x: 8, y: 2, w: 8, h: 4, rx: 1 },
    { t: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { t: 'path', d: 'm9 14 2 2 4-4' },
  ] as IconShape[],
  hash: [
    { t: 'line', x1: 4, y1: 9, x2: 20, y2: 9 }, { t: 'line', x1: 4, y1: 15, x2: 20, y2: 15 },
    { t: 'line', x1: 10, y1: 3, x2: 8, y2: 21 }, { t: 'line', x1: 16, y1: 3, x2: 14, y2: 21 },
  ] as IconShape[],
  globe: [
    { t: 'circle', cx: 12, cy: 12, r: 10 },
    { t: 'path', d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' },
    { t: 'path', d: 'M2 12h20' },
  ] as IconShape[],
} satisfies Record<string, IconShape[]>;

// Lucide's own default SVG attrs: 24x24 viewBox, 2px stroke, no fill, round
// caps/joins — `star`/`check`/`x`/`circlePlus` etc. are drawn the same way
// here so they match the preview's stroke-style icons exactly (not filled
// glyphs).
function Icon({ shape, size = 9, color = TEXT, filled = false }: { shape: keyof typeof ICON_SHAPES; size?: number; color?: string; filled?: boolean }) {
  const common = filled
    ? { fill: color, stroke: 'none' }
    : { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ICON_SHAPES[shape].map((s, i) => {
        if (s.t === 'path') return <Path key={i} d={s.d} {...common} />;
        if (s.t === 'circle') return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...common} />;
        if (s.t === 'line') return <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth={2} strokeLinecap="round" />;
        return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...common} />;
      })}
    </Svg>
  );
}

// Matches OtherFormatPreviewModern's DAY_ITEM_ICON/DAY_ITEM_ACCENT exactly
// (other-format-panel.tsx) — same icon-to-type mapping, same accent colors.
const DAY_ITEM_ICON: Record<OFDayItemType, keyof typeof ICON_SHAPES> = {
  transfer: 'arrowRightLeft', checkin: 'bedDouble', attraction: 'landmark', explore: 'compass',
  plain: 'circleOutline', optional: 'circlePlus', meals: 'utensils', flight: 'plane', note: 'info',
};
const DAY_ITEM_ACCENT: Record<OFDayItemType, string> = {
  transfer: NAVY, checkin: LINK, attraction: NAVY, explore: NAVY,
  plain: MUTED, optional: GOLD, meals: GOLD, flight: LINK, note: MUTED,
};

// Chunks an array into pairs — [1,2,3,4,5] -> [[1,2],[3,4],[5]] — used to lay
// out Trip Summary as a two-up grid (see Modern's ModernDocument).
function pairUp<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

function Stars({ count, size = 7, color = GOLD }: { count: number; size?: number; color?: string }) {
  const n = Math.max(0, Math.min(5, count));
  return (
    <View style={{ flexDirection: 'row' }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ marginLeft: i > 0 ? 1 : 0 }}>
          <Icon shape="star" size={size} color={color} filled />
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// Shared running header/footer — repeats on every page (the `fixed` prop),
// mirrors buildRunningHeader/buildFooter in docx-helpers.ts so the PDF and
// the Word export read the same way in this respect. The compact header is
// skipped on page 1 specifically (via the `render` prop's `pageNumber`) —
// page 1 already has the big Letterhead banner just below it, so repeating
// a second, smaller copy of the same company name right above it was
// redundant there; it only earns its place once the big letterhead is gone
// on page 2+.
// ============================================================================
function RunningHeader({ meta }: { meta: OFMeta }) {
  const subline = [meta.country, meta.guestName, meta.dateRangeShort, meta.duration].filter(Boolean).join('  |  ');
  return (
    <View
      fixed
      style={{ position: 'absolute', top: 18, left: 28, right: 28 }}
      render={({ pageNumber }) =>
        pageNumber === 1 ? null : (
          <View style={styles.runningHeader}>
            <Text style={styles.runningHeaderName}>{AGENCY.name}</Text>
            <Text style={styles.runningHeaderSub}>{subline}</Text>
          </View>
        )
      }
    />
  );
}

function RunningFooter() {
  return (
    <Text
      style={styles.runningFooter}
      fixed
      render={({ pageNumber, totalPages }) => `${AGENCY.email}   |   ${AGENCY.phones.join('   |   ')}        Page ${pageNumber} of ${totalPages}`}
    />
  );
}

function Letterhead({ logo }: { logo: Buffer }) {
  return (
    <>
      <View style={styles.letterhead}>
        <Image src={{ data: logo, format: 'png' }} style={styles.logo} />
        <View style={styles.letterheadDivider} />
        <View style={{ flex: 1 }}>
          <Text style={styles.coName}>{AGENCY.name}</Text>
          <Text style={styles.coAddress}>{AGENCY.address}</Text>
          <Text style={styles.coContact}>{AGENCY.email}   |   {AGENCY.phones.join('   |   ')}</Text>
        </View>
      </View>
      <View style={styles.goldRule} />
    </>
  );
}

function Footnote() {
  return (
    <Text style={styles.closingLine}>
      This quotation has been prepared by {AGENCY.name}. For queries, please contact us at {AGENCY.email}
    </Text>
  );
}

// ============================================================================
// Branded — the vibrant magazine-style PDF (diagonal navy/orange accents,
// icon-badge fact grids, a day-timeline, image-panel hotel/pricing cards).
// Mirrors OtherFormatPreviewBranded (other-format-panel.tsx) — this is the
// PDF counterpart; the .docx export (itinerary-docx-branded.ts) stays the
// simpler card/table version since diagonal clips and photo panels aren't
// realistically achievable in Word.
//
// No photo data exists on OFItinerary yet — every place the reference
// mockup has a real photograph, PhotoPanel draws a navy→blue gradient
// panel instead, not a fabricated image.
// ============================================================================
const BRAND_NAVY = '#13305C';
const BRAND_NAVY_DEEP = '#0B2347';
const BRAND_BLUE_LIGHT = '#2F6FB3';
const BRAND_GOLD = GOLD;

// Renders a real uploaded photo (`src`, a data URL — see ImageUploadButton
// in other-format-panel.tsx) when one exists, otherwise falls back to the
// navy→blue gradient placeholder.
function PhotoPanel({ height = 60, label, src }: { height?: number; label?: string; src?: string }) {
  const gid = `photo-${Math.random().toString(36).slice(2)}`;
  return (
    <View style={{ height, position: 'relative', overflow: 'hidden' }} wrap={false}>
      {src ? (
        <Image src={src} style={{ width: '100%', height, objectFit: 'cover' }} />
      ) : (
        <Svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={BRAND_NAVY} />
              <Stop offset="0.6" stopColor={BRAND_NAVY_DEEP} />
              <Stop offset="1" stopColor={BRAND_BLUE_LIGHT} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={100} height={100} fill={`url(#${gid})`} />
        </Svg>
      )}
      {label && (
        <Text style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 6, fontFamily: 'Helvetica-Bold', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
      )}
    </View>
  );
}

// The diagonal corner accent that's this template's one geometric signature
// — a blue triangle clipped into the page's corner via an actual filled
// path (not a real CSS clip-path, which doesn't exist in PDF).
function DiagonalCorner({ size = 90, corner = 'top-right' }: { size?: number; corner?: 'top-right' | 'bottom-right' }) {
  const gid = `corner-${Math.random().toString(36).slice(2)}`;
  const d = corner === 'top-right' ? `M${size} 0 L0 0 L${size} ${size} Z` : `M${size} ${size} L0 ${size} L${size} 0 Z`;
  return (
    <View style={{ position: 'absolute', top: corner === 'top-right' ? 0 : undefined, bottom: corner === 'bottom-right' ? 0 : undefined, right: 0 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND_BLUE_LIGHT} />
            <Stop offset="1" stopColor={BRAND_NAVY} />
          </LinearGradient>
        </Defs>
        <Path d={d} fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

const BRAND_SUMMARY_ICON_RULES: { test: RegExp; icon: keyof typeof ICON_SHAPES }[] = [
  { test: /destination/i, icon: 'mapPin' },
  { test: /date/i, icon: 'calendarDays' },
  { test: /duration|night|day/i, icon: 'clock' },
  { test: /passenger|guest|pax|adult/i, icon: 'users' },
  { test: /hotel|star|category/i, icon: 'star' },
  { test: /meal/i, icon: 'utensils' },
  { test: /group/i, icon: 'users' },
  { test: /status|booking/i, icon: 'clipboardCheck' },
  { test: /reference|ref\b/i, icon: 'hash' },
];
function brandIconForLabel(label: string): keyof typeof ICON_SHAPES {
  return BRAND_SUMMARY_ICON_RULES.find((r) => r.test.test(label))?.icon ?? 'info';
}

function BrandedHeading({ text, accentGold, icon }: { text: string; accentGold?: string; icon?: keyof typeof ICON_SHAPES }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      {icon ? (
        <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: BRAND_NAVY, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Icon shape={icon} size={10} color="#fff" />
        </View>
      ) : (
        <View style={{ width: 4, height: 15, borderRadius: 2, backgroundColor: BRAND_GOLD, marginRight: 7 }} />
      )}
      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 13, color: BRAND_NAVY }}>
        {text}{accentGold ? <Text style={{ color: BRAND_GOLD }}> {accentGold}</Text> : null}
      </Text>
    </View>
  );
}

function BrandedDayBlock({ day }: { day: OFDayPlan }) {
  const metaLine = [day.date, day.weekday, day.place].filter(Boolean).join('  ·  ');
  return (
    <View wrap={false} style={{ flexDirection: 'row', marginBottom: 14 }}>
      <View style={bStyles.dayBadge}>
        <Text style={bStyles.dayBadgeLabel}>DAY</Text>
        <Text style={bStyles.dayBadgeNum}>{day.num || '–'}</Text>
      </View>
      <View style={{ flex: 1, paddingTop: 1 }}>
        {metaLine ? <Text style={bStyles.dayMeta}>{metaLine}</Text> : null}
        <Text style={bStyles.dayTitle}>{day.title}</Text>
        {day.items.map((item) => (
          <View key={item.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 }}>
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: BRAND_GOLD, marginRight: 5, marginTop: 4 }} />
            <Text style={bStyles.dayItemText}>
              {item.label ? <Text style={{ fontFamily: 'Helvetica-Bold', color: BRAND_NAVY }}>{item.label} </Text> : null}
              <Text style={{ color: MUTED }}>{item.text}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function BrandedDocument({ data, logo }: { data: OFItinerary; logo: Buffer }) {
  const options = data.hotelOptions;
  const hasCost = options.some((o) => o.perPerson || o.total);
  const destList = data.meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const money = (v: string) => formatOfMoney(v, data.currency);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <RunningHeader meta={data.meta} />
        <RunningFooter />
        <Letterhead logo={logo} />

        {/* ---------------- Cover / hero ---------------- */}
        <View wrap={false} style={{ position: 'relative', marginBottom: 16, paddingBottom: 6 }}>
          <DiagonalCorner size={70} />
          <Text style={bStyles.kicker}>YOUR JOURNEY  ·  OUR EXPERTISE  ·  MORE MEMORIES</Text>
          <Text style={bStyles.heroTitle}>{(data.meta.title || data.meta.country || 'Untitled Trip').toUpperCase()}</Text>
          {data.meta.tagline ? <Text style={bStyles.heroTagline}>{data.meta.tagline}</Text> : null}
          {destList.length > 0 ? <Text style={bStyles.heroDest}>{destList.join('   |   ')}</Text> : null}
          {data.meta.guestName ? <Text style={bStyles.heroGuest}>Prepared for {data.meta.guestName}</Text> : null}
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {data.meta.dateRangeShort ? (
              <View style={bStyles.heroFact}>
                <Icon shape="calendarDays" size={8} color={BRAND_GOLD} />
                <Text style={bStyles.heroFactText}>{data.meta.dateRangeShort}</Text>
              </View>
            ) : null}
            {data.meta.duration ? (
              <View style={bStyles.heroFact}>
                <Icon shape="clock" size={8} color={BRAND_GOLD} />
                <Text style={bStyles.heroFactText}>{data.meta.duration}</Text>
              </View>
            ) : null}
            {data.meta.referenceCode ? (
              <View style={bStyles.heroFact}>
                <Icon shape="hash" size={8} color={BRAND_GOLD} />
                <Text style={bStyles.heroFactText}>Ref {data.meta.referenceCode}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ---------------- Trip overview ---------------- */}
        {data.tripSummary.length > 0 && (
          <View wrap={false} style={{ marginBottom: 16 }}>
            <BrandedHeading text="Trip" accentGold="Overview" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
              {data.tripSummary.map((r) => (
                <View key={r.id} style={{ width: '33.33%', padding: 3 }}>
                  <View style={bStyles.fact}>
                    <View style={bStyles.factIcon}><Icon shape={brandIconForLabel(r.label)} size={8} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={bStyles.factLabel}>{r.label}</Text>
                      <Text style={[bStyles.factValue, r.emphasis ? { color: BRAND_GOLD } : {}]}>{r.value}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ---------------- Hotel accommodation ---------------- */}
        {options.some((o) => o.hotels.length > 0) && (
          <View wrap={false} style={{ marginBottom: 16 }}>
            <BrandedHeading text="Hotel Accommodation" icon="hotel" />
            <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
              {options.map(
                (opt) =>
                  opt.hotels.length > 0 && (
                    <View key={opt.id} wrap={false} style={{ flex: 1, marginHorizontal: 4, borderWidth: 0.75, borderColor: '#E7EBF2', borderRadius: 8, overflow: 'hidden' }}>
                      <PhotoPanel height={110} src={opt.image} />
                      <View style={bStyles.optionBanner}><Text style={bStyles.optionBannerText}>{opt.label.toUpperCase()}</Text></View>
                      <View style={{ padding: 8 }}>
                        {opt.hotels.map((h) => (
                          <View key={h.id} style={{ marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={bStyles.hotelName}>{h.hotel}</Text>
                              <View style={{ marginLeft: 4 }}><Stars count={h.stars} size={6} color={BRAND_GOLD} /></View>
                            </View>
                            <Text style={bStyles.hotelMeta}>{[h.city, h.room, h.nights ? `${h.nights}N` : ''].filter(Boolean).join('  ·  ')}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )
              )}
            </View>
          </View>
        )}

        {/* ---------------- Flights ---------------- */}
        {data.flights.length > 0 && (
          <View wrap={false} style={{ marginBottom: 16 }}>
            <BrandedHeading text="Flight Details" icon="plane" />
            <View style={bStyles.tableHead}>
              {['Airline', 'Flight', 'From', 'To', 'Dep.', 'Arr.', 'Class'].map((h, i) => (
                <Text key={h} style={[bStyles.th, { flex: [0.19, 0.11, 0.15, 0.15, 0.15, 0.15, 0.1][i] }]}>{h}</Text>
              ))}
            </View>
            {data.flights.map((f, i) => (
              <View key={f.id} wrap={false} style={[bStyles.tdRow, i % 2 === 1 ? { backgroundColor: '#F8FAFC' } : {}]}>
                <Text style={[bStyles.td, { flex: 0.19, fontFamily: 'Helvetica-Bold' }]}>{f.airline}</Text>
                <Text style={[bStyles.td, { flex: 0.11 }]}>{f.flightNo}</Text>
                <Text style={[bStyles.td, { flex: 0.15 }]}>{f.from}</Text>
                <Text style={[bStyles.td, { flex: 0.15 }]}>{f.to}</Text>
                <Text style={[bStyles.td, { flex: 0.15 }]}>{f.departure}</Text>
                <Text style={[bStyles.td, { flex: 0.15 }]}>{f.arrival}</Text>
                <Text style={[bStyles.td, { flex: 0.1 }]}>{f.travelClass}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ---------------- Tours & transfers ---------------- */}
        {data.tours.length > 0 && (
          <View wrap={false}>
            <BrandedHeading text="Tours &amp; Transfers" icon="mapPinned" />
            <View style={bStyles.tableHead}>
              {['Tour / Transfer', 'Basis', 'Details'].map((h, i) => (
                <Text key={h} style={[bStyles.th, { flex: [0.4, 0.2, 0.4][i] }]}>{h}</Text>
              ))}
            </View>
            {data.tours.map((t, i) => (
              <View key={t.id} wrap={false} style={[bStyles.tdRow, i % 2 === 1 ? { backgroundColor: '#F8FAFC' } : {}]}>
                <Text style={[bStyles.td, { flex: 0.4 }]}>{t.tour}</Text>
                <Text style={[bStyles.td, { flex: 0.2, fontFamily: 'Helvetica-Bold' }]}>{t.basis}</Text>
                <Text style={[bStyles.td, { flex: 0.4, color: MUTED }]}>{t.details}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ---------------- Day-wise itinerary ---------------- */}
        {data.days.length > 0 && (
          <View break>
            <BrandedHeading text="Day-Wise" accentGold="Itinerary" />
            {data.days.map((day) => (
              <BrandedDayBlock key={day.id} day={day} />
            ))}
          </View>
        )}

        {/* ---------------- Destination highlights ---------------- */}
        {destList.length > 0 && (
          <View style={{ marginTop: data.days.length > 0 ? 16 : 0, marginBottom: 16 }}>
            <BrandedHeading text="Destination Highlights" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {destList.map((d) => (
                <View key={d} wrap={false} style={{ width: '33.33%', padding: 4 }}>
                  <View style={{ borderWidth: 0.75, borderColor: '#E7EBF2', borderRadius: 6, overflow: 'hidden' }}>
                    <PhotoPanel height={100} src={data.destinationImages?.[d]} />
                    <Text style={{ padding: 5, fontSize: 8, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY }}>{d}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ---------------- Package pricing ---------------- */}
        {hasCost && (
          <View break>
            <BrandedHeading text="Package Pricing" icon="wallet" />
            {data.costComparison.componentLabel ? <Text style={bStyles.costLabel}>{data.costComparison.componentLabel}</Text> : null}
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
              {options.map((opt) => (
                <View key={opt.id} wrap={false} style={{ flex: 1, marginHorizontal: 4, borderWidth: 0.75, borderColor: '#E7EBF2', borderRadius: 8, overflow: 'hidden' }}>
                  <PhotoPanel height={45} src={opt.image} />
                  <View style={bStyles.optionBanner}><Text style={bStyles.optionBannerText}>{opt.label.toUpperCase()}</Text></View>
                  <View style={{ padding: 10, alignItems: 'center' }}>
                    {opt.hotels[0] ? <Text style={bStyles.priceHotelName}>{opt.hotels[0].hotel}</Text> : null}
                    {opt.perPerson ? (
                      <>
                        <Text style={bStyles.priceBig}>{money(opt.perPerson)}</Text>
                        <Text style={bStyles.priceSubLabel}>Per Person</Text>
                      </>
                    ) : null}
                    {opt.total ? <Text style={bStyles.priceTotal}>Total: {money(opt.total)}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
            {data.costComparison.footnote ? (
              <View style={bStyles.noteBand}>
                <Text style={bStyles.noteBandText}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Note: </Text>{data.costComparison.footnote}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ---------------- Inclusions / Exclusions ---------------- */}
        {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <View wrap={false} style={[bStyles.inclExclCard, { marginRight: 6, backgroundColor: '#F0F9F2', borderColor: '#D7ECDB' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Icon shape="check" size={8} color={GREEN} />
                <Text style={[bStyles.inclExclHead, { color: GREEN }]}>  Inclusions</Text>
              </View>
              {data.inclusions.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 }}>
                  <View style={{ marginRight: 5, marginTop: 2 }}><Icon shape="check" size={7} color={GREEN} /></View>
                  <Text style={[bStyles.inclExclText, { flex: 1 }]}>{it}</Text>
                </View>
              ))}
            </View>
            <View wrap={false} style={[bStyles.inclExclCard, { marginLeft: 6, backgroundColor: '#FDF1EF', borderColor: '#F3D6D0' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Icon shape="x" size={8} color={RED} />
                <Text style={[bStyles.inclExclHead, { color: RED }]}>  Exclusions</Text>
              </View>
              {data.exclusions.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 }}>
                  <View style={{ marginRight: 5, marginTop: 2 }}><Icon shape="x" size={7} color={RED} /></View>
                  <Text style={[bStyles.inclExclText, { flex: 1 }]}>{it}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ---------------- Important notes ---------------- */}
        {data.notes.length > 0 && (
          <View wrap={false} style={{ marginTop: 16, marginBottom: 16 }}>
            <BrandedHeading text="Important Notes" />
            {data.notes.map((n) => (
              <View key={n.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                <View style={{ marginRight: 5, marginTop: 2 }}><Icon shape="info" size={7} color={BRAND_GOLD} /></View>
                <Text style={bStyles.noteText}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: BRAND_NAVY }}>{n.label}: </Text>
                  <Text style={{ color: MUTED }}>{n.text}</Text>
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ---------------- Hotel differences ---------------- */}
        {data.hotelDifferences.length > 0 && (
          <View wrap={false} style={{ marginBottom: 16 }}>
            <BrandedHeading text="Hotel Differences Between Options" />
            <View style={bStyles.tableHead}>
              <Text style={[bStyles.th, { flex: 0.3 }]}>City</Text>
              {options.map((o) => <Text key={o.id} style={[bStyles.th, { flex: 0.7 / options.length }]}>{o.label}</Text>)}
            </View>
            {data.hotelDifferences.map((r, i) => (
              <View key={r.id} style={[bStyles.tdRow, i % 2 === 1 ? { backgroundColor: '#F8FAFC' } : {}]}>
                <Text style={[bStyles.td, { flex: 0.3, fontFamily: 'Helvetica-Bold' }]}>{r.city}</Text>
                {options.map((o, idx) => (
                  <Text key={o.id} style={[bStyles.td, { flex: 0.7 / options.length, fontFamily: 'Helvetica-Bold', color: BRAND_GOLD }]}>{(r.values || [])[idx] || ''}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ---------------- Contact footer band ---------------- */}
        <View wrap={false} style={bStyles.contactBand}>
          <DiagonalCorner size={50} corner="bottom-right" />
          <Text style={bStyles.contactTagline}>Because every journey deserves to be extraordinary.</Text>
          <Text style={bStyles.contactLine}>www.skyvisa.in   |   {AGENCY.email}   |   {AGENCY.phones[0]}</Text>
        </View>
      </Page>
    </Document>
  );
}

const bStyles = StyleSheet.create({
  kicker: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, letterSpacing: 1.5 },
  heroTitle: { fontFamily: 'Helvetica-Bold', fontSize: 30, color: BRAND_NAVY, marginTop: 6 },
  heroTagline: { fontSize: 15, fontStyle: 'italic', color: BRAND_GOLD, marginTop: 2 },
  heroDest: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, marginTop: 6 },
  heroGuest: { fontSize: 9, fontFamily: 'Helvetica', color: MUTED, marginTop: 4 },
  heroFact: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  heroFactText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, marginLeft: 4 },

  fact: { flexDirection: 'row', alignItems: 'center', borderWidth: 0.75, borderColor: '#E7EBF2', borderRadius: 6, padding: 6, backgroundColor: '#FBFCFE' },
  factIcon: { width: 18, height: 18, borderRadius: 4, backgroundColor: BRAND_NAVY, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  factLabel: { fontSize: 6, textTransform: 'uppercase', color: MUTED },
  factValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, marginTop: 1 },

  dayBadge: { width: 34, height: 34, borderRadius: 7, backgroundColor: BRAND_GOLD, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  dayBadgeLabel: { fontSize: 5, fontFamily: 'Helvetica-Bold', color: '#fff' },
  dayBadgeNum: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#fff' },
  dayMeta: { fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Bold' },
  dayTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, marginTop: 1, marginBottom: 2 },
  dayItemText: { fontSize: 7.5, lineHeight: 1.4 },

  optionBanner: { backgroundColor: BRAND_NAVY, paddingVertical: 4 },
  optionBannerText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center', letterSpacing: 0.5 },
  hotelName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY },
  hotelMeta: { fontSize: 7, color: MUTED, marginTop: 1 },

  tableHead: { flexDirection: 'row', backgroundColor: BRAND_NAVY, paddingVertical: 4, paddingHorizontal: 4 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', paddingHorizontal: 2, textTransform: 'uppercase' },
  tdRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
  td: { fontSize: 7.5, paddingHorizontal: 2 },

  costLabel: { fontSize: 8, color: MUTED, marginTop: -4 },
  priceHotelName: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, marginBottom: 2 },
  priceBig: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: BRAND_GOLD },
  priceSubLabel: { fontSize: 6, textTransform: 'uppercase', color: MUTED },
  priceTotal: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BRAND_NAVY, marginTop: 4 },
  noteBand: { backgroundColor: '#FDF1EB', borderRadius: 6, padding: 8, marginTop: 10 },
  noteBandText: { fontSize: 7.5, color: BRAND_NAVY },

  inclExclCard: { flex: 1, borderWidth: 0.75, borderRadius: 8, padding: 10 },
  inclExclHead: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  inclExclText: { fontSize: 7.5, color: TEXT },
  noteText: { flex: 1, fontSize: 7.5 },

  contactBand: { position: 'relative', backgroundColor: BRAND_NAVY, borderRadius: 8, paddingVertical: 14, alignItems: 'center', overflow: 'hidden' },
  contactTagline: { fontSize: 9, fontStyle: 'italic', color: '#fff' },
  contactLine: { fontSize: 7, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
});

// ============================================================================
// Classic — mirrors itinerary-docx.ts: solid navy banners/section headers,
// shaded tables.
// ============================================================================
function ClassicDocument({ data, logo }: { data: OFItinerary; logo: Buffer }) {
  const options = data.hotelOptions;
  const hasCost = options.some((o) => o.perPerson || o.total);
  const destList = data.meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const money = (v: string) => formatOfMoney(v, data.currency);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <RunningHeader meta={data.meta} />
        <RunningFooter />
        <Letterhead logo={logo} />

        <View style={styles.titleBlockC}>
          <Text style={styles.titleC}>{data.meta.title || 'Untitled Trip'}</Text>
          {destList.length > 0 && <Text style={styles.destLineC}>{destList.join('  ·  ')}</Text>}
          {data.meta.tagline && <Text style={styles.taglineC}>{data.meta.tagline}</Text>}
          <Text style={styles.sublineC}>
            {[data.meta.guestName, data.meta.dateRangeShort, data.meta.duration, data.meta.referenceCode && `Ref ${data.meta.referenceCode}`].filter(Boolean).join('   |   ')}
          </Text>
        </View>

        {data.tripSummary.length > 0 && (
          <View wrap={false} style={{ marginTop: 10 }}>
            <SectionBarC title="Trip Summary" />
            {data.tripSummary.map((r, i) => (
              <View key={r.id} style={[styles.rowC, i % 2 === 1 ? { backgroundColor: PALEBLUE } : {}]}>
                <Text style={styles.rowLabelC}>{r.label}</Text>
                <Text style={[styles.rowValueC, r.emphasis ? { color: GOLD, fontFamily: 'Helvetica-Bold' } : {}]}>{r.value}</Text>
              </View>
            ))}
          </View>
        )}

        {options.some((o) => o.hotels.length > 0) && (
          <View style={{ marginTop: 10 }}>
            <SectionBarC title={options.filter((o) => o.hotels.length).length > 1 ? `Hotel Accommodation — ${options.length} Options` : 'Hotel Accommodation'} />
            {options.map((opt) =>
              opt.hotels.length > 0 ? (
                <View key={opt.id} wrap={false} style={{ marginBottom: 8 }}>
                  <View style={styles.optionBannerC}><Text style={styles.optionBannerTextC}>{opt.label.toUpperCase()}</Text></View>
                  <View style={styles.tableHeadC}>
                    {['City', 'Hotel', 'Stars', 'Room', 'Nts'].map((h, i) => (
                      <Text key={h} style={[styles.thC, { flex: [0.18, 0.4, 0.12, 0.22, 0.08][i] }]}>{h}</Text>
                    ))}
                  </View>
                  {opt.hotels.map((h, i) => (
                    <View key={h.id} style={[styles.tdRowC, i % 2 === 1 ? { backgroundColor: PALEBLUE } : {}]}>
                      <Text style={[styles.tdC, { flex: 0.18 }]}>{h.city}</Text>
                      <Text style={[styles.tdC, { flex: 0.4, fontFamily: 'Helvetica-Bold', color: LINK }]}>{h.hotel}</Text>
                      <View style={{ flex: 0.12, paddingHorizontal: 2 }}><Stars count={h.stars} size={6} /></View>
                      <Text style={[styles.tdC, { flex: 0.22 }]}>{h.room}</Text>
                      <Text style={[styles.tdC, { flex: 0.08 }]}>{h.nights}</Text>
                    </View>
                  ))}
                </View>
              ) : null
            )}
          </View>
        )}

        {data.flights.length > 0 && (
          <View wrap={false} style={{ marginTop: 10 }}>
            <SectionBarC title="Flights" />
            <View style={styles.tableHeadC}>
              {['Airline', 'Flight', 'From', 'To', 'Dep.', 'Arr.', 'Class'].map((h, i) => (
                <Text key={h} style={[styles.thC, { flex: [0.17, 0.11, 0.15, 0.15, 0.15, 0.15, 0.12][i] }]}>{h}</Text>
              ))}
            </View>
            {data.flights.map((f, i) => (
              <View key={f.id} style={[styles.tdRowC, i % 2 === 1 ? { backgroundColor: PALEBLUE } : {}]}>
                <Text style={[styles.tdC, { flex: 0.17, fontFamily: 'Helvetica-Bold' }]}>{f.airline}</Text>
                <Text style={[styles.tdC, { flex: 0.11 }]}>{f.flightNo}</Text>
                <Text style={[styles.tdC, { flex: 0.15 }]}>{f.from}</Text>
                <Text style={[styles.tdC, { flex: 0.15 }]}>{f.to}</Text>
                <Text style={[styles.tdC, { flex: 0.15 }]}>{f.departure}</Text>
                <Text style={[styles.tdC, { flex: 0.15 }]}>{f.arrival}</Text>
                <Text style={[styles.tdC, { flex: 0.12 }]}>{f.travelClass}</Text>
              </View>
            ))}
          </View>
        )}

        {data.tours.length > 0 && (
          <View wrap={false} style={{ marginTop: 10 }}>
            <SectionBarC title="Tours & Transfers" />
            <View style={styles.tableHeadC}>
              {['Tour / Transfer', 'Basis', 'Details'].map((h, i) => (
                <Text key={h} style={[styles.thC, { flex: [0.4, 0.2, 0.4][i] }]}>{h}</Text>
              ))}
            </View>
            {data.tours.map((t, i) => (
              <View key={t.id} style={[styles.tdRowC, i % 2 === 1 ? { backgroundColor: PALEBLUE } : {}]}>
                <Text style={[styles.tdC, { flex: 0.4 }]}>{t.tour}</Text>
                <Text style={[styles.tdC, { flex: 0.2, fontFamily: 'Helvetica-Bold' }]}>{t.basis}</Text>
                <Text style={[styles.tdC, { flex: 0.4, color: MUTED }]}>{t.details}</Text>
              </View>
            ))}
          </View>
        )}

        {data.days.length > 0 && (
          <View break style={{ marginTop: 10 }}>
            <Text style={styles.daysHeadingC}>DAY-WISE ITINERARY</Text>
            {data.days.map((day) => (
              <DayBlockC key={day.id} day={day} />
            ))}
          </View>
        )}

        {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
          <View break style={{ marginTop: 10, flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 4 }}>
              <View style={[styles.inclExclHeadC, { backgroundColor: GREEN }]}><Text style={styles.inclExclHeadTextC}>{'+ '}PACKAGE INCLUSIONS</Text></View>
              {data.inclusions.map((it, i) => (
                <View key={i} style={[styles.inclExclRowC, i % 2 === 1 ? { backgroundColor: PALEBLUE } : {}]}>
                  <Text style={styles.inclExclTextC}><Text style={{ color: GREEN, fontFamily: 'Helvetica-Bold' }}>{'+ '}</Text>{it}</Text>
                </View>
              ))}
            </View>
            <View style={{ flex: 1, marginLeft: 4 }}>
              <View style={[styles.inclExclHeadC, { backgroundColor: RED }]}><Text style={styles.inclExclHeadTextC}>{'- '}PACKAGE EXCLUSIONS</Text></View>
              {data.exclusions.map((it, i) => (
                <View key={i} style={[styles.inclExclRowC, i % 2 === 1 ? { backgroundColor: PALEBLUE } : {}]}>
                  <Text style={styles.inclExclTextC}><Text style={{ color: RED, fontFamily: 'Helvetica-Bold' }}>{'- '}</Text>{it}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.notes.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <SectionBarC title="Important Notes" />
            {data.notes.map((n) => (
              <Text key={n.id} style={styles.noteLineC}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: NAVY }}>{n.label}: </Text>
                {n.text}
              </Text>
            ))}
          </View>
        )}

        {hasCost && (
          <View wrap={false} style={{ marginTop: 10 }}>
            <SectionBarC title="Package Cost — Comparison" />
            <View style={styles.costHeadC}>
              <View style={[styles.costHeadCellC, { flex: 0.3 }]}>
                <Text style={styles.costHeadLabelC}>{data.costComparison.componentLabel}</Text>
                {data.costComparison.componentSub ? <Text style={styles.costHeadSubC}>{data.costComparison.componentSub}</Text> : null}
              </View>
              {options.map((o) => (
                <Text key={o.id} style={[styles.costHeadOptC, { flex: 0.7 / options.length }]}>{o.label}</Text>
              ))}
            </View>
            <View style={[styles.costRowC, { backgroundColor: PALEBLUE }]}>
              <Text style={[styles.costCellLabelC, { flex: 0.3 }]}>Per Person</Text>
              {options.map((o) => (
                <Text key={o.id} style={[styles.costCellC, { flex: 0.7 / options.length }]}>{money(o.perPerson)}</Text>
              ))}
            </View>
            <View style={[styles.costRowC, { backgroundColor: CREAM, paddingVertical: 0 }]}>
              <View style={{ flex: 0.3, backgroundColor: GOLD, paddingVertical: 4, paddingHorizontal: 4 }}>
                <Text style={[styles.costCellLabelC, { color: '#FFFFFF', padding: 0 }]}>TOTAL PACKAGE COST</Text>
              </View>
              {options.map((o) => (
                <Text key={o.id} style={[styles.costCellC, { flex: 0.7 / options.length, fontFamily: 'Helvetica-Bold', color: NAVY, fontSize: 10 }]}>{money(o.total)}</Text>
              ))}
            </View>
            {data.costComparison.footnote ? <Text style={styles.footnoteC}>{data.costComparison.footnote}</Text> : null}
          </View>
        )}

        {data.hotelDifferences.length > 0 && (
          <View wrap={false} style={{ marginTop: 10 }}>
            <View style={styles.optionBannerC}><Text style={styles.optionBannerTextC}>HOTEL DIFFERENCES BETWEEN OPTIONS</Text></View>
            <View style={styles.tableHeadC}>
              <Text style={[styles.thC, { flex: 0.3 }]}>City</Text>
              {options.map((o) => <Text key={o.id} style={[styles.thC, { flex: 0.7 / options.length }]}>{o.label}</Text>)}
            </View>
            {data.hotelDifferences.map((r, i) => (
              <View key={r.id} style={[styles.tdRowC, i % 2 === 1 ? { backgroundColor: PALEBLUE } : {}]}>
                <Text style={[styles.tdC, { flex: 0.3 }]}>{r.city}</Text>
                {options.map((o, idx) => (
                  <Text key={o.id} style={[styles.tdC, { flex: 0.7 / options.length, fontFamily: 'Helvetica-Bold', color: LINK }]}>{(r.values || [])[idx] || ''}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

        <Footnote />
      </Page>
    </Document>
  );
}

function SectionBarC({ title }: { title: string }) {
  return <View style={styles.sectionBarC}><Text style={styles.sectionBarTextC}>{title.toUpperCase()}</Text></View>;
}

function DayBlockC({ day }: { day: OFDayPlan }) {
  const metaLine = [day.date, day.weekday].filter(Boolean).join(' · ');
  return (
    <View wrap={false} style={styles.dayBlockC}>
      <View style={styles.dayHeadC}>
        <Text style={styles.dayHeadTextC}>
          Day {day.num}{metaLine ? `   |   ${metaLine}   |   ` : '   |   '}{day.title}
        </Text>
      </View>
      {day.items.map((item) => (
        <View key={item.id} style={[styles.dayItemRowC, { flexDirection: 'row', alignItems: 'flex-start' }]}>
          <View style={{ marginRight: 5, marginTop: 2 }}>
            <Icon shape={DAY_ITEM_ICON[item.type]} size={8} color={DAY_ITEM_ACCENT[item.type]} />
          </View>
          <Text style={[styles.dayItemTextC, { flex: 1 }]}>
            {item.label ? <Text style={{ fontFamily: 'Helvetica-Bold' }}>{item.label} </Text> : null}
            <Text style={{ color: MUTED }}>{item.text}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// Modern — rounded "cards" (borderRadius, impossible in the .docx export),
// mirrors OtherFormatPreviewModern (other-format-panel.tsx).
// ============================================================================
function ModernDocument({ data, logo }: { data: OFItinerary; logo: Buffer }) {
  const options = data.hotelOptions;
  const hasCost = options.some((o) => o.perPerson || o.total);
  const destList = data.meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const money = (v: string) => formatOfMoney(v, data.currency);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <RunningHeader meta={data.meta} />
        <RunningFooter />
        <Letterhead logo={logo} />

        <View
          wrap={false}
          style={[
            styles.card,
            { alignItems: 'center', backgroundColor: PALEBLUE, borderTopWidth: 3, borderTopColor: LINK, borderBottomWidth: 3, borderBottomColor: LINK },
          ]}
        >
          <Text style={styles.titleM}>{data.meta.title || 'Untitled Trip'}</Text>
          {destList.length > 0 && (
            <View style={styles.chipRow}>
              {destList.map((d) => (
                <View key={d} style={styles.chipBox}>
                  <Text style={styles.chip}>{d}</Text>
                </View>
              ))}
            </View>
          )}
          {data.meta.tagline && <Text style={styles.taglineM}>{data.meta.tagline}</Text>}
          <Text style={styles.sublineM}>
            {[data.meta.guestName, data.meta.dateRangeShort, data.meta.duration, data.meta.referenceCode && `Ref ${data.meta.referenceCode}`].filter(Boolean).join('   |   ')}
          </Text>
        </View>

        {data.tripSummary.length > 0 && (
          <View wrap={false} style={styles.card}>
            <SectionHeadM title="Trip Summary" icon="clipboardList" />
            {/* Two-up grid (matches OtherFormatPreviewModern's "grid grid-cols-2"
                on screen) — pair rows two at a time, not one stacked column. */}
            {pairUp(data.tripSummary).map((pair, rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: 'row' }}>
                {pair.map((r, colIdx) => (
                  <View key={r.id} style={[styles.summaryRowM, { flex: 1, marginRight: colIdx === 0 ? 16 : 0 }]}>
                    <Text style={styles.summaryLabelM}>{r.label}</Text>
                    <Text style={[styles.summaryValueM, r.emphasis ? { color: GOLD, fontFamily: 'Helvetica-Bold' } : {}]}>{r.value}</Text>
                  </View>
                ))}
                {pair.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>
        )}

        {options.some((o) => o.hotels.length > 0) && (
          <View>
            <SectionHeadM title="Hotel Accommodation" icon="hotel" />
            <View style={{ flexDirection: 'row' }}>
              {options.map(
                (opt, i) =>
                  opt.hotels.length > 0 && (
                    <View
                      key={opt.id}
                      wrap={false}
                      style={[styles.card, { flex: 1, marginRight: i < options.length - 1 ? 6 : 0, borderTopWidth: 3, borderTopColor: i % 2 === 0 ? NAVY : LINK }]}
                    >
                      <View style={[styles.optionChipBoxM, { backgroundColor: i % 2 === 0 ? NAVY : LINK }]}>
                        <Text style={styles.optionChipM}>{opt.label.toUpperCase()}</Text>
                      </View>
                      {opt.hotels.map((h) => (
                        <View key={h.id} style={{ marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.hotelNameM}>{h.hotel}</Text>
                            <View style={{ marginLeft: 4 }}><Stars count={h.stars} size={6} /></View>
                          </View>
                          <Text style={styles.hotelMetaM}>{[h.city, h.room, h.nights ? `${h.nights}N` : ''].filter(Boolean).join('  ·  ')}</Text>
                        </View>
                      ))}
                    </View>
                  )
              )}
            </View>
          </View>
        )}

        {data.flights.length > 0 && (
          <View wrap={false} style={styles.card}>
            <SectionHeadM title="Flights" color={LINK} icon="plane" />
            <View style={styles.tableHeadM}>
              {['Airline', 'Flight', 'From', 'To', 'Dep.', 'Arr.', 'Class'].map((h, i) => (
                <Text key={h} style={[styles.thM, { flex: [0.17, 0.11, 0.15, 0.15, 0.15, 0.15, 0.12][i] }]}>{h}</Text>
              ))}
            </View>
            {data.flights.map((f, i) => (
              <View key={f.id} style={[styles.tdRowM, i % 2 === 1 ? { backgroundColor: '#F8FAFC' } : {}]}>
                <Text style={[styles.tdM, { flex: 0.17, fontFamily: 'Helvetica-Bold' }]}>{f.airline}</Text>
                <Text style={[styles.tdM, { flex: 0.11 }]}>{f.flightNo}</Text>
                <Text style={[styles.tdM, { flex: 0.15 }]}>{f.from}</Text>
                <Text style={[styles.tdM, { flex: 0.15 }]}>{f.to}</Text>
                <Text style={[styles.tdM, { flex: 0.15 }]}>{f.departure}</Text>
                <Text style={[styles.tdM, { flex: 0.15 }]}>{f.arrival}</Text>
                <Text style={[styles.tdM, { flex: 0.12 }]}>{f.travelClass}</Text>
              </View>
            ))}
          </View>
        )}

        {data.tours.length > 0 && (
          <View wrap={false} style={styles.card}>
            <SectionHeadM title="Tours & Transfers" color={GOLD} icon="mapPinned" />
            <View style={styles.tableHeadM}>
              {['Tour / Transfer', 'Basis', 'Details'].map((h, i) => (
                <Text key={h} style={[styles.thM, { flex: [0.4, 0.2, 0.4][i] }]}>{h}</Text>
              ))}
            </View>
            {data.tours.map((t, i) => (
              <View key={t.id} style={[styles.tdRowM, i % 2 === 1 ? { backgroundColor: '#F8FAFC' } : {}]}>
                <Text style={[styles.tdM, { flex: 0.4 }]}>{t.tour}</Text>
                <Text style={[styles.tdM, { flex: 0.2, fontFamily: 'Helvetica-Bold' }]}>{t.basis}</Text>
                <Text style={[styles.tdM, { flex: 0.4, color: MUTED }]}>{t.details}</Text>
              </View>
            ))}
          </View>
        )}

        {data.days.length > 0 && (
          <View break>
            <SectionHeadM title="Day-Wise Itinerary" icon="calendarRange" />
            {data.days.map((day) => (
              <DayCardM key={day.id} day={day} />
            ))}
          </View>
        )}

        {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
          <View break style={{ flexDirection: 'row' }}>
            <View wrap={false} style={[styles.card, { flex: 1, marginRight: 6, borderTopWidth: 3, borderTopColor: GREEN }]}>
              <GradientCardBg color={GREEN} id="inclusions-card" />
              <SectionHeadM title="Inclusions" color={GREEN} icon="check" />
              {data.inclusions.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 }}>
                  <View style={{ marginRight: 5, marginTop: 2 }}><Icon shape="check" size={7} color={GREEN} /></View>
                  <Text style={[styles.bulletLineM, { flex: 1, marginBottom: 0 }]}>{it}</Text>
                </View>
              ))}
            </View>
            <View wrap={false} style={[styles.card, { flex: 1, marginLeft: 6, borderTopWidth: 3, borderTopColor: RED }]}>
              <GradientCardBg color={RED} id="exclusions-card" />
              <SectionHeadM title="Exclusions" color={RED} icon="x" />
              {data.exclusions.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 }}>
                  <View style={{ marginRight: 5, marginTop: 2 }}><Icon shape="x" size={7} color={RED} /></View>
                  <Text style={[styles.bulletLineM, { flex: 1, marginBottom: 0 }]}>{it}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.notes.length > 0 && (
          <View wrap={false} style={styles.card}>
            <GradientCardBg color={GOLD} id="notes-card" />
            <SectionHeadM title="Important Notes" color={GOLD} icon="stickyNote" />
            {data.notes.map((n) => (
              <View key={n.id} style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, color: NAVY, marginRight: 6 }}>{n.label}:</Text>
                <Text style={[styles.bulletLineM, { flex: 1 }]}>{n.text}</Text>
              </View>
            ))}
          </View>
        )}

        {hasCost && (
          <View wrap={false} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ marginRight: 5 }}><Icon shape="wallet" size={9} color={GOLD} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.costTitleM}>{data.costComparison.componentLabel}</Text>
                {data.costComparison.componentSub ? <Text style={styles.costSubM}>{data.costComparison.componentSub}</Text> : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              {options.map((o, i) => (
                <View key={o.id} style={[styles.costTileM, { marginRight: i < options.length - 1 ? 6 : 0 }]}>
                  <Text style={styles.costTileLabelM}>{o.label}</Text>
                  {o.perPerson ? (
                    <>
                      <Text style={styles.costTileSubLabelM}>Per Person</Text>
                      <Text style={styles.costTilePpM}>{money(o.perPerson)}</Text>
                    </>
                  ) : null}
                  <View style={styles.costTileTotalBandM}>
                    <Text style={styles.costTileTotalLabelM}>TOTAL PACKAGE COST</Text>
                    <Text style={styles.costTileTotalM}>{money(o.total)}</Text>
                  </View>
                </View>
              ))}
            </View>
            {data.costComparison.footnote ? <Text style={styles.footnoteC}>{data.costComparison.footnote}</Text> : null}
          </View>
        )}

        {data.hotelDifferences.length > 0 && (
          <View wrap={false} style={styles.card}>
            <SectionHeadM title="Hotel Differences Between Options" color={LINK} icon="building2" />
            <View style={styles.tableHeadM}>
              <Text style={[styles.thM, { flex: 0.3 }]}>City</Text>
              {options.map((o) => <Text key={o.id} style={[styles.thM, { flex: 0.7 / options.length }]}>{o.label}</Text>)}
            </View>
            {data.hotelDifferences.map((r, i) => (
              <View key={r.id} style={[styles.tdRowM, i % 2 === 1 ? { backgroundColor: '#F8FAFC' } : {}]}>
                <Text style={[styles.tdM, { flex: 0.3, fontFamily: 'Helvetica-Bold' }]}>{r.city}</Text>
                {options.map((o, idx) => (
                  <Text key={o.id} style={[styles.tdM, { flex: 0.7 / options.length, fontFamily: 'Helvetica-Bold', color: LINK }]}>{(r.values || [])[idx] || ''}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

        <Footnote />
      </Page>
    </Document>
  );
}

// The trailing gradient-fade rule next to each section heading on screen
// (OfmSectionHeading's "flex-1 h-px, background: linear-gradient(90deg,
// color, transparent)") — a real gradient, not a flat line, drawn via
// react-pdf's SVG LinearGradient (viewBox lets a fixed-coordinate gradient
// stretch to fill whatever width the flex:1 wrapper gives it). `id` must be
// unique per instance (a page can have many of these) — the section title
// is already unique within a document, so it doubles as the gradient id.
function FadeRule({ color, id }: { color: string; id: string }) {
  const gid = `fade-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={{ flex: 1, marginLeft: 8 }}>
      <Svg width="100%" height={1.2} viewBox="0 0 100 1.2" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={1.2} fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

// A true top-to-bottom gradient card background (matches the preview's CSS
// `linear-gradient(180deg, rgba(color,0.04-0.05), transparent 40-45%)` washes
// on the Inclusions/Exclusions/Important Notes cards) — a flat tint color was
// a visible downgrade from the fade the preview actually has. Absolutely
// positioned to fill the card behind its content; the card itself needs
// `overflow: hidden` (already set on `card`) so this doesn't bleed past the
// rounded corners.
function GradientCardBg({ color, id, opacity = 0.09 }: { color: string; id: string; opacity?: number }) {
  const gid = `cardbg-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

function SectionHeadM({ title, color = NAVY, icon }: { title: string; color?: string; icon: keyof typeof ICON_SHAPES }) {
  return (
    <View style={styles.sectionHeadRowM}>
      <View style={{ marginRight: 5 }}>
        <Icon shape={icon} size={9} color={color} />
      </View>
      <Text style={[styles.sectionHeadTextM, { color }]}>{title.toUpperCase()}</Text>
      <FadeRule color={color} id={title} />
    </View>
  );
}

function DayCardM({ day }: { day: OFDayPlan }) {
  const metaLine = [day.date, day.weekday, day.place].filter(Boolean).join('  ·  ');
  return (
    <View wrap={false} style={styles.dayCardM}>
      <View style={styles.dayCardHeadM}>
        <View style={styles.dayCardBadgeM}><Text style={styles.dayCardBadgeTextM}>{day.num || '–'}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayCardTitleM}>{day.title}</Text>
          {metaLine ? <Text style={styles.dayCardMetaM}>{metaLine}</Text> : null}
        </View>
      </View>
      <View style={styles.dayCardBodyM}>
        {day.items.map((item) => (
          <View key={item.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 }}>
            <View style={{ marginRight: 5, marginTop: 2 }}>
              <Icon shape={DAY_ITEM_ICON[item.type]} size={8} color={DAY_ITEM_ACCENT[item.type]} />
            </View>
            <Text style={[styles.dayItemTextM, { flex: 1, marginBottom: 0 }]}>
              {item.label ? <Text style={{ fontFamily: 'Helvetica-Bold' }}>{item.label} </Text> : null}
              <Text style={{ color: MUTED }}>{item.text}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  // Page padding reserves room above/below for the fixed header/footer on
  // EVERY page (same uniform value for all of them — a single Page style
  // can't vary per physical page). paddingTop is sized to exactly fit the
  // compact running header (which only appears from page 2 on — see
  // RunningHeader) at its `top: 18` offset plus its own ~16pt height, not
  // any larger: since page 1 has no header there, anything bigger would
  // just be dead blank space above the Letterhead banner instead of it
  // starting at a normal top margin.
  page: { paddingTop: 36, paddingBottom: 46, paddingHorizontal: 28, fontFamily: 'Helvetica', fontSize: 9, color: TEXT },

  runningHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 4 },
  runningHeaderName: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: NAVY },
  runningHeaderSub: { fontSize: 7.5, color: MUTED },
  runningFooter: { position: 'absolute', bottom: 18, left: 28, right: 28, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 5, fontSize: 7, color: MUTED },

  letterhead: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  logo: { width: 48, height: 48 },
  letterheadDivider: { width: 2.5, alignSelf: 'stretch', backgroundColor: NAVY, marginHorizontal: 10 },
  coName: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: NAVY, marginBottom: 2 },
  coAddress: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#333333', marginBottom: 2 },
  coContact: { fontSize: 7, color: TEXT },
  goldRule: { borderBottomWidth: 2, borderBottomColor: GOLD, marginBottom: 10 },

  closingLine: { textAlign: 'center', fontSize: 7.5, fontStyle: 'italic', color: MUTED, marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: BORDER },
  footnoteC: { fontSize: 7, fontStyle: 'italic', color: MUTED, marginTop: 4 },

  // ---------- Classic ----------
  titleBlockC: { alignItems: 'center', backgroundColor: PALEBLUE, borderTopWidth: 2, borderTopColor: NAVY, borderBottomWidth: 2, borderBottomColor: NAVY, paddingVertical: 8 },
  titleC: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: NAVY, textAlign: 'center' },
  destLineC: { fontSize: 9, color: LINK, fontFamily: 'Helvetica-Bold', marginTop: 4, textAlign: 'center' },
  taglineC: { fontSize: 8, fontStyle: 'italic', color: MUTED, marginTop: 3, textAlign: 'center' },
  sublineC: { fontSize: 8, color: TEXT, marginTop: 4, textAlign: 'center' },

  sectionBarC: { backgroundColor: NAVY, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 2 },
  sectionBarTextC: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },

  rowC: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6 },
  rowLabelC: { flex: 0.3, fontFamily: 'Helvetica-Bold', color: NAVY, fontSize: 8 },
  rowValueC: { flex: 0.7, fontSize: 8 },

  optionBannerC: { backgroundColor: NAVY, paddingVertical: 4, paddingHorizontal: 6 },
  optionBannerTextC: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  tableHeadC: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 3, paddingHorizontal: 4 },
  thC: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 7.5, paddingHorizontal: 2 },
  tdRowC: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tdC: { fontSize: 7.5, paddingHorizontal: 2 },

  daysHeadingC: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: NAVY, borderBottomWidth: 1.5, borderBottomColor: LINK, paddingBottom: 4, marginBottom: 6 },
  dayBlockC: { borderWidth: 0.75, borderColor: BORDER, borderRadius: 4, overflow: 'hidden', marginBottom: 7 },
  dayHeadC: { backgroundColor: NAVY, paddingVertical: 4, paddingHorizontal: 7 },
  dayHeadTextC: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  dayItemRowC: { paddingVertical: 3, paddingHorizontal: 7, borderTopWidth: 0.5, borderTopColor: '#EEF2F7' },
  dayItemTextC: { fontSize: 7.5, lineHeight: 1.3 },

  inclExclHeadC: { paddingVertical: 4, paddingHorizontal: 6 },
  inclExclHeadTextC: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  inclExclRowC: { paddingVertical: 3, paddingHorizontal: 6 },
  inclExclTextC: { fontSize: 7.5 },
  noteLineC: { fontSize: 7.5, marginBottom: 4 },

  costHeadC: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 4, paddingHorizontal: 4 },
  costHeadCellC: { paddingHorizontal: 2 },
  costHeadLabelC: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  costHeadSubC: { color: '#FFFFFF', fontSize: 6.5, fontStyle: 'italic', marginTop: 1 },
  costHeadOptC: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center' },
  costRowC: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, alignItems: 'center' },
  costCellLabelC: { fontFamily: 'Helvetica-Bold', color: NAVY, fontSize: 7.5, padding: 2 },
  costCellC: { fontSize: 8, textAlign: 'center' },

  // ---------- Modern ----------
  card: { borderWidth: 0.75, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, marginBottom: 10, overflow: 'hidden' },
  titleM: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: NAVY, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 5 },
  // Pills are a View (box) wrapping a Text (label) — @react-pdf/renderer's
  // Text doesn't reliably render backgroundColor/borderRadius as a filled
  // pill the way View does, which is why a plain styled Text here was
  // rendering as colorless text with no chip background at all.
  chipBox: { backgroundColor: PALEBLUE, borderRadius: 9, paddingVertical: 2, paddingHorizontal: 7, marginHorizontal: 2, marginTop: 2 },
  chip: { color: NAVY, fontSize: 7, fontFamily: 'Helvetica-Bold' },
  taglineM: { fontSize: 8, fontStyle: 'italic', color: MUTED, marginTop: 5, textAlign: 'center' },
  sublineM: { fontSize: 7.5, color: MUTED, marginTop: 5, textAlign: 'center' },

  sectionHeadRowM: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  sectionHeadTextM: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },

  summaryRowM: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
  summaryLabelM: { fontSize: 7.5, color: MUTED },
  summaryValueM: { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },

  optionChipBoxM: { borderRadius: 9, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-start', marginBottom: 6 },
  optionChipM: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 7 },
  hotelNameM: { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  hotelMetaM: { fontSize: 7, color: MUTED, marginTop: 1 },

  tableHeadM: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  thM: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, paddingHorizontal: 2 },
  tdRowM: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
  tdM: { fontSize: 7.5, paddingHorizontal: 2 },

  dayCardM: { borderWidth: 0.75, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 8 },
  dayCardHeadM: { flexDirection: 'row', alignItems: 'center', backgroundColor: NAVY, padding: 7 },
  dayCardBadgeM: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  dayCardBadgeTextM: { color: NAVY, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  dayCardTitleM: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  dayCardMetaM: { color: '#D9E4F2', fontSize: 7 },
  dayCardBodyM: { padding: 7 },
  dayItemTextM: { fontSize: 7.5, lineHeight: 1.4, marginBottom: 2 },

  bulletLineM: { fontSize: 7.5, lineHeight: 1.4, marginBottom: 3 },

  costTitleM: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: NAVY },
  costSubM: { fontSize: 7, fontStyle: 'italic', color: MUTED, marginTop: 1 },
  costTileM: { flex: 1, borderWidth: 0.75, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden' },
  costTileLabelM: { textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: NAVY, backgroundColor: PALEBLUE, paddingVertical: 4 },
  costTileSubLabelM: { textAlign: 'center', fontSize: 6, color: MUTED, marginTop: 4 },
  costTilePpM: { textAlign: 'center', fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1, marginBottom: 2 },
  costTileTotalBandM: { backgroundColor: CREAM, paddingVertical: 6, alignItems: 'center' },
  costTileTotalLabelM: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: GOLD },
  costTileTotalM: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: GOLD, marginTop: 2 },
});

export async function generateOtherFormatPdf(
  data: OFItinerary,
  template: OFTemplate = 'classic'
): Promise<{ base64: string; filename: string } | { error: string }> {
  try {
    const logo = await loadLogo();
    const doc =
      template === 'classic' ? (
        <ClassicDocument data={data} logo={logo} />
      ) : template === 'branded' ? (
        <BrandedDocument data={data} logo={logo} />
      ) : (
        <ModernDocument data={data} logo={logo} />
      );
    const buf = await renderToBuffer(doc);
    const filename = safeFilename('Itinerary', data.meta.guestName || data.meta.title, 'pdf');
    return { base64: Buffer.from(buf).toString('base64'), filename };
  } catch (e: any) {
    return { error: e?.message || 'Failed to generate the PDF.' };
  }
}
