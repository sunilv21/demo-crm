'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UploadCloud, FileDown, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useFirestore, useUser, useAppUser } from '@/firebase';
import { collection, doc, getDocs, serverTimestamp, writeBatch, type Firestore, type WriteBatch } from 'firebase/firestore';
import type { Booking, BookingType, BookingStatus, FinanceSupplier } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const FIELD_ALIASES: Record<string, string[]> = {
  name: ['clientname', 'name', 'customername', 'fullname'],
  phone: ['clientphone', 'phone', 'mobile', 'contact', 'phonenumber', 'mobilenumber', 'contactnumber'],
  email: ['clientemail', 'email', 'emailaddress'],
  nationality: ['nationality'],
  bookingType: ['bookingtype', 'type'],
  destination: ['destination'],
  startDate: ['startdate', 'departuredate', 'traveldate'],
  endDate: ['enddate', 'returndate'],
  total: ['customerprice', 'total', 'price', 'sellingprice'],
  supplierCost: ['bookingprice', 'supplierCost', 'cost', 'buyprice'],
  amountPaid: ['amountpaid', 'paid', 'advance'],
  status: ['status'],
  supplier: ['supplier', 'vendor', 'airline', 'hotelname'],
  bookingPortal: ['bookingportal', 'portal'],
  remarks: ['remarks', 'notes', 'note'],
};

const TEMPLATE_HEADERS = [
  'Client Name', 'Client Phone', 'Client Email', 'Nationality', 'Booking Type', 'Destination',
  'Start Date', 'End Date', 'Customer Price', 'Booking Price', 'Amount Paid', 'Status',
  'Supplier', 'Booking Portal', 'Remarks',
];

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
const normalizeSupplierName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

const BOOKING_TYPE_VALUES: Record<string, BookingType> = {
  flight: 'flight', hotel: 'hotel', visa: 'visa', activity: 'activity',
  car: 'car', transfer: 'car', other: 'other',
};
const STATUS_VALUES: Record<string, BookingStatus> = {
  draft: 'draft', hold: 'hold', pending: 'pending', blocked: 'blocked',
  confirmed: 'confirmed', cancelled: 'cancelled', canceled: 'cancelled',
};
const PROGRESS_BY_STATUS: Record<string, number> = {
  draft: 10, pending: 50, hold: 50, blocked: 50, confirmed: 100, cancelled: 0,
};

