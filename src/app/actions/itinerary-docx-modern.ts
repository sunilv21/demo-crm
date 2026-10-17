// "Modern" .docx layout for the Other Format itinerary — same AGENCY
// letterhead, same OFItinerary data, same navy/gold brand palette as the
// classic layout (itinerary-docx.ts), different surface treatment: bordered
// "card" blocks instead of solid navy banners and dense tables. Mirrors the
// OtherFormatPreviewModern React component (other-format-panel.tsx) so the
// on-screen preview and the downloaded Word doc read as the same design.
//
// NOT a 'use server' file — it isn't invoked directly, only called from
// itinerary-docx.ts's generateOtherFormatDocx (the actual server action),
// so it's free to export plain (non-async) builder functions.
//
// docx has no real border-radius — "card" here means a thin all-round border
// with generous cell padding, the closest approximation available.

import {
  Paragraph, TextRun, Table, TableRow,
  WidthType, AlignmentType, VerticalAlignTable, BorderStyle, TabStopType,
} from 'docx';
import {
  NAVY, GOLD, LIGHTBLUE, PALEBLUE, CREAM, GREEN, RED, TEXT, MUTED, LINK, FONT, PAGE_WIDTH, BORDER,
  cell, p, fixedTable, thinBorders, noBorders,
  type RunPart,
} from './docx-helpers';
import {
  formatOfMoney,
  type OFItinerary,
  type OFMeta,
  type OFTripSummaryRow,
  type OFHotelOption,
  type OFFlightRow,
  type OFTourRow,
  type OFDayPlan,
  type OFDayItem,
  type OFDayItemType,
  type OFNoteItem,
  type OFHotelDifferenceRow,
} from '@/app/(app)/itinerary-builder/other-format-types';

// A light section label — no solid color bar, just bold navy caps text with
// a thin rule, quieter than the classic layout's sectionHeading.
function modernHeading(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 4 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: NAVY, font: FONT })],
  });
}

// A single-cell bordered "card" wrapping arbitrary paragraph/table content.
function card(children: (Paragraph | Table)[], { shade }: { shade?: string } = {}) {
  return fixedTable({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: [PAGE_WIDTH],
    rows: [
      new TableRow({
        children: [
          cell(children, {
            width: PAGE_WIDTH,
            shade,
            borders: thinBorders(BORDER),
            valign: VerticalAlignTable.TOP,
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
          }),
        ],
      }),
    ],
  });
}

// ---------- Title card ----------
function titleCard(meta: OFMeta) {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: meta.title || 'Untitled Trip', bold: true, size: 36, color: NAVY, font: 'Georgia' })],
    }),
  ];
  const destList = meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  if (destList.length) {
    const destRuns: RunPart[] = [];
    destList.forEach((d, i) => {
      if (i > 0) destRuns.push({ text: '   ', size: 18 });
      destRuns.push({ text: ` ${d} `, bold: true, color: NAVY, size: 17 });
    });
    children.push(p(destRuns, { spacing: { after: 80 }, align: AlignmentType.CENTER }, 17));
  }
  if (meta.tagline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: meta.tagline, italics: true, size: 18, color: MUTED, font: FONT })],
      })
    );
  }
  const subline = [meta.guestName, meta.dateRangeShort, meta.duration, meta.referenceCode ? `Ref ${meta.referenceCode}` : '']
    .filter(Boolean)
    .join('   |   ');
  if (subline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: subline, size: 18, color: TEXT, font: FONT })],
      })
    );
  }
  return card(children);
}

// ---------- Trip summary card ----------
function tripSummaryCard(rows: OFTripSummaryRow[]) {
  const children = rows.map(
    (r) =>
      new Paragraph({
        spacing: { after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'F1F5F9', space: 2 } },
        children: [
          new TextRun({ text: r.label, size: 18, color: MUTED, font: FONT }),
          new TextRun({ text: '\t' }),
          new TextRun({ text: r.value, bold: true, size: 18, color: r.emphasis ? GOLD : TEXT, font: FONT }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: PAGE_WIDTH - 400 }],
      })
  );
  return card(children);
}

