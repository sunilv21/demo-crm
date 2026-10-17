'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { Booking, FinanceAccount, FinanceSupplier } from '@/lib/types';
import { FINANCE_COLLECTIONS, SUPPLIER_CATEGORIES } from '@/lib/finance';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { PlusCircle, MoreHorizontal, Pencil, Power, Truck, Upload, Trash2 } from 'lucide-react';


export default function SuppliersPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceSupplier | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinanceSupplier | null>(null);

  const q = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.suppliers) : null), [firestore]);
  const { data: suppliersData, isLoading } = useCollection<FinanceSupplier>(q);
  const suppliers = [...(suppliersData ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accountsData } = useCollection<FinanceAccount>(accountsQuery);
  const accounts = accountsData ?? [];
  const accountById = new Map(accounts.map((a) => [a.id, a.name]));

  const toggle = (s: FinanceSupplier) => {
    if (!firestore) return;
    setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.suppliers, s.id),
      { status: s.status === 'inactive' ? 'active' : 'inactive', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null }, { merge: true });
  };

  const handleDelete = () => {
    if (!firestore || !deleteTarget) return;
    deleteDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.suppliers, deleteTarget.id));
    toast({ variant: 'destructive', title: 'Supplier deleted', description: `"${deleteTarget.name}" has been permanently deleted.` });
    setDeleteTarget(null);
  };

  return (
    <>
      <PageHeader title="Suppliers & Payees" description="VFS, embassies, airlines, courier, utilities, employees — anyone you pay.">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import from bookings</Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}><PlusCircle className="mr-2 h-4 w-4" />New Supplier</Button>
        </div>
      </PageHeader>

      <Card className="border rounded-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Contact</TableHead>
                <TableHead>GST</TableHead><TableHead>Linked Account</TableHead><TableHead>Status</TableHead><TableHead className="w-[50px]"></TableHead>
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
                  <TableCell className="text-sm text-muted-foreground">
                    {s.linkedAccountId ? accountById.get(s.linkedAccountId) || 'Unknown account' : '—'}
                  </TableCell>
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
                        <DropdownMenuItem className="text-destructive" onSelect={() => setDeleteTarget(s)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
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

      <SupplierDialog open={open} onOpenChange={setOpen} supplier={editing} accounts={accounts} onSaved={() => toast({ title: editing ? 'Supplier updated' : 'Supplier created' })} />
      <ImportSuppliersDialog open={importOpen} onOpenChange={setImportOpen} existingSuppliers={suppliers} />
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmText={deleteTarget?.name || ''}
        description={
          <>
            This will permanently delete the supplier{' '}
            <span className="font-semibold text-foreground">{deleteTarget?.name}</span>. Bookings and transactions
            that already reference this name by text keep their saved values — only the directory entry is removed.
          </>
        }
      />
    </>
  );
}

