'use client';

import { PageHeader } from '@/components/common/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PlusCircle,
  MoreHorizontal,
  Plane,
  Flag,
  Bed,
  Car,
  Stamp,
  Pencil,
  Printer,
  Wallet,
  Archive,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Booking, Client } from '@/lib/types';
import { buildDetailEntries, bookingReference, formatBookingDates } from '@/lib/booking-details';
import { Fragment, useState, useRef, useEffect } from 'react';
import { differenceInDays } from 'date-fns';
import { PrintSettingsDialog, defaultSettings, type PrintSettings } from '@/components/bookings/print-settings-dialog';
import { PrintableBookings } from '@/components/bookings/printable-bookings';
import { PaymentsDialog } from '@/components/bookings/payments-dialog';
import { CancelRefundDialog } from '@/components/bookings/cancel-refund-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingForm } from '@/components/forms/booking-form';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

const ItineraryIcon = ({ type }: { type?: string }) => {
  const t = type?.toLowerCase();
  if (t?.includes('flight')) return <Plane className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes('tour')) return <Flag className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes('hotel')) return <Bed className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes('rental') || t?.includes('car')) return <Car className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes('visa')) return <Stamp className="mr-2 h-4 w-4 text-muted-foreground" />;
  return null;
};

const BookingRowSkeleton = () => (
  <TableRow>
    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
    <TableCell><MoreHorizontal className="h-4 w-4" /></TableCell>
  </TableRow>
);

// Bookings auto-archive this many days after the full payment is received.
const AUTO_ARCHIVE_DAYS = 15;

