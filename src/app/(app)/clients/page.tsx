
'use client';

import { useState, useEffect, useMemo } from 'react';
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
                                          User,
                                          X,
                                          Building2,
                                          } from 'lucide-react';
                                          import { Input } from '@/components/ui/input';
                                          import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
                                                              PaginationEllipsis,
                                                              } from '@/components/ui/pagination';
                                                              import type { Client, CustomerLog, FollowUp, Booking, User as StaffUser, Organization } from '@/lib/types';
                                                              import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, useUser, useAppUser } from '@/firebase';
                                                              import { collection, doc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
                                                              import { Skeleton } from '@/components/ui/skeleton';
                                                              import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
                                                              import { ClientForm } from '@/components/forms/client-form';
                                                              import { Avatar, AvatarFallback } from '@/components/ui/avatar';
                                                              import { visaStatusGlow } from '@/lib/utils';
                                                              import Link from 'next/link';
                                                              import { useToast } from '@/hooks/use-toast';
                                                              import {
                                                                AlertDialog,
                                                                  AlertDialogAction,
                                                                    AlertDialogCancel,
                                                                      AlertDialogContent,
                                                                        AlertDialogDescription,
                                                                          AlertDialogFooter,
                                                                            AlertDialogHeader,
                                                                              AlertDialogTitle,
                                                                              } from "@/components/ui/alert-dialog"
                                                                                import { format } from 'date-fns';
                                                                                import { CustomerLogForm } from '@/components/forms/customer-log-form';
                                                                                import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
                                                                                import { FollowUpForm } from '@/components/forms/follow-up-form';
                                                                                import { BookingForm } from '@/components/forms/booking-form';
import { LastLogActivity } from '@/components/clients/last-log-activity';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';


                                                                                const ClientRowSkeleton = () => (
                                                                                    <TableRow>
                                                                                          <TableCell className="font-medium w-[180px]"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-24" /></div></TableCell>
                                                                                                <TableCell className="w-[150px]"><Skeleton className="h-4 w-28" /></TableCell>
                                                                                                      <TableCell className="w-[50px]"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                                                                            <TableCell className="w-[60px]"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                                                                                  <TableCell className="w-[120px]"><Skeleton className="h-4 w-20" /></TableCell>
                                                                                                                        <TableCell className="w-[110px]"><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                                                                                                                              <TableCell className="w-[90px]"><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                                                                                                                                    <TableCell className="w-[100px]"><Skeleton className="h-4 w-20" /></TableCell>
                                                                                                                                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                                                                                                                <TableCell className="w-[56px] sticky right-0 bg-card z-10"><MoreHorizontal className="h-4 w-4" /></TableCell>
                                                                                                                                                    </TableRow>
                                                                                                                                                    );

                                                                                                                                                    const serviceTypeMap: { [key: string]: string } = {
                                                                                                                                                        flight: 'Flight',
                                                                                                                                                            hotel: 'Hotel',
                                                                                                                                                                visa: 'Visa',
                                                                                                                                                                transfers: 'Transfers',
                                                                                                                                                                activity: 'Activity',
                                                                                                                                                                localTours: 'Local Tours',
                                                                                                                                                                };

                                                                                                                                                                const travelPurposeMap: { [key: string]: string } = {
                                                                                                                                                                    leisure: 'Leisure',
                                                                                                                                                                        business: 'Business',
                                                                                                                                                                            family: 'Family',
                                                                                                                                                                            };


export default function ClientsPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { canDelete, isAdminOrManager } = useAppUser();
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
    const [orgFilter, setOrgFilter] = useState('All');
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [bookingClient, setBookingClient] = useState<Client | null>(null);
    const [shareClient, setShareClient] = useState<Client | null>(null);
    const [teammateToAdd, setTeammateToAdd] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortOrder, setSortOrder] = useState('createdAt-desc');
    const CLIENTS_PER_PAGE = 50;

    const clientsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        // Non-admins may only list their own clients (server-enforced). Constrain
        // the query by assignedEmployees and sort client-side (avoids a composite index).
        if (!isAdminOrManager) {
            if (!user) return null;
            return query(collection(firestore, 'clients'), where('assignedEmployees', 'array-contains', user.uid));
        }
        const [field, direction] = sortOrder.split('-');
        return query(collection(firestore, 'clients'), orderBy(field, direction as 'asc' | 'desc'));
    }, [firestore, sortOrder, isAdminOrManager, user]);

    const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

    // Staff list for the "Assigned Employee" dropdown and the Share-with-teammate
    // action. Readable by any signed-in user (see firestore.rules), so employees
    // can also add a colleague to their own clients.
    const usersQuery = useMemoFirebase(
        () => (firestore ? collection(firestore, 'users') : null),
        [firestore]
    );
    const { data: staffUsers } = useCollection<StaffUser>(usersQuery);
    const staffOptions = (staffUsers || []).map(u => ({ id: u.id, name: u.name }));
    const staffUserNames = useMemo(
        () => new Map((staffUsers || []).map((u) => [u.id, u.name || u.id])),
        [staffUsers]
    );

    // Organizations for the "Organization" column, filter, and the client form's
    // organization selector.
    const orgsQuery = useMemoFirebase(
        () => (firestore ? collection(firestore, 'organizations') : null),
        [firestore]
    );
    const { data: organizations } = useCollection<Organization>(orgsQuery);
    const orgOptions = useMemo(
        () => (organizations || []).map((o) => ({ id: o.id, name: o.name })),
        [organizations]
    );
    const orgNames = useMemo(
        () => new Map((organizations || []).map((o) => [o.id, o.name])),
        [organizations]
    );

    useEffect(() => {
        if (!clients) {
            setFilteredClients([]);
            return;
        }

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

                const orgMatch = orgFilter === 'All'
                    ? true
                    : orgFilter === 'Individuals'
                        ? !client.organizationId
                        : client.organizationId === orgFilter;

                // Only admins/managers see all clients; everyone else (employees,
                // agents) sees clients assigned to them OR that they created.
                const assignmentMatch = isAdminOrManager
                    ? true
                    : user?.uid && (client.assignedEmployees?.includes(user.uid) || false) || client.createdBy === user?.uid;

                return searchMatch && statusMatch && typeMatch && visaStatusMatch && orgMatch && assignmentMatch;
            });

            // Non-admin queries drop the server-side orderBy, so sort here.
            if (!isAdminOrManager) {
                const [field, direction] = sortOrder.split('-');
                const dir = direction === 'asc' ? 1 : -1;
                results.sort((a, b) => {
                    if (field === 'name') {
                        return (a.name || '').localeCompare(b.name || '') * dir;
                    }
                    const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                    const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                    return (at - bt) * dir;
                });
            }

            setFilteredClients(results);
    }, [searchTerm, clients, statusFilter, typeFilter, visaStatusFilter, orgFilter, isAdminOrManager, user?.uid, sortOrder]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, typeFilter, visaStatusFilter, orgFilter, sortOrder]);
    
    const handleAddClient = (newClientData: Partial<Client>) => {
        if (!clientsQuery) return;
        // Employees (non admin/manager) always own the clients they create.
        const dataToSave: Partial<Client> = { ...newClientData };
        if (!isAdminOrManager && user) {
            dataToSave.assignedEmployees = [user.uid];
        }
        addDocumentNonBlocking(collection(firestore!, 'clients'), dataToSave);
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
    
    const handleAddTeammate = (client: Client, uid: string) => {
        if (!firestore || !user || !uid) return;
        const current = client.assignedEmployees || [];
        if (current.includes(uid)) return;
        const clientDocRef = doc(firestore, 'clients', client.id);
        setDocumentNonBlocking(
            clientDocRef,
            { assignedEmployees: [...current, uid], updatedAt: serverTimestamp(), updatedBy: user.uid },
            { merge: true }
        );
        toast({
            title: 'Teammate added',
            description: `${staffUserNames.get(uid) || 'The employee'} can now work on ${client.name}.`,
        });
    };

    const handleRemoveTeammate = (client: Client, uid: string) => {
        if (!firestore || !user) return;
        const clientDocRef = doc(firestore, 'clients', client.id);
        setDocumentNonBlocking(
            clientDocRef,
            {
                assignedEmployees: (client.assignedEmployees || []).filter((id) => id !== uid),
                updatedAt: serverTimestamp(),
                updatedBy: user.uid,
            },
            { merge: true }
        );
        toast({ title: 'Teammate removed', description: `${staffUserNames.get(uid) || 'The employee'} no longer has access.` });
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
        const bookingsCollection = collection(firestore, 'bookings');
        addDocumentNonBlocking(bookingsCollection, newBookingData);
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
    
    const getPaginationItems = (currentPage: number, totalPages: number) => {
        const delta = 1;
        const range = [];
        const rangeWithDots: (string | number)[] = [];
        let l: number | undefined;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
                range.push(i);
            }
        }

        for (const i of range) {
            if (l) {
                if (i - l === 2) {
                    rangeWithDots.push(l + 1);
                } else if (i - l !== 1) {
                    rangeWithDots.push('...');
                }
            }
            rangeWithDots.push(i);
            l = i;
        }

        return rangeWithDots;
    };

    const paginationItems = getPaginationItems(currentPage, totalPages);

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
        'createdAt-desc': 'Newer to Old',
        'createdAt-asc': 'Old to New',
        'name-asc': 'Name - Alphabetic',
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
                        <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] p-0 gap-0">
                            <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">
                                <DialogTitle>Create New Client</DialogTitle>
                            </DialogHeader>
                            <div className="px-6 py-4">
                                <ClientForm onSubmit={handleAddClient} onCancel={() => setIsFormOpen(false)} canAssign={isAdminOrManager} staffUsers={staffOptions} organizations={orgOptions} />
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
                                    Organization: {orgFilter === 'All' ? 'All' : orgFilter === 'Individuals' ? 'Individuals' : (orgNames.get(orgFilter) || 'Selected')} <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-h-72 overflow-y-auto">
                                <DropdownMenuItem onSelect={() => setOrgFilter('All')}>All</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setOrgFilter('Individuals')}>Individuals only</DropdownMenuItem>
                                {orgOptions.map((o) => (
                                    <DropdownMenuItem key={o.id} onSelect={() => setOrgFilter(o.id)}>{o.name}</DropdownMenuItem>
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
                <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] p-0 gap-0">
                    <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">
                        <DialogTitle>Edit {editingClient?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="px-6 py-4">
                        {editingClient && <ClientForm client={editingClient} onSubmit={handleUpdateClient} onCancel={() => setEditingClient(null)} canAssign={isAdminOrManager} staffUsers={staffOptions} organizations={orgOptions} />}
                    </div>
                </DialogContent>
            </Dialog>
            
            <Dialog open={!!shareClient} onOpenChange={(open) => { if (!open) { setShareClient(null); setTeammateToAdd(''); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Share {shareClient?.name}</DialogTitle>
                    </DialogHeader>
                    {(() => {
                        const live = clients?.find((c) => c.id === shareClient?.id) ?? shareClient;
                        if (!live) return null;
                        const assigned = live.assignedEmployees ?? [];
                        const available = staffOptions.filter((o) => !assigned.includes(o.id));
                        return (
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Add a colleague so they can work on this client alongside you.
                                </p>
                                <div>
                                    <p className="text-sm font-medium mb-2">Current team ({assigned.length})</p>
                                    <div className="flex flex-wrap gap-2">
                                        {assigned.length === 0 && (
                                            <span className="text-sm text-muted-foreground">No one assigned yet.</span>
                                        )}
                                        {assigned.map((uid) => (
                                            <Badge key={uid} variant="secondary" className="pl-2.5 pr-1 py-1 gap-1">
                                                {staffUserNames.get(uid) || 'Employee'}
                                                {uid !== live.createdBy && (
                                                    <button
                                                        type="button"
                                                        aria-label="Remove"
                                                        className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                                                        onClick={() => handleRemoveTeammate(live, uid)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-end gap-2">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium mb-2">Add teammate</p>
                                        <Select value={teammateToAdd} onValueChange={setTeammateToAdd}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={available.length ? 'Select an employee' : 'Everyone is already added'} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {available.map((o) => (
                                                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button
                                        disabled={!teammateToAdd}
                                        onClick={() => { handleAddTeammate(live, teammateToAdd); setTeammateToAdd(''); }}
                                    >
                                        <UserPlus className="mr-2 h-4 w-4" /> Add
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
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
            
            <ConfirmDeleteDialog
                open={!!clientToDelete}
                onOpenChange={(open) => !open && setClientToDelete(null)}
                onConfirm={handleDeleteClient}
                confirmText={clientToDelete?.name || ''}
                description={
                    <>
                        This action cannot be undone. This will permanently delete the client{' '}
                        <span className="font-semibold text-foreground">{clientToDelete?.name}</span> and all associated data.
                    </>
                }
            />

            <div className="bg-card border rounded-lg mt-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[180px]">Client</TableHead>
                            <TableHead className="w-[150px]">Contact</TableHead>
                            <TableHead className="w-[50px] text-center">PAX</TableHead>
                            {!isAdminOrManager && <TableHead className="w-[60px] text-center">Docs</TableHead>}
                            {isAdminOrManager && <TableHead className="w-[120px]">Assigned Employee</TableHead>}
                            <TableHead className="w-[120px]">Type</TableHead>
                            <TableHead className="w-[110px]">Visa Status</TableHead>
                            <TableHead className="w-[90px]">Status</TableHead>
                            <TableHead className="w-[100px]">Date Created</TableHead>
                            <TableHead>Last Log</TableHead>
                            <TableHead className="w-[56px] text-right sticky right-0 bg-card z-20">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && Array.from({length: 5}).map((_, i) => <ClientRowSkeleton key={i} />)}
                        {!isLoading && paginatedClients.map((client) => (
                        <TableRow key={client.id}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border" style={visaStatusGlow(client.visaStatus)}>
                                    <AvatarFallback>
                                        <User className="h-5 w-5 text-muted-foreground" />
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <Link href={`/clients/${client.id}`} className="hover:underline">{client.name}</Link>
                                    <div className="text-sm text-muted-foreground truncate">{client.preferredDestination || 'No destination set'}</div>
                                    {client.organizationId && orgNames.get(client.organizationId) && (
                                        <Link href={`/organizations/${client.organizationId}`} onClick={(e) => e.stopPropagation()}>
                                            <Badge variant="secondary" className="mt-1 gap-1 font-normal hover:bg-secondary/80">
                                                <Building2 className="h-3 w-3" />{orgNames.get(client.organizationId)}
                                            </Badge>
                                        </Link>
                                    )}
                                </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2 text-sm">
                                    <Mail className="h-4 w-4 text-muted-foreground"/>
                                    <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a>
                                </div>
                                <div className="flex items-center gap-2 text-sm mt-1">
                                    <Phone className="h-4 w-4 text-muted-foreground"/>
                                    <span>{client.phone}</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-center">{client.pax || 1}</TableCell>
                            {!isAdminOrManager && (
                                <TableCell className="text-center">{client.requiredDocuments?.length || 'N/A'}</TableCell>
                            )}
                            {isAdminOrManager && (
                                <TableCell className="text-sm text-muted-foreground">
                                    {client.assignedEmployees?.length
                                        ? client.assignedEmployees.map((id) => staffUserNames.get(id) || id).join(', ')
                                        : 'Unassigned'}
                                </TableCell>
                            )}
                            <TableCell>{(() => { const svc = Array.isArray(client.services) ? client.services : client.services ? [client.services] : []; return svc.length > 0 ? svc.map(s => serviceTypeMap[s] || s).join(', ') : 'N/A'; })()}{client.travelPurpose ? ` / ${travelPurposeMap[client.travelPurpose] || client.travelPurpose}`: ''}</TableCell>
                            <TableCell>
                                {client.visaStatus && (
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
                                        {client.visaStatus.replace(/([A-Z])/g, ' $1').trim()}
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell>
                                <Badge
                                variant={client.status === 'active' ? 'default' : 'secondary'}
                                className={
                                    `capitalize ` + (client.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
                                    client.status === 'prospect' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : '')
                                }
                                >{client.status}</Badge>
                            </TableCell>
                            <TableCell>{client.createdAt?.toDate ? format(client.createdAt.toDate(), 'P') : 'N/A'}</TableCell>
                            <TableCell>
                                <LastLogActivity clientId={client.id} />
                            </TableCell>
                            <TableCell className="text-right sticky right-0 bg-card z-10">
                                <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem asChild><Link href={`/clients/${client.id}`} className="flex items-center"><Eye className="mr-2 h-4 w-4"/>View Details</Link></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setEditingClient(client)}><Pencil className="mr-2 h-4 w-4"/>Edit</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setLogClient(client)}><FilePlus2 className="mr-2 h-4 w-4"/>Add Log</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setFollowUpClient(client)}><Bell className="mr-2 h-4 w-4"/>Add Follow-up</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setBookingClient(client)}><Book className="mr-2 h-4 w-4"/>Create Booking</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setShareClient(client)}><UserPlus className="mr-2 h-4 w-4"/>Share with teammate</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handleArchiveClient(client)}><Archive className="mr-2 h-4 w-4"/>Archive</DropdownMenuItem>
                                    {canDelete && (
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onSelect={() => setClientToDelete(client)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4"/>Delete
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {!isLoading && filteredClients.length === 0 && (
                    <div className="text-center p-8 text-muted-foreground">
                        <p>No clients found.</p>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
                <div>Showing {startClientNum} to {endClientNum} of {filteredClients.length} clients</div>
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                        <PaginationPrevious onClick={prevPage} style={{cursor: currentPage > 1 ? 'pointer' : 'default'}} />
                        </PaginationItem>
                        {paginationItems.map((item, index) => (
                        <PaginationItem key={index}>
                            {typeof item === 'number' ? (
                            <PaginationLink
                                onClick={() => goToPage(item)}
                                isActive={currentPage === item}
                                style={{cursor: 'pointer'}}
                            >
                                {item}
                            </PaginationLink>
                            ) : (
                            <PaginationEllipsis />
                            )}
                        </PaginationItem>
                        ))}
                        <PaginationItem>
                        <PaginationNext onClick={nextPage} style={{cursor: currentPage < totalPages ? 'pointer' : 'default'}}/>
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>
        </>
    );
}