// ---------- Hotel option cards (side by side, one row, N columns) ----------
// Pricing deliberately NOT shown here — it belongs only in the Package Cost
// Comparison card below, not repeated next to every option's name.
function hotelOptionCards(options: OFHotelOption[]) {
  const withHotels = options.filter((o) => o.hotels.length > 0);
  if (!withHotels.length) return null;
  const n = withHotels.length;
  const each = Math.floor(PAGE_WIDTH / n);
  const widths = Array(n).fill(each);
  widths[n - 1] += PAGE_WIDTH - each * n;

  const cells = withHotels.map((opt, i) => {
    const children: Paragraph[] = [
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: opt.label.toUpperCase(), bold: true, size: 17, color: NAVY, font: FONT })],
      }),
    ];
    opt.hotels.forEach((h, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: idx > 0 ? 100 : 0, after: 10 },
          children: [
            new TextRun({ text: h.hotel, bold: true, color: LINK, size: 17, font: FONT }),
            new TextRun({ text: `  ${'★'.repeat(Math.max(0, Math.min(5, h.stars)))}`, color: GOLD, size: 15, font: FONT }),
          ],
        })
      );
      const metaLine = [h.city, h.room, h.nights ? `${h.nights}N` : ''].filter(Boolean).join('  ·  ');
      if (metaLine) {
        children.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: metaLine, color: MUTED, size: 16, font: FONT })] }));
      }
    });
    return cell(children, { width: widths[i], borders: thinBorders(BORDER), valign: VerticalAlignTable.TOP, margins: { top: 140, bottom: 140, left: 160, right: 160 } });
  });

  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [new TableRow({ children: cells })] });
}

// ---------- Flights / Tours cards (lighter header than classic) ----------
function flightsCard(rows: OFFlightRow[]) {
  const widths = [1400, 1300, 1550, 1550, 1400, 1400, 800, 1600];
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: [
          cell([p([{ text: r.airline, bold: true, color: LINK, size: 17 }], { spacing: { after: 0 } })], { width: widths[0], borders: thinBorders(BORDER) }),
          cell([p(r.flightNo, { spacing: { after: 0 } }, 17)], { width: widths[1], borders: thinBorders(BORDER) }),
          cell([p(r.from, { spacing: { after: 0 } }, 17)], { width: widths[2], borders: thinBorders(BORDER) }),
          cell([p(r.to, { spacing: { after: 0 } }, 17)], { width: widths[3], borders: thinBorders(BORDER) }),
          cell([p(r.departure, { spacing: { after: 0 } }, 17)], { width: widths[4], borders: thinBorders(BORDER) }),
          cell([p(r.arrival, { spacing: { after: 0 } }, 17)], { width: widths[5], borders: thinBorders(BORDER) }),
          cell([p(r.travelClass, { spacing: { after: 0 } }, 17)], { width: widths[6], borders: thinBorders(BORDER) }),
          cell([p([{ text: r.baggage, color: MUTED, size: 16 }], { spacing: { after: 0 } })], { width: widths[7], borders: thinBorders(BORDER) }),
        ],
      })
  );
  const header = new TableRow({
    children: ['Airline', 'Flight No.', 'From', 'To', 'Departure', 'Arrival', 'Class', 'Baggage'].map((t, i) =>
      cell([p([{ text: t, bold: true, color: MUTED, size: 14 }], { spacing: { after: 0 } })], { width: widths[i], shade: '#F8FAFC', borders: thinBorders(BORDER) })
    ),
  });
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
}

function toursCard(rows: OFTourRow[]) {
  const widths = [5500, 1647, 3853];
  const header = new TableRow({
    children: ['Tour / Transfer', 'Basis', 'Details'].map((t, i) =>
      cell([p([{ text: t, bold: true, color: MUTED, size: 14 }], { spacing: { after: 0 } })], { width: widths[i], shade: '#F8FAFC', borders: thinBorders(BORDER) })
    ),
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: [
          cell([p(r.tour, { spacing: { after: 0 } }, 17)], { width: widths[0], borders: thinBorders(BORDER) }),
          cell([p([{ text: r.basis, bold: true, size: 17 }], { spacing: { after: 0 } })], { width: widths[1], borders: thinBorders(BORDER) }),
          cell([p([{ text: r.details, color: MUTED, size: 16 }], { spacing: { after: 0 } })], { width: widths[2], borders: thinBorders(BORDER) }),
        ],
      })
  );
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
}

// ---------- Day cards (gold left accent bar + numbered badge) ----------
const DAY_ITEM_ACCENT: Record<OFDayItemType, string> = {
  transfer: NAVY,
  checkin: LINK,
  attraction: NAVY,
  explore: NAVY,
  plain: MUTED,
  optional: GOLD,
  meals: GOLD,
  flight: LINK,
  note: MUTED,
};

function dayItemLine(item: OFDayItem) {
  const accent = DAY_ITEM_ACCENT[item.type];
  const segs: RunPart[] = [{ text: '●  ', color: accent }];
  if (item.label) segs.push({ text: item.label + (item.text ? '  ' : ''), bold: true, color: TEXT });
  if (item.text) segs.push({ text: item.text, color: MUTED });
  return new Paragraph({ spacing: { after: 70 }, children: runsFor(segs) });
}

function runsFor(parts: RunPart[]) {
  return parts.map((r) => new TextRun({ text: r.text, bold: !!r.bold, italics: !!r.italic, color: r.color || TEXT, size: r.size || 17, font: FONT }));
}

