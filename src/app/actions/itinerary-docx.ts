'use server';

// Generates a real Word (.docx) document for the "Other Format" itinerary —
// ported from a reference script (build_itinerary_skytours.js) that used the
// `docx` library to produce a styled travel quotation (navy/gold palette,
// banner headers, cell-shaded tables, a running header/footer with page
// numbers). This module is the same layout code, parametrized by OFItinerary
// instead of a hardcoded trip, and returning a base64 buffer (Server Actions
// can't stream binary — the client turns this into a Blob and downloads it).

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle,
  VerticalAlignTable, Header, Footer, PageNumber, TabStopType, ImageRun,
} from 'docx';
import type { ITableCellBorders, TableVerticalAlign } from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import { safeFilename } from '@/lib/print';
import { AGENCY } from '@/app/(app)/itinerary-builder/other-format-types';
import type {
  OFItinerary,
  OFMeta,
  OFTripSummaryRow,
  OFHotelOption,
  OFTourRow,
  OFDayPlan,
  OFDayItem,
  OFDayItemType,
  OFNoteItem,
  OFHotelDifferenceRow,
} from '@/app/(app)/itinerary-builder/other-format-types';

// ---------- Palette (matches the reference template) ----------
const NAVY = '1B3A63';
const GOLD = 'C8862A';
const LIGHTBLUE = 'D6E6F6';
const PALEBLUE = 'EAF0F8';
const CREAM = 'FDF5E0';
const GREEN = '2F6B3A';
const RED = 'A33A2E';
const BORDER = 'CBD5E1';
const TEXT = '222222';
const MUTED = '6B7280';
const LINK = '4A86C8';

const FONT = 'Calibri';
const PAGE_WIDTH = 9350; // usable DXA width (A4, 620 DXA margins each side)

// ---------- Small helpers (ported as-is) ----------
function thinBorders(color = BORDER): ITableCellBorders {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color },
    bottom: { style: BorderStyle.SINGLE, size: 4, color },
    left: { style: BorderStyle.SINGLE, size: 4, color },
    right: { style: BorderStyle.SINGLE, size: 4, color },
  };
}
function noBorders(): ITableCellBorders {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };
}

type RunPart = { text: string; bold?: boolean; italic?: boolean; color?: string; size?: number };

function cell(
  children: Paragraph[],
  opts: { width: number; shade?: string; valign?: TableVerticalAlign; borders?: ITableCellBorders; margins?: { top: number; bottom: number; left: number; right: number } }
) {
  const { width, shade, valign = VerticalAlignTable.CENTER, borders = thinBorders(), margins } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: shade } : undefined,
    verticalAlign: valign,
    borders,
    margins: margins || { top: 90, bottom: 90, left: 140, right: 140 },
    children,
  });
}

function runs(parts: RunPart[], baseSize = 19) {
  return parts.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: !!r.bold,
        italics: !!r.italic,
        color: r.color || TEXT,
        size: r.size || baseSize,
        font: FONT,
      })
  );
}

function p(
  parts: RunPart[] | string,
  opts: { spacing?: { before?: number; after?: number }; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = { spacing: { after: 0 } },
  baseSize = 19
) {
  const parts2 = Array.isArray(parts) ? parts : [{ text: parts }];
  return new Paragraph({ alignment: opts.align, spacing: opts.spacing ?? { after: 0 }, children: runs(parts2, baseSize) });
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 300, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: LINK, space: 4 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 26, color: NAVY, font: FONT })],
  });
}

function navyBar(parts: RunPart[], { shade = NAVY, size = 20 }: { shade?: string; size?: number } = {}) {
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          cell([p(parts, { spacing: { after: 0 } }, size)], {
            width: PAGE_WIDTH,
            shade,
            borders: noBorders(),
            margins: { top: 130, bottom: 130, left: 200, right: 200 },
          }),
        ],
      }),
    ],
  });
}

// ---------- Page header / running footer ----------
function buildHeader(meta: OFMeta) {
  const subline = [meta.country, meta.guestName, meta.dateRangeShort, meta.duration].filter(Boolean).join(' | ');
  return new Header({
    children: [
      new Table({
        width: { size: PAGE_WIDTH, type: WidthType.DXA },
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              cell([p([{ text: AGENCY.name, bold: true, color: NAVY, size: 18 }], { spacing: { after: 0 } })], {
                width: 4675,
                borders: noBorders(),
                margins: { top: 0, bottom: 60, left: 0, right: 0 },
              }),
              cell(
                [p([{ text: subline, color: MUTED, size: 17 }], { spacing: { after: 0 }, align: AlignmentType.RIGHT })],
                { width: 4675, borders: noBorders(), margins: { top: 0, bottom: 60, left: 0, right: 0 } }
              ),
            ],
          }),
        ],
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 2 } },
        spacing: { after: 0 },
      }),
    ],
  });
}

