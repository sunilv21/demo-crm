
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
import type { Client, CustomerLog } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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


const ClientRowSkeleton = () => (
    <TableRow>
      <TableCell className="font-medium w-[250px]"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-24" /></div></TableCell>
      <TableCell className="w-[240px]"><Skeleton className="h-4 w-32" /></TableCell>
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);

  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'clients');
  }, [firestore]);

  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  useEffect(() => {
    if (clients) {
      if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        const results = clients.filter(client =>
          client.name.toLowerCase().includes(lowercasedTerm) ||
          (client.email && client.email.toLowerCase().includes(lowercasedTerm)) ||
          client.status.toLowerCase().includes(lowercasedTerm)
        );
        setFilteredClients(results);
      } else {
        setFilteredClients(clients);
      }
    }
  }, [searchTerm, clients]);
  
  const handleAddClient = (newClientData: Omit<Client, 'id' | 'travelHistory' | 'lastFollowUp' | 'followUpCompleted'>) => {
    if (!clientsQuery) return;
    addDocumentNonBlocking(clientsQuery, newClientData);
    setIsFormOpen(false);
    toast({
        title: "Client Created",
        description: `New client "${newClientData.name}" has been added.`,
    })
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


  const handleShare = () => {
    const intakeUrl = `${window.location.origin}/intake`;
    navigator.clipboard.writeText(intakeUrl);
    toast({
      title: "Link Copied!",
      description: "The client intake form link has been copied to your clipboard.",
    });
  };

  const displayClients = searchTerm ? filteredClients : clients || [];

  return (
    <>
      <PageHeader title="Clients" description="Manage all your customer profiles.">
        <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                placeholder="Search by name, email, or status..."
                className="pl-10 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
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
      
      <Dialog open={!!logClient} onOpenChange={(open) => !open && setLogClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Log for {logClient?.name}</DialogTitle>
          </DialogHeader>
          {logClient && <CustomerLogForm client={logClient} onSubmit={handleAddLog} />}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <div className="bg-card border rounded-lg mt-4">
        <Table>
        <TableHeader>
            <TableRow>
            <TableHead className="w-[250px]">Client</TableHead>
            <TableHead className="w-[240px]">Contact</TableHead>
            <TableHead className="w-[100px]">Documents</TableHead>
            <TableHead className="w-[150px]">Type</TableHead>
            <TableHead className="w-[120px]">Visa Status</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead className="w-[120px]">Last Activity</TableHead>
            <TableHead>Last Log</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {isLoading && Array.from({length: 5}).map((_, i) => <ClientRowSkeleton key={i} />)}
            {!isLoading && displayClients.map((client) => {
              const receivedDocs = client.requiredDocuments?.filter(d => d.status === 'received').length || 0;
              const totalDocs = client.requiredDocuments?.length || 0;
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
                    <TableCell>{client.updatedAt?.toDate ? format(client.updatedAt.toDate(), 'P') : 'N/A'}</TableCell>
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
                            <DropdownMenuItem>Edit</DropdownMenuItem>
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
        { !isLoading && displayClients.length === 0 && (
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
          <div>Showing {displayClients.length} of {clients?.length || 0}</div>
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
              <PaginationNext href="#" />
              </PaginationItem>
          </PaginationContent>
          </Pagination>
      </div>
    </>
  );
}
