'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/stat-card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ArrowLeft, Building2, Mail, Phone, User, Users, PlusCircle, UserPlus, Link2Off, MoreHorizontal, Upload, Share2 } from 'lucide-react';
import type { Organization, Client, Booking, User as StaffUser } from '@/lib/types';
import { ClientForm } from '@/components/forms/client-form';
import { ImportClientsDialog } from '@/components/clients/import-clients-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
  useUser,
  useAppUser,
  addDocumentNonBlocking,
} from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { copyToClipboard, clientSlug } from '@/lib/utils';

// A booking counts toward a client's financials unless it was cancelled.
const isLive = (b: Booking) => b.status !== 'cancelled';

// Paid / balance fall back to derived values when the cached fields are absent.
const paidOf = (b: Booking) =>
  b.amountPaid ?? (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
const totalOf = (b: Booking) => b.total || 0;
const balanceOf = (b: Booking) => b.balanceAmount ?? (totalOf(b) - paidOf(b));

const inr = (n: number) => `₹${n.toLocaleString()}`;

export default function OrganizationDetailPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdminOrManager, canViewRevenue } = useAppUser();
  const { toast } = useToast();
  const params = useParams();
  const orgId = params.orgId as string;
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const orgRef = useMemoFirebase(
    () => (firestore && orgId ? doc(firestore, 'organizations', orgId) : null),
    [firestore, orgId]
  );
  const { data: org, isLoading: isLoadingOrg } = useDoc<Organization>(orgRef);

  // Clients: same rules-safe pattern as the Clients page, then filter to this org.
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (!isAdminOrManager) {
      if (!user) return null;
      return query(collection(firestore, 'clients'), where('assignedEmployees', 'array-contains', user.uid));
    }
    return collection(firestore, 'clients');
  }, [firestore, isAdminOrManager, user]);
  const { data: allClients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);

  const orgClients = useMemo(
    () => (allClients || []).filter((c) => c.organizationId === orgId),
    [allClients, orgId]
  );

  // Clients not yet in this org — candidates for the "Link existing" picker.
  const linkableClients = useMemo(
    () => (allClients || []).filter((c) => c.organizationId !== orgId),
    [allClients, orgId]
  );

  // Staff list so admins/managers can assign a newly-created client.
  const usersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  const { data: staffUsers } = useCollection<StaffUser>(usersQuery);
  const staffOptions = useMemo(() => (staffUsers || []).map((u) => ({ id: u.id, name: u.name })), [staffUsers]);

  const handleAddClient = (data: Partial<Client>) => {
    if (!firestore) return;
    // Force the link to this org regardless of the form selector, and give
    // non-admin creators ownership (matches the Clients page behaviour).
    const dataToSave: Partial<Client> = { ...data, organizationId: orgId };
    if (!isAdminOrManager && user) dataToSave.assignedEmployees = [user.uid];
    addDocumentNonBlocking(collection(firestore, 'clients'), dataToSave);
    setIsAddClientOpen(false);
    toast({ title: 'Client Added', description: `"${data.name}" was added to ${org?.name ?? 'the organization'}.` });
  };

  const handleLinkClient = (client: Client) => {
    if (!firestore || !user) return;
    setDocumentNonBlocking(
      doc(firestore, 'clients', client.id),
      { organizationId: orgId, updatedAt: serverTimestamp(), updatedBy: user.uid },
      { merge: true }
    );
    toast({ title: 'Client Linked', description: `"${client.name}" is now part of ${org?.name ?? 'the organization'}.` });
  };

  const handleShareIntake = async () => {
    const url = `${window.location.origin}/intake?org=${orgId}${org?.name ? `&orgName=${encodeURIComponent(org.name)}` : ''}`;
    const copied = await copyToClipboard(url);
    toast({
      title: copied ? 'Intake link copied' : 'Copy the intake link',
      description: copied
        ? `Anyone who fills this form is added to ${org?.name ?? 'this organization'}.`
        : url,
    });
  };

  const handleUnlinkClient = (client: Client) => {
    if (!firestore || !user) return;
    setDocumentNonBlocking(
      doc(firestore, 'clients', client.id),
      { organizationId: null, updatedAt: serverTimestamp(), updatedBy: user.uid },
      { merge: true }
    );
    toast({ title: 'Client Removed', description: `"${client.name}" is no longer in this organization.` });
  };

  // Bookings: admins/managers see all; other roles only their own (rules-safe).
  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (!isAdminOrManager) {
      if (!user) return null;
      return query(collection(firestore, 'bookings'), where('createdBy', '==', user.uid));
    }
    return collection(firestore, 'bookings');
  }, [firestore, isAdminOrManager, user]);
  const { data: allBookings, isLoading: isLoadingBookings } = useCollection<Booking>(bookingsQuery);

  // Group each org client's live bookings and roll up their money.
  const rows = useMemo(() => {
    const byClient = new Map<string, Booking[]>();
    (allBookings || []).forEach((b) => {
      if (!b.clientId) return;
      if (!byClient.has(b.clientId)) byClient.set(b.clientId, []);
      byClient.get(b.clientId)!.push(b);
    });
    return orgClients.map((c) => {
      const live = (byClient.get(c.id) || []).filter(isLive);
      const total = live.reduce((s, b) => s + totalOf(b), 0);
      const paid = live.reduce((s, b) => s + paidOf(b), 0);
      const balance = live.reduce((s, b) => s + balanceOf(b), 0);
      return { client: c, bookingCount: live.length, total, paid, balance };
    });
  }, [orgClients, allBookings]);

  const grand = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          bookings: acc.bookings + r.bookingCount,
          total: acc.total + r.total,
          paid: acc.paid + r.paid,
          balance: acc.balance + r.balance,
        }),
        { bookings: 0, total: 0, paid: 0, balance: 0 }
      ),
    [rows]
  );

  const isLoading = isLoadingOrg || isLoadingClients || isLoadingBookings;
  const moneyCols = canViewRevenue ? 3 : 0;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-muted-foreground" />
            {isLoadingOrg ? <Skeleton className="h-8 w-56" /> : org?.name || 'Organization'}
          </span>
        }
        description="All clients under this organization and their totals."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/organizations"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
          </Button>
          <Button variant="outline" onClick={() => setIsLinkOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />Link Existing Client
          </Button>
          <Button variant="outline" onClick={handleShareIntake}>
            <Share2 className="mr-2 h-4 w-4" />Share Intake Form
          </Button>
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />Import Clients
          </Button>
          <Button onClick={() => setIsAddClientOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />Add Client
          </Button>
        </div>
      </PageHeader>

      <ImportClientsDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        defaultOrganizationId={orgId}
        defaultOrganizationName={org?.name}
      />

      {/* Create a brand-new client already linked to this organization */}
      <Dialog open={isAddClientOpen} onOpenChange={setIsAddClientOpen}>
        <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] p-0 gap-0">
          <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">
            <DialogTitle>Add Client to {org?.name}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <ClientForm
              onSubmit={handleAddClient}
              onCancel={() => setIsAddClientOpen(false)}
              canAssign={isAdminOrManager}
              staffUsers={staffOptions}
              organizations={org ? [{ id: org.id, name: org.name }] : []}
              defaultOrganizationId={orgId}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Link one or more already-created clients into this organization */}
      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent className="md:max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle>Link Existing Clients</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select clients to add to {org?.name}. They stay in your Clients list and their bookings roll up here.
          </p>
          <Command className="rounded-md border">
            <CommandInput placeholder="Search clients by name..." />
            <CommandList className="max-h-72">
              <CommandEmpty>No clients available to link.</CommandEmpty>
              <CommandGroup>
                {linkableClients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => handleLinkClient(c)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.phone}</span>
                    </span>
                    {c.organizationId && (
                      <Badge variant="outline" className="text-xs font-normal">In another org</Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsLinkOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {org && (org.contactPerson || org.email || org.phone || org.gstNumber || org.billingAddress) && (
        <Card className="mb-6">
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 text-sm">
            {org.contactPerson && (
              <div><div className="text-muted-foreground text-xs">Contact Person</div>{org.contactPerson}</div>
            )}
            {org.email && (
              <div><div className="text-muted-foreground text-xs">Email</div><span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{org.email}</span></div>
            )}
            {org.phone && (
              <div><div className="text-muted-foreground text-xs">Phone</div><span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{org.phone}</span></div>
            )}
            {org.gstNumber && (
              <div><div className="text-muted-foreground text-xs">GST</div>{org.gstNumber}</div>
            )}
            {org.billingAddress && (
              <div className="sm:col-span-2 lg:col-span-4"><div className="text-muted-foreground text-xs">Billing Address</div>{org.billingAddress}</div>
            )}
          </CardContent>
        </Card>
      )}

      <div className={`grid gap-4 mb-6 ${canViewRevenue ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'}`}>
        <StatCard title="Clients" value={isLoading ? '...' : orgClients.length.toString()} />
        <StatCard title="Bookings" value={isLoading ? '...' : grand.bookings.toString()} />
        {canViewRevenue && (
          <StatCard title="Total Booked" value={isLoading ? '...' : inr(grand.total)} variant="warning" />
        )}
        {canViewRevenue && (
          <StatCard title="Balance Due" value={isLoading ? '...' : inr(grand.balance)} variant={grand.balance > 0 ? 'danger' : 'default'} />
        )}
      </div>

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-center">Bookings</TableHead>
              {canViewRevenue && <TableHead className="text-right">Total Booked</TableHead>}
              {canViewRevenue && <TableHead className="text-right">Paid</TableHead>}
              {canViewRevenue && <TableHead className="text-right">Balance</TableHead>}
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  {canViewRevenue && <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>}
                  {canViewRevenue && <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>}
                  {canViewRevenue && <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>}
                  <TableCell></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              rows.map(({ client, bookingCount, total, paid, balance }) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Link href={`/clients/${clientSlug(client.name, client.id)}`} className="hover:underline">{client.name}</Link>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {client.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</div>}
                    <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{client.phone}</div>
                  </TableCell>
                  <TableCell className="text-center">{bookingCount}</TableCell>
                  {canViewRevenue && <TableCell className="text-right">{inr(total)}</TableCell>}
                  {canViewRevenue && <TableCell className="text-right text-green-600">{inr(paid)}</TableCell>}
                  {canViewRevenue && (
                    <TableCell className={`text-right font-medium ${balance > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {inr(balance)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open client actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/clients/${clientSlug(client.name, client.id)}/bookings`}>View bookings</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/clients/${clientSlug(client.name, client.id)}`}>Client profile</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => handleUnlinkClient(client)}>
                          <Link2Off className="mr-2 h-4 w-4" />Remove from organization
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
          {!isLoading && rows.length > 0 && canViewRevenue && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Organization total</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-center font-semibold">{grand.bookings}</TableCell>
                <TableCell className="text-right font-semibold">{inr(grand.total)}</TableCell>
                <TableCell className="text-right font-semibold text-green-600">{inr(grand.paid)}</TableCell>
                <TableCell className={`text-right font-semibold ${grand.balance > 0 ? 'text-red-600' : ''}`}>{inr(grand.balance)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        {!isLoading && rows.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>No clients linked to this organization yet.</p>
            <p className="text-sm mt-1">Use <span className="font-medium">Add Client</span> to create one here, or <span className="font-medium">Link Existing Client</span> to attach clients you already have.</p>
          </div>
        )}
      </Card>
    </>
  );
}
