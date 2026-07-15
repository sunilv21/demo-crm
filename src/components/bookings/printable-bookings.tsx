'use client';

import type { Booking, Client } from '@/lib/types';
import { buildDetailEntries, bookingReference } from '@/lib/booking-details';
import { format, isValid } from 'date-fns';
import { PrintSettings } from './print-settings-dialog';
import { COMPANY } from '@/lib/company';
import {
  Plane,
  BedDouble,
  Car,
  MapPinned,
  Stamp,
  Package,
  Phone,
  Mail,
  Globe,
  MapPin,
  User,
  Wallet,
  FileText,
  Plane as PlaneHeader,
} from 'lucide-react';

interface PrintableBookingsProps {
  client: Client;
  bookings: Booking[];
  settings: PrintSettings;
}

const fmtDate = (value: any): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  if (!isValid(d) || d.getFullYear() < 1990) return null;
  return d;
};
const dstr = (value: any): string | null => {
  const d = fmtDate(value);
  return d ? format(d, 'dd MMM yyyy') : null;
};
const money = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const bookingProfit = (b: Booking) => b.profit ?? ((b.total || 0) - (b.supplierCost || 0));
const bookingBalance = (b: Booking) => b.balanceAmount ?? Math.max(0, (b.total || 0) - (b.amountPaid || 0));

const TypeIcon = ({ type, size = 18 }: { type?: string; size?: number }) => {
  const t = type?.toLowerCase();
  if (t === 'flight') return <Plane size={size} />;
  if (t === 'hotel') return <BedDouble size={size} />;
  if (t === 'car') return <Car size={size} />;
  if (t === 'activity') return <MapPinned size={size} />;
  if (t === 'visa') return <Stamp size={size} />;
  return <Package size={size} />;
};

