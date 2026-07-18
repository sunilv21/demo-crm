// Shared low-level building blocks for generating .docx documents with the
// `docx` library — the navy/gold visual system, table/paragraph helpers, and
// the company letterhead banner. Extracted out of itinerary-docx.ts so the
// voucher generator (voucher-docx.ts) doesn't duplicate ~150 lines of table
// plumbing; both import from here.
//
// Deliberately takes a `CompanyIdentity` parameter everywhere rather than
// importing one specific company constant: the itinerary Other Format uses
// AGENCY (the exact letterhead details given for that document), while
// vouchers use the pre-existing COMPANY (already the source for booking
// receipts/printables) — this module doesn't pick a winner between them.

import {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle,
  VerticalAlignTable, Header, Footer, PageNumber, TabStopType, ImageRun, TableLayoutType,
} from 'docx';
import type { ITableCellBorders, TableVerticalAlign, ITableOptions } from 'docx';
import * as fs from 'fs';
import * as path from 'path';

// `new Table(...)` defaults to Word's "autofit" layout, which lets Word
// recalculate column widths from content — a single-cell table (a banner
// like navyBar) then shrinks to hug its short text instead of respecting the
// width we declared, and multi-column tables can drift too. Every table here
// specifies exact widths, so layout should always be FIXED; this wrapper
// makes that the default everywhere instead of a per-call-site detail to
// remember (and re-remember on the next table added).
export function fixedTable(options: ITableOptions): Table {
  return new Table({ ...options, layout: TableLayoutType.FIXED });
}

export type CompanyIdentity = {
  name: string;
  address: string;
  email: string;
  phones: readonly string[];
  web?: string;
};

// ---------- Palette ----------
export const NAVY = '1B3A63';
export const GOLD = 'C8862A';
export const LIGHTBLUE = 'D6E6F6';
export const PALEBLUE = 'EAF0F8';
export const CREAM = 'FDF5E0';
export const GREEN = '2F6B3A';
export const RED = 'A33A2E';
export const BORDER = 'CBD5E1';
export const TEXT = '222222';
export const MUTED = '6B7280';
export const LINK = '4A86C8';

export const FONT = 'Calibri';
// Both docx generators use US Letter (12240 twips wide) with 620-twip
// margins each side: 12240 - 620 - 620 = 11000. This must match the actual
// page/margin setup in itinerary-docx.ts and voucher-docx.ts's Document()
// call — a table sized to anything less leaves a gap next to the letterhead's
// gold rule (a paragraph border, which always spans the true printable
// width) instead of lining up with it.
export const PAGE_WIDTH = 11000;

// ---------- Small helpers ----------
export function thinBorders(color = BORDER): ITableCellBorders {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color },
    bottom: { style: BorderStyle.SINGLE, size: 4, color },
    left: { style: BorderStyle.SINGLE, size: 4, color },
    right: { style: BorderStyle.SINGLE, size: 4, color },
  };
}
export function noBorders(): ITableCellBorders {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };
}

export type RunPart = { text: string; bold?: boolean; italic?: boolean; color?: string; size?: number };

export function cell(
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

export function runs(parts: RunPart[], baseSize = 19) {
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

export function p(
  parts: RunPart[] | string,
  opts: { spacing?: { before?: number; after?: number }; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = { spacing: { after: 0 } },
  baseSize = 19
) {
  const parts2 = Array.isArray(parts) ? parts : [{ text: parts }];
  return new Paragraph({ alignment: opts.align, spacing: opts.spacing ?? { after: 0 }, children: runs(parts2, baseSize) });
}

export function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 300, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: LINK, space: 4 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 26, color: NAVY, font: FONT })],
  });
}

export function navyBar(
  parts: RunPart[],
  { shade = NAVY, size = 20, align }: { shade?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
) {
  return fixedTable({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    // A single-column table needs its width to come from BOTH the table's
    // own `width` AND an explicit `columnWidths` — with only a cell width
    // set, Word's fixed-layout math still autofits a lone short-text column
    // down to content size. Every other (multi-column) table here already
    // passes columnWidths; navyBar just needs the one-element form of it.
    columnWidths: [PAGE_WIDTH],
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          cell([p(parts, { spacing: { after: 0 }, align }, size)], {
            width: PAGE_WIDTH,
            shade,
            borders: noBorders(),
            margins: { top: 90, bottom: 90, left: 200, right: 200 },
          }),
        ],
      }),
    ],
  });
}

// ---------- Generic running footer (contact line + Page X of Y) ----------
export function buildFooter(company: CompanyIdentity) {
  const contactLine = `${company.email}  |  ${company.phones.join('  |  ')}`;
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 4 } },
        tabStops: [{ type: TabStopType.RIGHT, position: PAGE_WIDTH }],
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

// A compact running header (company name left, arbitrary right-aligned
// context text) — optional; single-page documents like vouchers usually
// don't need one, since the letterhead below already establishes identity.
export function buildRunningHeader(company: CompanyIdentity, rightText?: string) {
  return new Header({
    children: [
      fixedTable({
        width: { size: PAGE_WIDTH, type: WidthType.DXA },
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              cell([p([{ text: company.name, bold: true, color: NAVY, size: 18 }], { spacing: { after: 0 } })], {
                width: 4675,
                borders: noBorders(),
                margins: { top: 0, bottom: 60, left: 0, right: 0 },
              }),
              cell(
                [p([{ text: rightText || '', color: MUTED, size: 17 }], { spacing: { after: 0 }, align: AlignmentType.RIGHT })],
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

// ---------- Letterhead banner ----------
// The sky.png mark on the left, a thin navy divider bar, then the company
// name (serif, bold, navy), address and contact line, with a gold rule
// underneath. Sits once at the very top of the document body.
let cachedLogo: Buffer | null = null;
function loadLogo(): Buffer {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), 'public', 'sky.png'));
  }
  return cachedLogo;
}

export function buildLetterhead(company: CompanyIdentity): (Paragraph | Table)[] {
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

  const contactRuns: TextRun[] = [new TextRun({ text: company.email, bold: true, underline: {}, color: LINK, size: 18, font: FONT })];
  company.phones.forEach((ph) => {
    contactRuns.push(new TextRun({ text: '  |  ', color: TEXT, size: 18, font: FONT }));
    contactRuns.push(new TextRun({ text: ph, bold: true, size: 18, font: FONT }));
  });

  const textCell = cell(
    [
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: company.name, bold: true, size: 44, color: NAVY, font: 'Georgia' })],
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: company.address, bold: true, size: 19, color: '333333', font: FONT })],
      }),
      new Paragraph({ children: contactRuns }),
    ],
    { width: 7800, borders: noBorders(), valign: VerticalAlignTable.CENTER, margins: { top: 0, bottom: 0, left: 160, right: 0 } }
  );

  return [
    fixedTable({
      width: { size: PAGE_WIDTH, type: WidthType.DXA },
      borders: noBorders(),
      rows: [new TableRow({ children: [logoCell, dividerCell, textCell] })],
    }),
    // Gold rule separating the letterhead from the rest of the document.
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 8 } }, spacing: { after: 120 } }),
  ];
}
