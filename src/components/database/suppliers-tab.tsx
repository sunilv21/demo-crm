'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useAppUser, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { Booking, FinanceSupplier } from '@/lib/types';
import { FINANCE_COLLECTIONS, SUPPLIER_CATEGORIES } from '@/lib/finance';
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { Truck, PlusCircle, Search, MoreHorizontal, Pencil, Power, Phone, Wrench, GitMerge, Trash2 } from 'lucide-react';

function legacySupplierValue(b: Booking): string {
  const d: any = b.bookingDetails || {};
  return String(d.supplierName || d.supplier || d.rentalCompany || '').trim();
}

const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

const completeness = (s: FinanceSupplier) =>
  [s.category && s.category !== 'Other', s.contactPerson, s.phone, s.email, s.gst, s.address, s.notes].filter(Boolean).length;

export function SuppliersTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin, isFinance, isAdminOrManager } = useAppUser();
  const canManage = isAdmin || isFinance;
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceSupplier | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinanceSupplier | null>(null);

  const q = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.suppliers) : null), [firestore]);
  const { data: suppliersData, isLoading } = useCollection<FinanceSupplier>(q);
  const suppliers = useMemo(() => [...(suppliersData ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [suppliersData]);

  const filtered = useMemo(() => {
    if (!searchTerm) return suppliers;
    const t = searchTerm.toLowerCase();
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(t) || (s.category || '').toLowerCase().includes(t) || (s.contactPerson || '').toLowerCase().includes(t)
    );
  }, [suppliers, searchTerm]);

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
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, category, or contact..."
            className="pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {isAdminOrManager && (
            <Button variant="outline" onClick={() => setFixOpen(true)}>
              <Wrench className="mr-2 h-4 w-4" />Fix old bookings
            </Button>
          )}
          {isAdminOrManager && (
            <Button variant="outline" onClick={() => setMergeOpen(true)}>
              <GitMerge className="mr-2 h-4 w-4" />Merge duplicates
            </Button>
          )}
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <PlusCircle className="mr-2 h-4 w-4" />New Supplier
          </Button>
        </div>
      </div>

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  {canManage && <TableCell><MoreHorizontal className="h-4 w-4 ml-auto" /></TableCell>}
                </TableRow>
              ))}
            {!isLoading && filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />{s.name}</span>
                </TableCell>
                <TableCell>{s.category || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.contactPerson && <div>{s.contactPerson}</div>}
                  {s.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{s.phone}</span>}
                  {!s.contactPerson && !s.phone && '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={s.status === 'inactive' ? '' : 'bg-green-100 text-green-800 border-green-200'}>
                    {s.status === 'inactive' ? 'Inactive' : 'Active'}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open supplier actions"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { setEditing(s); setOpen(true); }}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggle(s)}>
                          <Power className="mr-2 h-4 w-4" />{s.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => setDeleteTarget(s)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isLoading && filtered.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            <p>No suppliers yet. Add one to start reusing it on bookings.</p>
          </div>
        )}
      </Card>

      <SupplierDialog open={open} onOpenChange={setOpen} supplier={editing} onSaved={() => toast({ title: editing ? 'Supplier updated' : 'Supplier created' })} />
      {isAdminOrManager && <FixLegacySupplierDialog open={fixOpen} onOpenChange={setFixOpen} />}
      {isAdminOrManager && <MergeDuplicatesDialog open={mergeOpen} onOpenChange={setMergeOpen} suppliers={suppliers} />}
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
    </div>
  );
}

function FixLegacySupplierDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);

  const bookingsQuery = useMemoFirebase(() => (firestore && open ? collection(firestore, 'bookings') : null), [firestore, open]);
  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);

  const candidates = useMemo(() => {
    return (bookings ?? [])
      .map((b) => ({ booking: b, value: legacySupplierValue(b) }))
      .filter((c) => !((c.booking.supplierName || '').trim()) && c.value);
  }, [bookings]);

  const run = async () => {
    if (!firestore || isRunning || !candidates.length) return;
    setIsRunning(true);
    try {
      await Promise.all(candidates.map((c) =>
        updateDocumentNonBlocking(doc(firestore, 'bookings', c.booking.id), {
          supplierName: c.value,
          updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
        })
      ));
      toast({ title: 'Bookings fixed', description: `${candidates.length} booking${candidates.length === 1 ? '' : 's'} updated.` });
      onOpenChange(false);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fix supplier field on old bookings</DialogTitle>
          <DialogDescription>
            Before the Supplier picker existed, Activity/Visa/Other/Transfer bookings saved the typed name in a
            different spot. This copies it onto the real Supplier field so those bookings show up and filter
            correctly in Reconciliation.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Scanning bookings…</div>
        ) : candidates.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nothing to fix — every booking already has a proper Supplier value.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
            {candidates.map((c) => (
              <div key={c.booking.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{c.booking.clientName}</div>
                  <div className="text-xs text-muted-foreground capitalize">{c.booking.bookingType}</div>
                </div>
                <div className="text-muted-foreground">{c.value}</div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={!candidates.length || isRunning}>
            <Wrench className="mr-2 h-4 w-4" />Fix {candidates.length || ''} booking{candidates.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DupGroup = { key: string; canonical: FinanceSupplier; duplicates: FinanceSupplier[] };

function MergeDuplicatesDialog({ open, onOpenChange, suppliers }: {
  open: boolean; onOpenChange: (o: boolean) => void; suppliers: FinanceSupplier[];
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});

  const bookingsQuery = useMemoFirebase(() => (firestore && open ? collection(firestore, 'bookings') : null), [firestore, open]);
  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);

  const groups = useMemo<DupGroup[]>(() => {
    const byKey = new Map<string, FinanceSupplier[]>();
    suppliers.forEach((s) => {
      const key = normalizeName(s.name);
      const list = byKey.get(key) || [];
      list.push(s);
      byKey.set(key, list);
    });
    const result: DupGroup[] = [];
    byKey.forEach((list, key) => {
      if (list.length < 2) return;
      const sorted = [...list].sort((a, b) => completeness(b) - completeness(a));
      result.push({ key, canonical: sorted[0], duplicates: sorted.slice(1) });
    });
    return result.sort((a, b) => a.canonical.name.localeCompare(b.canonical.name));
  }, [suppliers]);

  useEffect(() => { if (open) setSkipped({}); }, [open]);

  const bookingCountFor = (name: string) => (bookings ?? []).filter((b) =>
    normalizeName(b.supplierName || '') === normalizeName(name) || normalizeName(b.bookingPortal || '') === normalizeName(name)
  ).length;

  const selectedGroups = groups.filter((g) => !skipped[g.key]);

  const run = async () => {
    if (!firestore || isRunning || !selectedGroups.length) return;
    setIsRunning(true);
    try {
      for (const g of selectedGroups) {
        const dupNames = new Set(g.duplicates.map((d) => normalizeName(d.name)));
        const affected = (bookings ?? []).filter((b) =>
          dupNames.has(normalizeName(b.supplierName || '')) || dupNames.has(normalizeName(b.bookingPortal || ''))
        );
        await Promise.all(affected.map((b) => {
          const patch: Record<string, string> = {};
          if (dupNames.has(normalizeName(b.supplierName || ''))) patch.supplierName = g.canonical.name;
          if (dupNames.has(normalizeName(b.bookingPortal || ''))) patch.bookingPortal = g.canonical.name;
          return updateDocumentNonBlocking(doc(firestore, 'bookings', b.id), {
            ...patch, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
          });
        }));
        await Promise.all(g.duplicates.map((d) =>
          setDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.suppliers, d.id), {
            status: 'inactive',
            notes: [d.notes, `Merged into "${g.canonical.name}"`].filter(Boolean).join(' — '),
            updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
          }, { merge: true })
        ));
      }
      toast({ title: 'Duplicates merged', description: `${selectedGroups.length} group${selectedGroups.length === 1 ? '' : 's'} merged.` });
      onOpenChange(false);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge duplicate suppliers</DialogTitle>
          <DialogDescription>
            Entries whose name matches another one exactly (ignoring case/spacing). The most complete record in each
            group is kept; the others are deactivated and every booking pointing at them is switched to the kept name.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Checking bookings…</div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No duplicate supplier names found.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto border rounded-md divide-y">
            {groups.map((g) => (
              <label key={g.key} className="flex items-start gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={!skipped[g.key]}
                  onCheckedChange={(v) => setSkipped((prev) => ({ ...prev, [g.key]: !v }))}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-0.5">
                  <div>
                    <span className="font-medium text-green-700">{g.canonical.name}</span>
                    <span className="text-xs text-muted-foreground"> (kept · {bookingCountFor(g.canonical.name)} bookings)</span>
                  </div>
                  {g.duplicates.map((d) => (
                    <div key={d.id} className="text-xs text-muted-foreground pl-1">
                      → merges &quot;{d.name}&quot; ({bookingCountFor(d.name)} bookings)
                    </div>
                  ))}
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={!selectedGroups.length || isRunning}>
            <GitMerge className="mr-2 h-4 w-4" />Merge {selectedGroups.length || ''} group{selectedGroups.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierDialog({ open, onOpenChange, supplier, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; supplier: FinanceSupplier | null; onSaved: () => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [f, setF] = useState({ name: '', category: 'Other', contactPerson: '', phone: '', email: '', gst: '', address: '', notes: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      name: supplier?.name ?? '', category: supplier?.category ?? 'Other', contactPerson: supplier?.contactPerson ?? '',
      phone: supplier?.phone ?? '', email: supplier?.email ?? '', gst: supplier?.gst ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '',
    });
  }, [open, supplier]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (isSubmitting || !firestore || !f.name.trim()) return;
    const payload = {
      name: f.name.trim(), category: f.category, contactPerson: f.contactPerson.trim() || null, phone: f.phone.trim() || null,
      email: f.email.trim() || null, gst: f.gst.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null,
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
