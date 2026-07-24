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
import {
  PlusCircle,
  Search,
  MoreHorizontal,
  ChevronDown,
  Plane,
  Flag,
  Bed,
  Car,
  Stamp,
  Eye,
  Pencil,
  Printer,
  Download,
  FileText,
  XCircle,
  RotateCcw,
  Mail,
  MessageCircle,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Booking, Client, Hotel } from '@/lib/types';
import { formatBookingDates } from '@/lib/booking-details';
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingForm } from '@/components/forms/booking-form';
import { PrintableBookings } from '@/components/bookings/printable-bookings';
import { PrintSettingsDialog, defaultSettings, type PrintSettings } from '@/components/bookings/print-settings-dialog';
import { printContentHtml, pdfTitle } from '@/lib/print';
import { downloadBase64File } from '@/lib/download-file';
import { buildVoucherInput } from '@/lib/voucher-types';
import { generateBookingVoucherDocx } from '@/app/actions/voucher-docx';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { query, doc, collection, where, orderBy, limit, getDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { CancelRefundDialog } from '@/components/bookings/cancel-refund-dialog';
import { EmailVoucherDialog } from '@/components/bookings/email-voucher-dialog';
import { WhatsAppVoucherDialog } from '@/components/bookings/whatsapp-voucher-dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

const ItineraryIcon = ({ type }: { type?: string }) => {
  switch (type) {
    case 'flight': return <Plane className="mr-2 h-4 w-4 text-muted-foreground" />;
    case 'hotel': return <Bed className="mr-2 h-4 w-4 text-muted-foreground" />;
    case 'car': return <Car className="mr-2 h-4 w-4 text-muted-foreground" />;
    case 'activity': return <Flag className="mr-2 h-4 w-4 text-muted-foreground" />;
    case 'visa': return <Stamp className="mr-2 h-4 w-4 text-muted-foreground" />;
    default: return null;
  }
};

const bookingTypeLabel = (type?: string) =>
  type === 'car'
    ? 'Transfer'
    : type
      ? type.charAt(0).toUpperCase() + type.slice(1)
      : 'N/A';

const BookingRowSkeleton = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell><MoreHorizontal className="h-4 w-4" /></TableCell>
    </TableRow>
);


