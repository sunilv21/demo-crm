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
  MoreHorizontal,
  Plane,
  Flag,
  Bed,
  Car,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Booking, Client } from '@/lib/types';
import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingForm } from '@/components/forms/booking-form';
import { useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams } from 'next/navigation';

const ItineraryIcon = ({ type }: { type: string }) => {
  if (type?.includes('Flight')) return <Plane className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type?.includes('Tour')) return <Flag className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type?.includes('Hotel')) return <Bed className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type?.includes('Rental')) return <Car className="mr-2 h-4 w-4 text-muted-foreground" />;
  return null;
};

const BookingRowSkeleton = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell><MoreHorizontal className="h-4 w-4" /></TableCell>
    </TableRow>
);


export default function ClientBookingsPage() {
  const firestore = useFirestore();
  const params = useParams();
  const clientId = params.clientId as string;
  const [isFormOpen, setIsFormOpen] = useState(false);

  const clientRef = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);
  
  const { data: client, isLoading: isLoadingClient } = useDoc<Client>(clientRef);

  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return collection(firestore, 'clients', clientId, 'bookings');
  }, [firestore, clientId]);

  const { data: bookings, isLoading: isLoadingBookings } = useCollection<Booking>(bookingsQuery);

  const handleAddBooking = (newBookingData: Omit<Booking, 'id'>) => {
    if (!bookingsQuery) return;
     addDocumentNonBlocking(bookingsQuery, { ...newBookingData });
    setIsFormOpen(false);
  };
  
  const isLoading = isLoadingBookings || isLoadingClient;

  return (
    <>
      <PageHeader title="Client Bookings" description="Manage all bookings for this client.">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button disabled={!client}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Booking
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Booking</DialogTitle>
            </DialogHeader>
            {client && (
              <BookingForm 
                onSubmit={handleAddBooking} 
                clientId={client.id}
                clientName={client.name}
              />
            )}
             <DialogFooter>
                <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button type="submit" form="booking-form">Create Booking</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>
      
      <div className="bg-card border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking ID</TableHead>
              <TableHead>Itinerary</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({length: 3}).map((_, i) => <BookingRowSkeleton key={i} />)}
            {!isLoading && bookings?.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="font-medium">{`BK-${booking.id.slice(-5)}`}</TableCell>
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
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Cancel</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
         { !isLoading && bookings?.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            No bookings found for this client.
          </div>
        )}
      </div>
    </>
  );
}
