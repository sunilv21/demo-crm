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
import { Input } from '@/components/ui/input';
import { ArchiveRestore, MoreHorizontal, Search, Eye, FilePlus2, Pencil, Trash2, User, Lock } from 'lucide-react';
import type { Client, CustomerLog } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking, useUser, useAppUser } from '@/firebase';
import { collection, query, where, doc, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import Link from 'next/link';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
} from "@/components/ui/alert-dialog";
import { ClientForm } from '@/components/forms/client-form';
import { CustomerLogForm } from '@/components/forms/customer-log-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HotelsTab } from '@/components/database/hotels-tab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


const ArchivedClientRowSkeleton = () => (
    <TableRow>
      <TableCell className="font-medium w-[250px]"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-24" /></div></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="w-[50px]"><MoreHorizontal className="h-4 w-4" /></TableCell>
    </TableRow>
);

export default function DatabasePage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdminOrManager } = useAppUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const { toast } = useToast();

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [logClient, setLogClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  // Archived Clients lists every inactive client with no ownership filter,
  // which only admin/manager are allowed to read (see firestore.rules) — so
  // the query only runs for them. Everyone else still gets the Hotels tab
  // below, which has no such restriction.
  const archivedClientsQuery = useMemoFirebase(() => {
    if (!firestore || !isAdminOrManager) return null;
    return query(collection(firestore, 'clients'), where('status', '==', 'inactive'));
  }, [firestore, isAdminOrManager]);

  const { data: clients, isLoading } = useCollection<Client>(archivedClientsQuery);

  useEffect(() => {
    if (clients) {
      if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        const results = clients.filter(client =>
          client.name.toLowerCase().includes(lowercasedTerm) ||
          (client.email && client.email.toLowerCase().includes(lowercasedTerm))
        );
        setFilteredClients(results);
      } else {
        setFilteredClients(clients);
      }
    }
  }, [searchTerm, clients]);

  const handleUnarchiveClient = (clientToUnarchive: Client) => {
    if (!firestore) return;
    const clientDocRef = doc(firestore, 'clients', clientToUnarchive.id);
    setDocumentNonBlocking(clientDocRef, { status: 'active', updatedAt: serverTimestamp() }, { merge: true });
    toast({
      title: 'Client Unarchived',
      description: `Client "${clientToUnarchive.name}" has been restored to the active client list.`,
    });
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

  const handleAddLog = (newLogData: Omit<CustomerLog, 'id' | 'timestamp' | 'clientId' | 'clientName' | 'userName'>) => {
    if (!firestore || !logClient || !user) return;
    
    const logsCollectionRef = collection(firestore, 'customer_logs');
    addDocumentNonBlocking(logsCollectionRef, {
      ...newLogData,
      clientId: logClient.id,
      clientName: logClient.name,
      userName: user.displayName,
    });

    const clientRef = doc(firestore, 'clients', logClient.id);
    setDocumentNonBlocking(clientRef, { updatedAt: serverTimestamp() }, { merge: true });
    
    setLogClient(null);
    toast({
        title: "Log Added",
        description: "A new entry has been added to the customer's log.",
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


  const displayClients = searchTerm ? filteredClients : clients || [];

  return (
    <>
      <PageHeader title="Database" description="Archived clients and hotel master data." />

      <Tabs defaultValue={isAdminOrManager ? 'archived-clients' : 'hotels'} className="mt-2">
        <TabsList>
          <TabsTrigger value="archived-clients">Archived Clients</TabsTrigger>
          <TabsTrigger value="hotels">Hotels</TabsTrigger>
        </TabsList>
        <TabsContent value="archived-clients" className="mt-4 space-y-4">
      {!isAdminOrManager ? (
        <div className="flex items-center justify-center py-12">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />Restricted</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Archived clients are only visible to admins/managers.
            </CardContent>
          </Card>
        </div>
      ) : (
      <>
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
        placeholder="Search by name or email..."
        className="pl-10 w-full"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

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
      
      <Dialog open={!!logClient} onOpenChange={(open) => !open && setLogClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Log for {logClient?.name}</DialogTitle>
          </DialogHeader>
          {logClient && <CustomerLogForm client={logClient} onSubmit={handleAddLog} />}
        </DialogContent>
      </Dialog>

      <div>
        <div className="bg-card border rounded-lg mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Client</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Last Destination</TableHead>
                <TableHead>Date Archived</TableHead>
                <TableHead className="w-[50px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({length: 5}).map((_, i) => <ArchivedClientRowSkeleton key={i} />)}
              {!isLoading && displayClients.map((client) => (
                  <TableRow key={client.id}>
                      <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 border">
                                  <AvatarFallback>
                                      <User className="h-5 w-5 text-muted-foreground" />
                                  </AvatarFallback>
                              </Avatar>
                              <div>
                                  <Link href={`/clients/${client.id}`} className="hover:underline">{client.name}</Link>
                                  <div className="text-sm text-muted-foreground truncate">{client.email || 'No email'}</div>
                              </div>
                          </div>
                      </TableCell>
                      <TableCell>{client.phone}</TableCell>
                      <TableCell>{client.preferredDestination || 'N/A'}</TableCell>
                      <TableCell>{client.updatedAt?.toDate ? format(client.updatedAt.toDate(), 'P') : 'N/A'}</TableCell>
                      <TableCell className="text-right">
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Open record actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onSelect={() => handleUnarchiveClient(client)}>
                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                Unarchive
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild><Link href={`/clients/${client.id}`} className="flex items-center"><Eye className="mr-2 h-4 w-4"/>View Details</Link></DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLogClient(client)}>
                                  <FilePlus2 className="mr-2 h-4 w-4"/>
                                  Add Log
                              </DropdownMenuItem>
                               <DropdownMenuItem onSelect={() => setEditingClient(client)}>
                                  <Pencil className="mr-2 h-4 w-4"/>
                                  Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                  className="text-destructive"
                                  onSelect={(e) => { e.preventDefault(); setClientToDelete(client); }}
                              >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
          {!isLoading && displayClients.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                  <p>No archived clients found.</p>
              </div>
          )}
        </div>

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
      </div>
      </>
      )}
        </TabsContent>
        <TabsContent value="hotels" className="mt-4">
          <HotelsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
