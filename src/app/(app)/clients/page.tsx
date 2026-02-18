
'use client';

import { useState, useEffect } from 'react';
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
  Mail,
  Phone,
  Eye,
  Share2,
  Trash2,
  FilePlus2,
  UserPlus,
  Bell,
  Archive,
  Pencil,
  Book,
  ChevronDown,
} from 'lucide-react';
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
import type { Client, CustomerLog, FollowUp, Booking } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { ClientForm } from '@/components/forms/client-form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { LastLogActivity } from '@/components/clients/last-log-activity';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { format } from 'date-fns';
import { CustomerLogForm } from '@/components/forms/customer-log-form';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { FollowUpForm } from '@/components/forms/follow-up-form';
import { BookingForm } from '@/components/forms/booking-form';


const ClientRowSkeleton = () => (
    <TableRow>
      <TableCell className="font-medium w-[250px]"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-24" /></div></TableCell>
      <TableCell className="w-[240px]"><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
      <TableCell className="w-[100px]"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="w-[150px]"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="w-[120px]"><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell className="w-[110px]"><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell className="w-[120px]"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="w-[50px]"><MoreHorizontal className="h-4 w-4" /></TableCell>
    </TableRow>
);

const serviceTypeMap: { [key: string]: string } = {
    visa: 'Visa',
    fullPackage: 'Full Package',
    packageOnly: 'Package Only',
};

const travelPurposeMap: { [key: string]: string } = {
    leisure: 'Leisure',
    business: 'Business',
    family: 'Family',
};


