'use server';

// Generates a real, directly-downloadable PDF hotel booking voucher —
// mirrors the .docx generator (voucher-docx.ts) field-for-field and
// visually (same palette, same section order), but produces actual PDF
// bytes server-side via @react-pdf/renderer instead of going through the
// browser's print dialog ("Print > Save as PDF"), which the user had to
// manually step through — this downloads immediately, same as the .docx
// "Voucher" button already does.
//
// Hotel bookings ONLY — same restriction as generateBookingVoucherDocx.

import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';
import { COMPANY } from '@/lib/company';
import { voucherFilename } from '@/lib/print';
import { linesToBullets } from '@/lib/voucher-bullets';
import type { VoucherInput } from '@/lib/voucher-types';
import type { BookingStatus } from '@/lib/types';

// Same palette as docx-helpers.ts — keep in sync if the voucher's visual
// identity ever changes.
const NAVY = '#1B3A63';
const GOLD = '#C8862A';
const PALEBLUE = '#EAF0F8';
const GREEN = '#2F6B3A';
const RED = '#A33A2E';
const TEXT = '#222222';
const MUTED = '#6B7280';
const BORDER = '#CBD5E1';

const STATUS_STYLE: Record<BookingStatus, { label: string; icon: string; color: string }> = {
  confirmed: { label: 'BOOKING CONFIRMED', icon: '✓', color: GREEN },
  cancelled: { label: 'BOOKING CANCELLED', icon: '✘', color: RED },
  pending: { label: 'BOOKING PENDING', icon: '⏱', color: GOLD },
  hold: { label: 'BOOKING ON HOLD', icon: '⏱', color: GOLD },
  draft: { label: 'DRAFT BOOKING', icon: 'ℹ', color: MUTED },
};

const AGENCY_LABEL = 'Sky Visa Consultancy';

const DEFAULT_TERMS_LEFT = [
  'Booking is CONFIRMED. Standard hotel check-in / check-out timings apply.',
  'Carry valid photo ID / passport and this voucher at check-in. Minimum guest age to check-in is 18 years.',
  'Hotels may charge a refundable security deposit at check-in for incidentals (refunded if unutilized).',
  'Local city tax / tourist tax / supplementary charges, if applicable, are payable directly at the property.',
  'Bedding type is subject to availability at check-in; defaults to Queen or Twin if not specified.',
  'Extra beds are not included in the reservation price unless stated in hotel / booking policies.',
];
const DEFAULT_TERMS_RIGHT = [
  'Special requests (bed type, early check-in / late check-out) are subject to availability and not guaranteed.',
  'Hotels may not allow additional passengers apart from those reflected in the booking.',
  'Hotels may deny check-in or charge differently if the nationality differs from that at reservation.',
  "In case of No-Show or Early Check-Out, full charges will apply as per the hotel's cancellation policy.",
  'All extras (Mini Bar, Laundry, Telephone, Room Service, parking, etc.) are payable directly at check-out.',
  'Hotel reserves the right to deny check-in if all guest names are not provided in advance.',
];

function str(v: unknown): string {
  return v === null || v === undefined || v === '' ? '' : String(v);
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return '—';
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateLong(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return '—';
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function computeNights(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const startUtc = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
  const endUtc = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  return Math.round((endUtc - startUtc) / 86400000);
}

// public/sky.png is a palette/indexed-color PNG (colorType 3) — fine for a
// browser <img> or the `docx` library, but @react-pdf/renderer's PNG decoder
// doesn't handle indexed color correctly and renders it corrupted. Re-encode
// it to a standard RGBA PNG once (cached) before handing it to <Image>.
let cachedLogo: Buffer | null = null;
async function loadLogo(): Promise<Buffer> {
  if (!cachedLogo) {
    const raw = fs.readFileSync(path.join(process.cwd(), 'public', 'sky.png'));
    const sharp = (await import('sharp')).default;
    cachedLogo = await sharp(raw).png().toBuffer();
  }
  return cachedLogo;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', fontSize: 9, color: TEXT },
  letterhead: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 52, height: 52 },
  divider: { width: 2.5, alignSelf: 'stretch', backgroundColor: NAVY, marginHorizontal: 10 },
  lhText: { flex: 1 },
  coName: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: NAVY, marginBottom: 2 },
  coAddress: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#333333', marginBottom: 2 },
  coContact: { fontSize: 7.5, color: TEXT },
  goldRule: { borderBottomWidth: 2, borderBottomColor: GOLD, marginTop: 6, marginBottom: 10 },

  banner: { padding: 6, textAlign: 'center', color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 11, letterSpacing: 0.5 },

  tblBorder: { borderWidth: 1, borderColor: BORDER },
  row: { flexDirection: 'row' },

  refBox: { flexDirection: 'row', backgroundColor: PALEBLUE, borderWidth: 1, borderColor: BORDER, marginTop: 8 },
  refCell: { flex: 1, padding: 6, fontSize: 8 },

  sectionHead: { flexDirection: 'row', backgroundColor: NAVY },
  th: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 8.5, padding: 5 },

  hotelBody: { flexDirection: 'row', backgroundColor: PALEBLUE, borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  hotelDetailsCell: { flex: 0.56, padding: 6 },
  hotelDetailLine: { fontSize: 8, marginBottom: 2 },
  hotelSideCell: { flex: 0.22, padding: 6, alignItems: 'center', justifyContent: 'center' },
  roomsCount: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY },

  datesBody: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  dateCell: { flex: 1, padding: 6, alignItems: 'center' },
  dateBig: { fontFamily: 'Helvetica-Bold', fontSize: 10 },

  sectionBar: { backgroundColor: NAVY, padding: 5, marginTop: 12 },
  sectionBarText: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 9 },

  guestHead: { flexDirection: 'row', backgroundColor: NAVY },
  guestRow: { flexDirection: 'row', borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  guestRowShade: { backgroundColor: PALEBLUE },
  guestCell: { padding: 4, fontSize: 7 },

  termsBox: { flexDirection: 'row', backgroundColor: PALEBLUE, borderWidth: 1, borderColor: BORDER },
  termsCol: { flex: 1, padding: 8 },
  bulletRow: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { fontSize: 7, color: MUTED, marginRight: 3 },
  bulletText: { flex: 1, fontSize: 7, color: TEXT, lineHeight: 1.3 },

  notesBox: { backgroundColor: PALEBLUE, borderWidth: 1, borderColor: BORDER, padding: 8 },

  footer: { position: 'absolute', bottom: 20, left: 28, right: 28, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6, fontSize: 7, color: MUTED },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((t, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{'•'}</Text>
          <Text style={styles.bulletText}>{t}</Text>
        </View>
      ))}
    </>
  );
}

