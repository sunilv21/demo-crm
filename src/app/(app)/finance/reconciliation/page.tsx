'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { Booking, FinanceAccount, FinanceSupplier, FinanceTransaction, User } from '@/lib/types';
import { FINANCE_COLLECTIONS, DEFAULT_OUT_METHODS, todayISO, paidToSupplierByBooking, matchesMonth, bookingAgentName, bookingAgentId } from '@/lib/finance';
import { useGlobalMonthFilter } from '@/components/finance/global-month-filter-provider';
import { bookingMadeDate, bookingMadeDateISO } from '@/lib/booking-details';
import { isPackageComponent, isPackagePrimary } from '@/lib/booking-package';
import { EditBookingDateDialog } from '@/components/bookings/edit-booking-date-dialog';
import { downloadCsv } from '@/lib/csv-export';
import { formatINR } from '@/lib/utils';
import { format } from 'date-fns';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShieldCheck, ShieldX, IndianRupee, CheckCircle2, AlertTriangle, X, Pencil, RotateCcw, Ban, History, FileSpreadsheet } from 'lucide-react';

const NONE = '__none__';
const ALL = '__all__';
const HCELL = 'h-9 px-3';
const CELL = 'py-1.5 px-3';

const BOOKING_TYPE_LABELS: Record<string, string> = {
  flight: 'Flight', hotel: 'Hotel', car: 'Transfer', activity: 'Activity', visa: 'Visa', other: 'Other',
};

type ReconciliationFilters = {
  dateFrom: string; dateTo: string; month: string; supplierName: string;
  bookingType: string; clientName: string; agentId: string;
};
const EMPTY_FILTERS: ReconciliationFilters = { dateFrom: '', dateTo: '', month: '', supplierName: '', bookingType: '', clientName: '', agentId: '' };

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function matchesFilters(b: Booking, filters: ReconciliationFilters, globalMonth: string = '', roleOf?: (uid: string) => string | undefined): boolean {
  if (!matchesMonth(bookingMadeDateISO(b), globalMonth)) return false;
  if (filters.bookingType && b.bookingType !== filters.bookingType) return false;
  if (filters.agentId && roleOf) { if (bookingAgentId(b, roleOf) !== filters.agentId) return false; }
  if (filters.supplierName) {
    const want = normalize(filters.supplierName);
    const got = [b.supplierName, b.bookingPortal].filter(Boolean).map((v) => normalize(v as string));
    if (!got.includes(want)) return false;
  }
  if (filters.clientName) { if (!normalize(b.clientName || '').includes(normalize(filters.clientName))) return false; }
  if (filters.dateFrom || filters.dateTo) {
    const d = bookingMadeDateISO(b);
    if (!d) return false;
    if (filters.dateFrom && d < filters.dateFrom) return false;
    if (filters.dateTo && d > filters.dateTo) return false;
  }
  return true;
}

