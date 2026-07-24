'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search } from 'lucide-react';
import type { Client, Lead } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';

// Mirrors src/components/campaigns/campaign-recipient-picker.tsx (email),
// swapping the email column for phone — Client.phone/Lead.phone are
// non-optional, so there's no "no phone" disabled-row case to handle, just
// a skip for a genuinely empty string.
export interface PickedWhatsAppRecipient {
  type: 'client' | 'lead';
  id: string;
  name: string;
  phone: string;
}

interface WhatsAppCampaignRecipientPickerProps {
  onSelectionChange: (recipients: PickedWhatsAppRecipient[]) => void;
}

const LOAD_STEP = 100;

export function WhatsAppCampaignRecipientPicker({ onSelectionChange }: WhatsAppCampaignRecipientPickerProps) {
  const firestore = useFirestore();
  const [clientLimit, setClientLimit] = useState(LOAD_STEP);
  const [leadLimit, setLeadLimit] = useState(LOAD_STEP);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, PickedWhatsAppRecipient>>(new Map());

  const clientsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'clients'), orderBy('name', 'asc'), limit(clientLimit)) : null),
    [firestore, clientLimit]
  );
  const { data: clients, isLoading: clientsLoading } = useCollection<Client>(clientsQuery);

  const leadsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'leads'), orderBy('name', 'asc'), limit(leadLimit)) : null),
    [firestore, leadLimit]
  );
  const { data: leads, isLoading: leadsLoading } = useCollection<Lead>(leadsQuery);

  useEffect(() => {
    onSelectionChange(Array.from(selected.values()));
    // onSelectionChange intentionally omitted: parent passes a fresh
    // arrow fn each render, including it would loop this effect forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function toggle(type: 'client' | 'lead', id: string, name: string, phone: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      const key = `${type}:${id}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, { type, id, name, phone });
      return next;
    });
  }

  // Selects/deselects every row currently visible for this tab (i.e.
  // respecting the search filter) — rows without a phone are skipped since
  // they can't be messaged anyway.
  function toggleAll(type: 'client' | 'lead', rows: (Client | Lead)[]) {
    const eligible = rows.filter((r) => r.phone?.trim());
    const allSelected = eligible.length > 0 && eligible.every((r) => selected.has(`${type}:${r.id}`));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of eligible) {
        const key = `${type}:${r.id}`;
        if (allSelected) next.delete(key);
        else next.set(key, { type, id: r.id, name: r.name, phone: r.phone! });
      }
      return next;
    });
  }

  const term = search.trim().toLowerCase();
  const filteredClients = useMemo(
    () => (clients || []).filter((c) => !term || c.name.toLowerCase().includes(term) || (c.phone || '').toLowerCase().includes(term)),
    [clients, term]
  );
  const filteredLeads = useMemo(
    () => (leads || []).filter((l) => !term || l.name.toLowerCase().includes(term) || (l.phone || '').toLowerCase().includes(term)),
    [leads, term]
  );

  function renderRows(type: 'client' | 'lead', rows: (Client | Lead)[], isLoading: boolean) {
    const eligible = rows.filter((r) => r.phone?.trim());
    const allSelected = eligible.length > 0 && eligible.every((r) => selected.has(`${type}:${r.id}`));
    const someSelected = !allSelected && eligible.some((r) => selected.has(`${type}:${r.id}`));
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={someSelected ? 'indeterminate' : allSelected}
                disabled={eligible.length === 0}
                onCheckedChange={() => toggleAll(type, rows)}
                aria-label={`Select all ${type === 'client' ? 'clients' : 'leads'}`}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const key = `${type}:${r.id}`;
            const disabled = !r.phone?.trim();
            return (
              <TableRow key={key} data-state={selected.has(key) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(key)}
                    disabled={disabled}
                    onCheckedChange={() => toggle(type, r.id, r.name, r.phone || '')}
                  />
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.phone || <span className="italic">No phone</span>}
                </TableCell>
              </TableRow>
            );
          })}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-6">No results.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground shrink-0">{selected.size} selected</span>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clients ({clients?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="leads">Leads ({leads?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="clients" className="mt-3">
          <div className="border rounded-lg max-h-80 overflow-y-auto">{renderRows('client', filteredClients, clientsLoading)}</div>
          {!clientsLoading && (clients?.length ?? 0) === clientLimit && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setClientLimit((n) => n + LOAD_STEP)}>
              Load more clients
            </Button>
          )}
        </TabsContent>
        <TabsContent value="leads" className="mt-3">
          <div className="border rounded-lg max-h-80 overflow-y-auto">{renderRows('lead', filteredLeads, leadsLoading)}</div>
          {!leadsLoading && (leads?.length ?? 0) === leadLimit && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setLeadLimit((n) => n + LOAD_STEP)}>
              Load more leads
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