function buildFooter() {
  const contactLine = `${AGENCY.email}  |  ${AGENCY.phones.join('  |  ')}`;
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 4 } },
        tabStops: [{ type: TabStopType.RIGHT, position: 9350 }],
        children: [
          new TextRun({ text: contactLine, size: 16, color: MUTED, font: FONT }),
          new TextRun({ text: '\t', size: 16 }),
          new TextRun({ text: 'Page ', size: 16, color: MUTED, font: FONT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: FONT }),
          new TextRun({ text: ' of ', size: 16, color: MUTED, font: FONT }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED, font: FONT }),
        ],
      }),
    ],
  });
}

// ---------- Letterhead banner ----------
// Matches the reference letterhead: the sky.png mark on the left, a thin navy
// divider bar, then the company name (serif, bold, navy), address and
// contact line. Sits once at the very top of the document body — this is the
// rich letterhead, distinct from the compact running header (buildHeader)
// that repeats on every page.
let cachedLogo: Buffer | null = null;
function loadLogo(): Buffer {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), 'public', 'sky.png'));
  }
  return cachedLogo;
}

function buildLetterhead(): (Paragraph | Table)[] {
  const logoCell = cell(
    [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: 'png', data: loadLogo(), transformation: { width: 92, height: 92 } })],
      }),
    ],
    { width: 1500, borders: noBorders(), valign: VerticalAlignTable.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 } }
  );

  const dividerCell = cell([new Paragraph({ children: [] })], {
    width: 50,
    shade: NAVY,
    borders: noBorders(),
    valign: VerticalAlignTable.CENTER,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const contactRuns: TextRun[] = [new TextRun({ text: AGENCY.email, bold: true, underline: {}, color: LINK, size: 18, font: FONT })];
  AGENCY.phones.forEach((ph) => {
    contactRuns.push(new TextRun({ text: '  |  ', color: TEXT, size: 18, font: FONT }));
    contactRuns.push(new TextRun({ text: ph, bold: true, size: 18, font: FONT }));
  });

  const textCell = cell(
    [
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: AGENCY.name, bold: true, size: 44, color: NAVY, font: 'Georgia' })],
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: AGENCY.address, bold: true, size: 19, color: '333333', font: FONT })],
      }),
      new Paragraph({ children: contactRuns }),
    ],
    { width: 7800, borders: noBorders(), valign: VerticalAlignTable.CENTER, margins: { top: 0, bottom: 0, left: 160, right: 0 } }
  );

  return [
    new Table({
      width: { size: PAGE_WIDTH, type: WidthType.DXA },
      borders: noBorders(),
      rows: [new TableRow({ children: [logoCell, dividerCell, textCell] })],
    }),
    // Gold rule separating the letterhead from the rest of the document.
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 8 } }, spacing: { after: 160 } }),
  ];
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
      cell([p([{ text: label, bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: 2400, shade: NAVY }),
      cell([p([{ text: value, bold: true, color: emphasis ? GOLD : TEXT, size: 19 }], { spacing: { after: 0 } })], { width: 6950, shade }),
    ],
  });
}

function tripSummaryTable(rows: OFTripSummaryRow[]) {
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, 6950],
    rows: rows.map((r, i) => twoColRow(r.label, r.value, r.emphasis, i % 2 === 1 ? PALEBLUE : undefined)),
  });
}

// ---------- Hotel option table ----------
function hotelOptionTable(option: OFHotelOption) {
  const banner = `${option.label.toUpperCase()}  |  ${option.perPerson} per person  |  ${option.total} Total`;
  const widths = [1400, 3000, 850, 1500, 1100, 1100, 400]; // City | Hotel | Stars | Room | Check-in | Check-out | Nts

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
    new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [headHotel, ...bodyRows] }),
    new Paragraph({ spacing: { after: 120 } }),
  ];
}

// ---------- Tours & Transfers table ----------
function toursTransfersTable(rows: OFTourRow[]) {
  const widths = [4675, 1400, 3275];
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
  return new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
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
  return new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [PAGE_WIDTH], rows });
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
  return new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [4675, 4675], rows: [header, ...bodyRows] });
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