export default function BookingsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { canViewRevenue, isAdminOrManager, role } = useAppUser();
  // Mirrors canUseEmail() in firestore.rules — employee/finance can't read
  // mailboxes, so the Email Voucher action (which queries that collection)
  // must stay hidden for them, not just fail silently when clicked.
  const canUseEmail = role === 'admin' || role === 'manager' || role === 'agent';
  const { toast } = useToast();
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [printBooking, setPrintBooking] = useState<Booking | null>(null);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [pendingPdf, setPendingPdf] = useState(false);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultSettings);
  const printRef = useRef<HTMLDivElement>(null);

  // Load the client of the booking being printed, for the voucher header.
  const printClientRef = useMemoFirebase(
    () => (firestore && printBooking?.clientId ? doc(firestore, 'clients', printBooking.clientId) : null),
    [firestore, printBooking?.clientId]
  );
  const { data: printClient, isLoading: isPrintClientLoading } = useDoc<Client>(printClientRef);
  const printClientResolved: Client | null = printBooking
    ? printClient ?? ({ id: printBooking.clientId, name: printBooking.clientName } as Client)
    : null;

  // Give the hidden content a tick to reflect the latest settings/booking before
  // handing it to the print engine.
  const withPrintContent = (fn: (html: string) => void) => {
    setPrintSettingsOpen(false);
    setTimeout(() => {
      if (printRef.current) fn(printRef.current.innerHTML);
    }, 50);
  };

  const handlePrint = () => withPrintContent((html) => printContentHtml(html));

  // Same print engine, titled so the browser's "Save as PDF" destination
  // pre-fills a sensible filename instead of the page URL.
  const handleDownloadPdf = () =>
    withPrintContent((html) =>
      printContentHtml(html, { title: pdfTitle('Booking', printBooking?.clientName) })
    );

  // Row action: save one booking as a PDF without going through the settings
  // dialog (uses whatever print settings are currently selected).
  const downloadPdfFor = (booking: Booking) => {
    setPrintBooking(booking);
    setPendingPdf(true);
  };

  // The voucher header needs the client doc, which loads asynchronously after
  // setPrintBooking. Wait for it to settle, otherwise the PDF goes out with the
  // customer's phone/email missing.
  useEffect(() => {
    if (!pendingPdf || !printBooking || isPrintClientLoading) return;
    const t = setTimeout(() => {
      if (printRef.current) {
        printContentHtml(printRef.current.innerHTML, {
          title: pdfTitle('Booking', printBooking.clientName),
        });
      }
      setPendingPdf(false);
    }, 50);
    return () => clearTimeout(t);
  }, [pendingPdf, printBooking, isPrintClientLoading]);

  // Voucher generation: a real .docx via the server action, auto-formatted by
  // the booking's type (Hotel/Flight/Visa/Service). Reuses the same
  // wait-for-client-doc pattern as the PDF download above.
  const [voucherBooking, setVoucherBooking] = useState<Booking | null>(null);
  const [generatingVoucher, setGeneratingVoucher] = useState(false);
  // 'download' (existing behavior) or 'email' — Email Voucher reuses the
  // exact same generation flow (incl. the hotel-terms lookup below) and just
  // routes the resulting attachment into EmailVoucherDialog instead of
  // triggering a browser download.
  const [voucherMode, setVoucherMode] = useState<'download' | 'email'>('download');
  const [emailVoucherState, setEmailVoucherState] = useState<{
    booking: Booking;
    client: Client | null;
    attachment: { base64: string; filename: string };
  } | null>(null);
  const voucherClientRef = useMemoFirebase(
    () => (firestore && voucherBooking?.clientId ? doc(firestore, 'clients', voucherBooking.clientId) : null),
    [firestore, voucherBooking?.clientId]
  );
  const { data: voucherClient, isLoading: isVoucherClientLoading } = useDoc<Client>(voucherClientRef);

  // WhatsApp Voucher: unlike download/email above, the .docx is generated
  // server-side at send time (src/app/api/whatsapp/send-voucher) — the
  // dialog only needs the booking + client to prefill a recipient number.
  const [whatsappVoucherBooking, setWhatsappVoucherBooking] = useState<Booking | null>(null);
  const whatsappVoucherClientRef = useMemoFirebase(
    () => (firestore && whatsappVoucherBooking?.clientId ? doc(firestore, 'clients', whatsappVoucherBooking.clientId) : null),
    [firestore, whatsappVoucherBooking?.clientId]
  );
  const { data: whatsappVoucherClient } = useDoc<Client>(whatsappVoucherClientRef);

  const downloadVoucherFor = (booking: Booking) => {
    setVoucherMode('download');
    setVoucherBooking(booking);
    setGeneratingVoucher(true);
  };

  const emailVoucherFor = (booking: Booking) => {
    setVoucherMode('email');
    setVoucherBooking(booking);
    setGeneratingVoucher(true);
  };

  useEffect(() => {
    if (!generatingVoucher || !voucherBooking || isVoucherClientLoading) return;
    // Strict Mode double-invokes effects in dev (mount -> cleanup -> mount);
    // without this guard both invocations' async work completes and the
    // download fires twice. The cleanup flips `cancelled` before the second
    // mount's copy of this closure ever gets a chance to run.
    let cancelled = false;
    (async () => {
      try {
        const input = buildVoucherInput(voucherBooking, voucherClient ?? null);
        // Hotel Master: if this booking is linked to a saved hotel, pull its
        // own Terms & Conditions onto the voucher.
        const hotelId = voucherBooking.bookingDetails?.hotelId;
        if (firestore && hotelId) {
          const hotelSnap = await getDoc(doc(firestore, 'hotels', String(hotelId)));
          if (hotelSnap.exists()) {
            const hotel = hotelSnap.data() as Hotel;
            input.hotelTermsAndConditions = hotel.termsAndConditions;
            input.hotelNotes = hotel.notes;
          }
        }
        if (cancelled) return;
        const result = await generateBookingVoucherDocx(input);
        if (cancelled) return;
        if ('error' in result) {
          toast({ variant: 'destructive', title: 'Could not generate voucher', description: result.error });
        } else if (voucherMode === 'email') {
          setEmailVoucherState({
            booking: voucherBooking,
            client: voucherClient ?? null,
            attachment: { base64: result.base64, filename: result.filename },
          });
        } else {
          downloadBase64File(result.base64, result.filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        }
      } finally {
        if (!cancelled) {
          setGeneratingVoucher(false);
          setVoucherBooking(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // voucherClient deliberately omitted: it's a live onSnapshot listener, so a
    // second emission (even for identical data) while this effect's async work
    // is still in flight would re-run it and trigger a duplicate download —
    // same reasoning as the PDF effect above, which omits printClient too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatingVoucher, voucherBooking, isVoucherClientLoading, voucherMode]);

  // Server-side bounded loading: fetch the newest N bookings, "Load more" raises
  // the cap. Search/status filters run over the loaded set.
  const LOAD_STEP = 100;
  const [loadLimit, setLoadLimit] = useState(LOAD_STEP);

  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    // Non-admins may only list bookings they created (server-enforced).
    // Composite index: createdBy(ASC) + createdAt(DESC).
    if (!isAdminOrManager) {
      if (!user) return null;
      return query(
        collection(firestore, 'bookings'),
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(loadLimit)
      );
    }
    return query(collection(firestore, 'bookings'), orderBy('createdAt', 'desc'), limit(loadLimit));
  }, [firestore, isAdminOrManager, user, loadLimit]);

  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);
  const mayHaveMore = (bookings?.length ?? 0) >= loadLimit;

  useEffect(() => {
    if (!bookings) return;
    let results = bookings;
    // Agents manage only their own bookings (their revenue is private to them).
    if (canViewRevenue && user) {
      results = results.filter(booking => booking.createdBy === user.uid);
    }
    if (searchTerm) {
      results = results.filter(booking =>
        booking.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (booking.destination && booking.destination.toLowerCase().includes(searchTerm.toLowerCase())) ||
        `BK-${booking.id.split('-')[1]?.padStart(5, '0')}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (statusFilter !== 'All') {
      const want = statusFilter.toLowerCase();
      // 'Hold' also matches legacy 'pending' bookings.
      results = results.filter(booking =>
        booking.status === want || (want === 'hold' && booking.status === 'pending')
      );
    }
    setFilteredBookings(results);
  }, [searchTerm, statusFilter, bookings, canViewRevenue, user?.uid]);

  const handleAddBooking = (newBookingData: Omit<Booking, 'id'>) => {
    if (!firestore || !newBookingData.clientId) return;
    const bookingsCollection = collection(firestore, 'bookings');
    addDocumentNonBlocking(bookingsCollection, newBookingData);
    setIsFormOpen(false);
    toast({ title: 'Booking Created', description: `A new booking for ${newBookingData.clientName} has been created.` });
  };

  const handleUpdateBooking = (updatedData: Omit<Booking, 'id'>) => {
      if (!firestore || !editingBooking) return;
      const bookingRef = doc(firestore, 'bookings', editingBooking.id);
      setDocumentNonBlocking(bookingRef, updatedData, { merge: true });
      setEditingBooking(null);
      toast({ title: "Booking Updated", description: "The booking has been successfully updated." });
  };


  // Agents only ever work with their own bookings; everyone else sees all.
  const scopedBookings = (canViewRevenue && user)
    ? (bookings || []).filter(b => b.createdBy === user.uid)
    : (bookings || []);
  const displayBookings = searchTerm || statusFilter !== 'All' ? filteredBookings : scopedBookings;

  // Revenue / profit summary (agents only) from their confirmed bookings.
  const confirmedScoped = scopedBookings.filter(b => b.status === 'confirmed');
  const totalRevenue = confirmedScoped.reduce((s, b) => s + (b.total || 0), 0);
  const totalProfit = confirmedScoped.reduce(
    (s, b) => s + (b.profit ?? ((b.total || 0) - (b.supplierCost || 0))),
    0
  );

  return (
    <>
      <PageHeader title="Booking Management">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Booking
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 gap-0">
              <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">
                <DialogTitle>
                  Create Booking
                </DialogTitle>
              </DialogHeader>

              <div className="px-6 py-4">
                <BookingForm
                  onSubmit={handleAddBooking}
                />
              </div>

              <DialogFooter className="sticky bottom-0 z-20 bg-background border-t px-6 py-4 mt-0">
                <Button
                  variant="outline"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </Button>

                <Button type="submit" form="booking-form">
                  Create Booking
                </Button>
              </DialogFooter>

          </DialogContent>
        </Dialog>
      </PageHeader>
      <div className={`grid gap-4 mb-8 ${canViewRevenue ? 'md:grid-cols-2 lg:grid-cols-5' : 'md:grid-cols-2'}`}>
        <StatCard title="New Bookings Today" value={isLoading ? "..." : (displayBookings?.length || 0).toString()} />
        <StatCard title="Upcoming Departures" value={isLoading ? "..." : (displayBookings?.filter(b => new Date(b.startDate) > new Date()).length || 0).toString()} />
        {canViewRevenue && (
          <StatCard title="Revenue" value={isLoading ? "..." : `₹${totalRevenue.toLocaleString()}`} variant="warning" />
        )}
        {canViewRevenue && (
          <StatCard title="Profit" value={isLoading ? "..." : `₹${totalProfit.toLocaleString()}`} variant="success" />
        )}
        {canViewRevenue && (
          <StatCard title="Pending Payments" value={isLoading ? "..." : `₹${(scopedBookings.filter(b=>b.status === 'pending' || b.status === 'hold').reduce((acc, b) => acc + (b.total || 0), 0) || 0).toLocaleString()}`} />
        )}
      </div>
      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Booking ID, Customer Name, Destination..."
              className="pl-10 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto">
                  Status: {statusFilter} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {['All', 'Confirmed', 'Hold', 'Draft', 'Cancelled'].map(status => (
                    <DropdownMenuItem key={status} onSelect={() => setStatusFilter(status)}>{status}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto">
                  Booking Type <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Flight</DropdownMenuItem>
                <DropdownMenuItem>Hotel</DropdownMenuItem>
                <DropdownMenuItem>Tour</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto">
                  Date Range <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
               <DropdownMenuContent>
                <DropdownMenuItem>Last 7 Days</DropdownMenuItem>
                <DropdownMenuItem>Last 30 Days</DropdownMenuItem>
                <DropdownMenuItem>This Month</DropdownMenuItem>
                 <DropdownMenuItem>This Year</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto">
                  Agent <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Alex Doe</DropdownMenuItem>
                <DropdownMenuItem>John Smith</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div className="bg-card border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking ID</TableHead>
              <TableHead>Customer</TableHead>
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
            {isLoading && Array.from({length: 5}).map((_, i) => <BookingRowSkeleton key={i} />)}
            {!isLoading && displayBookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="font-medium">{`BK-${booking.id.slice(-5)}`}</TableCell>
                <TableCell>
                  {booking.clientId ? (
                    <Link
                      href={`/clients/${booking.clientId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {booking.clientName}
                    </Link>
                  ) : (
                    booking.clientName
                  )}
                </TableCell>
                <TableCell className="flex items-center">
                  <ItineraryIcon type={booking.bookingType} />
                  {bookingTypeLabel(booking.bookingType)}
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
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Open booking actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem asChild>
                        <Link href={`/clients/${booking.clientId}/bookings`}><Eye className="mr-2 h-4 w-4" />View Details</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditingBooking(booking)}>
                        <Pencil className="mr-2 h-4 w-4" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setPrintBooking(booking); setPrintSettingsOpen(true); }}>
                        <Printer className="mr-2 h-4 w-4" />Print
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => downloadPdfFor(booking)}>
                        <Download className="mr-2 h-4 w-4" />Download PDF
                      </DropdownMenuItem>
                      {booking.bookingType === 'hotel' && (
                        <DropdownMenuItem
                          onSelect={() => downloadVoucherFor(booking)}
                          disabled={generatingVoucher && voucherBooking?.id === booking.id}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          {generatingVoucher && voucherBooking?.id === booking.id ? 'Generating…' : 'Voucher'}
                        </DropdownMenuItem>
                      )}
                      {booking.bookingType === 'hotel' && canUseEmail && (
                        <DropdownMenuItem
                          onSelect={() => emailVoucherFor(booking)}
                          disabled={generatingVoucher && voucherBooking?.id === booking.id}
                        >
                          <Mail className="mr-2 h-4 w-4" />
                          {generatingVoucher && voucherBooking?.id === booking.id && voucherMode === 'email' ? 'Generating…' : 'Email Voucher'}
                        </DropdownMenuItem>
                      )}
                      {booking.bookingType === 'hotel' && canUseEmail && (
                        <DropdownMenuItem onSelect={() => setWhatsappVoucherBooking(booking)}>
                          <MessageCircle className="mr-2 h-4 w-4" />
                          WhatsApp Voucher
                        </DropdownMenuItem>
                      )}
                      {booking.status === 'cancelled' ? (
                        <DropdownMenuItem onSelect={() => setBookingToCancel(booking)}>
                          <RotateCcw className="mr-2 h-4 w-4" />Refund
                          {booking.refundStatus === 'pending' && <span className="ml-auto text-xs text-yellow-700">pending</span>}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setBookingToCancel(booking)} className="text-destructive">
                          <XCircle className="mr-2 h-4 w-4" />Cancel
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
         { !isLoading && displayBookings.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            No bookings found.
          </div>
        )}
      </div>
       <div className="flex flex-col items-center gap-2 mt-4 text-sm text-muted-foreground">
        <div>Showing {displayBookings.length} of {scopedBookings.length} loaded</div>
        {mayHaveMore && (
          <div className="flex flex-col items-center gap-1">
            <Button variant="outline" onClick={() => setLoadLimit((l) => l + LOAD_STEP)} disabled={isLoading}>
              {isLoading ? 'Loading…' : `Load more (${bookings?.length ?? 0} loaded)`}
            </Button>
            {(searchTerm || statusFilter !== 'All') && (
              <p className="text-xs">Search &amp; filters apply to loaded bookings — load more to widen the search.</p>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!editingBooking} onOpenChange={(open) => !open && setEditingBooking(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 gap-0">
          <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">
            <DialogTitle>Edit Booking</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            {editingBooking && (
              <BookingForm
                booking={editingBooking}
                onSubmit={handleUpdateBooking}
                clientId={editingBooking.clientId}
                clientName={editingBooking.clientName}
              />
            )}
          </div>

          <DialogFooter className="sticky bottom-0 z-20 bg-background border-t px-6 py-4 mt-0">
            <Button
              variant="outline"
              onClick={() => setEditingBooking(null)}
            >
              Cancel
            </Button>

            <Button type="submit" form="booking-form">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <CancelRefundDialog
        booking={bookingToCancel ? (bookings?.find((b) => b.id === bookingToCancel.id) ?? bookingToCancel) : null}
        onOpenChange={(open) => { if (!open) setBookingToCancel(null); }}
      />

      {emailVoucherState && (
        <EmailVoucherDialog
          booking={emailVoucherState.booking}
          client={emailVoucherState.client}
          attachment={emailVoucherState.attachment}
          open={!!emailVoucherState}
          onOpenChange={(open) => !open && setEmailVoucherState(null)}
        />
      )}

      {whatsappVoucherBooking && (
        <WhatsAppVoucherDialog
          booking={whatsappVoucherBooking}
          client={whatsappVoucherClient ?? null}
          open={!!whatsappVoucherBooking}
          onOpenChange={(open) => !open && setWhatsappVoucherBooking(null)}
        />
      )}

      <PrintSettingsDialog
        open={printSettingsOpen}
        onOpenChange={setPrintSettingsOpen}
        settings={printSettings}
        onSettingsChange={setPrintSettings}
        onPrint={handlePrint}
        onDownloadPdf={handleDownloadPdf}
      />

      {/* Hidden printable content — the single booking chosen from the row menu */}
      <div className="hidden" ref={printRef}>
        {printBooking && printClientResolved && (
          <PrintableBookings client={printClientResolved} bookings={[printBooking]} settings={printSettings} />
        )}
      </div>
    </>
  );
}