// One outer bordered card (thin all-round border, matching every other
// "card" in this layout) containing a NAVY day-number badge + title/meta
// head row, then each item as its own accented bullet line underneath.
function dayCardSimple(day: OFDayPlan) {
  const metaLine = [day.date, day.weekday, day.place].filter(Boolean).join('  ·  ');
  const innerWidth = PAGE_WIDTH - 400; // minus the card()'s own left/right margins
  const headRow = fixedTable({
    width: { size: innerWidth, type: WidthType.DXA },
    columnWidths: [480, innerWidth - 480],
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          cell([p([{ text: day.num || '–', bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], {
            width: 480,
            shade: NAVY,
            borders: noBorders(),
            margins: { top: 60, bottom: 60, left: 0, right: 0 },
          }),
          cell(
            [
              p([{ text: day.title, bold: true, color: NAVY, size: 19 }], { spacing: { after: 20 } }),
              ...(metaLine ? [p([{ text: metaLine, color: MUTED, size: 15 }], { spacing: { after: 0 } })] : []),
            ],
            { width: innerWidth - 480, borders: noBorders(), valign: VerticalAlignTable.CENTER, margins: { top: 0, bottom: 0, left: 160, right: 0 } }
          ),
        ],
      }),
    ],
  });
  const itemLines = day.items.map(dayItemLine);
  return card([headRow, new Paragraph({ spacing: { after: 60 } }), ...itemLines]);
}

// ---------- Inclusions / Exclusions cards ----------
function inclExclCards(inclusions: string[], exclusions: string[]) {
  const inclChildren = [
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'INCLUSIONS', bold: true, color: GREEN, size: 17, font: FONT })] }),
    ...inclusions.map((it) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: '✔  ', bold: true, color: GREEN, size: 16 }), new TextRun({ text: it, size: 16, color: TEXT, font: FONT })] })),
  ];
  const exclChildren = [
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'EXCLUSIONS', bold: true, color: RED, size: 17, font: FONT })] }),
    ...exclusions.map((it) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: '✘  ', bold: true, color: RED, size: 16 }), new TextRun({ text: it, size: 16, color: TEXT, font: FONT })] })),
  ];
  const half = Math.floor(PAGE_WIDTH / 2);
  return fixedTable({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: [half, PAGE_WIDTH - half],
    rows: [
      new TableRow({
        children: [
          cell(inclChildren, { width: half, borders: thinBorders(BORDER), valign: VerticalAlignTable.TOP, margins: { top: 140, bottom: 140, left: 180, right: 180 } }),
          cell(exclChildren, { width: PAGE_WIDTH - half, borders: thinBorders(BORDER), valign: VerticalAlignTable.TOP, margins: { top: 140, bottom: 140, left: 180, right: 180 } }),
        ],
      }),
    ],
  });
}

// ---------- Notes card ----------
function notesCard(notes: OFNoteItem[]) {
  const children = notes.map(
    (n) =>
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `${n.label}  `, bold: true, color: NAVY, size: 17, font: FONT }),
          new TextRun({ text: n.text, size: 17, color: TEXT, font: FONT }),
        ],
      })
  );
  return card(children);
}

// ---------- Cost comparison cards (pale-blue option tiles, gold total) ----------
// Total is the headline figure (what the client actually pays), so it gets
// its own CREAM-shaded band with much larger bold gold type — Per Person is
// supporting detail in the PALEBLUE band above it, not equal-weight. Built
// as two stacked table rows sharing the same column widths (rather than one
// cell with mixed shading, which `docx` cells don't support) so each
// option's two bands still read as one continuous tile.
function costComparisonCards(cc: OFItinerary['costComparison'], options: OFHotelOption[], currency: OFItinerary['currency']) {
  const innerWidth = PAGE_WIDTH - 400; // minus the card()'s own left/right margins
  const n = options.length;
  const each = Math.floor(innerWidth / n);
  const widths = Array(n).fill(each);
  widths[n - 1] += innerWidth - each * n;

  const label = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: cc.componentLabel, bold: true, size: 20, color: NAVY, font: FONT })] }),
    ...(cc.componentSub ? [new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: cc.componentSub, italics: true, size: 16, color: MUTED, font: FONT })] })] : [new Paragraph({ spacing: { after: 140 }, children: [] })]),
  ];

  const headRow = new TableRow({
    children: options.map((o, i) =>
      cell(
        [
          p([{ text: o.label, bold: true, color: NAVY, size: 17 }], { spacing: { after: 60 }, align: AlignmentType.CENTER }),
          ...(o.perPerson
            ? [
                p([{ text: 'Per Person', color: MUTED, size: 13 }], { spacing: { after: 10 }, align: AlignmentType.CENTER }),
                p([{ text: formatOfMoney(o.perPerson, currency), bold: true, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER }),
              ]
            : []),
        ],
        { width: widths[i], shade: PALEBLUE, borders: thinBorders(BORDER), margins: { top: 160, bottom: 140, left: 120, right: 120 } }
      )
    ),
  });

  const totalRow = new TableRow({
    children: options.map((o, i) =>
      cell(
        [
          p([{ text: 'TOTAL PACKAGE COST', bold: true, color: GOLD, size: 13 }], { spacing: { after: 60 }, align: AlignmentType.CENTER }),
          p([{ text: formatOfMoney(o.total, currency), bold: true, color: GOLD, size: 30 }], { spacing: { after: 0 }, align: AlignmentType.CENTER }),
        ],
        { width: widths[i], shade: CREAM, borders: thinBorders(BORDER), margins: { top: 140, bottom: 160, left: 120, right: 120 } }
      )
    ),
  });

  const tiles = fixedTable({ width: { size: innerWidth, type: WidthType.DXA }, columnWidths: widths, rows: [headRow, totalRow] });

  const footnote = cc.footnote
    ? [new Paragraph({ spacing: { before: 140, after: 0 }, children: [new TextRun({ text: cc.footnote, italics: true, size: 15, color: MUTED, font: FONT })] })]
    : [];

  return card([...label, tiles, ...footnote]);
}

