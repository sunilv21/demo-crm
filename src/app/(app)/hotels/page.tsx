'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreHorizontal, Pencil, PlusCircle, Power, Search, Building2 } from 'lucide-react';
import { addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { findHotelNameConflict } from '@/lib/hotel-master';

type HotelMasterForm = {
  id?: string;
  hotelName: string;
  hotelCode: string;
  hotelChain: string;
  starRating: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  cancellationPolicy: string;
  termsAndConditions: string;
  active: boolean;
};

type HotelRecord = {
  id: string;
  hotelName: string;
  hotelCode?: string;
  hotelChain?: string;
  starRating?: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  cancellationPolicy?: string;
  termsAndConditions?: string;
  active?: boolean;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
};

const emptyForm = (): HotelMasterForm => ({
  hotelName: '',
  hotelCode: '',
  hotelChain: '',
  starRating: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  phone: '',
  email: '',
  website: '',
  defaultCheckIn: '',
  defaultCheckOut: '',
  cancellationPolicy: '',
  termsAndConditions: '',
  active: true,
});

export default function HotelsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HotelRecord | null>(null);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState<HotelMasterForm>(emptyForm());
  const [error, setError] = useState('');

  const hotelsQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'hotels'), orderBy('hotelName', 'asc')) : null), [firestore]);
  const { data: hotels = [], isLoading } = useCollection<HotelRecord>(hotelsQuery);

  const countries = useMemo(() => Array.from(new Set((hotels || []).map((h) => h.country).filter((country): country is string => Boolean(country)))).sort(), [hotels]);

  const filteredHotels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (hotels || []).filter((hotel) => {
      const matchesSearch = !q || [hotel.hotelName, hotel.city, hotel.country, hotel.phone].filter(Boolean).join(' ').toLowerCase().includes(q);
      const matchesCountry = countryFilter === 'all' || hotel.country === countryFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? hotel.active !== false : hotel.active === false);
      return matchesSearch && matchesCountry && matchesStatus;
    });
  }, [hotels, search, countryFilter, statusFilter]);

  useEffect(() => {
    if (!dialogOpen) {
      setForm(emptyForm());
      setEditing(null);
      setError('');
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (editing) {
      setForm({
        id: editing.id,
        hotelName: editing.hotelName || '',
        hotelCode: editing.hotelCode || '',
        hotelChain: editing.hotelChain || '',
        starRating: editing.starRating?.toString() || '',
        address: editing.address || '',
        city: editing.city || '',
        state: editing.state || '',
        country: editing.country || '',
        postalCode: editing.postalCode || '',
        phone: editing.phone || '',
        email: editing.email || '',
        website: editing.website || '',
        defaultCheckIn: editing.defaultCheckIn || '',
        defaultCheckOut: editing.defaultCheckOut || '',
        cancellationPolicy: editing.cancellationPolicy || '',
        termsAndConditions: editing.termsAndConditions || '',
        active: editing.active !== false,
      });
    }
  }, [editing]);

  const saveHotel = () => {
    if (!firestore || !form.hotelName.trim()) return;

    const duplicate = findHotelNameConflict(hotels ?? [], form.hotelName, editing?.id);
    if (duplicate) {
      setError(`"${duplicate}" already exists in the active hotel master.`);
      return;
    }

    const payload = {
      hotelName: form.hotelName.trim(),
      hotelCode: form.hotelCode.trim() || null,
      hotelChain: form.hotelChain.trim() || null,
      starRating: form.starRating ? Number(form.starRating) : null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      state: form.state.trim() || null,
      postalCode: form.postalCode.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      defaultCheckIn: form.defaultCheckIn.trim() || null,
      defaultCheckOut: form.defaultCheckOut.trim() || null,
      cancellationPolicy: form.cancellationPolicy.trim() || null,
      termsAndConditions: form.termsAndConditions.trim() || null,
      active: form.active,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid ?? null,
    };

    if (editing) {
      setDocumentNonBlocking(doc(firestore, 'hotels', editing.id), payload, { merge: true });
    } else {
      addDocumentNonBlocking(collection(firestore, 'hotels'), { ...payload, createdAt: serverTimestamp(), createdBy: user?.uid ?? null });
    }

    toast({ title: editing ? 'Hotel updated' : 'Hotel created' });
    setDialogOpen(false);
  };

  const toggleHotel = (hotel: HotelRecord) => {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, 'hotels', hotel.id), { active: hotel.active === false, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null }, { merge: true });
  };

  return (
    <>
      <PageHeader title="Hotel Master" description="Centralize hotel details for booking creation and voucher generation.">
        <Button onClick={() => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); }}><PlusCircle className="mr-2 h-4 w-4" />New Hotel</Button>
      </PageHeader>

      <Card className="border rounded-lg">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hotel, city, country" className="pl-9" />
              </div>
            </div>
            <div className="w-full lg:w-48">
              <Label className="text-xs">Country</Label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger><SelectValue placeholder="All countries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {countries.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full lg:w-40">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && filteredHotels.map((hotel) => (
                  <TableRow key={hotel.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{hotel.hotelName}</div>
                      {hotel.hotelChain && <div className="text-xs text-muted-foreground">{hotel.hotelChain}</div>}
                    </TableCell>
                    <TableCell>{hotel.city || '—'}</TableCell>
                    <TableCell>{hotel.country || '—'}</TableCell>
                    <TableCell>{hotel.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={hotel.active === false ? '' : 'bg-green-100 text-green-800 border-green-200'}>{hotel.active === false ? 'Inactive' : 'Active'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Hotel actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => { setEditing(hotel); setDialogOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => toggleHotel(hotel)}><Power className="mr-2 h-4 w-4" />{hotel.active === false ? 'Reactivate' : 'Deactivate'}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isLoading && filteredHotels.length === 0 && <div className="p-8 text-center text-muted-foreground">No hotels found.</div>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit hotel' : 'Add hotel'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Hotel Name *</Label><Input value={form.hotelName} onChange={(e) => setForm((p) => ({ ...p, hotelName: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Hotel Code</Label><Input value={form.hotelCode} onChange={(e) => setForm((p) => ({ ...p, hotelCode: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Hotel Chain</Label><Input value={form.hotelChain} onChange={(e) => setForm((p) => ({ ...p, hotelChain: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Star Rating</Label><Input type="number" min="1" max="5" value={form.starRating} onChange={(e) => setForm((p) => ({ ...p, starRating: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Active</Label><Select value={form.active ? 'active' : 'inactive'} onValueChange={(value) => setForm((p) => ({ ...p, active: value === 'active' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2"><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
              <div className="space-y-1"><Label>City *</Label><Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
              <div className="space-y-1"><Label>State</Label><Input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Country *</Label><Input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Postal Code</Label><Input value={form.postalCode} onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))} /></div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Website</Label><Input value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} /></div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Default Check-in</Label><Input value={form.defaultCheckIn} onChange={(e) => setForm((p) => ({ ...p, defaultCheckIn: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Default Check-out</Label><Input value={form.defaultCheckOut} onChange={(e) => setForm((p) => ({ ...p, defaultCheckOut: e.target.value }))} /></div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Cancellation Policy</Label><Textarea rows={3} value={form.cancellationPolicy} onChange={(e) => setForm((p) => ({ ...p, cancellationPolicy: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Terms & Conditions</Label><Textarea rows={3} value={form.termsAndConditions} onChange={(e) => setForm((p) => ({ ...p, termsAndConditions: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveHotel} disabled={!form.hotelName.trim() || !form.city.trim() || !form.country.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
