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
  XCircle,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import type { Booking, Client } from '@/lib/types';
import { formatBookingDates } from '@/lib/booking-details';
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingForm } from '@/components/forms/booking-form';
import { PrintableBookings } from '@/components/bookings/printable-bookings';
import { PrintSettingsDialog, defaultSettings, type PrintSettings } from '@/components/bookings/print-settings-dialog';
import { printContentHtml } from '@/lib/print';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { query, doc, collection, serverTimestamp, where } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
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
  const { canViewRevenue, isAdminOrManager } = useAppUser();
  const { toast } = useToast();
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [printBooking, setPrintBooking] = useState<Booking | null>(null);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultSettings);
  const printRef = useRef<HTMLDivElement>(null);

  // Load the client of the booking being printed, for the voucher header.
  const printClientRef = useMemoFirebase(
    () => (firestore && printBooking?.clientId ? doc(firestore, 'clients', printBooking.clientId) : null),
    [firestore, printBooking?.clientId]
  );
  const { data: printClient } = useDoc<Client>(printClientRef);
  const printClientResolved: Client | null = printBooking
    ? printClient ?? ({ id: printBooking.clientId, name: printBooking.clientName } as Client)
    : null;

  const handlePrint = () => {
    setPrintSettingsOpen(false);
    // Give the hidden content a tick to reflect the latest settings/booking.
    setTimeout(() => {
      if (printRef.current) printContentHtml(printRef.current.innerHTML);
    }, 50);
  };

  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    // Non-admins may only list bookings they created (server-enforced).
    if (!isAdminOrManager) {
      if (!user) return null;
      return query(collection(firestore, 'bookings'), where('createdBy', '==', user.uid));
    }
    return collection(firestore, 'bookings');
  }, [firestore, isAdminOrManager, user]);

  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);

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

  const handleConfirmCancel = () => {
      if (!firestore || !bookingToCancel || !user) return;
      const bookingRef = doc(firestore, 'bookings', bookingToCancel.id);
      setDocumentNonBlocking(bookingRef, { status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
      toast({ variant: 'destructive', title: "Booking Cancelled", description: "The booking has been cancelled." });
      setBookingToCancel(null);
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
                      <Button variant="ghost" size="icon">
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
                      <DropdownMenuItem onSelect={() => setBookingToCancel(booking)} className="text-destructive">
                        <XCircle className="mr-2 h-4 w-4" />Cancel
                      </DropdownMenuItem>
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
       <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
        <div>Showing {displayBookings.length} of {scopedBookings.length}</div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">2</PaginationLink>
            </PaginationItem>
             <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
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
      
      <AlertDialog open={!!bookingToCancel} onOpenChange={(open) => !open && setBookingToCancel(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will cancel the booking for {bookingToCancel?.clientName}. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Back</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive hover:bg-destructive/90">
                    Confirm Cancellation
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PrintSettingsDialog
        open={printSettingsOpen}
        onOpenChange={setPrintSettingsOpen}
        settings={printSettings}
        onSettingsChange={setPrintSettings}
        onPrint={handlePrint}
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