// ---------- Hotel differences card ----------
function hotelDifferencesCard(rows: OFHotelDifferenceRow[], options: OFHotelOption[]) {
  const n = options.length;
  const firstWidth = Math.max(1800, Math.round(PAGE_WIDTH * (n <= 2 ? 0.25 : 0.18)));
  const remaining = PAGE_WIDTH - firstWidth;
  const each = Math.floor(remaining / n);
  const widths = [firstWidth, ...Array(n).fill(each)];
  widths[widths.length - 1] += remaining - each * n;

  const header = new TableRow({
    children: [
      cell([p([{ text: 'City', bold: true, color: MUTED, size: 14 }], { spacing: { after: 0 } })], { width: widths[0], shade: '#F8FAFC', borders: thinBorders(BORDER) }),
      ...options.map((o, i) =>
        cell([p([{ text: o.label, bold: true, color: MUTED, size: 14 }], { spacing: { after: 0 } })], { width: widths[1 + i], shade: '#F8FAFC', borders: thinBorders(BORDER) })
      ),
    ],
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: [
          cell([p(r.city, { spacing: { after: 0 } }, 17)], { width: widths[0], borders: thinBorders(BORDER) }),
          ...options.map((_, i) =>
            cell([p([{ text: (r.values || [])[i] || '', bold: true, color: LINK, size: 17 }], { spacing: { after: 0 } })], { width: widths[1 + i], borders: thinBorders(BORDER) })
          ),
        ],
      })
  );
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
}

// ============================================================================
// Document assembly — one entry point consumed by itinerary-docx.ts
// ============================================================================
export function buildModernChildren(data: OFItinerary): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  const options = data.hotelOptions;

  children.push(titleCard(data.meta));

  if (data.tripSummary.length) {
    children.push(modernHeading('Trip Summary'));
    children.push(tripSummaryCard(data.tripSummary));
  }

  const hotelCards = hotelOptionCards(options);
  if (hotelCards) {
    children.push(modernHeading(options.filter((o) => o.hotels.length).length > 1 ? `Hotel Accommodation — ${options.length} Options` : 'Hotel Accommodation'));
    children.push(hotelCards);
  }

  if (data.flights.length) {
    children.push(modernHeading('Flights'));
    children.push(flightsCard(data.flights));
  }

  if (data.tours.length) {
    children.push(modernHeading('Tours & Transfers Included'));
    children.push(toursCard(data.tours));
  }

  if (data.days.length) {
    children.push(modernHeading('Day-Wise Itinerary'));
    data.days.forEach((day) => {
      children.push(dayCardSimple(day));
      children.push(new Paragraph({ spacing: { after: 160 } }));
    });
  }

  if (data.inclusions.length || data.exclusions.length) {
    children.push(modernHeading('Inclusions & Exclusions'));
    children.push(inclExclCards(data.inclusions, data.exclusions));
  }

  if (data.notes.length) {
    children.push(modernHeading('Important Notes'));
    children.push(notesCard(data.notes));
  }

  const hasCostData = options.some((o) => o.perPerson || o.total);
  if (hasCostData) {
    children.push(modernHeading('Package Cost — Comparison'));
    children.push(costComparisonCards(data.costComparison, options, data.currency));
  }

  if (data.hotelDifferences.length) {
    children.push(modernHeading('Hotel Differences Between Options'));
    children.push(hotelDifferencesCard(data.hotelDifferences, options));
  }

  return children;
}
