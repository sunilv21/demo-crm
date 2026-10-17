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
  FileSpreadsheet,
  FileText,
  XCircle,
  RotateCcw,
  Mail,
  MessageCircle,
  Wallet,
  Trash2,
  Upload,
  CalendarIcon,
  X,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Booking, Client, Hotel, User } from '@/lib/types';
import { formatBookingDates, bookingMadeDate, paxCount, flightHotelSummary } from '@/lib/booking-details';
import { isPackageComponent, isPackagePrimary, packageComponentsOf, packageAwareProfit } from '@/lib/booking-package';
import { PackageCostIndicator } from '@/components/bookings/package-cost-indicator';
import { EditBookingDateDialog } from '@/components/bookings/edit-booking-date-dialog';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingForm } from '@/components/forms/booking-form';
import { PrintableBookings } from '@/components/bookings/printable-bookings';
import { PrintSettingsDialog, defaultSettings, type PrintSettings } from '@/components/bookings/print-settings-dialog';
import { printContentHtml, pdfTitle } from '@/lib/print';
import { downloadBase64File } from '@/lib/download-file';
import { downloadCsv } from '@/lib/csv-export';
import { buildVoucherInput } from '@/lib/voucher-types';
import { generateBookingVoucherDocx } from '@/app/actions/voucher-docx';
import { generateBookingVoucherPdf } from '@/app/actions/voucher-pdf';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';
import { query, doc, collection, where, orderBy, limit, getDoc, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { CancelRefundDialog } from '@/components/bookings/cancel-refund-dialog';
import { EmailVoucherDialog } from '@/components/bookings/email-voucher-dialog';
import { WhatsAppVoucherDialog } from '@/components/bookings/whatsapp-voucher-dialog';
import { PaymentsDialog } from '@/components/bookings/payments-dialog';
import { BookingDetailsDialog } from '@/components/bookings/booking-details-dialog';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { ImportBookingsDialog } from '@/components/bookings/import-bookings-dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { clientSlug } from '@/lib/utils';

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

// Supplier name lives in different places depending on booking type: a
// top-level field for flight/hotel/visa, but tucked into bookingDetails for
// activity (supplierName) and car/transfer (rentalCompany) since those are
// captured via type-specific form fields rather than the shared one.
const supplierFor = (b: Booking) => {
  if (b.supplierName) return b.supplierName;
  const d = b.bookingDetails || {};
  if (b.bookingType === 'car') return d.rentalCompany || '';
  return d.supplierName || d.supplier || '';
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
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell><MoreHorizontal className="h-4 w-4" /></TableCell>
    </TableRow>
);


export default function BookingsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { canViewRevenue, isAdminOrManager, isAdmin, isAgent, role } = useAppUser();
  // Mirrors canUseEmail() in firestore.rules — employee/finance can't read
  // mailboxes, so the Email Voucher action (which queries that collection)
  // must stay hidden for them, not just fail silently when clicked.
  const canUseEmail = role === 'admin' || role === 'manager' || role === 'agent';
  const { toast } = useToast();
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('All');
  // Defaults to the current month so Revenue/table both open scoped there;
  // "All Time" in the Month filter below clears it back to undefined.
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  }));
  const [agentFilter, setAgentFilter] = useState('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [isBookingFormSubmitting, setIsBookingFormSubmitting] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
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
  // 'download' (.docx), 'email', or 'pdf' — all three reuse the exact same
  // generation flow below (incl. the hotel-terms lookup), branching only on
  // what to do with the result: 'email' routes it into EmailVoucherDialog,
  // 'pdf' calls generateBookingVoucherPdf (a real PDF via @react-pdf/renderer,
  // not the browser print dialog) and downloads it directly, same as
  // 'download' already does for the .docx.
  const [voucherMode, setVoucherMode] = useState<'download' | 'email' | 'pdf'>('download');
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

  // Payments: collect/record installments against a booking (same dialog the
  // client's Bookings page already uses).
  const [paymentsBooking, setPaymentsBooking] = useState<Booking | null>(null);
  const paymentsClientRef = useMemoFirebase(
    () => (firestore && paymentsBooking?.clientId ? doc(firestore, 'clients', paymentsBooking.clientId) : null),
    [firestore, paymentsBooking?.clientId]
  );
  const { data: paymentsClient } = useDoc<Client>(paymentsClientRef);

  // Correct the "Booking Created date" for a booking entered into the
  // system late — writes `bookingDateOverride`, leaving the real
  // `createdAt` audit field untouched (shared with Finance → Reconciliation).
  const [dateEditTarget, setDateEditTarget] = useState<Booking | null>(null);
  const saveBookingDate = (date: string) => {
    if (!firestore || !dateEditTarget) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', dateEditTarget.id), {
      bookingDateOverride: date,
      bookingDateOverrideAt: serverTimestamp(),
      bookingDateOverrideBy: user?.uid ?? null,
      bookingDateOverrideByName: user?.displayName || user?.email?.split('@')[0] || 'Staff',
      updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    });
    toast({ title: 'Booking date updated' });
  };

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

  const voucherPdfFor = (booking: Booking) => {
    setVoucherMode('pdf');
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
        const result = voucherMode === 'pdf' ? await generateBookingVoucherPdf(input) : await generateBookingVoucherDocx(input);
        if (cancelled) return;
        if ('error' in result) {
          toast({ variant: 'destructive', title: 'Could not generate voucher', description: result.error });
        } else if (voucherMode === 'email') {
          setEmailVoucherState({
            booking: voucherBooking,
            client: voucherClient ?? null,
            attachment: { base64: result.base64, filename: result.filename },
          });
        } else if (voucherMode === 'pdf') {
          downloadBase64File(result.base64, result.filename, 'application/pdf');
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

  // Server-side bounded loading: fetch the newest N bookings, "Load more"
  // raises the cap. Deliberately NOT range-filtered by `createdAt` at the
  // query level — a booking entered today can be backdated to a previous
  // month via `bookingDateOverride` (the "add a late entry" flow), and that
  // override isn't a queryable Firestore field. Filtering by `createdAt`
  // here would silently exclude such bookings from whichever month they were
  // corrected into. Instead: fetch the newest bookings uniformly, and do all
  // month/date-range attribution client-side below via the override-aware
  // `bookingMadeDate` (see matchesDateRange), same as the Revenue page.
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

  // A non-admin agent is also credited (via agentId) for bookings a teammate
  // entered on their behalf — they still own the pricing, so they should see
  // those too, not just the ones they personally typed in. Merged with the
  // createdBy query above. Composite index: agentId(ASC) + createdAt(DESC).
  const agentIdBookingsQuery = useMemoFirebase(() => {
    if (!firestore || isAdminOrManager || !user) return null;
    return query(
      collection(firestore, 'bookings'),
      where('agentId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(loadLimit)
    );
  }, [firestore, isAdminOrManager, user, loadLimit]);

  const { data: ownBookings, isLoading: isLoadingOwnBookings } = useCollection<Booking>(bookingsQuery);
  const { data: agentIdBookings, isLoading: isLoadingAgentIdBookings } = useCollection<Booking>(agentIdBookingsQuery);
  const isLoading = isLoadingOwnBookings || isLoadingAgentIdBookings;
  const bookings = useMemo(() => {
    if (isAdminOrManager) return ownBookings;
    const byId = new Map<string, Booking>();
    for (const b of ownBookings ?? []) byId.set(b.id, b);
    for (const b of agentIdBookings ?? []) byId.set(b.id, b);
    return [...byId.values()];
  }, [ownBookings, agentIdBookings, isAdminOrManager]);
  const mayHaveMore = (ownBookings?.length ?? 0) >= loadLimit || (agentIdBookings?.length ?? 0) >= loadLimit;

  // Agent filter dropdown: only meaningful for admin/manager (agents already
  // only ever see their own bookings, both server- and client-side above).
  const agentUsersQuery = useMemoFirebase(
    () => (firestore && !canViewRevenue ? query(collection(firestore, 'users'), where('role', '==', 'agent')) : null),
    [firestore, canViewRevenue]
  );
  const { data: agentUsers } = useCollection<User>(agentUsersQuery);

  const matchesDateRange = (booking: Booking, range: DateRange | undefined) => {
    if (!range?.from && !range?.to) return true;
    const d = bookingMadeDate(booking);
    if (!d) return false;
    if (range.from && d < startOfDay(range.from)) return false;
    if (range.to && d > endOfDay(range.to)) return false;
    return true;
  };

  useEffect(() => {
    if (!bookings) return;
    let results = bookings;
    // Agents manage only bookings that are theirs — created by them, or
    // credited to them via agentId (a teammate entered it on their behalf,
    // but they still own its pricing). Their revenue is private to them.
    if (canViewRevenue && user) {
      results = results.filter(booking => booking.createdBy === user.uid || booking.agentId === user.uid);
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
    if (bookingTypeFilter !== 'All') {
      results = results.filter(booking => booking.bookingType === bookingTypeFilter);
    }
    if (dateRange?.from || dateRange?.to) {
      results = results.filter(booking => matchesDateRange(booking, dateRange));
    }
    if (agentFilter !== 'All') {
      results = results.filter(booking => (booking.agentId || booking.createdBy) === agentFilter);
    }
    setFilteredBookings(results);
    // matchesDateRange is a stable closure recreated each render but doesn't
    // depend on anything outside this effect's own deps — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, bookingTypeFilter, dateRange, agentFilter, bookings, canViewRevenue, user?.uid]);

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

  // Admin (any booking) or an agent deleting their own — and only for
  // bookings that were added by mistake (no money collected yet — mirrored
  // by the Firestore rule). Anything with real payment history should be
  // Cancelled instead so the financial trail stays intact; this is a
  // permanent, unrecoverable delete.
  const handleDeleteBooking = () => {
    if (!firestore || !bookingToDelete) return;
    deleteDocumentNonBlocking(doc(firestore, 'bookings', bookingToDelete.id));
    toast({
      variant: 'destructive',
      title: 'Booking deleted',
      description: `The ${bookingTypeLabel(bookingToDelete.bookingType)} booking for ${bookingToDelete.clientName} has been permanently deleted.`,
    });
    setBookingToDelete(null);
  };


  // Agents only ever work with bookings that are theirs (created by them, or
  // credited to them via agentId); everyone else sees all.
  const scopedBookings = (canViewRevenue && user)
    ? (bookings || []).filter(b => b.createdBy === user.uid || b.agentId === user.uid)
    : (bookings || []);
  const hasActiveFilters = !!searchTerm || statusFilter !== 'All' || bookingTypeFilter !== 'All' || !!dateRange?.from || !!dateRange?.to || agentFilter !== 'All';
  const displayBookings = hasActiveFilters ? filteredBookings : scopedBookings;

  // Revenue / profit summary (agents only) from their confirmed bookings,
  // scoped to the Month filter (defaults to the current month) the same way
  // the Revenue page does it — via the override-aware `bookingMadeDate`
  // rather than raw `createdAt`, so a booking whose date was corrected via
  // "Edit booking date" lands in the same month on both pages, even when it
  // was entered/created in a different month.
  const revenueScoped = scopedBookings.filter(b => matchesDateRange(b, dateRange));
  const confirmedScoped = revenueScoped.filter(b => b.status === 'confirmed');
  const totalRevenue = confirmedScoped.reduce((s, b) => s + (b.total || 0), 0);
  // packageAwareProfit (not the raw total-cost subtraction) to match both the
  // per-row Profit column below and Revenue page's calculation.
  const totalProfit = confirmedScoped.reduce(
    (s, b) => s + packageAwareProfit(b, bookings ?? []),
    0
  );

  // Export the currently displayed bookings (respects search/status filters) to
  // a CSV: name, type, date, all 3 prices, status, portal.
  const handleExportCsv = () => {
    const headers = ['Customer Name', 'Booking Type', 'Booking Date', 'Customer Price', 'Cost', 'Profit', 'Status', 'Booking Portal', 'Supplier'];
    const rows = displayBookings.map((b) => {
      const start = b.startDate ? new Date(b.startDate) : null;
      const dateStr = start && !isNaN(start.getTime()) ? start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const total = b.total || 0;
      const cost = b.supplierCost || 0;
      const profit = b.profit ?? (total - cost);
      const status = b.status === 'hold' || b.status === 'pending' ? 'Hold' : (b.status || '');
      return [b.clientName || '', bookingTypeLabel(b.bookingType), dateStr, total, cost, profit, status, b.bookingPortal || '', supplierFor(b)];
    });
    downloadCsv('Bookings_Export.csv', headers, rows);
  };

  // Quick "select the month directly" filter — sets dateRange to that whole
  // calendar month's bounds so it flows through the exact same
  // matchesDateRange logic as the custom calendar picker and Revenue below.
  const monthFilterOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: i === 0 ? 'This Month' : i === 1 ? 'Last Month' : format(d, 'MMM yyyy'),
      from: startOfMonth(d),
      to: endOfMonth(d),
    };
  });
  const activeMonthOption = monthFilterOptions.find(
    (opt) =>
      dateRange?.from &&
      dateRange?.to &&
      isSameDay(opt.from, dateRange.from) &&
      isSameDay(opt.to, dateRange.to)
  );
  const monthFilterLabel = !dateRange?.from && !dateRange?.to
    ? 'All Time'
    : activeMonthOption
      ? activeMonthOption.label
      : 'Custom Range';

  return (
    <>
      <PageHeader title="Booking Management">
        <div className="flex gap-2">
          {canViewRevenue && (
            <Button
              variant="outline"
              disabled={displayBookings.length === 0}
              onClick={handleExportCsv}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export Data
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
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
                    onSubmittingChange={setIsBookingFormSubmitting}
                  />
                </div>

                <DialogFooter className="sticky bottom-0 z-20 bg-background border-t px-6 py-4 mt-0">
                  <Button
                    variant="outline"
                    onClick={() => setIsFormOpen(false)}
                  >
                    Cancel
                  </Button>

                  <Button type="submit" form="booking-form" disabled={isBookingFormSubmitting}>
                    Create Booking
                  </Button>
                </DialogFooter>

            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>
      <div className={`grid gap-4 mb-8 ${canViewRevenue ? 'md:grid-cols-2 lg:grid-cols-5' : 'md:grid-cols-2'}`}>
        <StatCard title="New Bookings Today" value={isLoading ? "..." : (displayBookings?.length || 0).toString()} />
        <StatCard title="Upcoming Departures" value={isLoading ? "..." : (displayBookings?.filter(b => new Date(b.startDate) > new Date()).length || 0).toString()} />
        {canViewRevenue && (
          <StatCard title={`Revenue (${monthFilterLabel})`} value={isLoading ? "..." : `₹${totalRevenue.toLocaleString()}`} variant="warning" />
        )}
        {canViewRevenue && (
          <StatCard title={`Profit (${monthFilterLabel})`} value={isLoading ? "..." : `₹${totalProfit.toLocaleString()}`} variant="success" />
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
                  Type: {bookingTypeFilter === 'All' ? 'All' : bookingTypeLabel(bookingTypeFilter)} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setBookingTypeFilter('All')}>All</DropdownMenuItem>
                {(['flight', 'hotel', 'car', 'activity', 'visa', 'other'] as const).map((type) => (
                  <DropdownMenuItem key={type} onSelect={() => setBookingTypeFilter(type)}>{bookingTypeLabel(type)}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto">
                  Month: {monthFilterLabel} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setDateRange(undefined)}>All Time</DropdownMenuItem>
                {monthFilterOptions.map((opt) => (
                  <DropdownMenuItem key={opt.key} onSelect={() => setDateRange({ from: opt.from, to: opt.to })}>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto justify-between">
                  <span className="flex items-center">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>{format(dateRange.from, 'dd MMM yy')} – {format(dateRange.to, 'dd MMM yy')}</>
                      ) : (
                        <>{format(dateRange.from, 'dd MMM yy')} – …</>
                      )
                    ) : (
                      'Custom range'
                    )}
                  </span>
                  {(dateRange?.from || dateRange?.to) ? (
                    <X
                      className="ml-2 h-4 w-4 opacity-70 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }}
                    />
                  ) : (
                    <ChevronDown className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  captionLayout="buttons"
                  initialFocus
                />
                <div className="flex justify-end border-t p-2">
                  <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)} disabled={!dateRange?.from && !dateRange?.to}>
                    Clear
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {!canViewRevenue && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full md:w-auto">
                    Agent: {agentFilter === 'All' ? 'All' : (agentUsers ?? []).find((a) => a.id === agentFilter)?.name ?? 'Unknown'} <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setAgentFilter('All')}>All</DropdownMenuItem>
                  {(agentUsers ?? []).map((a) => (
                    <DropdownMenuItem key={a.id} onSelect={() => setAgentFilter(a.id)}>{a.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
      <div className="bg-card border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking Created</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Itinerary</TableHead>
              <TableHead>Flight/Hotel</TableHead>
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
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span>{(() => { const d = bookingMadeDate(booking); return d ? format(d, 'dd MMM yyyy') : '—'; })()}</span>
                    {booking.bookingDateOverride && <span className="text-[10px]" title="Corrected">(corrected)</span>}
                    <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" title="Edit booking date" aria-label="Edit booking date" onClick={() => setDateEditTarget(booking)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{booking.bookingPortal || supplierFor(booking) || '—'}</TableCell>
                <TableCell>
                  {booking.clientId ? (
                    <Link
                      href={`/clients/${clientSlug(booking.clientName ?? '', booking.clientId)}`}
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
                  {paxCount(booking) > 0 && <span className="ml-1 text-muted-foreground">· {paxCount(booking)} pax</span>}
                  {isPackageComponent(booking) && (
                    <Badge variant="secondary" className="ml-1.5 bg-purple-100 text-purple-800 border-purple-200">Package</Badge>
                  )}
                  {isPackagePrimary(booking) && (() => {
                    const included = packageComponentsOf(booking, bookings ?? []);
                    return included.length > 0 ? (
                      <Badge variant="secondary" className="ml-1.5 bg-purple-100 text-purple-800 border-purple-200">
                        +{included.length} in package
                      </Badge>
                    ) : null;
                  })()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{flightHotelSummary(booking)}</TableCell>
                <TableCell>{formatBookingDates(booking)}</TableCell>
                {canViewRevenue && isPackageComponent(booking) ? (
                  <TableCell colSpan={3} className="text-center">
                    <PackageCostIndicator booking={booking} />
                  </TableCell>
                ) : canViewRevenue ? (
                  <>
                    <TableCell className="text-right">₹{(booking.total || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-muted-foreground">₹{(booking.supplierCost || 0).toLocaleString()}</TableCell>
                    {(() => {
                      const p = packageAwareProfit(booking, bookings ?? []);
                      return (
                        <TableCell className={`text-right font-semibold ${p >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₹{p.toLocaleString()}
                        </TableCell>
                      );
                    })()}
                  </>
                ) : null}
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
                      <DropdownMenuItem onSelect={() => setViewingBooking(booking)}>
                        <Eye className="mr-2 h-4 w-4" />View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditingBooking(booking)}>
                        <Pencil className="mr-2 h-4 w-4" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPaymentsBooking(booking)}>
                        <Wallet className="mr-2 h-4 w-4" />Payments
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
                          {generatingVoucher && voucherBooking?.id === booking.id && voucherMode === 'download' ? 'Generating…' : 'Voucher'}
                        </DropdownMenuItem>
                      )}
                      {booking.bookingType === 'hotel' && (
                        <DropdownMenuItem
                          onSelect={() => voucherPdfFor(booking)}
                          disabled={generatingVoucher && voucherBooking?.id === booking.id}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          {generatingVoucher && voucherBooking?.id === booking.id && voucherMode === 'pdf' ? 'Generating…' : 'Voucher (PDF)'}
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
                      {(isAdmin || (isAgent && booking.createdBy === user?.uid)) && (() => {
                        const hasMoney = (booking.amountPaid || 0) > 0;
                        const blocksPackage = isPackagePrimary(booking) && packageComponentsOf(booking, bookings ?? []).length > 0;
                        if (hasMoney || blocksPackage) {
                          return (
                            <DropdownMenuItem disabled className="text-muted-foreground">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete {hasMoney ? '(has payments — cancel instead)' : '(remove package first)'}
                            </DropdownMenuItem>
                          );
                        }
                        return (
                          <DropdownMenuItem onSelect={() => setBookingToDelete(booking)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />Delete
                          </DropdownMenuItem>
                        );
                      })()}
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
            {hasActiveFilters && (
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
                onSubmittingChange={setIsBookingFormSubmitting}
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

            <Button type="submit" form="booking-form" disabled={isBookingFormSubmitting}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelRefundDialog
        booking={bookingToCancel ? (bookings?.find((b) => b.id === bookingToCancel.id) ?? bookingToCancel) : null}
        onOpenChange={(open) => { if (!open) setBookingToCancel(null); }}
      />

      <ImportBookingsDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
      />

      <ConfirmDeleteDialog
        open={!!bookingToDelete}
        onOpenChange={(open) => !open && setBookingToDelete(null)}
        onConfirm={handleDeleteBooking}
        confirmText={bookingToDelete?.clientName || ''}
        title="Delete this booking?"
        description={
          <>
            This action cannot be undone. This will permanently delete the{' '}
            {bookingToDelete ? bookingTypeLabel(bookingToDelete.bookingType) : ''} booking for{' '}
            <span className="font-semibold text-foreground">{bookingToDelete?.clientName}</span>
            {bookingToDelete?.destination ? ` to ${bookingToDelete.destination}` : ''}. Use this only for
            bookings added by mistake — anything with real payment history should be Cancelled instead so
            the financial trail stays intact.
          </>
        }
      />

      <BookingDetailsDialog
        booking={viewingBooking}
        onOpenChange={(open) => !open && setViewingBooking(null)}
        canViewRevenue={canViewRevenue}
        allBookings={bookings ?? []}
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

      <PaymentsDialog
        booking={paymentsBooking ? (bookings?.find((b) => b.id === paymentsBooking.id) ?? paymentsBooking) : null}
        client={paymentsClient ?? null}
        onOpenChange={(open) => { if (!open) setPaymentsBooking(null); }}
      />

      <EditBookingDateDialog
        open={!!dateEditTarget}
        onOpenChange={(o) => !o && setDateEditTarget(null)}
        booking={dateEditTarget}
        onSubmit={saveBookingDate}
      />

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
