'use client';

import { useState, useMemo } from 'react';
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
  Hotel as HotelIcon,
  PlusCircle,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  Phone,
} from 'lucide-react';
import type { Hotel } from '@/lib/types';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  useUser,
  useAppUser,
  addDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { HotelForm } from '@/components/forms/hotel-form';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { useToast } from '@/hooks/use-toast';

// The Hotel Master list/CRUD — lives under Database (not its own top-level
// nav item) alongside other reference data. Bookings pick up saved hotels
// via the HotelPicker in booking-form.tsx, which reads this same collection.
export function HotelsTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdminOrManager } = useAppUser();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [hotelToDelete, setHotelToDelete] = useState<Hotel | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const hotelsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'hotels'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: hotels, isLoading } = useCollection<Hotel>(hotelsQuery);

  const filteredHotels = useMemo(() => {
    const list = hotels || [];
    if (!searchTerm) return list;
    const t = searchTerm.toLowerCase();
    return list.filter(
      (h) =>
        h.name.toLowerCase().includes(t) ||
        (h.city && h.city.toLowerCase().includes(t)) ||
        (h.country && h.country.toLowerCase().includes(t))
    );
  }, [hotels, searchTerm]);

  const handleAddHotel = (data: Partial<Hotel>) => {
    if (!firestore) return;
    addDocumentNonBlocking(collection(firestore, 'hotels'), data);
    setIsFormOpen(false);
    toast({ title: 'Hotel Created', description: `"${data.name}" has been added.` });
  };

  const handleUpdateHotel = (data: Partial<Hotel>) => {
    if (!firestore || !editingHotel) return;
    setDocumentNonBlocking(doc(firestore, 'hotels', editingHotel.id), data, { merge: true });
    setEditingHotel(null);
    toast({ title: 'Hotel Updated', description: `"${data.name}" has been updated.` });
  };

  const toggleActive = (h: Hotel) => {
    if (!firestore) return;
    setDocumentNonBlocking(
      doc(firestore, 'hotels', h.id),
      { active: !h.active, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null },
      { merge: true }
    );
  };

  const handleDeleteHotel = () => {
    if (!firestore || !hotelToDelete) return;
    deleteDocumentNonBlocking(doc(firestore, 'hotels', hotelToDelete.id));
    toast({ variant: 'destructive', title: 'Hotel Deleted', description: `"${hotelToDelete.name}" has been deleted.` });
    setHotelToDelete(null);
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, city, or country..."
            className="pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Hotel
            </Button>
          </DialogTrigger>
          <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>Create New Hotel</DialogTitle>
            </DialogHeader>
            <HotelForm onSubmit={handleAddHotel} onCancel={() => setIsFormOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingHotel} onOpenChange={(open) => !open && setEditingHotel(null)}>
        <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Edit {editingHotel?.name}</DialogTitle>
          </DialogHeader>
          {editingHotel && (
            <HotelForm hotel={editingHotel} onSubmit={handleUpdateHotel} onCancel={() => setEditingHotel(null)} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!hotelToDelete}
        onOpenChange={(open) => !open && setHotelToDelete(null)}
        onConfirm={handleDeleteHotel}
        confirmText={hotelToDelete?.name || ''}
        description={
          <>
            This will permanently delete the hotel{' '}
            <span className="font-semibold text-foreground">{hotelToDelete?.name}</span>. Bookings that already
            reference it keep their saved details.
          </>
        }
      />

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hotel</TableHead>
              <TableHead>City / Country</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[56px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><MoreHorizontal className="h-4 w-4 ml-auto" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              filteredHotels.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                        <HotelIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      {h.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[h.city, h.country].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {h.phone ? (
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{h.phone}</span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={h.active ? 'bg-green-100 text-green-800 border-green-200' : ''}>
                      {h.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open hotel actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditingHotel(h)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleActive(h)}>
                          <Power className="mr-2 h-4 w-4" />{h.active ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                        {isAdminOrManager && (
                          <DropdownMenuItem className="text-destructive" onSelect={() => setHotelToDelete(h)}>
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
        {!isLoading && filteredHotels.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            <p>No hotels yet. Create one to start reusing its details on bookings and vouchers.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