// ---------- Package cost comparison ----------
function costComparisonTable(
  component: string,
  sub: string,
  opt1Label: string,
  opt2Label: string,
  opt1pp: string,
  opt2pp: string,
  opt1total: string,
  opt2total: string
) {
  const widths = [3550, 1450, 1450, 1450, 1450];
  const header = new TableRow({
    children: [
      cell([p([{ text: 'Component', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[0], shade: NAVY }),
      cell([p([{ text: `${opt1Label} (pp)`, bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1], shade: NAVY }),
      cell([p([{ text: `${opt2Label} (pp)`, bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[2], shade: NAVY }),
      cell([p([{ text: `${opt1Label} Total`, bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[3], shade: LINK }),
      cell([p([{ text: `${opt2Label} Total`, bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[4], shade: LINK }),
    ],
  });

  const row1 = new TableRow({
    children: [
      cell(
        [
          p([{ text: component, bold: true, color: NAVY, size: 19 }], { spacing: { after: 40 } }),
          p([{ text: sub, italic: true, color: MUTED, size: 16 }], { spacing: { after: 0 } }),
        ],
        { width: widths[0], shade: PALEBLUE }
      ),
      cell([p([{ text: opt1pp, bold: true, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1], shade: PALEBLUE }),
      cell([p([{ text: opt2pp, bold: true, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[2], shade: PALEBLUE }),
      cell([p([{ text: opt1total, bold: true, color: GOLD, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[3], shade: CREAM }),
      cell([p([{ text: opt2total, bold: true, color: GOLD, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[4], shade: CREAM }),
    ],
  });

  const row2 = new TableRow({
    children: [
      cell(
        [p([{ text: 'TOTAL PACKAGE COST', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })],
        { width: widths[0], shade: GOLD }
      ),
      cell([p([{ text: opt1pp, bold: true, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1], shade: GOLD }),
      cell([p([{ text: opt2pp, bold: true, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[2], shade: GOLD }),
      cell([p([{ text: opt1total, bold: true, color: NAVY, size: 20 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[3], shade: CREAM }),
      cell([p([{ text: opt2total, bold: true, color: NAVY, size: 20 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[4], shade: CREAM }),
    ],
  });

  return new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, row1, row2] });
}

// ---------- Hotel differences table ----------
function hotelDifferencesTable(rows: OFHotelDifferenceRow[], opt1Label: string, opt2Label: string) {
  const widths = [2350, 3500, 3500];
  const header = new TableRow({
    children: [
      cell([p([{ text: 'City', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[0], shade: NAVY }),
      cell([p([{ text: opt1Label, bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[1], shade: NAVY }),
      cell([p([{ text: opt2Label, bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[2], shade: NAVY }),
    ],
  });
  const bodyRows = rows.map(
    (r, idx) =>
      new TableRow({
        children: [
          cell([p(r.city, { spacing: { after: 0 } }, 18)], { width: widths[0], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p([{ text: r.opt1, bold: true, color: LINK, size: 18 }], { spacing: { after: 0 } })], { width: widths[1], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
          cell([p([{ text: r.opt2, bold: true, color: LINK, size: 18 }], { spacing: { after: 0 } })], { width: widths[2], shade: idx % 2 === 1 ? PALEBLUE : undefined }),
        ],
      })
  );
  return new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...bodyRows] });
}

// ---------- Document assembly ----------
export async function generateOtherFormatDocx(
  data: OFItinerary
): Promise<{ base64: string; filename: string } | { error: string }> {
  try {
    const children: (Paragraph | Table)[] = [];
    const [opt1, opt2] = data.hotelOptions;

    children.push(...buildLetterhead());
    children.push(...titleBlock(data.meta));

    if (data.tripSummary.length) {
      children.push(sectionHeading('Trip Summary'));
      children.push(tripSummaryTable(data.tripSummary));
    }

    if (opt1.hotels.length || opt2.hotels.length) {
      children.push(sectionHeading('Hotel Accommodation — Two Options'));
      if (opt1.hotels.length) children.push(...hotelOptionTable(opt1));
      if (opt2.hotels.length) children.push(...hotelOptionTable(opt2));
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

    const hasCostData = opt1.perPerson || opt2.perPerson || opt1.total || opt2.total;
    if (hasCostData) {
      children.push(sectionHeading('Package Cost — Comparison'));
      children.push(
        costComparisonTable(
          data.costComparison.componentLabel,
          data.costComparison.componentSub,
          opt1.label,
          opt2.label,
          opt1.perPerson,
          opt2.perPerson,
          opt1.total,
          opt2.total
        )
      );
      if (data.costComparison.footnote) {
        children.push(
          p([{ text: data.costComparison.footnote, italic: true, color: MUTED, size: 17 }], { spacing: { before: 100, after: 0 } })
        );
      }
    }

    if (data.hotelDifferences.length) {
      children.push(navyBar([{ text: 'HOTEL DIFFERENCES BETWEEN OPTIONS', bold: true, color: 'FFFFFF' }], { size: 20 }));
      children.push(hotelDifferencesTable(data.hotelDifferences, opt1.label, opt2.label));
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
          footers: { default: buildFooter() },
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