// Guest-column widths mirror the .docx GUEST_WIDTHS proportions (Guest Name
// widest, Room Type next, the rest compact).
const GUEST_FLEX = [0.16, 0.35, 0.12, 0.17, 0.08, 0.12];

function VoucherDocument({ data, logo }: { data: VoucherInput; logo: Buffer }) {
  const s = STATUS_STYLE[data.status] || STATUS_STYLE.confirmed;
  const statusLabel = s.label.replace('BOOKING ', '');
  const d = data.bookingDetails || {};
  const nights = computeNights(data.startDate, data.endDate);

  const hotelName = str(d.hotelName) || data.supplierName || '';
  const address = str(d.hotelAddress);
  const tel = str(d.hotelTel);
  const city = str(d.city);
  const country = str(d.country) || data.destination || '';
  const roomsCount = str(d.rooms) || '1';
  const guestsCount = str(d.guests) || String(data.hotelGuests?.filter((g) => g.name?.trim()).length || 1);
  const roomType = str(d.roomType) || '—';
  const inclusion = str(d.inclusion) || 'Room Only';
  const confNo = data.reference?.value || data.bookingId;

  const named = (data.hotelGuests || []).filter((g) => g.name && g.name.trim());
  const guestRows = named.length ? named : [{ name: data.clientName }];

  const termsLines = linesToBullets(data.hotelTermsAndConditions);
  const termsMid = Math.ceil(termsLines.length / 2);
  const termsLeft = termsLines.length ? termsLines.slice(0, termsMid) : DEFAULT_TERMS_LEFT;
  const termsRight = termsLines.length ? termsLines.slice(termsMid) : DEFAULT_TERMS_RIGHT;

  const noteLines = linesToBullets(data.hotelNotes);
  const guestHeaders = ['Guest Name', 'Room Type', 'Inclusion', 'Confirmation No', 'Pax', 'Status'];

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.letterhead}>
          <Image src={{ data: logo, format: 'png' }} style={styles.logo} />
          <View style={styles.divider} />
          <View style={styles.lhText}>
            <Text style={styles.coName}>{COMPANY.name}</Text>
            <Text style={styles.coAddress}>{COMPANY.address}</Text>
            <Text style={styles.coContact}>{COMPANY.email}  |  {COMPANY.phones.join('  |  ')}</Text>
          </View>
        </View>
        <View style={styles.goldRule} />

        <View style={[styles.banner, { backgroundColor: s.color }]}>
          <Text>{s.icon}  {s.label}</Text>
        </View>

        <View style={styles.refBox}>
          <Text style={styles.refCell}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Booking Reference: </Text>{data.reference?.value || data.bookingId}</Text>
          <Text style={styles.refCell}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Booking Date: </Text>{fmtDate(data.bookingDate)}</Text>
          <Text style={styles.refCell}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Booking Status: </Text><Text style={{ color: s.color, fontFamily: 'Helvetica-Bold' }}>{statusLabel}</Text></Text>
        </View>

        <View style={[styles.sectionHead, styles.tblBorder, { marginTop: 8 }]}>
          <Text style={[styles.th, { flex: 0.56 }]}>Hotel Details</Text>
          <Text style={[styles.th, { flex: 0.3, textAlign: 'center' }]}>Room Type</Text>
          <Text style={[styles.th, { flex: 0.14, textAlign: 'center' }]}>No of Rooms</Text>
        </View>
        <View style={styles.hotelBody}>
          <View style={styles.hotelDetailsCell}>
            <Text style={styles.hotelDetailLine}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Hotel Name : </Text>{hotelName || '—'}</Text>
            <Text style={styles.hotelDetailLine}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Address : </Text>{address || '—'}</Text>
            <Text style={styles.hotelDetailLine}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Tel : </Text>{tel || '—'}   <Text style={{ fontFamily: 'Helvetica-Bold' }}>City : </Text>{city || '—'}</Text>
            <Text style={styles.hotelDetailLine}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Country : </Text>{country || '—'}</Text>
            <Text style={styles.hotelDetailLine}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Lead Guest : </Text>{data.clientName}   <Text style={{ fontFamily: 'Helvetica-Bold' }}>Nationality : </Text>{data.clientNationality || '—'}</Text>
            <Text style={styles.hotelDetailLine}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Agency : </Text>{AGENCY_LABEL}</Text>
            <Text style={styles.hotelDetailLine}><Text style={{ fontFamily: 'Helvetica-Bold' }}>No. of Rooms : </Text>{roomsCount}   <Text style={{ fontFamily: 'Helvetica-Bold' }}>Guests : </Text>{guestsCount} Adult{Number(guestsCount) > 1 ? 's' : ''}</Text>
          </View>
          <View style={[styles.hotelSideCell, { flex: 0.3 }]}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9 }}>{roomType}</Text>
          </View>
          <View style={[styles.hotelSideCell, { flex: 0.14 }]}>
            <Text style={styles.roomsCount}>{roomsCount}</Text>
          </View>
        </View>

        <View style={[styles.sectionHead, styles.tblBorder, { marginTop: 8 }]}>
          <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>CHECK-IN</Text>
          <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>DURATION</Text>
          <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>CHECK-OUT</Text>
        </View>
        <View style={styles.datesBody}>
          <View style={styles.dateCell}><Text style={styles.dateBig}>{fmtDateLong(data.startDate)}</Text></View>
          <View style={styles.dateCell}><Text style={{ fontSize: 9 }}>{nights !== null ? `${nights} Night(s)` : '—'}</Text></View>
          <View style={styles.dateCell}><Text style={styles.dateBig}>{fmtDateLong(data.endDate)}</Text></View>
        </View>

        <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Guest Details</Text></View>
        <View style={[styles.guestHead, styles.tblBorder]}>
          {guestHeaders.map((h, i) => (
            <Text key={h} style={[styles.th, { flex: GUEST_FLEX[i], fontSize: 7 }]}>{h}</Text>
          ))}
        </View>
        {guestRows.map((g, i) => (
          <View key={i} style={[styles.guestRow, i % 2 === 1 ? styles.guestRowShade : {}]}>
            <Text style={[styles.guestCell, { flex: GUEST_FLEX[0] }]}>{(g.name || '').toUpperCase()}</Text>
            <Text style={[styles.guestCell, { flex: GUEST_FLEX[1] }]}>{roomType}</Text>
            <Text style={[styles.guestCell, { flex: GUEST_FLEX[2] }]}>{inclusion}</Text>
            <Text style={[styles.guestCell, { flex: GUEST_FLEX[3] }]}>{confNo}</Text>
            <Text style={[styles.guestCell, { flex: GUEST_FLEX[4] }]}>Adult</Text>
            <Text style={[styles.guestCell, { flex: GUEST_FLEX[5], color: s.color, fontFamily: 'Helvetica-Bold' }]}>{statusLabel}</Text>
          </View>
        ))}

        <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Terms &amp; Conditions</Text></View>
        <View style={styles.termsBox}>
          <View style={styles.termsCol}><Bullets items={termsLeft} /></View>
          <View style={styles.termsCol}><Bullets items={termsRight} /></View>
        </View>

        {noteLines.length > 0 && (
          <>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Notes</Text></View>
            <View style={styles.notesBox}><Bullets items={noteLines} /></View>
          </>
        )}

        <Text style={styles.footer} fixed>
          {COMPANY.email}  |  {COMPANY.phones.join('  |  ')}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateBookingVoucherPdf(
  data: VoucherInput
): Promise<{ base64: string; filename: string } | { error: string }> {
  if (data.bookingType !== 'hotel') {
    return { error: 'Vouchers are currently available for hotel bookings only.' };
  }
  try {
    const logo = await loadLogo();
    const buf = await renderToBuffer(<VoucherDocument data={data} logo={logo} />);
    const hotelName = str(data.bookingDetails?.hotelName) || data.supplierName;
    const filename = voucherFilename(hotelName, data.clientName, 'pdf');
    return { base64: Buffer.from(buf).toString('base64'), filename };
  } catch (e: any) {
    return { error: e?.message || 'Failed to generate the voucher PDF.' };
  }
}
