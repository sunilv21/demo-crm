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
  Download,
  FileText,
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
import type { Booking, Client, Hotel } from '@/lib/types';
import { buildDetailEntries, bookingReference, formatBookingDates } from '@/lib/booking-details';
import { Fragment, useState, useRef, useEffect } from 'react';
import { differenceInDays } from 'date-fns';
import { PrintSettingsDialog, defaultSettings, type PrintSettings } from '@/components/bookings/print-settings-dialog';
import { PrintableBookings } from '@/components/bookings/printable-bookings';
import { printContentHtml, pdfTitle } from '@/lib/print';
import { downloadBase64File } from '@/lib/download-file';
import { buildVoucherInput } from '@/lib/voucher-types';
import { generateBookingVoucherDocx } from '@/app/actions/voucher-docx';
import { PaymentsDialog } from '@/components/bookings/payments-dialog';
import { CancelRefundDialog } from '@/components/bookings/cancel-refund-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingForm } from '@/components/forms/booking-form';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, query, where, serverTimestamp, getDoc } from 'firebase/firestore';
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

  // The printable content (PrintableBookings) carries its own scoped .inv-*
  // styles, so the shared helper only needs to add the A4 page frame.
  const printHtml = () => document.querySelector('.print-content')?.innerHTML ?? null;

  // One booking selected from a row menu names the file after the client;
  // printing several at once is a combined summary.
  const printTitle = () =>
    pdfTitle(printBookings && printBookings.length === 1 ? 'Booking' : 'Bookings', client?.name);

  const handlePrint = () => {
    const html = printHtml();
    if (!html) return;
    setPrintSettingsOpen(false);
    printContentHtml(html);
  };

  // Same print engine, titled so the browser's "Save as PDF" destination
  // pre-fills a sensible filename instead of the page URL.
  const handleDownloadPdf = () => {
    const html = printHtml();
    if (!html) return;
    setPrintSettingsOpen(false);
    printContentHtml(html, { title: printTitle() });
  };

  // Row action: save a single booking as a PDF, skipping the settings dialog.
  const downloadPdfFor = (booking: Booking) => {
    setPrintBookings([booking]);
    // Let the hidden content re-render with just this booking. The client doc is
    // already loaded on this page, so no extra wait is needed.
    setTimeout(() => {
      const html = printHtml();
      if (html) printContentHtml(html, { title: pdfTitle('Booking', client?.name) });
    }, 50);
  };

  // Voucher generation: a real .docx via the server action, auto-formatted by
  // the booking's type (Hotel/Flight/Visa/Service). The client doc is already
  // loaded on this page, so no separate wait is needed here.
  const [generatingVoucherId, setGeneratingVoucherId] = useState<string | null>(null);
  const downloadVoucherFor = async (booking: Booking) => {
    setGeneratingVoucherId(booking.id);
    try {
      console.log("booking.startDate =", booking.startDate);
      console.log("booking.endDate =", booking.endDate);
      console.log("booking.createdAt =", booking.createdAt?.toDate?.());
      const input = buildVoucherInput(booking, client ?? null);
      // Hotel Master: if this booking is linked to a saved hotel, pull its own
      // Terms & Conditions onto the voucher.
      const hotelId = booking.bookingDetails?.hotelId;
      if (firestore && hotelId) {
        const hotelSnap = await getDoc(doc(firestore, 'hotels', String(hotelId)));
        if (hotelSnap.exists()) {
          const hotel = hotelSnap.data() as Hotel;
          input.hotelTermsAndConditions = hotel.termsAndConditions;
          input.hotelNotes = hotel.notes;
        }
      }
      const result = await generateBookingVoucherDocx(input);
      if ('error' in result) {
        toast({ variant: 'destructive', title: 'Could not generate voucher', description: result.error });
      } else {
        downloadBase64File(result.base64, result.filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }
    } finally {
      setGeneratingVoucherId(null);
    }
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
                          <DropdownMenuItem onSelect={() => downloadPdfFor(booking)}>
                            <Download className="mr-2 h-4 w-4" />
                            Download PDF
                          </DropdownMenuItem>
                          {booking.bookingType === 'hotel' && (
                            <DropdownMenuItem
                              onSelect={() => downloadVoucherFor(booking)}
                              disabled={generatingVoucherId === booking.id}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              {generatingVoucherId === booking.id ? 'Generating…' : 'Voucher'}
                            </DropdownMenuItem>
                          )}
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
                          {detailEntries.map((entry, entryIdx) => {
                            if (entry.isTable && Array.isArray(entry.value)) {
                              const cols = entry.columns ?? [
                                { key: 'from', label: 'From' },
                                { key: 'to', label: 'To' },
                                { key: 'date', label: 'Date' },
                              ];
                              return (
                                <div key={`${entry.label}-${entryIdx}`} className="col-span-2 sm:col-span-4">
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
                              <div key={`${entry.label}-${entryIdx}`} className="min-w-0">
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
        onDownloadPdf={handleDownloadPdf}
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
