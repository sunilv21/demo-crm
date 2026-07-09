'use client';

import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, UploadCloud, CheckCircle2, AlertCircle, FileCheck } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Client, RequiredDocument } from '@/lib/types';
import { useState } from 'react';
import { useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, arrayUnion, serverTimestamp, arrayRemove } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams } from 'next/navigation';
import { RequiredDocumentForm } from '@/components/forms/required-document-form';
import { useToast } from '@/hooks/use-toast';

const DocumentStatusIcon = ({ status }: { status: RequiredDocument['status']}) => {
  switch (status) {
    case 'verified':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'received':
        return <FileCheck className="h-5 w-5 text-blue-500" />;
    case 'uploaded':
      return <UploadCloud className="h-5 w-5 text-indigo-500" />;
    case 'pending':
    default:
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  }
}

const PageSkeleton = () => (
    <div className="space-y-8">
        <PageHeader title="Client Documents" description="Manage all documents for this client.">
            <Skeleton className="h-10 w-44" />
        </PageHeader>
        <Card>
            <CardHeader><CardTitle><Skeleton className="h-6 w-48" /></CardTitle></CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </CardContent>
        </Card>
    </div>
);


export default function ClientDocumentsPage() {
  const params = useParams();
  const firestore = useFirestore();
  const clientId = params.clientId as string;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { toast } = useToast();

  const clientRef = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);
  
  const { data: client, isLoading } = useDoc<Client>(clientRef);

  const handleAddRequirement = (data: { names: string[] }) => {
    if (!clientRef) return;

    const newRequirements: RequiredDocument[] = data.names.map(name => ({
        name: name,
        status: 'pending'
    }));

    setDocumentNonBlocking(clientRef, {
        requiredDocuments: arrayUnion(...newRequirements),
        updatedAt: serverTimestamp()
    }, { merge: true });

    setIsFormOpen(false);
    toast({
        title: "Document requirements added",
        description: `${data.names.length} new document(s) have been added to the list.`
    })
  }

  const handleRemoveRequirement = (documentToRemove: RequiredDocument) => {
    if (!clientRef) return;
     setDocumentNonBlocking(clientRef, {
        requiredDocuments: arrayRemove(documentToRemove),
        updatedAt: serverTimestamp()
    }, { merge: true });
    toast({
        variant: "destructive",
        title: "Document requirement removed",
        description: `"${documentToRemove.name}" has been removed from the list.`
    })
  }

  const handleStatusChange = (documentToUpdate: RequiredDocument, newStatus: RequiredDocument['status']) => {
    if (!client || !client.requiredDocuments || !clientRef) return;

    const updatedDocuments = client.requiredDocuments.map(doc => 
        doc.name === documentToUpdate.name ? { ...doc, status: newStatus } : doc
    );
    
    setDocumentNonBlocking(clientRef, {
        requiredDocuments: updatedDocuments,
        updatedAt: serverTimestamp()
    }, { merge: true });

    toast({
        title: "Status updated",
        description: `Status for "${documentToUpdate.name}" changed to ${newStatus}.`
    })
  }

  if (isLoading || !client) {
    return <PageSkeleton />;
  }

  const documentRequirements = client.requiredDocuments || [];

  return (
    <div className="space-y-8">
      <PageHeader title="Client Documents" description="Manage all required and uploaded documents for this client.">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Document Requirement
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Document Requirement</DialogTitle>
                </DialogHeader>
                <RequiredDocumentForm 
                    onSubmit={handleAddRequirement} 
                    existingDocuments={documentRequirements.map(d => d.name)}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                    <Button type="submit" form="required-document-form">Add Requirement(s)</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </PageHeader>
      
      <Card>
        <CardHeader>
            <CardTitle>Document Requirements</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Document Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {documentRequirements.map((doc, index) => (
                        <TableRow key={index}>
                            <TableCell>
                                <DocumentStatusIcon status={doc.status} />
                            </TableCell>
                            <TableCell className="font-medium">{doc.name}</TableCell>
                            <TableCell>
                                 <Badge
                                    variant={
                                    doc.status === 'verified' ? 'default' :
                                    doc.status === 'received' ? 'secondary' :
                                    doc.status === 'uploaded' ? 'secondary' : 'outline'
                                    }
                                    className={
                                        doc.status === 'verified' ? 'bg-green-100 text-green-800 border-green-200' :
                                        doc.status === 'received' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                        doc.status === 'uploaded' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 
                                        'bg-yellow-100 text-yellow-800 border-yellow-200'
                                    }
                                >
                                    {doc.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label="Open document actions">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem disabled={doc.status === 'pending'} onClick={() => handleStatusChange(doc, 'pending')}>
                                            Mark as Pending
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={doc.status === 'received'} onClick={() => handleStatusChange(doc, 'received')}>
                                            Mark as Received
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={doc.status === 'uploaded'} onClick={() => handleStatusChange(doc, 'uploaded')}>
                                            Mark as Uploaded
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={doc.status === 'verified'} onClick={() => handleStatusChange(doc, 'verified')}>
                                            Mark as Verified
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive" onClick={() => handleRemoveRequirement(doc)}>
                                            Remove
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {documentRequirements.length === 0 && (
                <div className="text-center p-8 text-muted-foreground">
                    <p>No document requirements have been added for this client yet.</p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