// A booking's balance is cleared when it's fully paid (nothing left to collect).
const isCleared = (b: Booking) => {
  const total = b.total || 0;
  const paid = b.amountPaid ?? (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const balance = b.balanceAmount ?? (total - paid);
  return total > 0 && balance <= 0;
};

// The date the full payment was received: the latest installment date, or a
// fallback to the booking's last-updated time for legacy bookings without a
// payments ledger.
const paymentReceivedDate = (b: Booking): Date | null => {
  const times = (b.payments || [])
    .map((p) => (p.date ? new Date(p.date).getTime() : NaN))
    .filter((t) => !isNaN(t));
  if (times.length) return new Date(Math.max(...times));
  if (b.updatedAt?.toDate) return b.updatedAt.toDate();
  return null;
};

export default function ClientBookingsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { canViewRevenue } = useAppUser();
  const params = useParams();
  const clientId = params.clientId as string;
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultSettings);
  // Exactly the bookings to print: one row, a chosen selection, or all active.
  const [printBookings, setPrintBookings] = useState<Booking[] | null>(null);
  const [paymentsBooking, setPaymentsBooking] = useState<Booking | null>(null);
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  // Row selection for "print some of them" (e.g. 3 of 5).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const printContentRef = useRef<HTMLDivElement>(null);

  const clientRef = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);

  const { data: client, isLoading: isLoadingClient } = useDoc<Client>(clientRef);

  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return query(collection(firestore, 'bookings'), where('clientId', '==', clientId));
  }, [firestore, clientId]);

  const { data: bookings, isLoading: isLoadingBookings } = useCollection<Booking>(bookingsQuery);

  const handleAddBooking = (newBookingData: Omit<Booking, 'id'>) => {
    if (!firestore) return;
    addDocumentNonBlocking(collection(firestore, 'bookings'), { ...newBookingData });
    setIsFormOpen(false);
    toast({ title: 'Booking Created', description: `New booking for ${client?.name} created.` });
  };

  const handleUpdateBooking = (updatedData: Omit<Booking, 'id'>) => {
    if (!firestore || !editingBooking) return;
    const bookingRef = doc(firestore, 'bookings', editingBooking.id);
    setDocumentNonBlocking(bookingRef, updatedData, { merge: true });
    setEditingBooking(null);
    toast({ title: "Booking Updated", description: "The booking has been successfully updated." });
  };

  const handleArchive = (booking: Booking) => {
    if (!firestore) return;
    const bookingRef = doc(firestore, 'bookings', booking.id);
    setDocumentNonBlocking(
      bookingRef,
      { archived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user?.uid },
      { merge: true }
    );
    toast({ title: 'Booking Archived', description: 'Moved to the client’s Travel History.' });
  };

  const handlePrint = () => {
    const printContent = document.querySelector('.print-content');
    if (!printContent) return;
    const contentHTML = printContent.innerHTML;
    setPrintSettingsOpen(false);

    // Print via a hidden iframe instead of window.open. This works in the
    // browser AND the Electron desktop app, where window.open is blocked as a
    // popup and there's no browser setting the user can toggle to allow it.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return;
    }

    doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Booking Summary</title>
              <base href="${window.location.origin}/" />
              <style>
                * {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  margin: 0;
                  padding: 0;
                  background: white;
                  color: black;
                }
                .print-container {
                  max-width: 210mm;
                  margin: 0 auto;
                  padding: 20px;
                  background: white;
                }
                @page {
                  size: A4;
                  margin: 15mm;
                }
                h1 {
                  font-size: 24px;
                  font-weight: bold;
                  margin-bottom: 16px;
                  border-bottom: 2px solid #1f2937;
                  padding-bottom: 16px;
                }
                h2 {
                  font-size: 18px;
                  font-weight: 600;
                  margin-bottom: 12px;
                }
                h3 {
                  font-size: 14px;
                  font-weight: 500;
                  margin-bottom: 8px;
                }
                p {
                  margin: 4px 0;
                  font-size: 14px;
                }
                .bg-gray-50 {
                  background-color: #f9fafb;
                }
                .p-4 {
                  padding: 16px;
                }
                .rounded-t-lg {
                  border-top-left-radius: 8px;
                  border-top-right-radius: 8px;
                }
                .border {
                  border: 1px solid #e5e7eb;
                }
                .border-t-0 {
                  border-top: none;
                }
                .rounded-b-lg {
                  border-bottom-left-radius: 8px;
                  border-bottom-right-radius: 8px;
                }
                .mb-6 {
                  margin-bottom: 24px;
                }
                .mt-2 {
                  margin-top: 8px;
                }
                .mt-3 {
                  margin-top: 12px;
                }
                .text-sm {
                  font-size: 14px;
                }
                .text-xs {
                  font-size: 12px;
                }
                .text-lg {
                  font-size: 18px;
                }
                .text-gray-900 {
                  color: #111827;
                }
                .text-gray-700 {
                  color: #374151;
                }
                .text-gray-600 {
                  color: #4b5563;
                }
                .text-gray-500 {
                  color: #6b7280;
                }
                .text-green-800 {
                  color: #166534;
                }
                .text-green-100 {
                  background-color: #dcfce7;
                }
                .text-yellow-800 {
                  color: #854d0e;
                }
                .text-yellow-100 {
                  background-color: #fef9c3;
                }
                .text-red-800 {
                  color: #991b1b;
                }
                .text-red-100 {
                  background-color: #fee2e2;
                }
                .text-red-700 {
                  color: #b91c1c;
                }
                .text-green-700 {
                  color: #15803d;
                }
                .font-medium {
                  font-weight: 500;
                }
                .font-semibold {
                  font-weight: 600;
                }
                .grid {
                  display: grid;
                }
                .grid-cols-2 {
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .grid-cols-3 {
                  grid-template-columns: repeat(3, minmax(0, 1fr));
                }
                .gap-4 {
                  gap: 16px;
                }
                .gap-2 {
                  gap: 8px;
                }
                .col-span-2 {
                  grid-column: span 2 / span 2;
                }
                .col-span-1 {
                  grid-column: span 1 / span 1;
                }
                .inline-block {
                  display: inline-block;
                }
                .px-3 {
                  padding-left: 12px;
                  padding-right: 12px;
                }
                .py-1 {
                  padding-top: 4px;
                  padding-bottom: 4px;
                }
                .rounded-full {
                  border-radius: 9999px;
                }
                .flex {
                  display: flex;
                }
                .justify-between {
                  justify-content: space-between;
                }
                .items-start {
                  align-items: flex-start;
                }
                .text-right {
                  text-align: right;
                }
                .space-y-2 > * + * {
                  margin-top: 8px;
                }
                .border-b {
                  border-bottom: 1px solid #e5e7eb;
                }
                .border-gray-300 {
                  border-color: #d1d5db;
                }
                .border-gray-200 {
                  border-color: #e5e7eb;
                }
                .last\\:border-0:last-child {
                  border: none;
                }
                .pt-4 {
                  padding-top: 16px;
                }
                .mt-4 {
                  margin-top: 16px;
                }
                .border-collapse {
                  border-collapse: collapse;
                }
                .w-full {
                  width: 100%;
                }
                .text-left {
                  text-align: left;
                }
                .py-2 {
                  padding-top: 8px;
                  padding-bottom: 8px;
                }
                .px-3 {
                  padding-left: 12px;
                  padding-right: 12px;
                }
                .list-disc {
                  list-style-type: disc;
                }
                .list-inside {
                  list-style-position: inside;
                }
                .text-center {
                  text-align: center;
                }
                .pt-4 {
                  padding-top: 16px;
                }
                .mt-8 {
                  margin-top: 32px;
                }
                .page-break-inside-avoid {
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
              </style>
            </head>
            <body>
              <div class="print-container">
                ${contentHTML}
              </div>
            </body>
            </html>
          `);
    doc.close();

    // Print once content (incl. the logo image) has loaded. Guard against
    // printing twice; fall back to a timeout if images never resolve.
    let printed = false;
    const cleanup = () => setTimeout(() => iframe.remove(), 1000);
    const doPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* printing not available */
      }
      cleanup();
    };
    const imgs = Array.from(doc.images);
    if (imgs.length) {
      let pending = imgs.length;
      const settle = () => { if (--pending <= 0) doPrint(); };
      imgs.forEach((img) => {
        if (img.complete) settle();
        else { img.onload = settle; img.onerror = settle; }
      });
    }
    setTimeout(doPrint, 1200);
  };

  const isLoading = isLoadingBookings || isLoadingClient;

  // Active bookings only (archived ones live in Travel History), newest first.
  const activeBookings = (bookings || [])
    .filter((b) => !b.archived)
    .sort((a, b) => {
      const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bt - at;
    });
  const archivedCount = (bookings || []).filter((b) => b.archived).length;

  // Auto-archive: any cleared booking whose full payment was received at least
  // AUTO_ARCHIVE_DAYS ago moves to Travel History on its own. Runs lazily when
  // the page is viewed (no backend job); manually un-archived bookings are exempt.
  useEffect(() => {
    if (!firestore || !bookings) return;
    bookings.forEach((b) => {
      if (b.archived || b.archiveExempt || !isCleared(b)) return;
      const received = paymentReceivedDate(b);
      if (received && differenceInDays(new Date(), received) >= AUTO_ARCHIVE_DAYS) {
        setDocumentNonBlocking(
          doc(firestore, 'bookings', b.id),
          { archived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user?.uid },
          { merge: true }
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, firestore]);

  const allSelected = activeBookings.length > 0 && activeBookings.every((b) => selectedIds.has(b.id));
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(activeBookings.map((b) => b.id)));

  return (
    <>
      <PageHeader title="Client Bookings" description="Active bookings for this client. Cleared bookings move to Travel History.">
        <div className="flex gap-2">
          {archivedCount > 0 && (
            <Button variant="outline" asChild>
              <Link href={`/clients/${clientId}/history`}>
                <Archive className="mr-2 h-4 w-4" />
                Travel History ({archivedCount})
              </Link>
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setPrintBookings(activeBookings.filter((b) => selectedIds.has(b.id)));
                setPrintSettingsOpen(true);
              }}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print Selected ({selectedIds.size})
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!client || activeBookings.length === 0}
            onClick={() => { setPrintBookings(activeBookings); setPrintSettingsOpen(true); }}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print All
          </Button>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button disabled={!client}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New Booking
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </PageHeader>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 gap-0">
          <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">
            <DialogTitle>Create New Booking</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            {client && (
              <BookingForm
                onSubmit={handleAddBooking}
                clientId={client.id}
                clientName={client.name}
              />
            )}
          </div>
          <DialogFooter className="sticky bottom-0 z-20 bg-background border-t px-6 py-4 mt-0">
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button type="submit" form="booking-form">Create Booking</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all bookings"
                      disabled={activeBookings.length === 0}
                    />
                  </TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Itinerary</TableHead>
                  <TableHead>Dates</TableHead>
                  {canViewRevenue && <TableHead className="text-right">Customer</TableHead>}
                  {canViewRevenue && <TableHead className="text-right">Cost</TableHead>}
                  {canViewRevenue && <TableHead className="text-right">Profit</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({length: 3}).map((_, i) => <BookingRowSkeleton key={i} />)}
                {!isLoading && activeBookings.map((booking) => {
                  const ref = bookingReference(booking);
                  const detailEntries = buildDetailEntries(booking);
                  const cleared = isCleared(booking);
                  return (
                  <Fragment key={booking.id}>
                  <TableRow data-state={selectedIds.has(booking.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(booking.id)}
                        onCheckedChange={() => toggleOne(booking.id)}
                        aria-label={`Select booking ${ref ? ref.value : ''}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{ref ? ref.value : '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <ItineraryIcon type={booking.bookingType} />
                        {booking.bookingType === 'car'
                          ? 'Transfer'
                          : booking.bookingType
                            ? booking.bookingType.charAt(0).toUpperCase() + booking.bookingType.slice(1)
                            : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>{formatBookingDates(booking)}</TableCell>
                    {canViewRevenue && <TableCell className="text-right">₹{(booking.total || 0).toLocaleString()}</TableCell>}
                    {canViewRevenue && <TableCell className="text-right text-muted-foreground">₹{(booking.supplierCost || 0).toLocaleString()}</TableCell>}
                    {canViewRevenue && (() => {
                      const p = booking.profit ?? ((booking.total || 0) - (booking.supplierCost || 0));
                      return (
                        <TableCell className={`text-right font-semibold ${p >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₹{p.toLocaleString()}
                        </TableCell>
                      );
                    })()}
                    <TableCell>
                      <Badge
                        variant={
                          booking.status === 'confirmed'
                            ? 'default'
                            : booking.status === 'pending' || booking.status === 'hold'
                            ? 'secondary'
                            : 'destructive'
                        }
                        className={
                          booking.status === 'confirmed'
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : booking.status === 'pending' || booking.status === 'hold'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                            : booking.status === 'cancelled'
                            ? 'bg-red-100 text-red-800 border-red-200'
                            : ''
                        }
                      >
                        {booking.status === 'hold' || booking.status === 'pending' ? 'Hold' : booking.status}
                      </Badge>
                      {booking.status === 'cancelled' && booking.refundStatus && (booking.refundAmount ?? 0) > 0 && (
                        <div className={`mt-1 text-xs ${booking.refundStatus === 'processed' ? 'text-green-600' : 'text-yellow-700'}`}>
                          {booking.refundStatus === 'processed' ? 'Refunded' : 'Refund pending'} ₹{(booking.refundAmount ?? 0).toLocaleString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Open booking actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditingBooking(booking)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setPaymentsBooking(booking)}>
                            <Wallet className="mr-2 h-4 w-4" />
                            Payments
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setPrintBookings([booking]); setPrintSettingsOpen(true); }}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!cleared}
                            onSelect={() => cleared && handleArchive(booking)}
                            title={cleared ? undefined : 'Clear the full payment before archiving'}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            {cleared ? 'Archive to Travel History' : 'Archive (payment pending)'}
                          </DropdownMenuItem>
                          {booking.status === 'cancelled' ? (
                            <DropdownMenuItem onSelect={() => setCancelBooking(booking)}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Refund
                              {booking.refundStatus === 'pending' && <span className="ml-auto text-xs text-yellow-700">pending</span>}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="text-destructive" onSelect={() => setCancelBooking(booking)}>
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancel / Refund
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  {detailEntries.length > 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={canViewRevenue ? 9 : 6} className="pt-0">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 text-xs">
                          {detailEntries.map((entry) => {
                            if (entry.isTable && Array.isArray(entry.value)) {
                              const cols = entry.columns ?? [
                                { key: 'from', label: 'From' },
                                { key: 'to', label: 'To' },
                                { key: 'date', label: 'Date' },
                              ];
                              return (
                                <div key={entry.label} className="col-span-2 sm:col-span-4">
                                  <span className="text-muted-foreground font-medium">{entry.label}: </span>
                                  <table className="mt-2 w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-border">
                                        {cols.map((c) => (
                                          <th key={c.key} className="py-1 px-2 text-muted-foreground font-medium">{c.label}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {entry.value.map((row: any, idx: number) => (
                                        <tr key={idx} className="border-b border-border/50 last:border-0">
                                          {cols.map((c) => (
                                            <td key={c.key} className="py-1 px-2">{row[c.key]}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            }
                            return (
                              <div key={entry.label} className="min-w-0">
                                <span className="text-muted-foreground">{entry.label}: </span>
                                <span className="text-foreground break-words">{entry.value}</span>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {!isLoading && activeBookings.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                {archivedCount > 0
                  ? <>No active bookings. {archivedCount} archived booking{archivedCount > 1 ? 's' : ''} in <Link href={`/clients/${clientId}/history`} className="underline">Travel History</Link>.</>
                  : 'No bookings found for this client.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingBooking} onOpenChange={(open) => !open && setEditingBooking(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 gap-0">
          <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4"><DialogTitle>Edit Booking</DialogTitle></DialogHeader>
          <div className="px-6 py-4">
            {editingBooking && client && (
              <BookingForm
                booking={editingBooking}
                onSubmit={handleUpdateBooking}
                clientId={client.id}
                clientName={client.name}
              />
            )}
          </div>
          <DialogFooter className="sticky bottom-0 z-20 bg-background border-t px-6 py-4 mt-0">
            <Button variant="outline" onClick={() => setEditingBooking(null)}>Cancel</Button>
            <Button type="submit" form="booking-form">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintSettingsDialog
        open={printSettingsOpen}
        onOpenChange={setPrintSettingsOpen}
        settings={printSettings}
        onSettingsChange={setPrintSettings}
        onPrint={handlePrint}
      />

      <PaymentsDialog
        booking={paymentsBooking ? (bookings?.find((b) => b.id === paymentsBooking.id) ?? paymentsBooking) : null}
        client={client ?? null}
        onOpenChange={(open) => { if (!open) setPaymentsBooking(null); }}
      />

      <CancelRefundDialog
        booking={cancelBooking ? (bookings?.find((b) => b.id === cancelBooking.id) ?? cancelBooking) : null}
        onOpenChange={(open) => { if (!open) setCancelBooking(null); }}
      />

      {/* Hidden printable content — a single booking when printing one row, else all */}
      <div className="print-content hidden" ref={printContentRef}>
        {client && bookings && (
          <PrintableBookings
            client={client}
            bookings={printBookings ?? activeBookings}
            settings={printSettings}
          />
        )}
      </div>
    </>
  );
}
