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
  Eye,
  Pencil,
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
import type { Booking } from '@/lib/types';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingForm } from '@/components/forms/booking-form';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { collectionGroup, query, doc, collection, serverTimestamp } from 'firebase/firestore';
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

const ItineraryIcon = ({ type }: { type: string }) => {
  if (type.includes('Flight')) return <Plane className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type.includes('Tour')) return <Flag className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type.includes('Hotel')) return <Bed className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type.includes('Rental')) return <Car className="mr-2 h-4 w-4 text-muted-foreground" />;
  return null;
};

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
  const { toast } = useToast();
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);

  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collectionGroup(firestore, 'bookings'));
  }, [firestore]);

  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);

  useEffect(() => {
    if (!bookings) return;
    let results = bookings;
    if (searchTerm) {
      results = results.filter(booking =>
        booking.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (booking.destination && booking.destination.toLowerCase().includes(searchTerm.toLowerCase())) ||
        `BK-${booking.id.split('-')[1]?.padStart(5, '0')}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (statusFilter !== 'All') {
      results = results.filter(booking => booking.status === statusFilter.toLowerCase());
    }
    setFilteredBookings(results);
  }, [searchTerm, statusFilter, bookings]);

  const handleAddBooking = (newBookingData: Omit<Booking, 'id'>) => {
    if (!firestore || !newBookingData.clientId) return;
    const clientBookingsCollection = collection(firestore, `clients/${newBookingData.clientId}/bookings`);
    addDocumentNonBlocking(clientBookingsCollection, newBookingData);
    setIsFormOpen(false);
    toast({ title: 'Booking Created', description: `A new booking for ${newBookingData.clientName} has been created.` });
  };
  
  const handleUpdateBooking = (updatedData: Omit<Booking, 'id'>) => {
      if (!firestore || !editingBooking) return;
      const bookingRef = doc(firestore, `clients/${editingBooking.clientId}/bookings/${editingBooking.id}`);
      setDocumentNonBlocking(bookingRef, updatedData, { merge: true });
      setEditingBooking(null);
      toast({ title: "Booking Updated", description: "The booking has been successfully updated." });
  };

  const handleConfirmCancel = () => {
      if (!firestore || !bookingToCancel || !user) return;
      const bookingRef = doc(firestore, `clients/${bookingToCancel.clientId}/bookings/${bookingToCancel.id}`);
      setDocumentNonBlocking(bookingRef, { status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
      toast({ variant: 'destructive', title: "Booking Cancelled", description: "The booking has been cancelled." });
      setBookingToCancel(null);
  };

  const displayBookings = searchTerm || statusFilter !== 'All' ? filteredBookings : bookings || [];

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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Booking</DialogTitle>
            </DialogHeader>
            <BookingForm onSubmit={handleAddBooking} />
             <DialogFooter>
                <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button type="submit" form="booking-form">Create Booking</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <StatCard title="New Bookings Today" value={isLoading ? "..." : (bookings?.length || 0).toString()} />
        <StatCard title="Upcoming Departures" value={isLoading ? "..." : (bookings?.filter(b => new Date(b.startDate) > new Date()).length || 0).toString()} />
        <StatCard title="Pending Payments" value={isLoading ? "..." : `₹${(bookings?.filter(b=>b.status === 'pending').reduce((acc, b) => acc + b.total, 0) || 0).toLocaleString()}`} />
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
                {['All', 'Confirmed', 'Pending', 'Cancelled'].map(status => (
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
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({length: 5}).map((_, i) => <BookingRowSkeleton key={i} />)}
            {!isLoading && displayBookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="font-medium">{`BK-${booking.id.slice(-5)}`}</TableCell>
                <TableCell>{booking.clientName}</TableCell>
                <TableCell className="flex items-center">
                  <ItineraryIcon type={booking.itineraryType} />
                  {booking.itineraryType || 'N/A'}
                </TableCell>
                <TableCell>
                  {new Date(booking.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                  {new Date(booking.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </TableCell>
                <TableCell>₹{booking.total.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      booking.status === 'confirmed'
                        ? 'default'
                        : booking.status === 'pending'
                        ? 'secondary'
                        : 'destructive'
                    }
                    className={
                      booking.status === 'confirmed'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : booking.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                        : booking.status === 'cancelled'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : ''
                    }
                  >
                    {booking.status}
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
        <div>Showing {displayBookings.length} of {bookings?.length || 0}</div>
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
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit Booking</DialogTitle>
            </DialogHeader>
            {editingBooking && (
                <BookingForm 
                    booking={editingBooking}
                    onSubmit={handleUpdateBooking} 
                    clientId={editingBooking.clientId}
                    clientName={editingBooking.clientName}
                />
            )}
            <DialogFooter>
                <Button variant="outline" onClick={() => setEditingBooking(null)}>Cancel</Button>
                <Button type="submit" form="booking-form">Save Changes</Button>
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
    </>
  );
}
