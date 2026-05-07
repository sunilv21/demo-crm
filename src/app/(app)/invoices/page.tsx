'use client';

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
import { PlusCircle, Search, MoreHorizontal, ChevronDown } from 'lucide-react';
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
import type { Invoice } from '@/lib/types';
import { useState, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useAppUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

const InvoiceRowSkeleton = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell className="w-[50px]"><MoreHorizontal className="h-4 w-4" /></TableCell>
    </TableRow>
);

export default function InvoicesPage() {
  const firestore = useFirestore();
  const { canManageInvoices } = useAppUser();
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const invoicesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'invoices');
  }, [firestore]);

  const { data: invoices, isLoading } = useCollection<Invoice>(invoicesQuery);

  useEffect(() => {
    if (!invoices) return;
    let results = invoices;
    if (searchTerm) {
      results = results.filter(invoice =>
        invoice.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `INV-${invoice.id.slice(-5)}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (statusFilter !== 'All') {
      results = results.filter(invoice => invoice.status === statusFilter.toLowerCase());
    }
    setFilteredInvoices(results);
  }, [searchTerm, statusFilter, invoices]);

  const displayInvoices = searchTerm || statusFilter !== 'All' ? filteredInvoices : invoices || [];

  return (
    <>
      <PageHeader title="Invoices" description="Generate invoices and track payments.">
        {canManageInvoices && (
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        )}
      </PageHeader>
        <div className="bg-card border rounded-lg p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                placeholder="Search by Invoice ID or Client Name..."
                className="pl-10 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-2">
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full md:w-auto">
                    Status: {statusFilter} <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {['All', 'Paid', 'Unpaid', 'Overdue'].map(status => (
                        <DropdownMenuItem key={status} onSelect={() => setStatusFilter(status)}>{status}</DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
                </DropdownMenu>
            </div>
            </div>
        </div>
      <div className="bg-card border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice ID</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
             {isLoading && Array.from({length: 5}).map((_, i) => <InvoiceRowSkeleton key={i} />)}
            {!isLoading && displayInvoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{`INV-${invoice.id.slice(-5)}`}</TableCell>
                <TableCell>{invoice.clientName}</TableCell>
                <TableCell>₹{invoice.amount.toLocaleString()}</TableCell>
                <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge 
                    variant={
                      invoice.status === 'paid' ? 'default' : 
                      invoice.status === 'unpaid' ? 'secondary' : 'destructive'
                    }
                    className={
                      `capitalize ` + (invoice.status === 'paid' ? 'bg-green-100 text-green-800 border-green-200' :
                      invoice.status === 'unpaid' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : '')
                    }
                  >
                    {invoice.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      {canManageInvoices && (
                        <DropdownMenuItem>Mark as Paid</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
         { !isLoading && displayInvoices.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            No invoices found.
          </div>
        )}
      </div>
       <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
        <div>Showing {displayInvoices.length} of {invoices?.length || 0}</div>
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