// Existing bookings often had a supplier/portal typed in free text before the
// picker existed. This scans every booking's supplierName/bookingPortal,
// dedupes case-insensitively against names already in the directory, and
// lets staff pick which of the remaining distinct names to add for real.
function ImportSuppliersDialog({ open, onOpenChange, existingSuppliers }: {
  open: boolean; onOpenChange: (o: boolean) => void; existingSuppliers: FinanceSupplier[];
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const bookingsQuery = useMemoFirebase(() => (firestore && open ? collection(firestore, 'bookings') : null), [firestore, open]);
  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);

  const candidates = useMemo(() => {
    const existingKeys = new Set(existingSuppliers.map((s) => s.name.trim().toLowerCase()));
    const counts = new Map<string, { name: string; count: number }>();
    const add = (raw?: string) => {
      const name = (raw || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (existingKeys.has(key)) return;
      const entry = counts.get(key);
      if (entry) entry.count += 1; else counts.set(key, { name, count: 1 });
    };
    (bookings ?? []).forEach((b: Booking) => { add(b.supplierName); add(b.bookingPortal); });
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [bookings, existingSuppliers]);

  useEffect(() => {
    if (!open) return;
    setSelected({});
  }, [open]);

  useEffect(() => {
    if (!candidates.length) return;
    setSelected((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const c of candidates) {
        if (!(c.name in next)) { next[c.name] = true; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [candidates]);

  const selectedCount = candidates.filter((c) => selected[c.name]).length;
  const allSelected = candidates.length > 0 && selectedCount === candidates.length;

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    candidates.forEach((c) => { next[c.name] = !allSelected; });
    setSelected(next);
  };

  const runImport = async () => {
    if (!firestore || isImporting) return;
    const toAdd = candidates.filter((c) => selected[c.name]);
    if (!toAdd.length) return;
    setIsImporting(true);
    try {
      await Promise.all(toAdd.map((c) =>
        addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.suppliers), {
          name: c.name, category: 'Other', status: 'active',
          createdAt: serverTimestamp(), createdBy: user?.uid ?? null,
        })
      ));
      toast({ title: 'Suppliers imported', description: `${toAdd.length} added from existing bookings.` });
      onOpenChange(false);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import suppliers from bookings</DialogTitle>
          <DialogDescription>
            Every distinct supplier/portal name typed on a booking that isn&apos;t already in this directory. Uncheck any typos before importing — you can fix categories afterwards.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Scanning bookings…</div>
        ) : candidates.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nothing new — every supplier typed on a booking is already in the directory.</div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="text-primary hover:underline" onClick={toggleAll}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-muted-foreground">{selectedCount} of {candidates.length} selected</span>
            </div>
            <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
              {candidates.map((c) => (
                <label key={c.name} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                  <Checkbox
                    checked={!!selected[c.name]}
                    onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [c.name]: !!v }))}
                  />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.count} booking{c.count === 1 ? '' : 's'}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={runImport} disabled={!selectedCount || isImporting}>
            <Upload className="mr-2 h-4 w-4" />Import {selectedCount || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NONE = '__none__';

function SupplierDialog({ open, onOpenChange, supplier, accounts, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; supplier: FinanceSupplier | null; accounts: FinanceAccount[]; onSaved: () => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [f, setF] = useState({ name: '', category: 'Other', contactPerson: '', phone: '', email: '', gst: '', address: '', notes: '', linkedAccountId: NONE });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      name: supplier?.name ?? '', category: supplier?.category ?? 'Other', contactPerson: supplier?.contactPerson ?? '',
      phone: supplier?.phone ?? '', email: supplier?.email ?? '', gst: supplier?.gst ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '',
      linkedAccountId: supplier?.linkedAccountId ?? NONE,
    });
  }, [open, supplier]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (isSubmitting || !firestore || !f.name.trim()) return;
    const payload = {
      name: f.name.trim(), category: f.category, contactPerson: f.contactPerson.trim() || null, phone: f.phone.trim() || null,
      email: f.email.trim() || null, gst: f.gst.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null,
      linkedAccountId: f.linkedAccountId === NONE ? null : f.linkedAccountId,
      updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    };
    setIsSubmitting(true);
    try {
      if (supplier) setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.suppliers, supplier.id), payload, { merge: true });
      else await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.suppliers), { ...payload, status: 'active', createdAt: serverTimestamp(), createdBy: user?.uid ?? null });
      onSaved(); onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
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
                {SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Contact person</Label><Input value={f.contactPerson} onChange={set('contactPerson')} /></div>
            <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={f.phone} onChange={set('phone')} /></div>
            <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={f.email} onChange={set('email')} /></div>
            <div className="space-y-1"><Label className="text-xs">GST</Label><Input value={f.gst} onChange={set('gst')} /></div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Linked Account</Label>
              <Select value={f.linkedAccountId} onValueChange={(v) => setF((p) => ({ ...p, linkedAccountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                E.g. link &quot;Riya Travels&quot; to their wallet account, so paying them can suggest the right account.
              </p>
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Address</Label><Textarea rows={2} value={f.address} onChange={set('address')} /></div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} value={f.notes} onChange={set('notes')} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!f.name.trim() || isSubmitting}>{supplier ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
