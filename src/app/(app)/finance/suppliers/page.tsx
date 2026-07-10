'use client';

import { useEffect, useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { FinanceSupplier } from '@/lib/types';
import { FINANCE_COLLECTIONS } from '@/lib/finance';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreHorizontal, Pencil, Power, Truck } from 'lucide-react';

const CATEGORIES = [
  'VFS', 'BLS', 'Embassy', 'DMC', 'B2B Portal', 'Airline', 'Hotel',
  'Transport', 'Tour Operator', 'Insurance', 'Courier', 'Marketing',
  'Software / SaaS', 'Bank / Gateway', 'Employee', 'Landlord', 'Utility', 'Government', 'Other',
];

export default function SuppliersPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceSupplier | null>(null);

  const q = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.suppliers) : null), [firestore]);
  const { data: suppliers, isLoading } = useCollection<FinanceSupplier>(q);

  const toggle = (s: FinanceSupplier) => {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.suppliers, s.id),
      { status: s.status === 'inactive' ? 'active' : 'inactive', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null }, { merge: true });
  };

  return (
    <>
      <PageHeader title="Suppliers & Payees" description="VFS, embassies, airlines, courier, utilities, employees — anyone you pay.">
        <Button onClick={() => { setEditing(null); setOpen(true); }}><PlusCircle className="mr-2 h-4 w-4" />New Supplier</Button>
      </PageHeader>

      <Card className="border rounded-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Contact</TableHead>
                <TableHead>GST</TableHead><TableHead>Status</TableHead><TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && (suppliers ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium"><span className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />{s.name}</span></TableCell>
                  <TableCell>{s.category || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.contactPerson && <div>{s.contactPerson}</div>}
                    {s.phone && <div>{s.phone}</div>}
                    {!s.contactPerson && !s.phone && '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.gst || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={s.status === 'inactive' ? '' : 'bg-green-100 text-green-800 border-green-200'}>
                      {s.status === 'inactive' ? 'Inactive' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Supplier actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { setEditing(s); setOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggle(s)}><Power className="mr-2 h-4 w-4" />{s.status === 'inactive' ? 'Reactivate' : 'Deactivate'}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && (suppliers ?? []).length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No suppliers yet.</div>
          )}
        </CardContent>
      </Card>

      <SupplierDialog open={open} onOpenChange={setOpen} supplier={editing} onSaved={() => toast({ title: editing ? 'Supplier updated' : 'Supplier created' })} />
    </>
  );
}

function SupplierDialog({ open, onOpenChange, supplier, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; supplier: FinanceSupplier | null; onSaved: () => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [f, setF] = useState({ name: '', category: 'Other', contactPerson: '', phone: '', email: '', gst: '', address: '', notes: '' });

  useEffect(() => {
    if (!open) return;
    setF({
      name: supplier?.name ?? '', category: supplier?.category ?? 'Other', contactPerson: supplier?.contactPerson ?? '',
      phone: supplier?.phone ?? '', email: supplier?.email ?? '', gst: supplier?.gst ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '',
    });
  }, [open, supplier]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = () => {
    if (!firestore || !f.name.trim()) return;
    const payload = {
      name: f.name.trim(), category: f.category, contactPerson: f.contactPerson.trim() || null, phone: f.phone.trim() || null,
      email: f.email.trim() || null, gst: f.gst.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null,
      updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    };
    if (supplier) setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.suppliers, supplier.id), payload, { merge: true });
    else addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.suppliers), { ...payload, status: 'active', createdAt: serverTimestamp(), createdBy: user?.uid ?? null });
    onSaved(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{supplier ? 'Edit supplier' : 'New supplier'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={f.name} onChange={set('name')} /></div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Contact person</Label><Input value={f.contactPerson} onChange={set('contactPerson')} /></div>
            <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={f.phone} onChange={set('phone')} /></div>
            <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={f.email} onChange={set('email')} /></div>
            <div className="space-y-1"><Label className="text-xs">GST</Label><Input value={f.gst} onChange={set('gst')} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Address</Label><Textarea rows={2} value={f.address} onChange={set('address')} /></div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} value={f.notes} onChange={set('notes')} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!f.name.trim()}>{supplier ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
