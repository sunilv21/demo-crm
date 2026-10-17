
'use client';

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
  Trash2,
  Edit,
  User,
  CheckCircle,
  Circle,
  FilePlus2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Client, CustomerLog, FollowUp } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { format, isPast } from 'date-fns';
import { FollowUpForm } from '@/components/forms/follow-up-form';
import { useState, useMemo } from 'react';
import { cn, clientSlug } from '@/lib/utils';
import { Card } from '../ui/card';
import { CustomerLogForm } from '../forms/customer-log-form';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';

const RowSkeleton = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell className="w-[50px]"><MoreHorizontal className="h-4 w-4" /></TableCell>
    </TableRow>
);

export function FollowUpList() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [logClient, setLogClient] = useState<Partial<Client> & {id:string, name: string} | null>(null);
  const [followUpToDelete, setFollowUpToDelete] = useState<FollowUp | null>(null);

  const ready = !!firestore && !!user && !isUserLoading;

  const followUpsQuery = useMemoFirebase(() => {
    if (!ready) return null;
    return collection(firestore!, 'follow_ups');
  }, [ready, firestore]);

  const { data: followUps, isLoading } = useCollection<FollowUp>(followUpsQuery);

  const filteredFollowUps = useMemo(() => {
    if (!followUps) return [];
    
    const byDate = [...followUps].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const done = byDate.filter(f => f.done);
    const notDone = byDate.filter(f => !f.done);

    let results = [...notDone, ...done]; // Show not-done tasks first

    if (!searchTerm) return results;
    
    return results.filter(f => 
        f.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.notes && f.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [followUps, searchTerm]);

  const handleFormSubmit = (values: Omit<FollowUp, 'id'|'clientName'|'clientEmail'|'clientPhone'>, client: Client) => {
    if (!user || !firestore) return;
    
    if (editingFollowUp) {
        const followUpRef = doc(firestore, 'follow_ups', editingFollowUp.id);
        setDocumentNonBlocking(followUpRef, {
            ...values,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
        }, { merge: true });
        toast({ title: "Follow-up updated" });
    } else {
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
        toast({ title: "Follow-up created" });
    }

    setIsFormOpen(false);
    setEditingFollowUp(null);
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

  const handleToggleDone = (followUp: FollowUp) => {
    if (!user || !firestore) return;
    const followUpRef = doc(firestore, 'follow_ups', followUp.id);
    setDocumentNonBlocking(followUpRef, {
        done: !followUp.done,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
    }, { merge: true });
    toast({ title: `Follow-up marked as ${!followUp.done ? 'complete' : 'incomplete'}.` });
  };

  const handleDelete = (followUp: FollowUp) => {
    if (!firestore) return;
    const followUpRef = doc(firestore, 'follow_ups', followUp.id);
    deleteDocumentNonBlocking(followUpRef);
    toast({ variant: 'destructive', title: "Follow-up deleted" });
    setFollowUpToDelete(null);
  };

  const openEditDialog = (followUp: FollowUp) => {
    setEditingFollowUp(followUp);
    setIsFormOpen(true);
  };

  const openNewDialog = () => {
    setEditingFollowUp(null);
    setIsFormOpen(true);
  };
  
  const openLogDialog = (followUp: FollowUp) => {
    setLogClient({
      id: followUp.clientId,
      name: followUp.clientName,
      email: followUp.clientEmail,
      phone: followUp.clientPhone,
    } as Client);
  }

  const PriorityBadge = ({ priority }: { priority: FollowUp['priority'] }) => {
    const priorityStyles = {
        high: 'bg-red-100 text-red-800 border-red-200',
        medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        low: 'bg-blue-100 text-blue-800 border-blue-200',
    };
    return <Badge className={cn(priorityStyles[priority], 'capitalize')}>{priority}</Badge>;
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                  placeholder="Search by client or notes..."
                  className="pl-10 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
          <Button onClick={openNewDialog}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Follow-up
          </Button>
      </div>

       <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingFollowUp ? 'Edit' : 'Create'} Follow-up</DialogTitle>
            </DialogHeader>
            <FollowUpForm onSubmit={handleFormSubmit} followUp={editingFollowUp}/>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button type="submit" form="follow-up-form">{editingFollowUp ? 'Save Changes' : 'Create'}</Button>
            </DialogFooter>
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
      
      <Card>
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading && Array.from({length: 5}).map((_, i) => <RowSkeleton key={i} />)}
                {!isLoading && filteredFollowUps?.map((followUp) => {
                  const isMissed = isPast(new Date(followUp.date)) && !followUp.done;
                  return (
                    <TableRow key={followUp.id} className={cn(followUp.done && 'text-muted-foreground')}>
                        <TableCell className="font-medium">
                            <Link href={`/clients/${clientSlug(followUp.clientName ?? '', followUp.clientId)}`} className={cn("hover:underline flex items-center gap-2", !followUp.done && 'text-foreground' )}>
                                <User className="h-4 w-4" />
                                {followUp.clientName}
                            </Link>
                        </TableCell>
                        <TableCell>
                            {followUp.clientEmail && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Mail className="h-4 w-4"/>
                                    <a href={`mailto:${followUp.clientEmail}`} className="hover:underline">{followUp.clientEmail}</a>
                                </div>
                            )}
                             {followUp.clientPhone && (
                                <div className="flex items-center gap-2 text-sm mt-1">
                                    <Phone className="h-4 w-4"/>
                                    <span>{followUp.clientPhone}</span>
                                </div>
                            )}
                        </TableCell>
                        <TableCell className={cn(
                            isMissed && 'text-red-600 font-medium',
                            followUp.done && 'text-green-600'
                        )}>
                            {format(new Date(followUp.date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className={cn("max-w-xs truncate", followUp.done && 'line-through')} title={followUp.notes || ''}>{followUp.notes}</TableCell>
                        <TableCell>
                            <PriorityBadge priority={followUp.priority} />
                        </TableCell>
                        <TableCell>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => handleToggleDone(followUp)}>
                                        {followUp.done ? <Circle className="mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                        {followUp.done ? 'Mark as incomplete' : 'Mark as complete'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => openLogDialog(followUp)}>
                                      <FilePlus2 className="mr-2 h-4 w-4"/>
                                      Add Log
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditDialog(followUp)}><Edit className="mr-2 h-4 w-4"/>Edit</DropdownMenuItem>
                                    <DropdownMenuItem asChild><Link href={`/clients/${clientSlug(followUp.clientName ?? '', followUp.clientId)}`} className="flex items-center"><Eye className="mr-2 h-4 w-4"/>View Client</Link></DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onSelect={(e) => { e.preventDefault(); setFollowUpToDelete(followUp); }}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
        </Table>
        { !isLoading && followUps?.length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
                No follow-ups found.
            </div>
        )}
      </Card>

      <ConfirmDeleteDialog
        open={!!followUpToDelete}
        onOpenChange={(o) => !o && setFollowUpToDelete(null)}
        onConfirm={() => followUpToDelete && handleDelete(followUpToDelete)}
        confirmText={followUpToDelete?.clientName || ''}
        description={
          <>
            This will permanently delete the follow-up for{' '}
            <span className="font-semibold text-foreground">{followUpToDelete?.clientName}</span>
            {followUpToDelete?.date ? ` on ${followUpToDelete.date}` : ''}. To confirm, type the client name below.
          </>
        }
      />
    </>
  );
}
