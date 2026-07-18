'use server';

// Generates a real Word (.docx) hotel booking voucher — matches an exact
// reference sample (a Crowne Plaza confirmation voucher) field-for-field:
// letterhead, a colour-coded booking-status banner, a booking reference/date
// box, a Hotel Details / Room Type / No of Rooms table, a Check-in / Duration
// / Check-out row, a Guest Details table, and a two-column Terms & Conditions
// box.
//
// Hotel bookings ONLY — vouchers are not generated for other booking types
// (flight/visa/car/activity/other); generateBookingVoucherDocx rejects them.

import { Document, Packer, Paragraph, TableRow, AlignmentType, WidthType, VerticalAlignTable } from 'docx';
import { COMPANY } from '@/lib/company';
import { safeFilename } from '@/lib/print';
import type { VoucherInput } from '@/lib/voucher-types';
import type { BookingStatus } from '@/lib/types';
import {
  NAVY, GREEN, RED, GOLD, PALEBLUE, TEXT, MUTED, PAGE_WIDTH,
  cell, p, navyBar, buildLetterhead, buildFooter, fixedTable,
  type RunPart,
} from './docx-helpers';

// Exact wording from the reference sample, split into the same two 6-item
// columns it uses.
const TERMS_LEFT = [
  'Booking is CONFIRMED. Standard hotel check-in / check-out timings apply.',
  'Carry valid photo ID / passport and this voucher at check-in. Minimum guest age to check-in is 18 years.',
  'Hotels may charge a refundable security deposit at check-in for incidentals (refunded if unutilized).',
  'Local city tax / tourist tax / supplementary charges, if applicable, are payable directly at the property.',
  'Bedding type is subject to availability at check-in; defaults to Queen or Twin if not specified.',
  'Extra beds are not included in the reservation price unless stated in hotel / booking policies.',
];
const TERMS_RIGHT = [
  'Special requests (bed type, early check-in / late check-out) are subject to availability and not guaranteed.',
  'Hotels may not allow additional passengers apart from those reflected in the booking.',
  'Hotels may deny check-in or charge differently if the nationality differs from that at reservation.',
  "In case of No-Show or Early Check-Out, full charges will apply as per the hotel's cancellation policy.",
  'All extras (Mini Bar, Laundry, Telephone, Room Service, parking, etc.) are payable directly at check-out.',
  'Hotel reserves the right to deny check-in if all guest names are not provided in advance.',
];

// The sample's "Agency" line names the booking desk, distinct from the
// letterhead's registered company name — given verbatim in the reference.
const AGENCY_LABEL = 'Sky Visa Consultancy';

const STATUS_STYLE: Record<BookingStatus, { label: string; icon: string; color: string }> = {
  confirmed: { label: 'BOOKING CONFIRMED', icon: '✓', color: GREEN },
  cancelled: { label: 'BOOKING CANCELLED', icon: '✘', color: RED },
  pending: { label: 'BOOKING PENDING', icon: '⏱', color: GOLD },
  hold: { label: 'BOOKING ON HOLD', icon: '⏱', color: GOLD },
  draft: { label: 'DRAFT BOOKING', icon: 'ℹ', color: MUTED },
};

function str(v: unknown): string {
  return v === null || v === undefined || v === '' ? '' : String(v);
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// "Fri, 28 Aug 2026" — matches the sample's CHECK-IN/CHECK-OUT date style.
function fmtDateLong(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return '—';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function computeNights(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

// ---------- Status banner ----------
function statusBanner(status: BookingStatus) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.confirmed;
  return navyBar([{ text: `${s.icon}  ${s.label}`, bold: true, color: 'FFFFFF', size: 24 }], { shade: s.color, size: 24, align: AlignmentType.CENTER });
}

// ---------- Booking reference / date / status box ----------
// Three separate cells — confirmed against a second reference sample
// (Novotel Avignon Centre), which splits these out rather than stacking
// Date+Status together in one (uneven widths below: the reference).
function referenceDateBox(data: VoucherInput) {
  const s = STATUS_STYLE[data.status] || STATUS_STYLE.confirmed;
  // Uneven thirds: the reference value can run long ("239-26124701/1" etc.)
  // while Date/Status are consistently shorter — equal thirds wrapped the
  // reference cell to 2 lines.
  const widths = [4588, 3235, 3177];
  const refCell = cell(
    [p([{ text: 'Booking Reference: ', bold: true, color: TEXT, size: 18 }, { text: data.reference?.value || data.bookingId, color: TEXT, size: 18 }], { spacing: { after: 0 } })],
    { width: widths[0], valign: VerticalAlignTable.CENTER }
  );
  const dateCell = cell(
    [p([{ text: 'Booking Date: ', bold: true, color: TEXT, size: 18 }, { text: fmtDate(data.bookingDate), color: TEXT, size: 18 }], { spacing: { after: 0 } })],
    { width: widths[1], valign: VerticalAlignTable.CENTER }
  );
  const statusCell = cell(
    [p([{ text: 'Booking Status: ', bold: true, color: TEXT, size: 18 }, { text: s.label.replace('BOOKING ', ''), bold: true, color: s.color, size: 18 }], { spacing: { after: 0 } })],
    { width: widths[2], valign: VerticalAlignTable.CENTER }
  );
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [new TableRow({ children: [refCell, dateCell, statusCell] })] });
}

