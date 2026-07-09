'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
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
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import type { Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

// Canonical client field ← accepted header aliases (all matched case-insensitively,
// ignoring spaces/underscores).
const FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'clientname', 'fullname', 'customername'],
  email: ['email', 'emailaddress', 'mail'],
  phone: ['phone', 'mobile', 'contact', 'phonenumber', 'mobilenumber', 'whatsapp', 'contactnumber'],
  nationality: ['nationality'],
  preferredDestination: ['destination', 'preferreddestination', 'preferreddestinations'],
  travelPurpose: ['travelpurpose', 'purpose'],
  status: ['status'],
  pax: ['pax', 'travelers', 'travellers', 'passengers'],
  budget: ['budget'],
  gender: ['gender'],
  dateOfBirth: ['dob', 'dateofbirth', 'birthdate'],
  preferences: ['preferences', 'notes', 'remarks', 'note'],
  organization: ['organization', 'organisation', 'company', 'org'],
};

const TEMPLATE_HEADERS = [
  'Name', 'Email', 'Phone', 'Nationality', 'Destination', 'Travel Purpose',
  'Status', 'PAX', 'Budget', 'Gender', 'DOB', 'Notes', 'Organization',
];

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');

const STATUSES = ['active', 'inactive', 'lead', 'prospect'];
const GENDERS = ['male', 'female', 'other'];

type ParsedRow = {
  data: Partial<Client>;
  orgName?: string;
  valid: boolean;
  reason?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations?: { id: string; name: string }[];
  /** When set, every imported client is linked to this organization (used from an org page). */
  defaultOrganizationId?: string;
  defaultOrganizationName?: string;
}

export function ImportClientsDialog({ open, onOpenChange, organizations = [], defaultOrganizationId, defaultOrganizationName }: Props) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdminOrManager } = useAppUser();
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
        if (aliases.includes(n)) {
          map[i] = field;
          break;
        }
      }
    });
    return map;
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // header:1 → array-of-arrays so we control header mapping ourselves.
      const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
      if (grid.length < 2) {
        toast({ variant: 'destructive', title: 'Empty file', description: 'No data rows found under the header row.' });
        setParsing(false);
        return;
      }
      const headerMap = buildHeaderMap(grid[0].map(String));
      if (!Object.values(headerMap).includes('name')) {
        toast({ variant: 'destructive', title: 'Missing "Name" column', description: 'The file must have a Name column. Download the template for the expected format.' });
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
        if (!name) return { data: {}, valid: false, reason: 'Missing name' };

        const status = STATUSES.includes((raw.status || '').toLowerCase())
          ? (raw.status.toLowerCase() as Client['status'])
          : 'prospect';
        const gender = GENDERS.includes((raw.gender || '').toLowerCase())
          ? (raw.gender.toLowerCase() as Client['gender'])
          : undefined;

        let dob: string | undefined;
        if (raw.dateOfBirth) {
          const d = new Date(raw.dateOfBirth);
          if (!isNaN(d.getTime())) dob = d.toISOString();
        }

        const data: Partial<Client> = {
          name,
          email: raw.email || '',
          phone: raw.phone || '',
          status,
          nationality: raw.nationality || undefined,
          preferredDestination: raw.preferredDestination || undefined,
          travelPurpose: raw.travelPurpose || undefined,
          gender,
          dateOfBirth: dob,
          preferences: raw.preferences || '',
          pax: raw.pax && !isNaN(Number(raw.pax)) ? Number(raw.pax) : undefined,
          budget: raw.budget && !isNaN(Number(raw.budget)) ? Number(raw.budget) : undefined,
        };

        return { data, orgName: raw.organization || undefined, valid: true };
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
      ['Riya Sharma', 'riya@example.com', '+919876543210', 'Indian', 'Dubai', 'leisure', 'prospect', '2', '150000', 'female', '1995-04-12', 'VIP client', 'Acme Corp'],
    ];
    const csv = sample.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clients-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!firestore || !user || validRows.length === 0) return;
    setImporting(true);
    try {
      // Match an "Organization" cell to an existing org by name (case-insensitive).
      const orgByName = new Map(organizations.map((o) => [o.name.toLowerCase(), o.id]));

      // writeBatch caps at 500 ops; chunk to be safe.
      const CHUNK = 400;
      for (let i = 0; i < validRows.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        validRows.slice(i, i + CHUNK).forEach((row) => {
          const ref = doc(collection(firestore, 'clients'));
          // Org-page import pins every row to that org; otherwise match by name.
          const orgId = defaultOrganizationId ?? (row.orgName ? orgByName.get(row.orgName.toLowerCase()) : undefined);
          const payload: Record<string, any> = {
            ...row.data,
            organizationId: orgId ?? null,
            avatar: '',
            // Non-admins own the clients they import (so they appear in their list).
            assignedEmployees: isAdminOrManager ? null : [user.uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
            updatedBy: user.uid,
          };
          // Firestore rejects undefined values.
          Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
          batch.set(ref, payload);
        });
        await batch.commit();
      }
      toast({ title: 'Clients imported', description: `${validRows.length} client${validRows.length > 1 ? 's' : ''} added.` });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Import failed', description: err?.message ?? 'Could not import clients.' });
    } finally {
      setImporting(false);
    }
  };

  const skipped = rows.length - validRows.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="md:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {defaultOrganizationName
              ? `Import Clients into ${defaultOrganizationName}`
              : 'Import Clients from CSV / Excel'}
          </DialogTitle>
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
            Accepts .csv, .xlsx, .xls. The first row must be headers. <span className="font-medium">Name</span> is required;
            Email, Phone, Nationality, Destination, Travel Purpose, Status, PAX, Budget, Gender, DOB and Notes are optional.
            {defaultOrganizationName
              ? ` Every imported client will be added to ${defaultOrganizationName}.`
              : ' An Organization cell links the client to a matching existing organization by name.'}
          </p>

          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />{validRows.length} ready</Badge>
                {skipped > 0 && <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />{skipped} skipped (no name)</Badge>}
              </div>

              <div className="rounded border max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Organization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 100).map((r, i) => (
                      <TableRow key={i} className={r.valid ? '' : 'opacity-50'}>
                        <TableCell className="font-medium">{r.data.name || <span className="text-destructive text-xs">— skipped —</span>}</TableCell>
                        <TableCell className="text-sm">{r.data.email || '—'}</TableCell>
                        <TableCell className="text-sm">{r.data.phone || '—'}</TableCell>
                        <TableCell className="text-sm capitalize">{r.data.status || '—'}</TableCell>
                        <TableCell className="text-sm">{r.orgName || '—'}</TableCell>
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
            Import {validRows.length > 0 ? `${validRows.length} Client${validRows.length > 1 ? 's' : ''}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
