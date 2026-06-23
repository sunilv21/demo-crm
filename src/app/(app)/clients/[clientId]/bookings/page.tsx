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
  Pencil,
  XCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Booking, Client } from '@/lib/types';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookingForm } from '@/components/forms/booking-form';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams } from 'next/navigation';
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

const ItineraryIcon = ({ type }: { type?: string }) => {
  const t = type?.toLowerCase();
  if (t?.includes('flight')) return <Plane className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes('tour')) return <Flag className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes('hotel')) return <Bed className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes('rental') || t?.includes('car')) return <Car className="mr-2 h-4 w-4 text-muted-foreground" />;
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
  const { isAdminOrManager } = useAppUser();
  const params = useParams();
  const clientId = params.clientId as string;
  const { user } = useUser();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);

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

  const handleConfirmCancel = () => {
    if (!firestore || !bookingToCancel || !user) return;
    const bookingRef = doc(firestore, 'bookings', bookingToCancel.id);
    setDocumentNonBlocking(bookingRef, { status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
    toast({ variant: 'destructive', title: "Booking Cancelled", description: "The booking has been cancelled." });
    setBookingToCancel(null);
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
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
            <ScrollArea className="max-h-[75vh] p-4">
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
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" form="booking-form">Create Booking</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking ID</TableHead>
                  <TableHead>Itinerary</TableHead>
                  <TableHead>Dates</TableHead>
                  {isAdminOrManager && <TableHead>Total</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({length: 3}).map((_, i) => <BookingRowSkeleton key={i} />)}
                {!isLoading && bookings?.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium">{`BK-${booking.id.slice(-5)}`}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <ItineraryIcon type={booking.bookingType} />
                        {booking.bookingType ? booking.bookingType.charAt(0).toUpperCase() + booking.bookingType.slice(1) : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(booking.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                      {new Date(booking.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableCell>
                    {isAdminOrManager && <TableCell>₹{booking.total.toLocaleString()}</TableCell>}
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
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditingBooking(booking)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setBookingToCancel(booking)} className="text-destructive">
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isLoading && bookings?.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                No bookings found for this client.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingBooking} onOpenChange={(open) => !open && setEditingBooking(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <ScrollArea className="max-h-[75vh] p-4">
            <DialogHeader><DialogTitle>Edit Booking</DialogTitle></DialogHeader>
            {editingBooking && client && (
              <BookingForm
                booking={editingBooking}
                onSubmit={handleUpdateBooking}
                clientId={client.id}
                clientName={client.name}
              />
            )}
          </ScrollArea>
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
            <AlertDialogDescription>This will cancel the booking. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive hover:bg-destructive/90">Confirm Cancellation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