export default function ClientsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [logClient, setLogClient] = useState<Client | null>(null);
  const [followUpClient, setFollowUpClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [visaStatusFilter, setVisaStatusFilter] = useState('All');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [bookingClient, setBookingClient] = useState<Client | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('name-asc');
  const CLIENTS_PER_PAGE = 20;

  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const [field, direction] = sortOrder.split('-');
    return query(collection(firestore, 'clients'), orderBy(field, direction as 'asc' | 'desc'));
  }, [firestore, sortOrder]);

  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  useEffect(() => {
    if (clients) {
      const activeClients = clients.filter(c => c.status !== 'inactive');
      
      const results = activeClients.filter(client => {
        const lowercasedTerm = searchTerm.toLowerCase();
        const searchMatch = searchTerm 
            ? client.name.toLowerCase().includes(lowercasedTerm) ||
              (client.email && client.email.toLowerCase().includes(lowercasedTerm))
            : true;

        const statusMatch = statusFilter !== 'All'
            ? client.status.toLowerCase() === statusFilter.toLowerCase()
            : true;

        const typeMatch = typeFilter !== 'All'
            ? client.travelPurpose?.toLowerCase() === typeFilter.toLowerCase()
            : true;
        
        const visaStatusValueMap: {[key: string]: string} = {
            'To Start': 'toStart',
            'In Process': 'inProcess',
            'Applied': 'applied',
            'Approved': 'approved',
            'Rejected': 'rejected',
            'Completed': 'completed',
            'Travelling': 'travelling'
        };
        const mappedVisaStatus = visaStatusValueMap[visaStatusFilter];
        const visaStatusMatch = visaStatusFilter !== 'All'
            ? client.visaStatus === mappedVisaStatus
            : true;
            
        return searchMatch && statusMatch && typeMatch && visaStatusMatch;
      });
      setFilteredClients(results);
    } else {
        setFilteredClients([]);
    }
  }, [searchTerm, clients, statusFilter, typeFilter, visaStatusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, visaStatusFilter, sortOrder]);
  
  const handleAddClient = (newClientData: Partial<Client>) => {
    if (!clientsQuery) return;
    addDocumentNonBlocking(collection(firestore!, 'clients'), newClientData);
    setIsFormOpen(false);
    toast({
        title: "Client Created",
        description: `New client "${newClientData.name}" has been added.`,
    })
  };

  const handleUpdateClient = (updatedData: Partial<Client>) => {
    if (!firestore || !editingClient) return;
    const clientDocRef = doc(firestore, 'clients', editingClient.id);
    setDocumentNonBlocking(clientDocRef, { ...updatedData, updatedAt: serverTimestamp() }, { merge: true });
    setEditingClient(null);
    toast({
        title: "Client Updated",
        description: `Client "${editingClient.name}" has been successfully updated.`,
    });
  };

  const handleDeleteClient = () => {
    if (!firestore || !clientToDelete) return;
    const clientDocRef = doc(firestore, 'clients', clientToDelete.id);
    deleteDocumentNonBlocking(clientDocRef);
    toast({
      variant: 'destructive',
      title: 'Client Deleted',
      description: `Client "${clientToDelete.name}" has been permanently deleted.`,
    });
    setClientToDelete(null);
  };
  
  const handleArchiveClient = (clientToArchive: Client) => {
    if (!firestore) return;
    const clientDocRef = doc(firestore, 'clients', clientToArchive.id);
    setDocumentNonBlocking(clientDocRef, { status: 'inactive', updatedAt: serverTimestamp() }, { merge: true });
    toast({
      title: 'Client Archived',
      description: `Client "${clientToArchive.name}" has been moved to the database.`,
    });
  };
  
  const handleAddLog = (newLogData: Omit<CustomerLog, 'id' | 'timestamp' | 'clientId' | 'clientName' | 'userName'>) => {
    if (!firestore || !logClient || !user) return;
    
    const logsCollectionRef = collection(firestore, 'customer_logs');
    // Add the new log entry
    addDocumentNonBlocking(logsCollectionRef, {
      ...newLogData,
      clientId: logClient.id,
      clientName: logClient.name,
      userName: user.displayName,
    });

    // Also update the client's updatedAt timestamp
    const clientRef = doc(firestore, 'clients', logClient.id);
    setDocumentNonBlocking(clientRef, { updatedAt: serverTimestamp() }, { merge: true });
    
    setLogClient(null);
    toast({
        title: "Log Added",
        description: "A new entry has been added to the customer's log.",
    })
  };

  const handleAddFollowUp = (values: Omit<FollowUp, 'id'|'clientName'|'clientEmail'|'clientPhone'>, client: Client) => {
    if (!user || !firestore) return;
    
    const followUpsCollection = collection(firestore, 'follow_ups');
    addDocumentNonBlocking(followUpsCollection, {
        ...values,
        clientId: client.id,
        clientName: client.name,
        clientEmail: client.email,
        clientPhone: client.phone,
        createdBy: user.uid,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    setFollowUpClient(null);
    toast({ title: "Follow-up created", description: `Follow-up for ${client.name} has been scheduled.` });
  };
  
  const handleAddBooking = (newBookingData: Omit<Booking, 'id'>) => {
    if (!firestore || !bookingClient) return;
    const clientBookingsCollection = collection(firestore, `clients/${bookingClient.id}/bookings`);
    addDocumentNonBlocking(clientBookingsCollection, newBookingData);
    setBookingClient(null);
    toast({
        title: "Booking Created",
        description: `New booking for "${bookingClient.name}" has been created.`,
    })
  };


  const handleShare = () => {
    const intakeUrl = `${window.location.origin}/intake`;
    navigator.clipboard.writeText(intakeUrl);
    toast({
      title: "Link Copied!",
      description: "The client intake form link has been copied to your clipboard.",
    });
  };

  const totalPages = Math.ceil(filteredClients.length / CLIENTS_PER_PAGE);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * CLIENTS_PER_PAGE,
    currentPage * CLIENTS_PER_PAGE
  );

  const goToPage = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const startClientNum = filteredClients.length > 0 ? (currentPage - 1) * CLIENTS_PER_PAGE + 1 : 0;
  const endClientNum = Math.min(currentPage * CLIENTS_PER_PAGE, filteredClients.length);
  
  const sortOptions: { [key: string]: string } = {
    'name-asc': 'Name - Alphabetic',
    'createdAt-desc': 'Newer to Old',
    'createdAt-asc': 'Old to New',
  };

  return (
    <>
      <PageHeader title="Clients" description="Manage all your customer profiles.">
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share Intake Form
            </Button>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
                <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Client
                </Button>
            </DialogTrigger>
            <DialogContent className="md:max-w-2xl">
                <DialogHeader>
                <DialogTitle>Create New Client</DialogTitle>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto p-1">
                    <ClientForm onSubmit={handleAddClient} onCancel={() => setIsFormOpen(false)} />
                </div>
            </DialogContent>
            </Dialog>
        </div>
      </PageHeader>
      
      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-10 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-between">
                  Status: {statusFilter} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {['All', 'Active', 'Prospect', 'Lead'].map(status => (
                    <DropdownMenuItem key={status} onSelect={() => setStatusFilter(status)}>{status}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-between">
                  Type: {typeFilter} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {['All', 'Leisure', 'Tourism', 'Visit', 'Business', 'Family'].map(type => (
                    <DropdownMenuItem key={type} onSelect={() => setTypeFilter(type)}>{type}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-between">
                  Visa Status: {visaStatusFilter} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {['All', 'To Start', 'In Process', 'Applied', 'Approved', 'Rejected', 'Completed', 'Travelling'].map(status => (
                    <DropdownMenuItem key={status} onSelect={() => setVisaStatusFilter(status)}>{status}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-between">
                  Sort by: {sortOptions[sortOrder]} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.entries(sortOptions).map(([value, label]) => (
                    <DropdownMenuItem key={value} onSelect={() => setSortOrder(value)}>{label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        </div>
      </div>

      <Dialog open={!!logClient} onOpenChange={(open) => !open && setLogClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Log for {logClient?.name}</DialogTitle>
          </DialogHeader>
          {logClient && <CustomerLogForm client={logClient} onSubmit={handleAddLog} />}
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!followUpClient} onOpenChange={(open) => !open && setFollowUpClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Follow-up for {followUpClient?.name}</DialogTitle>
          </DialogHeader>
          {followUpClient && <FollowUpForm clientForNewTask={followUpClient} onSubmit={handleAddFollowUp} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpClient(null)}>Cancel</Button>
            <Button type="submit" form="follow-up-form">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
       <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {editingClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-1">
            {editingClient && <ClientForm client={editingClient} onSubmit={handleUpdateClient} onCancel={() => setEditingClient(null)} />}
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!bookingClient} onOpenChange={(open) => !open && setBookingClient(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Booking for {bookingClient?.name}</DialogTitle>
            </DialogHeader>
            {bookingClient && (
              <BookingForm 
                onSubmit={handleAddBooking} 
                clientId={bookingClient.id}
                clientName={bookingClient.name}
              />
            )}
             <DialogFooter>
                <Button variant="outline" onClick={() => setBookingClient(null)}>Cancel</Button>
                <Button type="submit" form="booking-form">Create Booking</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      
      <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <div className="bg-card border rounded-lg mt-4">
        <Table>
        <TableHeader>
            <TableRow>
            <TableHead className="w-[250px]">Client</TableHead>
            <TableHead className="w-[240px]">Contact</TableHead>
            <TableHead>PAX</TableHead>
            <TableHead className="w-[100px]">Documents</TableHead>
            <TableHead className="w-[150px]">Type</TableHead>
            <TableHead className="w-[120px]">Visa Status</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead className="w-[120px]">Date Created</TableHead>
            <TableHead>Last Log</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {isLoading && Array.from({length: 5}).map((_, i) => <ClientRowSkeleton key={i} />)}
            {!isLoading && paginatedClients.map((client) => {
              const receivedDocs = client.requiredDocuments?.filter(d => d.status === 'received').length || 0;
              const totalDocs = client.requiredDocuments?.length || 0;
              const pax = client.pax || 1;
              return (
                <TableRow key={client.id}>
                    <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border">
                                <AvatarImage src={client.avatar} alt={client.name} data-ai-hint="person face" />
                                <AvatarFallback>{client.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <Link href={`/clients/${client.id}`} className="hover:underline">{client.name}</Link>
                                <div className="text-sm text-muted-foreground truncate">{client.preferredDestination || 'No destination set'}</div>
                            </div>
                        </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2 truncate">
                            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <a href={`mailto:${client.email}`} className="text-sm hover:underline truncate">{client.email}</a>
                        </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm">{client.phone}</span>
                        </div>
                    </TableCell>
                    <TableCell>{pax}</TableCell>
                    <TableCell>
                      {totalDocs > 0 ? `${receivedDocs} of ${totalDocs}` : 'N/A'}
                    </TableCell>
                    <TableCell className="font-medium capitalize">
                      {client.travelPurpose ? travelPurposeMap[client.travelPurpose] : 'N/A'}
                      {client.services && ` / ${serviceTypeMap[client.services]}`}
                    </TableCell>
                    <TableCell>
                       <Badge
                          variant={
                            client.visaStatus === 'approved' ? 'default' :
                            client.visaStatus === 'rejected' ? 'destructive' :
                            'secondary'
                          }
                          className={
                              `capitalize ` + (
                              client.visaStatus === 'approved' ? 'bg-green-100 text-green-800 border-green-200' :
                              client.visaStatus === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                              client.visaStatus === 'travelling' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                              client.visaStatus === 'completed' ? 'bg-sky-100 text-sky-800 border-sky-200' :
                              client.visaStatus === 'applied' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                              client.visaStatus === 'inProcess' ? 'bg-purple-100 text-purple-800 border-purple-200' : 
                              'bg-gray-100 text-gray-800 border-gray-200')
                          }
                        >
                          {client.visaStatus || 'N/A'}
                        </Badge>
                    </TableCell>
                    <TableCell>
                    <Badge
                        variant={
                            client.status === 'active'
                            ? 'default'
                            : client.status === 'prospect'
                            ? 'secondary'
                            : 'outline'
                        }
                          className={
                            `capitalize ` + (client.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
                            client.status === 'prospect' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : '')
                        }
                    >
                        {client.status}
                    </Badge>
                    </TableCell>
                    <TableCell>{client.createdAt?.toDate ? format(client.createdAt.toDate(), 'P') : 'N/A'}</TableCell>
                    <TableCell  className="max-w-[200px]">
                      <LastLogActivity clientId={client.id} />
                    </TableCell>
                    <TableCell>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem asChild><Link href={`/clients/${client.id}`} className="flex items-center"><Eye className="mr-2 h-4 w-4"/>View Details</Link></DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setLogClient(client)}>
                                <FilePlus2 className="mr-2 h-4 w-4"/>
                                Add Log
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setFollowUpClient(client)}>
                                <Bell className="mr-2 h-4 w-4"/>
                                Add Follow-up
                            </DropdownMenuItem>
                             <DropdownMenuItem onSelect={() => setBookingClient(client)}>
                                <Book className="mr-2 h-4 w-4"/>
                                Create Booking
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditingClient(client)}>
                                <Pencil className="mr-2 h-4 w-4"/>
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleArchiveClient(client)}>
                                <Archive className="mr-2 h-4 w-4" />
                                Archive
                            </DropdownMenuItem>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                  className="text-destructive"
                                  onSelect={(e) => { e.preventDefault(); setClientToDelete(client); }}
                              >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                              </DropdownMenuItem>
                          </AlertDialogTrigger>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
        </Table>
        { !isLoading && paginatedClients.length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
                No clients found.
            </div>
        )}
        </div>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the client
              <span className="font-bold"> {clientToDelete?.name}</span> and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClient} className="bg-destructive hover:bg-destructive/90">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
        <div>
           {filteredClients.length > 0 ?
              `Showing ${startClientNum} to ${endClientNum} of ${filteredClients.length} clients`
              : `Showing 0 of 0 clients`
            }
        </div>
        {totalPages > 1 && (
            <Pagination>
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious href="#" onClick={(e) => {e.preventDefault(); prevPage()}} className={currentPage === 1 ? 'pointer-events-none opacity-50' : undefined}/>
                </PaginationItem>
                {[...Array(totalPages).keys()].map((page) => (
                    <PaginationItem key={page}>
                        <PaginationLink href="#" onClick={(e) => { e.preventDefault(); goToPage(page + 1)}} isActive={currentPage === page + 1}>
                            {page + 1}
                        </PaginationLink>
                    </PaginationItem>
                ))}
                <PaginationItem>
                    <PaginationNext href="#" onClick={(e) => {e.preventDefault(); nextPage()}} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : undefined}/>
                </PaginationItem>
            </PaginationContent>
            </Pagination>
        )}
      </div>
    </>
  );
}


