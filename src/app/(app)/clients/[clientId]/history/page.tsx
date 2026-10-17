'use client';

import { PageHeader } from '@/components/common/page-header';
import { useCollection, useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, setDocumentNonBlocking, useUser } from '@/firebase';
import type { Booking, Client, VisaHistoryItem, PreviousTrip } from '@/lib/types';
import { collection, doc, query, where, arrayUnion, serverTimestamp, arrayRemove } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import { clientIdFromSlug } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plane, Bed, Car, Flag, Calendar, Globe, PlusCircle, CheckCircle, XCircle, MoreHorizontal, Clock, Archive, ArchiveRestore } from 'lucide-react';
import { bookingReference, formatBookingDates } from '@/lib/booking-details';
import { format, differenceInDays } from 'date-fns';
import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VisaHistoryForm } from '@/components/forms/visa-history-form';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PreviousTripForm } from '@/components/forms/previous-trip-form';


const ItineraryIcon = ({ type }: { type?: string }) => {
  if (type?.includes('Flight')) return <Plane className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type?.includes('Tour')) return <Flag className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type?.includes('Hotel')) return <Bed className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type?.includes('Rental')) return <Car className="mr-2 h-4 w-4 text-muted-foreground" />;
  return <Globe className="mr-2 h-4 w-4 text-muted-foreground" />;
};

const TripCardSkeleton = () => (
    <TableRow>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
    </TableRow>
);