export function PrintableBookings({ client, bookings, settings }: PrintableBookingsProps) {
  // Cancelled bookings are excluded from the printed summary.
  const sortedBookings = [...bookings]
    .filter((b) => b.status !== 'cancelled')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const totalPrice = sortedBookings.reduce((s, b) => s + (b.total || 0), 0);
  const totalCost = sortedBookings.reduce((s, b) => s + (b.supplierCost || 0), 0);
  const totalProfit = sortedBookings.reduce((s, b) => s + bookingProfit(b), 0);
  const amountPaid = sortedBookings.reduce((s, b) => s + (b.amountPaid || 0), 0);
  const balanceDue = sortedBookings.reduce((s, b) => s + bookingBalance(b), 0);
  const payStatus = totalPrice > 0 && balanceDue <= 0 ? 'Paid' : amountPaid > 0 ? 'Partially Paid' : 'Unpaid';

  // Travel date range across all bookings.
  const starts = sortedBookings.map((b) => fmtDate(b.startDate)).filter(Boolean) as Date[];
  const ends = sortedBookings
    .map((b) => fmtDate(b.endDate) || fmtDate(b.startDate))
    .filter(Boolean) as Date[];
  const rangeStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  const rangeEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
  const travelRange =
    rangeStart && rangeEnd
      ? `${format(rangeStart, 'dd MMM')} – ${format(rangeEnd, 'dd MMM yyyy')}`
      : '—';

  const now = new Date();
  const docNo = `SV/${format(now, 'ddMMyy')}/001`;

  const showFinance = settings.showPrices || settings.showCost || settings.showProfit;

  return (
    <div className="inv">
      <style>{INV_CSS}</style>

      {/* ================= Header ================= */}
      <div className="inv-head">
        <div className="inv-brand">
          <img src="/sky.png" alt="Sky Visa" className="inv-logo" />
        </div>
        <div className="inv-co">
          <div className="inv-co-name">{COMPANY.name}</div>
          <div className="inv-co-line"><MapPin size={11} /> {COMPANY.address}</div>
          <div className="inv-co-line"><Phone size={11} /> {COMPANY.phones.join('  |  ')}</div>
          <div className="inv-co-line"><Mail size={11} /> {COMPANY.email} &nbsp;|&nbsp; <Globe size={11} /> {COMPANY.web}</div>
        </div>
      </div>

      <div className="inv-titlebar">
        <h1 className="inv-title">BOOKING SUMMARY</h1>
        <div className="inv-meta">
          <div><span>Date of Issue</span> : {format(now, 'MMMM d, yyyy')}</div>
          <div><span>Document No.</span> : {docNo}</div>
        </div>
      </div>

      {/* ================= Info cards ================= */}
      <div className="inv-cards">
        <div className="inv-card">
          <div className="inv-card-title">Customer Details</div>
          <div className="inv-kv"><User size={13} /> <span>{client.name || '—'}</span></div>
          {client.phone && <div className="inv-kv"><Phone size={13} /> <span>{client.phone}</span></div>}
          {client.email && <div className="inv-kv"><Mail size={13} /> <span>{client.email}</span></div>}
          {client.nationality && <div className="inv-kv"><MapPin size={13} /> <span>{client.nationality}</span></div>}
        </div>
        <div className="inv-card">
          <div className="inv-card-title">Trip Overview</div>
          <div className="inv-row"><span className="k">Total Bookings</span><span className="c">:</span><span className="v">{sortedBookings.length}</span></div>
          <div className="inv-row"><span className="k">Travel Dates</span><span className="c">:</span><span className="v">{travelRange}</span></div>
          <div className="inv-row"><span className="k">Prepared By</span><span className="c">:</span><span className="v">Sky Visa Travels</span></div>
          <div className="inv-row"><span className="k">Currency</span><span className="c">:</span><span className="v">INR (₹)</span></div>
        </div>
      </div>

      {/* ================= Booking details ================= */}
      <div className="inv-section"><PlaneHeader size={16} /> BOOKING DETAILS</div>

      {sortedBookings.map((booking, index) => {
        const ref = bookingReference(booking);
        const detailEntries = buildDetailEntries(booking);
        const rowEntries = detailEntries.filter(
          (e) => !e.isTable && e.label !== 'Portal' && e.label !== 'Supplier'
        );
        const tableEntries = detailEntries.filter((e) => e.isTable && Array.isArray(e.value));

        const start = dstr(booking.startDate);
        const end = dstr(booking.endDate);
        const dateText = start && end && end !== start ? `${start} – ${end}` : start || end || '—';

        const sub: { label: string; value: string }[] = [];
        if (settings.showPortal && booking.bookingPortal) sub.push({ label: 'Portal', value: booking.bookingPortal });
        if (settings.showSupplier && booking.supplierName) sub.push({ label: 'Supplier', value: booking.supplierName });
        if (settings.showReferences && ref) sub.push({ label: ref.label, value: ref.value });

        const profit = bookingProfit(booking);
        const statusClass =
          booking.status === 'confirmed' ? 'ok' : booking.status === 'cancelled' ? 'bad' : 'warn';

        return (
          <div key={booking.id} className="bk">
            <div className="bk-no">{String(index + 1).padStart(2, '0')}</div>
            <div className="bk-main">
              <div className="bk-head">
                <div className="bk-title">
                  <span className="bk-ic"><TypeIcon type={booking.bookingType} /></span>
                  <span>{settings.showReferences && ref ? ref.value : cap(booking.bookingType) || 'Booking'}</span>
                </div>
                <div className="bk-metrics">
                  {settings.showPrices && (
                    <div className="metric"><div className="m-l">AMOUNT (₹)</div><div className="m-v">{money(booking.total || 0)}</div></div>
                  )}
                  {settings.showCost && (
                    <div className="metric"><div className="m-l">COST (₹)</div><div className="m-v">{money(booking.supplierCost || 0)}</div></div>
                  )}
                  {settings.showProfit && (
                    <div className="metric"><div className="m-l">PROFIT (₹)</div><div className={`m-v ${profit >= 0 ? 'pos' : 'neg'}`}>{money(profit)}</div></div>
                  )}
                  <div className="metric"><div className="m-l">STATUS</div><div className={`badge ${statusClass}`}>{booking.status === 'pending' ? 'Hold' : cap(booking.status)}</div></div>
                </div>
              </div>

              <div className="bk-grid">
                <div className="kv"><span className="k">Type</span><span className="c">:</span><span className="v">{cap(booking.bookingType) || '—'}</span></div>
                {booking.destination && (
                  <div className="kv"><span className="k">Destination</span><span className="c">:</span><span className="v">{booking.destination}</span></div>
                )}
                <div className="kv"><span className="k">Dates</span><span className="c">:</span><span className="v">{dateText}</span></div>
                {rowEntries.map((e) => (
                  <div key={e.label} className="kv"><span className="k">{e.label}</span><span className="c">:</span><span className="v">{e.value as string}</span></div>
                ))}
              </div>

              {tableEntries.map((entry, entryIdx) => {
                const cols = entry.columns ?? [
                  { key: 'from', label: 'From' },
                  { key: 'to', label: 'To' },
                  { key: 'date', label: 'Date' },
                ];
                const rows = entry.value as any[];
                return (
                  <div key={`${entry.label}-${entryIdx}`} className="bk-tbl-wrap">
                    <div className="bk-tbl-title">{entry.label}</div>
                    <table className="bk-tbl">
                      <thead>
                        <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i}>{cols.map((c) => <td key={c.key}>{row[c.key]}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {sub.length > 0 && (
                <div className="bk-sub">
                  {sub.map((s) => (
                    <div key={s.label} className="bk-sub-i"><span className="k">{s.label}</span><span className="c">:</span><span className="v">{s.value}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ================= Payment + description ================= */}
      <div className="inv-cards inv-pay-wrap">
        {showFinance && (
          <div className="inv-card inv-pay">
            <div className="inv-card-title"><Wallet size={15} /> Payment Summary</div>
            {settings.showPrices && <div className="pay-row"><span>Total Booking Value</span><b>{money(totalPrice)}</b></div>}
            {settings.showCost && <div className="pay-row"><span>Total Cost</span><b>{money(totalCost)}</b></div>}
            {settings.showProfit && <div className="pay-row"><span>Total Profit</span><b className="pos">{money(totalProfit)}</b></div>}
            {settings.showPrices && (
              <>
                <div className="pay-row"><span>Amount Paid</span><b>{money(amountPaid)}</b></div>
                <div className="pay-row"><span>Payment Status</span><b>{payStatus}</b></div>
                <div className="pay-row pay-total"><span>Balance Due</span><b>{money(balanceDue)}</b></div>
              </>
            )}
          </div>
        )}
        <div className="inv-card inv-desc">
          <div className="inv-card-title"><FileText size={15} /> Description</div>
          <p>This is the summary of all bookings made with Sky Visa Travels.</p>
          <p>All services are confirmed and subject to terms and conditions mentioned by the respective airlines and hotels.</p>
        </div>
      </div>

      {/* ================= Notes + signature ================= */}
      <div className="inv-foot-grid">
        <div>
          <div className="inv-notes-title">Important Notes</div>
          <ul className="inv-notes">
            <li>Please reconfirm all bookings before travel.</li>
            <li>Changes or cancellations are subject to respective airline/hotel policies.</li>
            <li>Carry your original passport and valid IDs during travel.</li>
            <li>Please arrive at the airport at least 3 hours before departure.</li>
            <li>Visa approval is at the sole discretion of the respective consulate/embassy.</li>
            <li>Reach out to us for any assistance.</li>
          </ul>
        </div>
        <div className="inv-thanks">
          <div className="inv-thanks-1">Thank you for choosing Sky Visa Travels.</div>
          <div className="inv-thanks-2">We wish you a safe and pleasant journey!</div>
          <div className="inv-sign">
            <div className="inv-sign-line"></div>
            <div className="inv-sign-l1">Authorized Signature</div>
            <div className="inv-sign-l2">{COMPANY.name}</div>
          </div>
        </div>
      </div>

      {/* ================= Footer bar ================= */}
      <div className="inv-bar">
        <span><Phone size={12} /> {COMPANY.phones.join(' | ')}</span>
        <span><Mail size={12} /> {COMPANY.email}</span>
        <span><Globe size={12} /> {COMPANY.web}</span>
      </div>
    </div>
  );
}

// Scoped stylesheet — every rule is prefixed with `.inv` so it neither leaks
// into the app nor collides with the print window's base stylesheet.
const INV_CSS = `
.inv { color:#111827; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:12px; line-height:1.45; }
.inv *{ box-sizing:border-box; }

/* Pagination: never split these blocks across a page boundary. */
.inv-head, .inv-titlebar, .inv-card, .bk, .bk-sub, .inv-foot-grid, .inv-bar {
  break-inside: avoid; page-break-inside: avoid;
}
/* Keep a heading with the content that follows it. */
.inv-section { break-after: avoid; page-break-after: avoid; }
/* Cards row can wrap to the next page, but each card stays whole. */
.inv-cards { break-inside: auto; page-break-inside: auto; }
.inv h1{ margin:0; padding:0; border:0; }
.inv p{ margin:0 0 6px; font-size:12px; }
.inv svg{ vertical-align:-2px; }

.inv-head{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1e40af; padding-bottom:14px; }
.inv-logo{ height:92px; width:auto; margin-top:-14px; }
.inv-co{ text-align:right; }
.inv-co-name{ color:#1e3a8a; font-size:23px; font-weight:800; margin-bottom:2px; }
.inv-co-line{ color:#4b5563; font-size:10.5px; margin-top:3px; }
.inv-co-line svg{ color:#2563eb; margin-right:3px; }

.inv-titlebar{ margin-top:16px; }
.inv-title{ text-align:center; color:#1e40af; font-size:26px; font-weight:800; letter-spacing:1px; }
.inv-meta{ margin-top:10px; text-align:right; color:#374151; font-size:12px; }
.inv-meta span{ display:inline-block; min-width:104px; color:#6b7280; }

.inv-cards{ display:flex; gap:16px; margin-top:16px; }
.inv-card{ flex:1; background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px; }
.inv-card-title{ color:#1e40af; font-size:14px; font-weight:700; margin-bottom:10px; }
.inv-card-title svg{ color:#2563eb; margin-right:4px; }
.inv-kv{ font-size:12px; margin:6px 0; color:#374151; }
.inv-kv svg{ color:#2563eb; margin-right:6px; }
.inv-row{ display:flex; font-size:12px; margin:6px 0; color:#374151; }
.inv-row .k{ width:120px; color:#6b7280; }
.inv-row .c{ width:12px; color:#9ca3af; }
.inv-row .v{ font-weight:600; color:#111827; }

.inv-section{ margin:22px 0 12px; color:#1e40af; font-size:15px; font-weight:800; letter-spacing:.5px; }
.inv-section svg{ color:#2563eb; margin-right:6px; }

.bk{ display:flex; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; margin-bottom:14px; page-break-inside:avoid; }
.bk-no{ width:42px; background:#1e40af; color:#fff; font-weight:800; font-size:14px; display:flex; align-items:center; justify-content:center; }
.bk-main{ flex:1; min-width:0; }
.bk-head{ display:flex; justify-content:space-between; align-items:flex-start; padding:12px 16px 8px; }
.bk-title{ display:flex; align-items:center; font-size:16px; font-weight:800; color:#111827; }
.bk-ic{ display:inline-flex; color:#1e40af; margin-right:8px; }
.bk-metrics{ display:flex; align-items:flex-start; gap:22px; text-align:center; }
.metric .m-l{ color:#1e40af; font-size:9.5px; font-weight:700; letter-spacing:.4px; }
.metric .m-v{ font-size:14px; font-weight:700; color:#111827; margin-top:3px; }
.metric .m-v.pos{ color:#16a34a; } .metric .m-v.neg{ color:#dc2626; }
.badge{ display:inline-block; margin-top:3px; padding:3px 10px; border-radius:999px; font-size:10px; font-weight:700; }
.badge.ok{ background:#dcfce7; color:#166534; } .badge.warn{ background:#fef9c3; color:#854d0e; } .badge.bad{ background:#fee2e2; color:#991b1b; }

.bk-grid{ display:flex; flex-wrap:wrap; padding:0 16px 12px; }
.bk-grid .kv{ display:flex; width:50%; font-size:12px; margin:3px 0; }
.bk-grid .k{ width:96px; color:#6b7280; } .bk-grid .c{ width:12px; color:#9ca3af; } .bk-grid .v{ color:#111827; font-weight:600; }

.bk-tbl-wrap{ padding:0 16px 12px; }
.bk-tbl-title{ font-size:11px; font-weight:700; color:#1e40af; margin-bottom:4px; }
.bk-tbl{ width:100%; border-collapse:collapse; font-size:11px; }
.bk-tbl th{ text-align:left; background:#eff6ff; color:#1e3a8a; font-weight:600; padding:5px 8px; border:1px solid #dbeafe; }
.bk-tbl td{ padding:5px 8px; border:1px solid #e5e7eb; color:#111827; }

.bk-sub{ display:flex; flex-wrap:wrap; gap:24px; background:#eff6ff; padding:9px 16px; border-top:1px solid #dbeafe; }
.bk-sub-i{ display:flex; font-size:11px; }
.bk-sub-i .k{ color:#6b7280; } .bk-sub-i .c{ margin:0 5px; color:#9ca3af; } .bk-sub-i .v{ color:#1e3a8a; font-weight:600; }

.inv-pay-wrap{ margin-top:8px; }
.inv-pay .pay-row{ display:flex; justify-content:space-between; font-size:12px; padding:5px 0; color:#374151; }
.inv-pay .pay-row b{ font-weight:700; color:#111827; } .inv-pay .pay-row b.pos{ color:#16a34a; }
.inv-pay .pay-total{ border-top:2px solid #1e40af; margin-top:4px; padding-top:8px; font-size:15px; }
.inv-pay .pay-total span{ font-weight:700; color:#111827; } .inv-pay .pay-total b{ font-size:16px; color:#1e40af; }
.inv-desc p{ color:#4b5563; font-size:11.5px; }

.inv-foot-grid{ display:flex; gap:24px; margin-top:20px; }
.inv-foot-grid>div{ flex:1; }
.inv-notes-title{ color:#1e40af; font-weight:700; font-size:12px; margin-bottom:6px; }
.inv-notes{ margin:0; padding-left:16px; color:#4b5563; font-size:11px; }
.inv-notes li{ margin:4px 0; }
.inv-thanks{ text-align:center; }
.inv-thanks-1{ color:#374151; font-size:12px; }
.inv-thanks-2{ color:#1e40af; font-style:italic; font-size:15px; margin:14px 0 22px; }
.inv-sign{ margin-top:56px; }
.inv-sign-line{ border-top:1px solid #9ca3af; width:200px; margin:0 auto 4px; }
.inv-sign-l1{ font-size:12px; color:#111827; } .inv-sign-l2{ font-size:11px; color:#6b7280; }

.inv-bar{ display:flex; justify-content:space-around; gap:16px; margin-top:22px; padding:12px; background:#eff6ff; border-radius:8px; color:#1e3a8a; font-size:11px; }
.inv-bar svg{ color:#2563eb; margin-right:4px; }
`;
