'use client';

import { PageHeader } from '@/components/common/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import type { Client, CustomerLog } from '@/lib/types';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import { ClientQuickAccess } from '@/components/clients/client-quick-access';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomerLogForm } from '@/components/forms/customer-log-form';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { FollowUpManager } from '@/components/clients/follow-up-manager';

function ClientDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const clientId = params.clientId as string;
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const clientRef = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);
  
  const logsCollectionRef = useMemoFirebase(() => {
    if(!firestore) return null;
    return collection(firestore, 'customer_logs');
  }, [firestore]);

  const { data: client, isLoading } = useDoc<Client>(clientRef);
  
  const handleUpdateClient = (updatedData: Partial<Client>) => {
    if (!clientRef) return;
    setDocumentNonBlocking(clientRef, { ...updatedData, updatedAt: serverTimestamp() }, { merge: true });
    toast({
        title: 'Client Updated',
        description: 'The client details have been successfully saved.',
    });
  };

  const handleAddLog = (newLogData: Omit<CustomerLog, 'id' | 'timestamp' | 'clientId' | 'clientName' | 'userName'>) => {
    if (!logsCollectionRef || !client || !user || !clientRef) return;
    
    // Add the new log entry
    addDocumentNonBlocking(logsCollectionRef, {
      ...newLogData,
      clientId: client.id,
      clientName: client.name,
      userName: user.displayName,
    });

    // Also update the client's updatedAt timestamp
    setDocumentNonBlocking(clientRef, { updatedAt: serverTimestamp() }, { merge: true });
    
    toast({
        title: "Log Added",
        description: "A new entry has been added to the customer's log.",
    })
  };

  return (
    <>
      <PageHeader title={isLoading ? <Skeleton className="h-8 w-48" /> : client?.name || "Client"} />
      <div className="grid lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-8">
          {children}
        </div>
        <aside className="lg:col-span-1 space-y-6">
          <div className="sticky top-20 space-y-6">
            <ClientQuickAccess />
            {client && (
              <>
                <Card>
                    <CardHeader>
                        <CardTitle>Add a Log</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <CustomerLogForm client={client} onSubmit={handleAddLog} />
                    </CardContent>
                </Card>
                <FollowUpManager client={client} />
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

export default ClientDetailLayout;
