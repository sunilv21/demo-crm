'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Building2,
  PlusCircle,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Users,
} from 'lucide-react';
import type { Organization, Client } from '@/lib/types';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  useUser,
  useAppUser,
  addDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, doc, query, orderBy, where, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { OrganizationForm } from '@/components/forms/organization-form';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { useToast } from '@/hooks/use-toast';

export default function OrganizationsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdminOrManager, canDelete } = useAppUser();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const orgsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'organizations'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: organizations, isLoading } = useCollection<Organization>(orgsQuery);

  // Clients are loaded with the same rules-safe pattern as the Clients page so
  // we can show a member count per org. Admin/manager get everyone; other roles
  // get only their own clients (count may be partial for them — acceptable).
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (!isAdminOrManager) {
      if (!user) return null;
      return query(collection(firestore, 'clients'), where('assignedEmployees', 'array-contains', user.uid));
    }
    return collection(firestore, 'clients');
  }, [firestore, isAdminOrManager, user]);
  const { data: clients } = useCollection<Client>(clientsQuery);

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (clients || []).forEach((c) => {
      if (c.organizationId) counts.set(c.organizationId, (counts.get(c.organizationId) || 0) + 1);
    });
    return counts;
  }, [clients]);

  const filteredOrgs = useMemo(() => {
    const list = organizations || [];
    if (!searchTerm) return list;
    const t = searchTerm.toLowerCase();
    return list.filter(
      (o) =>
        o.name.toLowerCase().includes(t) ||
        (o.contactPerson && o.contactPerson.toLowerCase().includes(t)) ||
        (o.email && o.email.toLowerCase().includes(t))
    );
  }, [organizations, searchTerm]);

  const handleAddOrg = (data: Partial<Organization>) => {
    if (!firestore) return;
    addDocumentNonBlocking(collection(firestore, 'organizations'), data);
    setIsFormOpen(false);
    toast({ title: 'Organization Created', description: `"${data.name}" has been added.` });
  };

  const handleUpdateOrg = (data: Partial<Organization>) => {
    if (!firestore || !editingOrg) return;
    setDocumentNonBlocking(doc(firestore, 'organizations', editingOrg.id), data, { merge: true });
    setEditingOrg(null);
    toast({ title: 'Organization Updated', description: `"${data.name}" has been updated.` });
  };

  const handleDeleteOrg = () => {
    if (!firestore || !orgToDelete) return;
    deleteDocumentNonBlocking(doc(firestore, 'organizations', orgToDelete.id));
    // Detach member clients so they don't point at a deleted org.
    (clients || [])
      .filter((c) => c.organizationId === orgToDelete.id)
      .forEach((c) =>
        setDocumentNonBlocking(
          doc(firestore, 'clients', c.id),
          { organizationId: null, updatedAt: serverTimestamp() },
          { merge: true }
        )
      );
    toast({ variant: 'destructive', title: 'Organization Deleted', description: `"${orgToDelete.name}" has been deleted.` });
    setOrgToDelete(null);
  };

  return (
    <>
      <PageHeader title="Organizations" description="Manage corporate accounts and their clients.">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="md:max-w-xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
            </DialogHeader>
            <OrganizationForm onSubmit={handleAddOrg} onCancel={() => setIsFormOpen(false)} />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, contact, or email..."
            className="pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Dialog open={!!editingOrg} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent className="md:max-w-xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Edit {editingOrg?.name}</DialogTitle>
          </DialogHeader>
          {editingOrg && (
            <OrganizationForm organization={editingOrg} onSubmit={handleUpdateOrg} onCancel={() => setEditingOrg(null)} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!orgToDelete}
        onOpenChange={(open) => !open && setOrgToDelete(null)}
        onConfirm={handleDeleteOrg}
        confirmText={orgToDelete?.name || ''}
        description={
          <>
            This will permanently delete the organization{' '}
            <span className="font-semibold text-foreground">{orgToDelete?.name}</span>. Its clients are kept, but
            will no longer be linked to any organization.
          </>
        }
      />

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-center">Clients</TableHead>
              <TableHead>GST</TableHead>
              <TableHead className="w-[56px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><MoreHorizontal className="h-4 w-4 ml-auto" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              filteredOrgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Link href={`/organizations/${org.id}`} className="hover:underline">{org.name}</Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    {org.contactPerson && <div className="text-sm">{org.contactPerson}</div>}
                    {org.email && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />{org.email}
                      </div>
                    )}
                    {org.phone && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />{org.phone}
                      </div>
                    )}
                    {!org.contactPerson && !org.email && !org.phone && (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {memberCounts.get(org.id) || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{org.gstNumber || '—'}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/organizations/${org.id}`} className="flex items-center">
                            <Eye className="mr-2 h-4 w-4" />View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditingOrg(org)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        {canDelete && (
                          <DropdownMenuItem className="text-destructive" onSelect={() => setOrgToDelete(org)}>
                            <Trash2 className="mr-2 h-4 w-4" />Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!isLoading && filteredOrgs.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            <p>No organizations yet. Create one to start grouping corporate clients.</p>
          </div>
        )}
      </Card>
    </>
  );
}
