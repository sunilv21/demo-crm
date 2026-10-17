'use server';

// Generates a real Word (.docx) document for the "Other Format" itinerary —
// ported from a reference script (build_itinerary_skytours.js) that used the
// `docx` library to produce a styled travel quotation (navy/gold palette,
// banner headers, cell-shaded tables, a running header/footer with page
// numbers). This module is the same layout code, parametrized by OFItinerary
// instead of a hardcoded trip, and returning a base64 buffer (Server Actions
// can't stream binary — the client turns this into a Blob and downloads it).
//
// The generic visual primitives (palette, table/paragraph helpers, the
// company letterhead) live in docx-helpers.ts, shared with voucher-docx.ts —
// only the itinerary-specific layout (day blocks, hotel tables, cost
// comparison, …) stays here.

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow,
  WidthType, AlignmentType, BorderStyle, VerticalAlignTable,
} from 'docx';
import { safeFilename } from '@/lib/print';
import { AGENCY, formatOfMoney } from '@/app/(app)/itinerary-builder/other-format-types';
import {
  NAVY, GOLD, LIGHTBLUE, PALEBLUE, CREAM, GREEN, RED, TEXT, MUTED, LINK, FONT, PAGE_WIDTH,
  cell, p, sectionHeading, navyBar, buildLetterhead, buildFooter, buildRunningHeader, fixedTable,
  thinBorders, noBorders,
  type RunPart,
} from './docx-helpers';
import { buildModernChildren } from './itinerary-docx-modern';
import { buildBrandedChildren } from './itinerary-docx-branded';
import type {
  OFItinerary,
  OFMeta,
  OFTemplate,
  OFTripSummaryRow,
  OFHotelOption,
  OFFlightRow,
  OFTourRow,
  OFDayPlan,
  OFDayItem,
  OFDayItemType,
  OFNoteItem,
  OFHotelDifferenceRow,
} from '@/app/(app)/itinerary-builder/other-format-types';

// ---------- Page header (compact, repeats every page — itinerary-specific
// meta on the right, unlike the shared buildRunningHeader's blank default) ----------
function buildHeader(meta: OFMeta) {
  const subline = [meta.country, meta.guestName, meta.dateRangeShort, meta.duration].filter(Boolean).join(' | ');
  return buildRunningHeader(AGENCY, subline);
}

// ---------- Cover / title block ----------
function titleBlock(meta: OFMeta) {
  const children: Paragraph[] = [];
  children.push(
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 20, color: NAVY, space: 6 } }, spacing: { after: 160 } })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: meta.title, bold: true, size: 40, color: NAVY, font: FONT })],
    })
  );
  const destList = meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const destRuns: RunPart[] = [];
  destList.forEach((d, i) => {
    if (i > 0) destRuns.push({ text: '  ·  ', color: TEXT, size: 21 });
    destRuns.push({ text: d, bold: true, color: LINK, size: 21 });
  });
  if (destRuns.length) children.push(p(destRuns, { spacing: { after: 80 }, align: AlignmentType.CENTER }));
  if (meta.tagline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: meta.tagline, italics: true, size: 19, color: MUTED, font: FONT })],
      })
    );
  }
  const subline = [meta.guestName, meta.dateRangeShort, meta.duration, meta.referenceCode ? `Ref ${meta.referenceCode}` : '']
    .filter(Boolean)
    .join('  |  ');
  if (subline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: subline, size: 19, color: TEXT, font: FONT })],
      })
    );
  }
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 20, color: NAVY, space: 0 } }, spacing: { after: 0 } }));
  return children;
}