// ---------- Hotel Details | Room Type | No of Rooms ----------
function hotelDetailsTable(data: VoucherInput) {
  const d = data.bookingDetails || {};
  // Room Type gets more room than the original 2200 — real room-type strings
  // ("Executive Room, 1 Double Bed With Sofa Bed") run much longer than
  // "Standard Room"; No of Rooms only ever holds a 1-2 digit number.
  const widths = [6000, 3235, 1765];

  const line = (...parts: { label: string; value: string }[]) =>
    p(
      parts.flatMap((pt, i): RunPart[] => [
        ...(i > 0 ? [{ text: '     ' }] : []),
        { text: `${pt.label} : `, bold: true, color: NAVY, size: 17 },
        { text: pt.value || '—', color: TEXT, size: 17 },
      ]),
      { spacing: { after: 35 } }
    );

  const hotelName = str(d.hotelName) || data.supplierName || '';
  const address = str(d.hotelAddress);
  const tel = str(d.hotelTel);
  const city = str(d.city);
  const country = str(d.country) || data.destination || '';
  const roomsCount = str(d.rooms) || '1';
  const guestsCount = str(d.guests) || String(data.hotelGuests?.filter((g) => g.name?.trim()).length || 1);

  // Address/Tel/City/Country always render — even blank, as "—" — rather
  // than being hidden when not captured. Confirmed against a second
  // reference sample (Novotel Avignon Centre), which shows an empty
  // "Address:" and "Tel : —" line rather than omitting them entirely: the
  // template's completeness matters more than the current lack of a data
  // source for these fields in the booking form.
  const detailLines: Paragraph[] = [
    line({ label: 'Hotel Name', value: hotelName }),
    line({ label: 'Address', value: address }),
    line({ label: 'Tel', value: tel }, { label: 'City', value: city }),
    line({ label: 'Country', value: country }),
    line({ label: 'Lead Guest', value: data.clientName }, { label: 'Nationality', value: data.clientNationality || '' }),
  ];
  detailLines.push(line({ label: 'Agency', value: AGENCY_LABEL }));
  detailLines.push(line({ label: 'No. of Rooms', value: roomsCount }, { label: 'Guests', value: `${guestsCount} Adult${Number(guestsCount) > 1 ? 's' : ''}` }));

  const header = new TableRow({
    children: [
      cell([p([{ text: 'Hotel Details', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 } })], { width: widths[0], shade: NAVY }),
      cell([p([{ text: 'Room Type', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1], shade: NAVY }),
      cell([p([{ text: 'No of Rooms', bold: true, color: 'FFFFFF', size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[2], shade: NAVY }),
    ],
  });
  const body = new TableRow({
    children: [
      cell(detailLines, { width: widths[0], shade: PALEBLUE, valign: VerticalAlignTable.TOP, margins: { top: 90, bottom: 90, left: 160, right: 120 } }),
      cell([p([{ text: str(d.roomType) || '—', bold: true, color: NAVY, size: 18 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1], shade: PALEBLUE }),
      cell([p([{ text: roomsCount, bold: true, color: NAVY, size: 26 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[2], shade: PALEBLUE }),
    ],
  });
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, body] });
}

// ---------- CHECK-IN | DURATION | CHECK-OUT ----------
function checkInOutRow(data: VoucherInput) {
  const nights = computeNights(data.startDate, data.endDate);
  const widths = [3667, 3666, 3667];
  const header = new TableRow({
    children: ['CHECK-IN', 'DURATION', 'CHECK-OUT'].map((t, i) =>
      cell([p([{ text: t, bold: true, color: 'FFFFFF', size: 18 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[i], shade: NAVY })
    ),
  });
  const body = new TableRow({
    children: [
      cell([p([{ text: fmtDateLong(data.startDate), bold: true, color: NAVY, size: 20 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[0] }),
      cell([p([{ text: nights !== null ? `${nights} Night(s)` : '—', color: TEXT, size: 19 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[1] }),
      cell([p([{ text: fmtDateLong(data.endDate), bold: true, color: NAVY, size: 20 }], { spacing: { after: 0 }, align: AlignmentType.CENTER })], { width: widths[2] }),
    ],
  });
  return fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, body] });
}

// ---------- Guest Details ----------
function guestDetailsSection(data: VoucherInput) {
  const d = data.bookingDetails || {};
  const roomType = str(d.roomType) || '—';
  const inclusion = str(d.inclusion) || 'Room Only';
  const confNo = data.reference?.value || data.bookingId;
  const s = STATUS_STYLE[data.status] || STATUS_STYLE.confirmed;
  const statusLabel = s.label.replace('BOOKING ', '');

  const named = (data.hotelGuests || []).filter((g) => g.name && g.name.trim());
  const guestRows = named.length ? named : [{ name: data.clientName }];

  // Room Type is the long pole here — real values ("Executive Room, 1 Double
  // Bed With Sofa Bed") run 40+ characters and repeat once per guest row, so
  // it gets by far the most room; Pax/Status only ever hold one short word.
  const widths = [1765, 3882, 1118, 1824, 1000, 1411];
  const fontSize = 15;
  // Tighter than cell()'s default 140/140 side padding — several of these
  // columns are only ever one short word/number wide, and the reclaimed
  // space is what keeps "CONFIRMED"/"CANCELLED" from wrapping to 2 lines.
  const dataMargins = { top: 70, bottom: 70, left: 80, right: 80 };
  const header = new TableRow({
    children: ['Guest Name', 'Room Type', 'Inclusion', 'Confirmation No', 'Pax', 'Status'].map((t, i) =>
      cell([p([{ text: t, bold: true, color: 'FFFFFF', size: fontSize }], { spacing: { after: 0 } })], { width: widths[i], shade: NAVY, margins: dataMargins })
    ),
  });
  const rows = guestRows.map(
    (g, i) =>
      new TableRow({
        children: [
          cell([p((g.name || '').toUpperCase(), { spacing: { after: 0 } }, fontSize)], { width: widths[0], shade: i % 2 === 1 ? PALEBLUE : undefined, margins: dataMargins }),
          cell([p(roomType, { spacing: { after: 0 } }, fontSize)], { width: widths[1], shade: i % 2 === 1 ? PALEBLUE : undefined, margins: dataMargins }),
          cell([p(inclusion, { spacing: { after: 0 } }, fontSize)], { width: widths[2], shade: i % 2 === 1 ? PALEBLUE : undefined, margins: dataMargins }),
          cell([p(confNo, { spacing: { after: 0 } }, fontSize)], { width: widths[3], shade: i % 2 === 1 ? PALEBLUE : undefined, margins: dataMargins }),
          cell([p('Adult', { spacing: { after: 0 } }, fontSize)], { width: widths[4], shade: i % 2 === 1 ? PALEBLUE : undefined, margins: dataMargins }),
          cell([p([{ text: statusLabel, bold: true, color: s.color, size: fontSize }], { spacing: { after: 0 } })], { width: widths[5], shade: i % 2 === 1 ? PALEBLUE : undefined, margins: dataMargins }),
        ],
      })
  );

  return [
    navyBar([{ text: 'Guest Details', bold: true, color: 'FFFFFF' }], { size: 20 }),
    fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...rows] }),
  ];
}

// ---------- Terms & Conditions ----------
function termsSection() {
  const bullet = (text: string) => p([{ text: '•  ', color: MUTED, size: 15 }, { text, color: TEXT, size: 15 }], { spacing: { after: 50 } });
  const width = PAGE_WIDTH / 2;
  // Pale-tinted background, matching the reference sample's shaded terms box
  // (rather than plain white, as the earlier draft had it).
  const leftCell = cell(TERMS_LEFT.map(bullet), { width, shade: PALEBLUE, valign: VerticalAlignTable.TOP, margins: { top: 90, bottom: 90, left: 140, right: 120 } });
  const rightCell = cell(TERMS_RIGHT.map(bullet), { width, shade: PALEBLUE, valign: VerticalAlignTable.TOP, margins: { top: 90, bottom: 90, left: 140, right: 120 } });
  return [
    navyBar([{ text: 'Terms & Conditions', bold: true, color: 'FFFFFF' }], { size: 20 }),
    fixedTable({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [width, width], rows: [new TableRow({ children: [leftCell, rightCell] })] }),
  ];
}

export async function generateBookingVoucherDocx(
  data: VoucherInput
): Promise<{ base64: string; filename: string } | { error: string }> {
  if (data.bookingType !== 'hotel') {
    return { error: 'Vouchers are currently available for hotel bookings only.' };
  }
  try {
    const children = [
      ...buildLetterhead(COMPANY),
      statusBanner(data.status),
      new Paragraph({ spacing: { after: 90 } }),
      referenceDateBox(data),
      new Paragraph({ spacing: { after: 90 } }),
      hotelDetailsTable(data),
      new Paragraph({ spacing: { after: 90 } }),
      checkInOutRow(data),
      new Paragraph({ spacing: { after: 110 } }),
      ...guestDetailsSection(data),
      new Paragraph({ spacing: { after: 110 } }),
      ...termsSection(),
    ];

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 620, bottom: 620, left: 620, right: 620 },
            },
          },
          footers: { default: buildFooter(COMPANY) },
          children,
        },
      ],
    });

    const buf = await Packer.toBuffer(doc);
    const filename = safeFilename('hotel-voucher', data.clientName, 'docx');
    return { base64: buf.toString('base64'), filename };
  } catch (e: any) {
    return { error: e?.message || 'Failed to generate the voucher.' };
  }
}