function FilterBar({ filters, setFilters, suppliers, agents }: {
  filters: ReconciliationFilters; setFilters: (f: ReconciliationFilters) => void;
  suppliers: FinanceSupplier[]; agents: User[];
}) {
  const setMonth = (m: string) => {
    if (!m) { setFilters({ ...filters, month: '', dateFrom: '', dateTo: '' }); return; }
    const [y, mo] = m.split('-').map(Number);
    const lastDay = new Date(y, mo, 0).getDate();
    setFilters({ ...filters, month: m, dateFrom: `${m}-01`, dateTo: `${m}-${String(lastDay).padStart(2, '0')}` });
  };
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { value, label: format(d, 'MMMM yyyy') };
    });
  }, []);
  const hasFilters = filters.dateFrom || filters.dateTo || filters.month || filters.supplierName || filters.bookingType || filters.clientName || filters.agentId;

  return (
    <div className="bg-card border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3 max-w-full">
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">Client</Label>
        <Input className="w-[180px] max-w-full h-9" placeholder="Search by client name…" value={filters.clientName} onChange={(e) => setFilters({ ...filters, clientName: e.target.value })} />
      </div>
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">Month</Label>
        <Select value={filters.month || ALL} onValueChange={(v) => setMonth(v === ALL ? '' : v)}>
          <SelectTrigger className="w-[160px] max-w-full h-9"><SelectValue placeholder="Any month" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>Any month</SelectItem>
            {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">From</Label>
        <Input type="date" className="w-[150px] max-w-full h-9" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value, month: '' })} />
      </div>
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">To</Label>
        <Input type="date" className="w-[150px] max-w-full h-9" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value, month: '' })} />
      </div>
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">Supplier</Label>
        <Select value={filters.supplierName || ALL} onValueChange={(v) => setFilters({ ...filters, supplierName: v === ALL ? '' : v })}>
          <SelectTrigger className="w-[180px] max-w-full h-9"><SelectValue placeholder="All suppliers" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>All suppliers</SelectItem>
            {[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">Agent</Label>
        <Select value={filters.agentId || ALL} onValueChange={(v) => setFilters({ ...filters, agentId: v === ALL ? '' : v })}>
          <SelectTrigger className="w-[160px] max-w-full h-9"><SelectValue placeholder="All agents" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>All agents</SelectItem>
            {[...agents].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">Booking type</Label>
        <Select value={filters.bookingType || ALL} onValueChange={(v) => setFilters({ ...filters, bookingType: v === ALL ? '' : v })}>
          <SelectTrigger className="w-[150px] max-w-full h-9"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {Object.entries(BOOKING_TYPE_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => setFilters(EMPTY_FILTERS)}>
          <X className="mr-1 h-3.5 w-3.5" />Clear
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'green' | 'yellow' | 'muted' | 'red' }) {
  const cls = { green: 'bg-green-100 text-green-800 border-green-200', yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200', muted: '', red: 'bg-red-100 text-red-800 border-red-200' }[tone];
  return <Badge variant="secondary" className={cls}>{label}</Badge>;
}

type PayoutSeed = { accountId?: string; supplierId?: string; date?: string; method?: string; reference?: string; remarks?: string };

function RecordPayoutDialog({ open, onOpenChange, title, description, defaultAmount, accounts, suppliers, showSupplier, onSubmit, seed }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; defaultAmount: number;
  accounts: FinanceAccount[]; suppliers?: FinanceSupplier[]; showSupplier?: boolean;
  onSubmit: (data: { accountId: string; supplierId: string; amount: number; date: string; method: string; reference: string; remarks: string }) => Promise<void>;
  seed?: PayoutSeed | null;
}) {
  const [accountId, setAccountId] = useState('');
  const [supplierId, setSupplierId] = useState(NONE);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState(DEFAULT_OUT_METHODS[0]);
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountId(seed?.accountId ?? ''); setSupplierId(seed?.supplierId ?? NONE); setAmount(String(Math.max(0, Math.round(defaultAmount))));
    setDate(seed?.date ?? todayISO()); setMethod(seed?.method ?? DEFAULT_OUT_METHODS[0]); setReference(seed?.reference ?? ''); setRemarks(seed?.remarks ?? '');
  }, [open, defaultAmount, seed]);

  const submit = async () => {
    if (isSubmitting) return;
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0 || !accountId) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ accountId, supplierId: supplierId === NONE ? '' : supplierId, amount: amt, date, method, reference, remarks });
      onOpenChange(false);
    } finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Amount (₹) *</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DEFAULT_OUT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {showSupplier && (
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Supplier (optional)</Label>
              <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); if (!accountId) { const linked = v !== NONE ? (suppliers ?? []).find((s) => s.id === v)?.linkedAccountId : undefined; if (linked) setAccountId(linked); } }}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1 col-span-2"><Label className="text-xs">Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / receipt no." /></div>
          <div className="space-y-1 col-span-2"><Label className="text-xs">Remarks</Label><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!accountId || !amount || isSubmitting}>Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyDialog({ open, onOpenChange, title, description, onSubmit, notePlaceholder = 'e.g. Checked VFS receipt #1234', confirmLabel = 'Mark verified', confirmIcon: ConfirmIcon = CheckCircle2 }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; onSubmit: (note: string) => void;
  notePlaceholder?: string; confirmLabel?: string; confirmIcon?: typeof CheckCircle2;
}) {
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="space-y-1"><Label className="text-xs">Note (optional)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSubmit(note); onOpenChange(false); }}><ConfirmIcon className="mr-2 h-4 w-4" />{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CostRow = { booking: Booking; cost: number; paid: number; balance: number };

function CostTab({ filters, userById }: { filters: ReconciliationFilters; userById: Map<string, User> }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { month: globalMonth } = useGlobalMonthFilter();
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);
  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const suppliersQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.suppliers) : null), [firestore]);
  const { data: suppliers } = useCollection<FinanceSupplier>(suppliersQuery);
  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const roleOf = useMemo(() => (uid: string) => userById.get(uid)?.role, [userById]);

  const rows = useMemo<CostRow[]>(() => {
    const paidByBooking = paidToSupplierByBooking(transactions ?? []);
    return (bookings ?? []).filter((b) => b.status === 'confirmed').filter((b) => matchesFilters(b, filters, globalMonth, roleOf))
      .map((b) => { const cost = b.supplierCost || 0; const paid = paidByBooking.get(b.id) || 0; return { booking: b, cost, paid, balance: Math.max(0, cost - paid) }; })
      .sort((a, b) => bookingMadeDateISO(a.booking).localeCompare(bookingMadeDateISO(b.booking)));
  }, [bookings, transactions, filters, globalMonth, roleOf]);

  const exportCsv = () => {
    const headers = ['Client', 'Agent', 'Booking date', 'Supplier / Portal', 'Buy price', 'Selling price', 'Paid', 'Balance', 'Status', 'Verified'];
    const rowsOut = rows.map(({ booking: b, cost, paid, balance }) => [
      b.clientName || '', bookingAgentName(b, userById),
      (() => { const d = bookingMadeDate(b); return d ? format(d, 'dd MMM yyyy') : ''; })(),
      b.supplierName || b.bookingPortal || '', cost, b.total || 0, paid, balance,
      cost === 0 ? 'No cost' : balance === 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid',
      b.supplierCostVerified ? 'Verified' : 'Not verified',
    ]);
    downloadCsv(`Reconciliation_BuyPrice_${todayISO()}.csv`, headers, rowsOut);
  };

  const [payTarget, setPayTarget] = useState<CostRow | null>(null);
  const [paySeed, setPaySeed] = useState<PayoutSeed | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<Booking | null>(null);
  const [dateEditTarget, setDateEditTarget] = useState<Booking | null>(null);
  const [paymentsTarget, setPaymentsTarget] = useState<Booking | null>(null);

  const saveBookingDate = (date: string) => {
    if (!firestore || !dateEditTarget) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', dateEditTarget.id), { bookingDateOverride: date, bookingDateOverrideAt: serverTimestamp(), bookingDateOverrideBy: user?.uid ?? null, bookingDateOverrideByName: user?.displayName || user?.email?.split('@')[0] || 'Staff', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Booking date updated' });
  };

  const recordPayment = async (data: { accountId: string; supplierId: string; amount: number; date: string; method: string; reference: string; remarks: string }) => {
    if (!firestore || !payTarget) return;
    const supplier = data.supplierId ? (suppliers ?? []).find((s) => s.id === data.supplierId) : undefined;
    const createdByName = user?.displayName || user?.email?.split('@')[0] || 'Staff';
    const fromWallet = (accounts ?? []).find((a) => a.id === data.accountId)?.type === 'wallet';
    await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
      type: 'expense', amount: data.amount, date: data.date, accountId: data.accountId, excludeFromExpenseTotal: fromWallet,
      paymentMethod: data.method, reference: data.reference.trim() || null, remarks: data.remarks.trim() || null,
      bookingId: payTarget.booking.id, supplierId: supplier?.id ?? null, supplierName: supplier?.name ?? payTarget.booking.supplierName ?? null,
      categoryName: 'Supplier Cost', categoryId: null, status: 'completed', source: 'manual',
      createdAt: serverTimestamp(), createdBy: user?.uid ?? null, createdByName, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    });
    toast({ title: 'Payment recorded', description: `${formatINR(data.amount)} paid toward supplier cost.` });
  };

  const cancelPayment = (t: FinanceTransaction) => {
    if (!firestore) return;
    updateDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.transactions, t.id), { status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Payment cancelled' });
  };

  const editPayment = (t: FinanceTransaction, booking: Booking) => {
    cancelPayment(t);
    setPaymentsTarget(null);
    setPaySeed({ accountId: t.accountId, supplierId: t.supplierId ?? undefined, date: t.date, method: t.paymentMethod ?? undefined, reference: t.reference ?? undefined, remarks: t.remarks ?? undefined });
    setPayTarget({ booking, cost: booking.supplierCost || 0, paid: 0, balance: t.amount || 0 });
  };

  const verify = (note: string) => {
    if (!firestore || !verifyTarget) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', verifyTarget.id), { supplierCostVerified: true, supplierCostVerifiedAt: serverTimestamp(), supplierCostVerifiedBy: user?.uid ?? null, supplierCostVerifiedByName: user?.displayName || user?.email?.split('@')[0] || 'Staff', supplierCostVerifiedNote: note.trim() || null, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Marked verified' });
  };

  const unverify = (b: Booking) => {
    if (!firestore) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', b.id), { supplierCostVerified: false, supplierCostVerifiedAt: null, supplierCostVerifiedBy: null, supplierCostVerifiedByName: null, supplierCostVerifiedNote: null, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
  };

  return (
    <Card className="border rounded-lg">
      <div className="flex items-center justify-end p-3 pb-0">
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}><FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Export</Button>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={HCELL}>Booking</TableHead>
              <TableHead className={HCELL}>Agent</TableHead>
              <TableHead className={HCELL}>Booking date</TableHead>
              <TableHead className={HCELL}>Supplier / Portal</TableHead>
              <TableHead className={`${HCELL} text-right`}>Buy price</TableHead>
              <TableHead className={`${HCELL} text-right`}>Selling price</TableHead>
              <TableHead className={`${HCELL} text-right`}>Paid</TableHead>
              <TableHead className={`${HCELL} text-right`}>Balance</TableHead>
              <TableHead className={HCELL}>Status</TableHead>
              <TableHead className={HCELL}>Verified</TableHead>
              <TableHead className={`${HCELL} text-right`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && rows.map(({ booking, cost, paid, balance }) => (
              <TableRow key={booking.id}>
                <TableCell className={`${CELL} text-sm`}>
                  <div className="font-medium flex items-center gap-1.5">
                    {booking.clientName}
                    {isPackageComponent(booking) && <StatusBadge label="Package" tone="muted" />}
                    {isPackagePrimary(booking) && <StatusBadge label="Package total" tone="muted" />}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{booking.bookingType}{booking.destination ? ` · ${booking.destination}` : ''}</div>
                </TableCell>
                <TableCell className={`${CELL} text-sm text-muted-foreground`}>{bookingAgentName(booking, userById)}</TableCell>
                <TableCell className={`${CELL} text-sm text-muted-foreground`}>
                  <div className="flex items-center gap-1">
                    <span>{(() => { const d = bookingMadeDate(booking); return d ? format(d, 'dd MMM yyyy') : '—'; })()}</span>
                    {booking.bookingDateOverride && <span className="text-[10px] text-muted-foreground" title="Corrected">(corrected)</span>}
                    <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" title="Edit booking date" aria-label="Edit booking date" onClick={() => setDateEditTarget(booking)}><Pencil className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
                <TableCell className={`${CELL} text-sm text-muted-foreground`}>
                  <div>{booking.supplierName || '—'}</div>
                  {booking.bookingPortal && booking.bookingPortal !== booking.supplierName && <div className="text-xs">via {booking.bookingPortal}</div>}
                </TableCell>
                <TableCell className={`${CELL} text-right font-medium`}>{cost > 0 ? formatINR(cost) : <span className="text-muted-foreground font-normal">No cost entered</span>}</TableCell>
                <TableCell className={`${CELL} text-right text-muted-foreground`}>{isPackageComponent(booking) ? '—' : formatINR(booking.total || 0)}</TableCell>
                <TableCell className={`${CELL} text-right text-green-600`}>{formatINR(paid)}</TableCell>
                <TableCell className={`${CELL} text-right`}>{balance > 0 ? <span className="text-red-600 font-medium">{formatINR(balance)}</span> : '—'}</TableCell>
                <TableCell className={CELL}>{cost === 0 ? <StatusBadge label="No cost" tone="muted" /> : balance === 0 ? <StatusBadge label="Paid" tone="green" /> : paid > 0 ? <StatusBadge label="Partial" tone="yellow" /> : <StatusBadge label="Unpaid" tone="muted" />}</TableCell>
                <TableCell className={CELL}>{booking.supplierCostVerified ? <StatusBadge label="Verified" tone="green" /> : <StatusBadge label="Not verified" tone="muted" />}</TableCell>
                <TableCell className={`${CELL} text-right space-x-1 whitespace-nowrap`}>
                  {balance > 0 && <Button size="icon" className="h-7 w-7" variant="outline" title="Pay" onClick={() => { setPaySeed(null); setPayTarget({ booking, cost, paid, balance }); }}><IndianRupee className="h-3.5 w-3.5" /></Button>}
                  {paid > 0 && <Button size="icon" className="h-7 w-7" variant="ghost" title="View payments" onClick={() => setPaymentsTarget(booking)}><History className="h-3.5 w-3.5" /></Button>}
                  {booking.supplierCostVerified
                    ? <Button size="icon" className="h-7 w-7" variant="ghost" title="Unverify" onClick={() => unverify(booking)}><ShieldX className="h-3.5 w-3.5" /></Button>
                    : <Button size="icon" className="h-7 w-7" variant="outline" title="Verify" onClick={() => setVerifyTarget(booking)}><ShieldCheck className="h-3.5 w-3.5" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isLoading && rows.length === 0 && <div className="p-8 text-center text-muted-foreground">{Object.values(filters).some(Boolean) ? 'No bookings match these filters.' : 'No confirmed bookings yet.'}</div>}
      </CardContent>
      <RecordPayoutDialog open={!!payTarget} onOpenChange={(o) => { if (!o) { setPayTarget(null); setPaySeed(null); } }} title={paySeed ? 'Edit supplier cost payment' : 'Record supplier cost payment'} description={payTarget ? `Pay ${payTarget.booking.supplierName || 'the supplier'} for ${payTarget.booking.clientName}'s booking.` : ''} defaultAmount={payTarget?.balance ?? 0} accounts={activeAccounts} suppliers={suppliers ?? []} showSupplier onSubmit={recordPayment} seed={paySeed} />
      <VerifyDialog open={!!verifyTarget} onOpenChange={(o) => !o && setVerifyTarget(null)} title="Verify buy price" description={verifyTarget ? `Confirm ${formatINR(verifyTarget.supplierCost || 0)} buy price matches ${verifyTarget.supplierName || verifyTarget.bookingPortal || 'the supplier'}'s listing.` : ''} onSubmit={verify} />
      <EditBookingDateDialog open={!!dateEditTarget} onOpenChange={(o) => !o && setDateEditTarget(null)} booking={dateEditTarget} onSubmit={saveBookingDate} />
      <PaymentsHistoryDialog booking={paymentsTarget} transactions={transactions ?? []} categoryName="Supplier Cost" onOpenChange={(o) => !o && setPaymentsTarget(null)} onCancel={cancelPayment} onEdit={editPayment} />
    </Card>
  );
}

function PaymentsHistoryDialog({ booking, transactions, categoryName, onOpenChange, onCancel, onEdit }: {
  booking: Booking | null; transactions: FinanceTransaction[]; categoryName: string;
  onOpenChange: (open: boolean) => void; onCancel: (t: FinanceTransaction) => void; onEdit: (t: FinanceTransaction, booking: Booking) => void;
}) {
  if (!booking) return null;
  const rows = transactions.filter((t) => t.bookingId === booking.id && t.type === 'expense' && t.categoryName === categoryName).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Payments — {booking.clientName}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded.</p>}
          {rows.map((t) => {
            const cancelled = t.status === 'cancelled';
            return (
              <div key={t.id} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${cancelled ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <div className="font-medium">{formatINR(t.amount)}{t.paymentMethod && <span className="ml-1.5 text-xs font-normal text-muted-foreground">via {t.paymentMethod}</span>}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.date ? format(new Date(t.date), 'dd MMM yyyy') : '—'}{t.reference ? ` · ${t.reference}` : ''}{t.supplierName ? ` · ${t.supplierName}` : ''}</div>
                </div>
                {cancelled ? <Badge variant="secondary" className="shrink-0">Cancelled</Badge> : (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => onEdit(t, booking)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Cancel" onClick={() => onCancel(t)}><Ban className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type RefundRow = { booking: Booking; due: number; recorded: number };

function RefundTab({ filters, userById }: { filters: ReconciliationFilters; userById: Map<string, User> }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { month: globalMonth } = useGlobalMonthFilter();
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);
  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const roleOf = useMemo(() => (uid: string) => userById.get(uid)?.role, [userById]);

  const rows = useMemo<RefundRow[]>(() => {
    const recordedByBooking = new Map<string, number>();
    (transactions ?? []).forEach((t) => {
      if (t.status === 'cancelled' || t.type !== 'expense' || !t.bookingId || t.source !== 'refund') return;
      recordedByBooking.set(t.bookingId, (recordedByBooking.get(t.bookingId) || 0) + (t.amount || 0));
    });
    return (bookings ?? []).filter((b) => b.status === 'cancelled' && (b.refundAmount || 0) > 0).filter((b) => matchesFilters(b, filters, globalMonth, roleOf))
      .map((b) => ({ booking: b, due: b.refundAmount || 0, recorded: recordedByBooking.get(b.id) || 0 }))
      .sort((a, b) => bookingMadeDateISO(a.booking).localeCompare(bookingMadeDateISO(b.booking)));
  }, [bookings, transactions, filters, globalMonth, roleOf]);

  const [payTarget, setPayTarget] = useState<RefundRow | null>(null);
  const [paySeed, setPaySeed] = useState<PayoutSeed | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<Booking | null>(null);
  const [dateEditTarget, setDateEditTarget] = useState<Booking | null>(null);
  const [paymentsTarget, setPaymentsTarget] = useState<Booking | null>(null);

  const saveBookingDate = (date: string) => {
    if (!firestore || !dateEditTarget) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', dateEditTarget.id), { bookingDateOverride: date, bookingDateOverrideAt: serverTimestamp(), bookingDateOverrideBy: user?.uid ?? null, bookingDateOverrideByName: user?.displayName || user?.email?.split('@')[0] || 'Staff', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Booking date updated' });
  };

  const recordPayout = async (data: { accountId: string; supplierId: string; amount: number; date: string; method: string; reference: string; remarks: string }) => {
    if (!firestore || !payTarget) return;
    const createdByName = user?.displayName || user?.email?.split('@')[0] || 'Staff';
    await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
      type: 'expense', amount: data.amount, date: data.date, accountId: data.accountId, paymentMethod: data.method,
      reference: data.reference.trim() || null, remarks: data.remarks.trim() || 'Refund reconciliation backfill',
      bookingId: payTarget.booking.id, clientId: payTarget.booking.clientId ?? null, clientName: payTarget.booking.clientName ?? null,
      categoryName: 'Refund', status: 'completed', source: 'refund',
      createdAt: serverTimestamp(), createdBy: user?.uid ?? null, createdByName, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    });
    toast({ title: 'Refund payout recorded', description: `${formatINR(data.amount)} logged for ${payTarget.booking.clientName}.` });
  };

  const cancelPayment = (t: FinanceTransaction) => {
    if (!firestore) return;
    updateDocumentNonBlocking(doc(firestore, FINANCE_COLLECTIONS.transactions, t.id), { status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Payout cancelled' });
  };

  const editPayment = (t: FinanceTransaction, booking: Booking) => {
    cancelPayment(t);
    setPaymentsTarget(null);
    setPaySeed({ accountId: t.accountId, date: t.date, method: t.paymentMethod ?? undefined, reference: t.reference ?? undefined, remarks: t.remarks ?? undefined });
    setPayTarget({ booking, due: t.amount || 0, recorded: 0 });
  };

  const verify = (note: string) => {
    if (!firestore || !verifyTarget) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', verifyTarget.id), { refundVerified: true, refundVerifiedAt: serverTimestamp(), refundVerifiedBy: user?.uid ?? null, refundVerifiedByName: user?.displayName || user?.email?.split('@')[0] || 'Staff', refundVerifiedNote: note.trim() || null, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Marked verified' });
  };

  const unverify = (b: Booking) => {
    if (!firestore) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', b.id), { refundVerified: false, refundVerifiedAt: null, refundVerifiedBy: null, refundVerifiedByName: null, refundVerifiedNote: null, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
  };

  const exportCsv = () => {
    const headers = ['Client', 'Agent', 'Booking date', 'Refund due', 'Recorded', 'Match', 'Refund status', 'Verified'];
    const rowsOut = rows.map(({ booking: b, due, recorded }) => [b.clientName || '', bookingAgentName(b, userById), (() => { const d = bookingMadeDate(b); return d ? format(d, 'dd MMM yyyy') : ''; })(), due, recorded, recorded !== due ? 'Mismatch' : 'Matches', b.refundStatus === 'processed' ? 'Processed' : 'Pending', b.refundVerified ? 'Verified' : 'Not verified']);
    downloadCsv(`Reconciliation_Refunds_${todayISO()}.csv`, headers, rowsOut);
  };

  return (
    <Card className="border rounded-lg">
      <div className="flex items-center justify-end p-3 pb-0"><Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}><FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Export</Button></div>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead className={HCELL}>Client</TableHead><TableHead className={HCELL}>Agent</TableHead>
            <TableHead className={HCELL}>Booking date</TableHead><TableHead className={`${HCELL} text-right`}>Refund due</TableHead>
            <TableHead className={`${HCELL} text-right`}>Recorded</TableHead><TableHead className={HCELL}>Match</TableHead>
            <TableHead className={HCELL}>Refund status</TableHead><TableHead className={HCELL}>Verified</TableHead>
            <TableHead className={`${HCELL} text-right`}>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!isLoading && rows.map(({ booking, due, recorded }) => {
              const mismatch = recorded !== due;
              const processed = booking.refundStatus === 'processed';
              return (
                <TableRow key={booking.id}>
                  <TableCell className={`${CELL} text-sm font-medium`}>{booking.clientName}</TableCell>
                  <TableCell className={`${CELL} text-sm text-muted-foreground`}>{bookingAgentName(booking, userById)}</TableCell>
                  <TableCell className={`${CELL} text-sm text-muted-foreground`}>
                    <div className="flex items-center gap-1">
                      <span>{(() => { const d = bookingMadeDate(booking); return d ? format(d, 'dd MMM yyyy') : '—'; })()}</span>
                      {booking.bookingDateOverride && <span className="text-[10px] text-muted-foreground">(corrected)</span>}
                      <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" title="Edit booking date" onClick={() => setDateEditTarget(booking)}><Pencil className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                  <TableCell className={`${CELL} text-right font-medium`}>{formatINR(due)}</TableCell>
                  <TableCell className={`${CELL} text-right text-muted-foreground`}>{formatINR(recorded)}</TableCell>
                  <TableCell className={CELL}>{mismatch ? <span className="inline-flex items-center gap-1 text-red-600 text-sm"><AlertTriangle className="h-3.5 w-3.5" />Mismatch</span> : <span className="inline-flex items-center gap-1 text-green-600 text-sm"><CheckCircle2 className="h-3.5 w-3.5" />Matches</span>}</TableCell>
                  <TableCell className={CELL}>{processed ? <StatusBadge label="Processed" tone="green" /> : <StatusBadge label="Pending" tone="yellow" />}</TableCell>
                  <TableCell className={CELL}>{booking.refundVerified ? <StatusBadge label="Verified" tone="green" /> : <StatusBadge label="Not verified" tone="muted" />}</TableCell>
                  <TableCell className={`${CELL} text-right space-x-1 whitespace-nowrap`}>
                    {mismatch && processed && <Button size="icon" className="h-7 w-7" variant="outline" title="Record payout" onClick={() => { setPaySeed(null); setPayTarget({ booking, due, recorded }); }}><IndianRupee className="h-3.5 w-3.5" /></Button>}
                    {recorded > 0 && <Button size="icon" className="h-7 w-7" variant="ghost" title="View payouts" onClick={() => setPaymentsTarget(booking)}><History className="h-3.5 w-3.5" /></Button>}
                    {processed && (booking.refundVerified ? <Button size="icon" className="h-7 w-7" variant="ghost" title="Unverify" onClick={() => unverify(booking)}><ShieldX className="h-3.5 w-3.5" /></Button> : <Button size="icon" className="h-7 w-7" variant="outline" title="Verify" onClick={() => setVerifyTarget(booking)}><ShieldCheck className="h-3.5 w-3.5" /></Button>)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!isLoading && rows.length === 0 && <div className="p-8 text-center text-muted-foreground">{Object.values(filters).some(Boolean) ? 'No refunds match these filters.' : 'No refunds due yet.'}</div>}
      </CardContent>
      <RecordPayoutDialog open={!!payTarget} onOpenChange={(o) => { if (!o) { setPayTarget(null); setPaySeed(null); } }} title={paySeed ? 'Edit refund payout' : 'Record refund payout'} description={payTarget ? `Backfill the missing refund transaction for ${payTarget.booking.clientName}.` : ''} defaultAmount={payTarget ? payTarget.due - payTarget.recorded : 0} accounts={activeAccounts} onSubmit={recordPayout} seed={paySeed} />
      <VerifyDialog open={!!verifyTarget} onOpenChange={(o) => !o && setVerifyTarget(null)} title="Verify refund" description={verifyTarget ? `Confirm ${formatINR(verifyTarget.refundAmount || 0)} was refunded to ${verifyTarget.clientName}.` : ''} onSubmit={verify} />
      <EditBookingDateDialog open={!!dateEditTarget} onOpenChange={(o) => !o && setDateEditTarget(null)} booking={dateEditTarget} onSubmit={saveBookingDate} />
      <PaymentsHistoryDialog booking={paymentsTarget} transactions={transactions ?? []} categoryName="Refund" onOpenChange={(o) => !o && setPaymentsTarget(null)} onCancel={cancelPayment} onEdit={editPayment} />
    </Card>
  );
}

type AttentionRow = { booking: Booking; paid: number };

function NeedsAttentionTab({ filters, userById }: { filters: ReconciliationFilters; userById: Map<string, User> }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { month: globalMonth } = useGlobalMonthFilter();
  const bookingsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'bookings') : null), [firestore]);
  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);
  const txnsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.transactions) : null), [firestore]);
  const { data: transactions } = useCollection<FinanceTransaction>(txnsQuery);
  const accountsQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.accounts) : null), [firestore]);
  const { data: accounts } = useCollection<FinanceAccount>(accountsQuery);
  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.status !== 'inactive'), [accounts]);
  const roleOf = useMemo(() => (uid: string) => userById.get(uid)?.role, [userById]);

  const rows = useMemo<AttentionRow[]>(() => {
    const paidByBooking = paidToSupplierByBooking(transactions ?? []);
    return (bookings ?? []).filter((b) => b.status === 'cancelled' && b.supplierCostVerified && (!b.supplierCostRecoveryStatus || b.supplierCostRecoveryStatus === 'pending')).filter((b) => matchesFilters(b, filters, globalMonth, roleOf))
      .map((b) => ({ booking: b, paid: paidByBooking.get(b.id) || b.supplierCost || 0 }))
      .sort((a, b) => bookingMadeDateISO(a.booking).localeCompare(bookingMadeDateISO(b.booking)));
  }, [bookings, transactions, filters, globalMonth, roleOf]);

  const [recoverTarget, setRecoverTarget] = useState<AttentionRow | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<AttentionRow | null>(null);

  const recordRecovery = async (data: { accountId: string; amount: number; date: string; method: string; reference: string; remarks: string }) => {
    if (!firestore || !recoverTarget) return;
    const createdByName = user?.displayName || user?.email?.split('@')[0] || 'Staff';
    await addDocumentNonBlocking(collection(firestore, FINANCE_COLLECTIONS.transactions), {
      type: 'income', amount: data.amount, date: data.date, accountId: data.accountId, paymentMethod: data.method,
      reference: data.reference.trim() || null, remarks: data.remarks.trim() || 'Supplier refund — booking cancelled after cost was paid',
      bookingId: recoverTarget.booking.id, supplierName: recoverTarget.booking.supplierName ?? null,
      categoryName: 'Supplier Refund', status: 'completed', source: 'manual',
      createdAt: serverTimestamp(), createdBy: user?.uid ?? null, createdByName, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null,
    });
    updateDocumentNonBlocking(doc(firestore, 'bookings', recoverTarget.booking.id), { supplierCostRecoveryStatus: 'recovered', supplierCostRecoveryAt: serverTimestamp(), supplierCostRecoveryBy: user?.uid ?? null, supplierCostRecoveryByName: createdByName, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Marked recovered', description: `${formatINR(data.amount)} recovered from the supplier.` });
  };

  const writeOff = (note: string) => {
    if (!firestore || !writeOffTarget) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', writeOffTarget.booking.id), { supplierCostRecoveryStatus: 'written_off', supplierCostRecoveryAt: serverTimestamp(), supplierCostRecoveryBy: user?.uid ?? null, supplierCostRecoveryByName: user?.displayName || user?.email?.split('@')[0] || 'Staff', supplierCostRecoveryNote: note.trim() || null, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null });
    toast({ title: 'Written off' });
  };

  const exportCsv = () => {
    const headers = ['Client', 'Agent', 'Supplier / Portal', 'Paid to supplier', 'Cancelled'];
    const rowsOut = rows.map(({ booking: b, paid }) => [b.clientName || '', bookingAgentName(b, userById), b.supplierName || b.bookingPortal || '', paid, b.cancelledAt || '']);
    downloadCsv(`Reconciliation_NeedsAttention_${todayISO()}.csv`, headers, rowsOut);
  };

  return (
    <Card className="border rounded-lg">
      <div className="flex items-center justify-end p-3 pb-0"><Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}><FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Export</Button></div>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead className={HCELL}>Booking</TableHead><TableHead className={HCELL}>Agent</TableHead>
            <TableHead className={HCELL}>Supplier / Portal</TableHead><TableHead className={`${HCELL} text-right`}>Paid to supplier</TableHead>
            <TableHead className={HCELL}>Cancelled</TableHead><TableHead className={`${HCELL} text-right`}>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!isLoading && rows.map((row) => {
              const { booking, paid } = row;
              return (
                <TableRow key={booking.id}>
                  <TableCell className={`${CELL} text-sm`}><div className="font-medium">{booking.clientName}</div><div className="text-xs text-muted-foreground capitalize">{booking.bookingType}</div></TableCell>
                  <TableCell className={`${CELL} text-sm text-muted-foreground`}>{bookingAgentName(booking, userById)}</TableCell>
                  <TableCell className={`${CELL} text-sm text-muted-foreground`}>{booking.supplierName || booking.bookingPortal || '—'}</TableCell>
                  <TableCell className={`${CELL} text-right font-medium text-red-600`}>{formatINR(paid)}</TableCell>
                  <TableCell className={`${CELL} text-sm text-muted-foreground`}>{booking.cancelledAt || '—'}</TableCell>
                  <TableCell className={`${CELL} text-right space-x-1 whitespace-nowrap`}>
                    <Button size="icon" className="h-7 w-7" variant="outline" title="Record supplier refund" onClick={() => setRecoverTarget(row)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" className="h-7 w-7" variant="ghost" title="Write off" onClick={() => setWriteOffTarget(row)}><Ban className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!isLoading && rows.length === 0 && <div className="p-8 text-center text-muted-foreground">Nothing needs attention — no cancelled bookings with a verified, unresolved supplier cost.</div>}
      </CardContent>
      <RecordPayoutDialog open={!!recoverTarget} onOpenChange={(o) => !o && setRecoverTarget(null)} title="Record supplier refund" description={recoverTarget ? `Enter what ${recoverTarget.booking.supplierName || recoverTarget.booking.bookingPortal || 'the supplier'} actually refunded for ${recoverTarget.booking.clientName}'s cancelled booking.` : ''} defaultAmount={recoverTarget?.paid ?? 0} accounts={activeAccounts} onSubmit={recordRecovery} />
      <VerifyDialog open={!!writeOffTarget} onOpenChange={(o) => !o && setWriteOffTarget(null)} title="Write off supplier cost" description={writeOffTarget ? `Accept ${formatINR(writeOffTarget.paid)} paid to ${writeOffTarget.booking.supplierName || writeOffTarget.booking.bookingPortal || 'the supplier'} as a total loss — no refund expected.` : ''} notePlaceholder="e.g. Non-refundable fare, supplier confirmed no refund" confirmLabel="Write off" confirmIcon={Ban} onSubmit={writeOff} />
    </Card>
  );
}

export default function ReconciliationPage() {
  const firestore = useFirestore();
  const suppliersQuery = useMemoFirebase(() => (firestore ? collection(firestore, FINANCE_COLLECTIONS.suppliers) : null), [firestore]);
  const { data: suppliers } = useCollection<FinanceSupplier>(suppliersQuery);
  const usersQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'users') : null), [firestore]);
  const { data: users } = useCollection<User>(usersQuery);
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const agents = useMemo(() => (users ?? []).filter((u) => u.role === 'agent'), [users]);
  const [filters, setFilters] = useState<ReconciliationFilters>(EMPTY_FILTERS);

  return (
    <>
      <PageHeader title="Reconciliation" description="Match supplier buy price and refunds against what was actually paid, and verify against the supplier's portal." />
      <FilterBar filters={filters} setFilters={setFilters} suppliers={suppliers ?? []} agents={agents} />
      <Tabs defaultValue="cost">
        <TabsList>
          <TabsTrigger value="cost">Buy Price</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="attention">Needs Attention</TabsTrigger>
        </TabsList>
        <TabsContent value="cost" className="mt-4"><CostTab filters={filters} userById={userById} /></TabsContent>
        <TabsContent value="refunds" className="mt-4"><RefundTab filters={filters} userById={userById} /></TabsContent>
        <TabsContent value="attention" className="mt-4"><NeedsAttentionTab filters={filters} userById={userById} /></TabsContent>
      </Tabs>
    </>
  );
}
