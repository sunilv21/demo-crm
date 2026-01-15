'use client';

import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Lead } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { LeadForm } from '@/components/forms/lead-form';
import * as React from 'react';

const statusColumns: { title: string; status: Lead['status'] }[] = [
  { title: 'New', status: 'new' },
  { title: 'Contacted', status: 'contacted' },
  { title: 'Proposal', status: 'proposal' },
  { title: 'Won', status: 'won' },
  { title: 'Lost', status: 'lost' },
];

const LeadCardSkeleton = () => (
  <Card className="mb-4">
    <CardContent className="p-4 flex items-center space-x-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </CardContent>
  </Card>
);

const LeadCard = ({ lead }: { lead: Lead }) => (
  <Card className="mb-4">
    <CardContent className="p-4 flex items-center space-x-4">
      <Avatar>
        <AvatarImage src={lead.avatar} data-ai-hint="person face" />
        <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <p className="font-medium">{lead.name}</p>
        <p className="text-sm text-muted-foreground">{lead.phone}</p>
      </div>
    </CardContent>
  </Card>
);

const KanbanColumn = ({ title, leads, isLoading }: { title: string; leads: Lead[], isLoading: boolean }) => (
  <div className="flex-1">
    <Card className="bg-muted/50">
      <CardHeader>
        <CardTitle className="text-base font-medium">{title} ({leads.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && Array.from({ length: 2 }).map((_, i) => <LeadCardSkeleton key={i} />)}
        {!isLoading && leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
        {!isLoading && leads.length === 0 && (
          <div className="text-center p-4 text-sm text-muted-foreground">
            No leads in this stage.
          </div>
        )}
      </CardContent>
    </Card>
  </div>
);

export default function LeadsPage() {
  const firestore = useFirestore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { user } = useUser();

  const leadsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'leads');
  }, [firestore]);

  const { data: leads, isLoading } = useCollection<Omit<Lead, 'id'>>(leadsQuery);
  
  const handleAddLead = (newLeadData: Omit<Lead, 'id' | 'avatar'>) => {
    if (!leadsQuery || !user) return;
    
    addDocumentNonBlocking(leadsQuery, newLeadData);
    setIsFormOpen(false);
  };

  const leadsByStatus = (status: Lead['status']) => {
    return leads?.filter(lead => lead.status === status) || [];
  }

  return (
    <>
      <PageHeader title="Leads" description="Track and manage new leads through the sales pipeline.">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Lead</DialogTitle>
            </DialogHeader>
            <LeadForm onSubmit={handleAddLead} />
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button type="submit" form="lead-form" className="bg-green-600 hover:bg-green-700">
                    Save
                </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <div className="flex flex-col md:flex-row gap-6 overflow-x-auto pb-4">
        {statusColumns.map(col => (
          <KanbanColumn 
            key={col.status} 
            title={col.title} 
            leads={leadsByStatus(col.status)}
            isLoading={isLoading} 
          />
        ))}
      </div>
    </>
  );
}