type ParsedRow = {
  data: {
    name: string; phone: string; email: string; nationality: string;
    bookingType: BookingType; destination: string; startDate: Date | null; endDate: Date | null;
    total: number; supplierCost: number; amountPaid: number; status: BookingStatus;
    supplier: string; bookingPortal: string; remarks: string;
  };
  valid: boolean;
  reason?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportBookingsDialog({ open, onOpenChange }: Props) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { canViewRevenue } = useAppUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const validRows = rows.filter((r) => r.valid);

  const reset = () => {
    setFileName('');
    setRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const buildHeaderMap = (headers: string[]) => {
    const map: Record<number, string> = {};
    headers.forEach((h, i) => {
      const n = norm(String(h));
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.includes(n)) { map[i] = field; break; }
      }
    });
    return map;
  };

  const parseDate = (v: string): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const parseNumber = (v: string): number => {
    const n = Number(String(v).replace(/[,₹\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
      if (grid.length < 2) {
        toast({ variant: 'destructive', title: 'Empty file', description: 'No data rows found under the header row.' });
        setParsing(false);
        return;
      }
      const headerMap = buildHeaderMap(grid[0].map(String));
      if (!Object.values(headerMap).includes('name') || !Object.values(headerMap).includes('phone')) {
        toast({
          variant: 'destructive',
          title: 'Missing required columns',
          description: 'The file must have Client Name and Client Phone columns. Download the template for the expected format.',
        });
        setParsing(false);
        return;
      }

      const parsed: ParsedRow[] = grid.slice(1).map((cells) => {
        const raw: Record<string, string> = {};
        cells.forEach((val, i) => {
          const field = headerMap[i];
          if (field) raw[field] = String(val ?? '').trim();
        });

        const name = raw.name || '';
        const phone = raw.phone || '';
        const startDate = parseDate(raw.startDate);
        const bookingType = BOOKING_TYPE_VALUES[norm(raw.bookingType || '')] || 'other';
        const status = STATUS_VALUES[norm(raw.status || '')] || 'confirmed';

        let reason: string | undefined;
        if (!name) reason = 'Missing client name';
        else if (!phone) reason = 'Missing phone number';
        else if (!startDate) reason = 'Missing/invalid start date';

        const data: ParsedRow['data'] = {
          name, phone,
          email: raw.email || '',
          nationality: raw.nationality || '',
          bookingType,
          destination: raw.destination || '',
          startDate,
          endDate: parseDate(raw.endDate),
          total: parseNumber(raw.total),
          supplierCost: parseNumber(raw.supplierCost),
          amountPaid: parseNumber(raw.amountPaid),
          status,
          supplier: raw.supplier || '',
          bookingPortal: raw.bookingPortal || '',
          remarks: raw.remarks || '',
        };

        return { data, valid: !reason, reason };
      });

      setRows(parsed);
      setFileName(file.name);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not read file', description: err?.message ?? 'Unsupported or corrupt file.' });
    } finally {
      setParsing(false);
    }
  };

  const downloadTemplate = () => {
    const sample = [
      TEMPLATE_HEADERS,
      ['Riya Sharma', '+919876543210', 'riya@example.com', 'Indian', 'Flight', 'Dubai', '2026-09-10', '2026-09-15', '45000', '38000', '10000', 'Confirmed', 'Emirates', 'MakeMyTrip', 'Family trip'],
    ];
    const csv = sample.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookings-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!firestore || !user || validRows.length === 0) return;
    setImporting(true);
    try {
      const token = await user.getIdToken();
      const matchRes = await fetch('/api/clients/match-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rows: validRows.map((r) => ({
            name: r.data.name, phone: r.data.phone, email: r.data.email, nationality: r.data.nationality,
          })),
        }),
      });
      const matchResult = await matchRes.json();
      if (!matchRes.ok) {
        toast({ variant: 'destructive', title: 'Could not resolve clients', description: matchResult.error });
        return;
      }
      const clientByRow = new Map<number, { clientId: string; clientName: string }>(
        matchResult.results.map((r: any) => [r.index, { clientId: r.clientId, clientName: r.clientName }])
      );
      const newClientCount = matchResult.results.filter((r: any) => r.created).length;

      const supplierNames = [...new Set(validRows.map((r) => r.data.supplier).filter(Boolean))];
      const existingSuppliers = supplierNames.length
        ? (await getDocs(collection(firestore, 'suppliers'))).docs.map((d) => ({ ...(d.data() as FinanceSupplier), id: d.id }))
        : [];
      const supplierByName = new Map<string, string>();
      const newSupplierOps: { ref: ReturnType<typeof doc>; name: string }[] = [];
      for (const rawName of supplierNames) {
        const key = normalizeSupplierName(rawName);
        const existing = existingSuppliers.find((s) => normalizeSupplierName(s.name) === key);
        if (existing) {
          supplierByName.set(key, existing.name);
        } else if (!newSupplierOps.some((s) => normalizeSupplierName(s.name) === key)) {
          newSupplierOps.push({ ref: doc(collection(firestore, 'suppliers')), name: rawName });
          supplierByName.set(key, rawName);
        }
      }

      const hasPricing = (total: number, cost: number) => total > 0 || cost > 0;
      type Op = (batch: WriteBatch) => void;
      const ops: Op[] = [];

      for (const s of newSupplierOps) {
        ops.push((batch) =>
          batch.set(s.ref, {
            name: s.name,
            category: 'Other',
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
            updatedBy: user.uid,
          })
        );
      }

      validRows.forEach((row, i) => {
        const client = clientByRow.get(i);
        if (!client || !row.data.startDate) return;
        const { total, supplierCost, amountPaid, status, bookingType } = row.data;
        const supplierKey = row.data.supplier ? normalizeSupplierName(row.data.supplier) : '';
        const supplierName = supplierKey ? supplierByName.get(supplierKey) || row.data.supplier : '';
        const isOneWay = bookingType === 'flight' && !row.data.endDate;
        const agentId = canViewRevenue && hasPricing(total, supplierCost) ? user.uid : undefined;

        const payload: Record<string, any> = {
          clientId: client.clientId,
          clientName: client.clientName,
          bookingType,
          destination: row.data.destination,
          startDate: row.data.startDate.toISOString(),
          endDate: row.data.endDate ? row.data.endDate.toISOString() : null,
          total, supplierCost,
          profit: total - supplierCost,
          amountPaid,
          status,
          progress: PROGRESS_BY_STATUS[status] ?? 0,
          supplierName,
          bookingPortal: row.data.bookingPortal,
          remarks: row.data.remarks,
          isOneWay,
          ...(agentId ? { agentId } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        };
        const ref = doc(collection(firestore, 'bookings'));
        ops.push((batch) => batch.set(ref, payload));
      });

      const CHUNK = 400;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        ops.slice(i, i + CHUNK).forEach((op) => op(batch));
        await batch.commit();
      }

      toast({
        title: 'Bookings imported',
        description: `${validRows.length} booking${validRows.length > 1 ? 's' : ''} added (${newClientCount} new client${newClientCount === 1 ? '' : 's'}, ${newSupplierOps.length} new supplier${newSupplierOps.length === 1 ? '' : 's'}).`,
      });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Import failed', description: err?.message ?? 'Could not import bookings.' });
    } finally {
      setImporting(false);
    }
  };

  const skipped = rows.length - validRows.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="md:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Bookings from CSV / Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) parseFile(f);
              }}
            />
            <Button variant="default" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
              {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              Choose File
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <FileDown className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>

          <p className="text-xs text-muted-foreground">
            Accepts .csv, .xlsx, .xls. The first row must be headers.{' '}
            <span className="font-medium">Client Name</span>, <span className="font-medium">Client Phone</span> and{' '}
            <span className="font-medium">Start Date</span> are required — rows missing any of these are skipped.
            The client is matched by phone to an existing one if it already exists, otherwise a new client is created
            automatically (Nationality defaults to Indian if left blank). Status defaults to Confirmed when left blank.
          </p>

          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />{validRows.length} ready</Badge>
                {skipped > 0 && <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />{skipped} skipped</Badge>}
              </div>

              <div className="rounded border max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Supplier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 100).map((r, i) => (
                      <TableRow key={i} className={r.valid ? '' : 'opacity-50'}>
                        <TableCell className="font-medium">
                          {r.data.name || <span className="text-destructive text-xs">—</span>}
                          {!r.valid && <div className="text-xs text-destructive">{r.reason}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{r.data.phone || '—'}</TableCell>
                        <TableCell className="text-sm capitalize">{r.data.bookingType}</TableCell>
                        <TableCell className="text-sm">{r.data.startDate ? r.data.startDate.toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-sm text-right">{r.data.total ? r.data.total.toLocaleString() : '—'}</TableCell>
                        <TableCell className="text-sm capitalize">{r.data.status}</TableCell>
                        <TableCell className="text-sm">{r.data.supplier || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {rows.length > 100 && (
                <p className="text-xs text-muted-foreground">Showing first 100 of {rows.length} rows. All valid rows will be imported.</p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import {validRows.length > 0 ? `${validRows.length} Booking${validRows.length > 1 ? 's' : ''}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