// ---------- Trip summary ----------
function twoColRow(label: string, value: string, emphasis: boolean | undefined, shade?: string) {
  return new TableRow({
    children: [
      cell([p([{ text: label, bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: 2824, shade: NAVY }),
      cell([p([{ text: value, bold: true, color: emphasis ? GOLD : TEXT, size: 19 }], { spacing: { after: 0 } })], { width: 8176, shade }),
    ],
  });
}

function tripSummaryTable(rows: OFTripSummaryRow[]) {
  return fixedTable({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: [2824, 8176],
    rows: rows.map((r, i) => twoColRow(r.label, r.value, r.emphasis, i % 2 === 1 ? PALEBLUE : undefined)),
  });
}

// ---------- Hotel option table ----------
// Pricing deliberately NOT in this banner — it belongs only in the Package
// Cost Comparison table (costComparisonTable below), not repeated next to
// every hotel option's name.
function hotelOptionTable(option: OFHotelOption) {
  const banner = option.label.toUpperCase();
  const widths = [1647, 3529, 1000, 1765, 1294, 1294, 471]; // City | Hotel | Stars | Room | Check-in | Check-out | Nts

  const headHotel = new TableRow({
    children: ['City', 'Hotel', 'Stars', 'Room Type', 'Check-in', 'Check-out', 'Nts'].map((t, i) =>
      cell([p([{ text: t, bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 } })], { width: widths[i], shade: NAVY })
    ),
  });

  const bodyRows = option.hotels.map(
    (r) =>
      new TableRow({
        children: [
          cell([p(r.city, { spacing: { after: 0 } }, 18)], { width: widths[0] }),
          cell([p([{ text: r.hotel, bold: true, color: LINK, size: 18 }], { spacing: { after: 0 } })], { width: widths[1] }),
          cell([p([{ text: '★'.repeat(Math.max(0, Math.min(5, r.stars))), color: GOLD, size: 16 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], {
            width: widths[2],
          }),
          cell([p(r.room, { spacing: { after: 0 } }, 18)], { width: widths[3] }),
          cell([p(r.checkin, { spacing: { after: 0 } }, 18)], { width: widths[4] }),
          cell([p(r.checkout, { spacing: { after: 0 } }, 18)], { width: widths[5] }),
          cell([p(String(r.nights), { spacing: { after: 0 } }, 18)], { width: widths[6] }),
        ],
      })
  );

  return [
    navyBar([{ text: banner, bold: true, color: 'FFFFFF' }], { size: 19 }),
    fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [headHotel, ...bodyRows] }),
    new Paragraph({ spacing: { after: 120 } }),
  ];
}

// ---------- Flights table ----------
function flightsTable(rows: OFFlightRow[]) {
  const widths = [1400, 1300, 1550, 1550, 1400, 1400, 800, 1600]; // Airline | Flight No. | From | To | Departure | Arrival | Class | Baggage — sums to PAGE_WIDTH (11000)
  const header = new TableRow({
    children: ['Airline', 'Flight No.', 'From', 'To', 'Departure', 'Arrival', 'Class', 'Baggage'].map((t, i) =>
      cell([p([{ text: t, bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 } })], { width: widths[i], shade: NAVY })
    ),
  });
  const bodyRows = rows.map(
    (r, idx) =>
      new TableRow({
        children: [
          cell([p([{ text: r.airline, bold: true, color: LINK, size: 18 }], { spacing: { after: 0 } })], { width: widths[0], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p(r.flightNo, { spacing: { after: 0 } }, 18)], { width: widths[1], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p(r.from, { spacing: { after: 0 } }, 18)], { width: widths[2], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p(r.to, { spacing: { after: 0 } }, 18)], { width: widths[3], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p(r.departure, { spacing: { after: 0 } }, 18)], { width: widths[4], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p(r.arrival, { spacing: { after: 0 } }, 18)], { width: widths[5], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p(r.travelClass, { spacing: { after: 0 } }, 18)], { width: widths[6], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p([{ text: r.baggage, color: MUTED, size: 17 }], { spacing: { after: 0 } })], { width: widths[7], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
        ],
      })
  );
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
}

// ---------- Tours & Transfers table ----------
function toursTransfersTable(rows: OFTourRow[]) {
  const widths = [5500, 1647, 3853];
  const header = new TableRow({
    children: [
      cell([p([{ text: 'Tour / Transfer', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[0], shade: NAVY }),
      cell([p([{ text: 'Basis', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[1], shade: NAVY }),
      cell([p([{ text: 'Details', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[2], shade: NAVY }),
    ],
  });
  const bodyRows = rows.map(
    (r, idx) =>
      new TableRow({
        children: [
          cell([p(r.tour, { spacing: { after: 0 } }, 18)], { width: widths[0], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p([{ text: r.basis, bold: true, size: 18 }], { spacing: { after: 0 } })], { width: widths[1], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p([{ text: r.details, color: MUTED, size: 18 }], { spacing: { after: 0 } })], { width: widths[2], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
        ],
      })
  );
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
}

// ---------- Day-wise itinerary ----------
// Every OFDayItem uses the same {label, text} shape; the visual vocabulary
// (icon / shade / colour) comes from its `type`, mirroring the sample
// script's per-type helper functions (L.transfer, L.checkin, L.attraction…).
const DAY_ITEM_STYLE: Record<OFDayItemType, { icon: string; shade?: string; labelColor: string; labelBold: boolean; textItalic?: boolean; textColor?: string }> = {
  transfer: { icon: '➤', labelColor: NAVY, labelBold: true },
  checkin: { icon: '⌂', shade: LIGHTBLUE, labelColor: LINK, labelBold: true },
  attraction: { icon: '▲', labelColor: NAVY, labelBold: true },
  explore: { icon: '▶', labelColor: NAVY, labelBold: true },
  plain: { icon: '▶', labelColor: TEXT, labelBold: false },
  optional: { icon: '⊕', shade: CREAM, labelColor: GOLD, labelBold: true },
  meals: { icon: '🍴', shade: CREAM, labelColor: NAVY, labelBold: true },
  flight: { icon: '✈', shade: LIGHTBLUE, labelColor: NAVY, labelBold: true },
  note: { icon: 'ℹ', shade: LIGHTBLUE, labelColor: MUTED, labelBold: false, textItalic: true },
};

function lineRow(item: OFDayItem) {
  const style = DAY_ITEM_STYLE[item.type];
  const segs: RunPart[] = [{ text: `${style.icon}  `, color: TEXT }];
  if (item.label) segs.push({ text: item.label + (item.text ? ' ' : ''), bold: style.labelBold, color: style.labelColor, italic: style.textItalic });
  if (item.text) segs.push({ text: item.text, color: style.textColor || TEXT, italic: style.textItalic });
  return new TableRow({
    children: [cell([p(segs, { spacing: { after: 0 } }, 19)], { width: PAGE_WIDTH, shade: style.shade, valign: VerticalAlignTable.TOP, borders: thinBorders() })],
  });
}

function dayHeaderRow(day: OFDayPlan) {
  const metaLine = [day.date, day.weekday].filter(Boolean).join(' · ');
  return new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({ text: `Day ${day.num}`, bold: true, size: 22, color: 'FFFFFF', font: FONT }),
              new TextRun({ text: metaLine ? `  |  ${metaLine}  |  ` : '  |  ', size: 18, color: 'D9E4F2', font: FONT }),
              new TextRun({ text: day.title, bold: true, size: 21, color: 'FFFFFF', font: FONT }),
            ],
          }),
        ],
        { width: PAGE_WIDTH, shade: NAVY, borders: thinBorders(NAVY) }
      ),
    ],
  });
}

function dayBlock(day: OFDayPlan) {
  const rows = [dayHeaderRow(day), ...day.items.map(lineRow)];
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [PAGE_WIDTH], rows });
}

// ---------- Inclusions / Exclusions ----------
function inclExclTable(inclusions: string[], exclusions: string[]) {
  const header = new TableRow({
    children: [
      cell([p([{ text: '✔  PACKAGE INCLUSIONS', bold: true, color: 'FFFFFF', size: 20 }], { spacing: { after: 0 } })], { width: 4675, shade: GREEN }),
      cell([p([{ text: '✘  PACKAGE EXCLUSIONS', bold: true, color: 'FFFFFF', size: 20 }], { spacing: { after: 0 } })], { width: 4675, shade: RED }),
    ],
  });
  const rowCount = Math.max(inclusions.length, exclusions.length);
  const bodyRows: TableRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const shade = i % 2 === 1 ? PALEBLUE : undefined;
    bodyRows.push(
      new TableRow({
        children: [
          cell(
            [p([{ text: '▶ ', bold: true, color: GREEN }, { text: inclusions[i] || '', size: 18 }], { spacing: { after: 0 } })],
            { width: 4675, shade, valign: VerticalAlignTable.TOP }
          ),
          cell(
            [p([{ text: '▶ ', bold: true, color: RED }, { text: exclusions[i] || '', size: 18 }], { spacing: { after: 0 } })],
            { width: 4675, shade, valign: VerticalAlignTable.TOP }
          ),
        ],
      })
    );
  }
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [4675, 4675], rows: [header, ...bodyRows] });
}

// ---------- Important notes ----------
function noteLine(note: OFNoteItem) {
  return new Paragraph({
    spacing: { after: 140 },
    children: [
      new TextRun({ text: 'ℹ  ', size: 19, font: FONT }),
      new TextRun({ text: `${note.label}: `, bold: true, size: 19, color: NAVY, font: FONT }),
      new TextRun({ text: note.text, size: 19, color: TEXT, font: FONT }),
    ],
  });
}

// ---------- Column widths for tables with one first (label) column plus N
// equal-ish option columns, summing exactly to `total` DXA. ----------
function splitWidths(total: number, firstWidth: number, count: number): number[] {
  const remaining = total - firstWidth;
  const each = Math.floor(remaining / count);
  const widths = Array(count).fill(each);
  widths[count - 1] += remaining - each * count; // absorb rounding into the last column
  return [firstWidth, ...widths];
}

// ---------- Package cost comparison ----------
// One column per option (not two — a separate "pp" and "Total" row instead
// of a doubled-up column per option), so the table reads as
// Options → Option A | Option B | …, then a Per Person row and a Total row.
function costComparisonTable(cc: OFItinerary['costComparison'], options: OFHotelOption[], currency: OFItinerary['currency']) {
  const n = options.length;
  const firstWidth = Math.max(1800, Math.round(PAGE_WIDTH * (n <= 3 ? 0.3 : 0.22)));
  const widths = splitWidths(PAGE_WIDTH, firstWidth, n);

  const header = new TableRow({
    children: [
      cell(
        [
          p([{ text: cc.componentLabel, bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 40 } }),
          p([{ text: cc.componentSub, italic: true, color: 'FFFFFF', size: 15 }], { spacing: { after: 0 } }),
        ],
        { width: widths[0], shade: NAVY }
      ),
      ...options.map((o, i) =>
        cell([p([{ text: o.label, bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1 + i], shade: NAVY })
      ),
    ],
  });

  const ppRow = new TableRow({
    children: [
      cell([p([{ text: 'Per Person', bold: true, color: NAVY, size: 18 }], { spacing: { after: 0 } })], { width: widths[0], shade: PALEBLUE }),
      ...options.map((o, i) =>
        cell([p([{ text: formatOfMoney(o.perPerson, currency), bold: true, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1 + i], shade: PALEBLUE })
      ),
    ],
  });

  const totalRow = new TableRow({
    children: [
      cell([p([{ text: 'TOTAL PACKAGE COST', bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 } })], { width: widths[0], shade: GOLD }),
      ...options.map((o, i) =>
        cell([p([{ text: formatOfMoney(o.total, currency), bold: true, color: NAVY, size: 20 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1 + i], shade: CREAM })
      ),
    ],
  });

  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ppRow, totalRow] });
}

// ---------- Hotel differences table ----------
function hotelDifferencesTable(rows: OFHotelDifferenceRow[], options: OFHotelOption[]) {
  const n = options.length;
  const firstWidth = Math.max(1800, Math.round(PAGE_WIDTH * (n <= 2 ? 0.25 : 0.18)));
  const widths = splitWidths(PAGE_WIDTH, firstWidth, n);

  const header = new TableRow({
    children: [
      cell([p([{ text: 'City', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[0], shade: NAVY }),
      ...options.map((o, i) =>
        cell([p([{ text: o.label, bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[1 + i], shade: NAVY })
      ),
    ],
  });
  const bodyRows = rows.map(
    (r, idx) =>
      new TableRow({
        children: [
          cell([p(r.city, { spacing: { after: 0 } }, 18)], { width: widths[0], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          ...options.map((_, i) =>
            cell([p([{ text: (r.values || [])[i] || '', bold: true, color: LINK, size: 18 }], { spacing: { after: 0 } })], { width: widths[1 + i], shade: idx % 2 === 1 ? PALEBLUE : undefined })
          ),
        ],
      })
  );
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
}

// ---------- Document assembly ----------
export async function generateOtherFormatDocx(
  data: OFItinerary,
  template: OFTemplate = 'classic'
): Promise<{ base64: string; filename: string } | { error: string }> {
  try {
    const children: (Paragraph | Table)[] = [];
    const options = data.hotelOptions;

    children.push(...buildLetterhead(AGENCY));

    if (template === 'modern' || template === 'branded') {
      // Card/block layout — same letterhead above, same data, everything
      // else built by itinerary-docx-modern.ts (mirrors OtherFormatPreview
      // Modern in other-format-panel.tsx) or, for 'branded', the stronger
      // royal-blue/orange variant in itinerary-docx-branded.ts (Word-export
      // only for now — no dedicated preview/PDF yet).
      children.push(...(template === 'branded' ? buildBrandedChildren(data) : buildModernChildren(data)));
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: NAVY, space: 4 } }, spacing: { before: 300, after: 200 } }));
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: `This quotation has been prepared by ${AGENCY.name}. For queries, please contact us at ${AGENCY.email}`,
              italics: true,
              size: 18,
              color: MUTED,
              font: FONT,
            }),
          ],
        })
      );

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                size: { width: 12240, height: 15840 },
                margin: { top: 620, bottom: 620, left: 620, right: 620 },
              },
            },
            headers: { default: buildHeader(data.meta) },
            footers: { default: buildFooter(AGENCY) },
            children,
          },
        ],
      });

      const buf = await Packer.toBuffer(doc);
      const filename = safeFilename('Itinerary', data.meta.guestName || data.meta.title, 'docx');
      return { base64: buf.toString('base64'), filename };
    }

    children.push(...titleBlock(data.meta));

    if (data.tripSummary.length) {
      children.push(sectionHeading('Trip Summary'));
      children.push(tripSummaryTable(data.tripSummary));
    }

    if (options.some((o) => o.hotels.length)) {
      children.push(sectionHeading(options.length > 1 ? `Hotel Accommodation — ${options.length} Options` : 'Hotel Accommodation'));
      options.forEach((opt) => {
        if (opt.hotels.length) children.push(...hotelOptionTable(opt));
      });
    }

    if (data.flights.length) {
      children.push(sectionHeading('Flights'));
      children.push(flightsTable(data.flights));
    }

    if (data.tours.length) {
      children.push(sectionHeading('Tours & Transfers Included'));
      children.push(toursTransfersTable(data.tours));
    }

    if (data.days.length) {
      children.push(
        new Paragraph({
          spacing: { before: 400, after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: LINK, space: 4 } },
          children: [new TextRun({ text: 'DAY-WISE ITINERARY', bold: true, size: 30, color: NAVY, font: FONT })],
        })
      );
      data.days.forEach((day) => children.push(dayBlock(day)));
    }

    if (data.inclusions.length || data.exclusions.length) {
      children.push(sectionHeading('Inclusions & Exclusions'));
      children.push(inclExclTable(data.inclusions, data.exclusions));
    }

    if (data.notes.length) {
      children.push(sectionHeading('Important Notes'));
      data.notes.forEach((n) => children.push(noteLine(n)));
    }

    const hasCostData = options.some((o) => o.perPerson || o.total);
    if (hasCostData) {
      children.push(sectionHeading('Package Cost — Comparison'));
      children.push(costComparisonTable(data.costComparison, options, data.currency));
      if (data.costComparison.footnote) {
        children.push(
          p([{ text: data.costComparison.footnote, italic: true, color: MUTED, size: 17 }], { spacing: { before: 100, after: 0 } })
        );
      }
    }

    if (data.hotelDifferences.length) {
      children.push(navyBar([{ text: 'HOTEL DIFFERENCES BETWEEN OPTIONS', bold: true, color: 'FFFFFF' }], { size: 20 }));
      children.push(hotelDifferencesTable(data.hotelDifferences, options));
    }

    children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: NAVY, space: 4 } }, spacing: { before: 300, after: 200 } }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `This quotation has been prepared by ${AGENCY.name}. For queries, please contact us at ${AGENCY.email}`,
            italics: true,
            size: 18,
            color: MUTED,
            font: FONT,
          }),
        ],
      })
    );

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 }, // US Letter DXA, matches the reference script
              margin: { top: 620, bottom: 620, left: 620, right: 620 },
            },
          },
          headers: { default: buildHeader(data.meta) },
          footers: { default: buildFooter(AGENCY) },
          children,
        },
      ],
    });

    const buf = await Packer.toBuffer(doc);
    const filename = safeFilename('Itinerary', data.meta.guestName || data.meta.title, 'docx');
    return { base64: buf.toString('base64'), filename };
  } catch (e: any) {
    return { error: e?.message || 'Failed to generate the Word document.' };
  }
}
