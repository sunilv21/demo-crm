'use client';

import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Booking, Invoice } from '@/lib/types';
import { useParams } from 'next/navigation';
import { clientIdFromSlug } from '@/lib/utils';
import { format } from 'date-fns';
import { useMemo } from 'react';

const statusVariant = (status?: string) =>
  status === 'paid' ? 'default' : status === 'overdue' ? 'destructive' : 'secondary';

export default function ClientInvoicesPage() {
  const params = useParams();
  const clientId = clientIdFromSlug(params.clientId as string);
  const firestore = useFirestore();
  const { isAdminOrManager } = useAppUser();

  const bookingsQuery = useMemoFirebase(
    () => (firestore && clientId ? query(collection(firestore, 'bookings'), where('clientId', '==', clientId)) : null),
    [firestore, clientId]
  );
  const { data: bookings } = useCollection<Booking>(bookingsQuery);

  // Invoices are readable by admins/managers only (per Firestore rules).
  const invoicesQuery = useMemoFirebase(
    () => (firestore && isAdminOrManager ? collection(firestore, 'invoices') : null),
    [firestore, isAdminOrManager]
  );
  const { data: invoices, isLoading } = useCollection<Invoice>(invoicesQuery);

  const clientInvoices = useMemo(() => {
    const bookingIds = new Set((bookings ?? []).map((b) => b.id));
    return (invoices ?? []).filter((inv) => bookingIds.has(inv.bookingId));
  }, [invoices, bookings]);

  if (!isAdminOrManager) {
    return (
      <>
        <PageHeader title="Client Invoices" description="Manage all invoices for this client." />
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
          <p>You don&apos;t have permission to view invoices.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Client Invoices" description="Invoices linked to this client's bookings." />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                  </TableRow>
                ))}
              {!isLoading &&
                clientInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{`INV-${inv.id.slice(-5)}`}</TableCell>
                    <TableCell>{`BK-${inv.bookingId.slice(-5)}`}</TableCell>
                    <TableCell className="text-right">₹{(inv.amount || 0).toLocaleString()}</TableCell>
                    <TableCell>{inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inv.status)} className="capitalize">
                        {inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {!isLoading && clientInvoices.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No invoices for this client yet.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