export default function ClientHistoryPage() {
  const firestore = useFirestore();
  const params = useParams();
  const clientId = clientIdFromSlug(params.clientId as string);
  const [isTripFormOpen, setIsTripFormOpen] = useState(false);
  const [isVisaFormOpen, setIsVisaFormOpen] = useState(false);
  const [editingVisa, setEditingVisa] = useState<VisaHistoryItem | null>(null);
  const { toast } = useToast();
  const { user } = useUser();

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

  const handleAddTrip = (newTripData: PreviousTrip) => {
    if (!clientRef) return;
    setDocumentNonBlocking(clientRef, {
      previousTrips: arrayUnion(newTripData),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    setIsTripFormOpen(false);
    toast({
        title: "Previous Trip Added",
        description: `A new trip to ${newTripData.country} has been added.`
    });
  };
  
  const handleVisaFormSubmit = (visaData: VisaHistoryItem) => {
    if(editingVisa) {
      handleEditVisaHistory(visaData);
    } else {
      handleAddVisaHistory(visaData);
    }
  }

  const handleAddVisaHistory = (newVisaHistory: VisaHistoryItem) => {
    if (!clientRef) return;
    setDocumentNonBlocking(clientRef, {
      visaHistory: arrayUnion(newVisaHistory),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    setIsVisaFormOpen(false);
    toast({
        title: "Visa History Added",
        description: `A new visa record for ${newVisaHistory.country} has been added.`
    });
  };
  
  const handleEditVisaHistory = (updatedVisa: VisaHistoryItem) => {
    if (!clientRef || !client?.visaHistory || !editingVisa) return;

    const originalRecord = client.visaHistory.find(v => v.date === editingVisa.date && v.country === editingVisa.country);

    const updatedHistory = client.visaHistory.map(v => 
        (v.date === editingVisa.date && v.country === editingVisa.country) ? updatedVisa : v
    );

    setDocumentNonBlocking(clientRef, {
      visaHistory: updatedHistory,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    setEditingVisa(null);
    setIsVisaFormOpen(false);
    toast({
        title: "Visa History Updated",
        description: `The visa record for ${updatedVisa.country} has been updated.`
    });
  };


  const handleRemoveVisaHistory = (visaToRemove: VisaHistoryItem) => {
    if (!clientRef || !client?.visaHistory) return;

     const originalRecord = client.visaHistory.find(v => v.date === visaToRemove.date && v.country === visaToRemove.country);

    if (originalRecord) {
        setDocumentNonBlocking(clientRef, {
            visaHistory: arrayRemove(originalRecord),
            updatedAt: serverTimestamp(),
        }, { merge: true });

        toast({
            variant: "destructive",
            title: "Visa History Removed",
            description: `The visa record for ${visaToRemove.country} has been removed.`
        });
    }
  };

  const openEditDialog = (visa: VisaHistoryItem) => {
    setEditingVisa(visa);
    setIsVisaFormOpen(true);
  }

  const handleOpenChange = (open: boolean) => {
    setIsVisaFormOpen(open);
    if (!open) {
      setEditingVisa(null);
    }
  }

  const handleUnarchive = (booking: Booking) => {
    if (!firestore) return;
    setDocumentNonBlocking(
      doc(firestore, 'bookings', booking.id),
      { archived: false, archiveExempt: true, updatedAt: serverTimestamp(), updatedBy: user?.uid },
      { merge: true }
    );
    toast({ title: 'Booking Restored', description: 'Moved back to active bookings.' });
  };

  // Archived bookings = the client's completed/paid travel, newest first.
  const archivedBookings = (bookings || [])
    .filter((b) => b.archived)
    .sort((a, b) => {
      const at = a.archivedAt?.toDate ? a.archivedAt.toDate().getTime() : new Date(a.startDate || 0).getTime();
      const bt = b.archivedAt?.toDate ? b.archivedAt.toDate().getTime() : new Date(b.startDate || 0).getTime();
      return bt - at;
    });

  const pastTrips = client?.previousTrips
    ?.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()) || [];
    
  const isLoading = isLoadingClient;

  return (
    <>
      <PageHeader title="Client Travel History" description="A record of the client's previous trips and visa history." />
      
      <div className="space-y-8">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Archive className="h-5 w-5 text-muted-foreground" />Archived Bookings</CardTitle>
                {archivedBookings.length > 0 && (
                    <span className="text-sm text-muted-foreground">{archivedBookings.length} archived</span>
                )}
            </CardHeader>
            <CardContent>
                {isLoadingBookings && <Skeleton className="h-20 w-full" />}
                {!isLoadingBookings && archivedBookings.length > 0 && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Reference</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Dates</TableHead>
                                <TableHead>Archived</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {archivedBookings.map((booking) => {
                                const ref = bookingReference(booking);
                                return (
                                <TableRow key={booking.id}>
                                    <TableCell className="font-medium">{ref ? ref.value : '—'}</TableCell>
                                    <TableCell className="capitalize">{booking.bookingType === 'car' ? 'Transfer' : (booking.bookingType || 'N/A')}</TableCell>
                                    <TableCell>{formatBookingDates(booking)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {booking.archivedAt?.toDate ? format(booking.archivedAt.toDate(), 'LLL d, yyyy') : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" aria-label="Open previous trip actions"><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => handleUnarchive(booking)}>
                                                    <ArchiveRestore className="mr-2 h-4 w-4" />Restore to active
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
                {!isLoadingBookings && archivedBookings.length === 0 && (
                    <div className="text-center p-8 text-muted-foreground">
                        <p>No archived bookings yet. Fully-paid bookings are archived here manually or automatically 15 days after payment.</p>
                    </div>
                )}
            </CardContent>
        </Card>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Previous Trips</CardTitle>
                <Dialog open={isTripFormOpen} onOpenChange={setIsTripFormOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={!client}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Trip
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Past Trip</DialogTitle>
                        </DialogHeader>
                        <PreviousTripForm onSubmit={handleAddTrip} />
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsTripFormOpen(false)}>Cancel</Button>
                            <Button type="submit" form="previous-trip-form">Add Trip</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {isLoading && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Country</TableHead>
                                <TableHead>Dates</TableHead>
                                <TableHead>Duration (days)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array.from({length: 3}).map((_, i) => <TripCardSkeleton key={i} />)}
                        </TableBody>
                    </Table>
                )}
                {!isLoading && pastTrips.length > 0 && (
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Country</TableHead>
                                <TableHead>Dates</TableHead>
                                <TableHead>Duration (days)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pastTrips.map((trip, index) => {
                                const duration = differenceInDays(new Date(trip.endDate), new Date(trip.startDate)) + 1;
                                return (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{trip.country}</TableCell>
                                    <TableCell>
                                        {format(new Date(trip.startDate), 'LLL d, yyyy')} - {format(new Date(trip.endDate), 'LLL d, yyyy')}
                                    </TableCell>
                                    <TableCell>{duration}</TableCell>
                                </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                )}
                 {!isLoading && pastTrips.length === 0 && (
                    <div className="text-center p-8 text-muted-foreground">
                        <p>No previous travel history found for this client.</p>
                    </div>
                )}
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Visa History</CardTitle>
                <Dialog open={isVisaFormOpen} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={!client} onClick={() => setIsVisaFormOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Visa Record
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingVisa ? 'Edit' : 'Add'} Visa History Record</DialogTitle>
                        </DialogHeader>
                        <VisaHistoryForm onSubmit={handleVisaFormSubmit} visaHistoryItem={editingVisa}/>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsVisaFormOpen(false)}>Cancel</Button>
                            <Button type="submit" form="visa-history-form">{editingVisa ? 'Save Changes' : 'Add Record'}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {!isLoading && client?.visaHistory && client.visaHistory.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Country</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Rejection Reason</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {client.visaHistory.map((visa, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{visa.country}</TableCell>
                                    <TableCell>
                                        <Badge variant={visa.status === 'approved' ? 'default' : 'destructive'}
                                          className={
                                            visa.status === 'approved' ? 'bg-green-100 text-green-800 border-green-200' :
                                            'bg-red-100 text-red-800 border-red-200'
                                          }
                                        >
                                             {visa.status === 'approved' ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                                            {visa.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{format(new Date(visa.date), 'LLL d, yyyy')}</TableCell>
                                    <TableCell>{visa.rejectionReason || 'N/A'}</TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" aria-label="Open visa record actions">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent>
                                                <DropdownMenuItem onClick={() => openEditDialog(visa)}>Edit</DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive" onClick={() => handleRemoveVisaHistory(visa)}>Delete</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center p-8 text-muted-foreground">
                        <p>No visa history records found.</p>
                    </div>
                )}
                 {isLoading && <Skeleton className="h-20 w-full" />}
            </CardContent>
        </Card>
      </div>
    </>
  );
}
