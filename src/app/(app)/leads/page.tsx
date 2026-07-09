'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Lead, LeadStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  PlusCircle, User, MoreHorizontal, Eye, Pencil, Trash2, UserCheck,
  ChevronRight, Search, ChevronDown, LayoutGrid, Table as TableIcon, Mail, Phone, Share2,
  Copy, Check,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking,
  updateDocumentNonBlocking, deleteDocumentNonBlocking, useUser, useAppUser,
} from '@/firebase';
import { collection, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { LeadForm, LEAD_SOURCES, SHARE_PLATFORMS } from '@/components/forms/lead-form';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import Link from 'next/link';

const statusColumns: { title: string; status: LeadStatus }[] = [
  { title: 'New', status: 'new' },
  { title: 'Contacted', status: 'contacted' },
  { title: 'Proposal', status: 'proposal' },
  { title: 'Won', status: 'won' },
  { title: 'Lost', status: 'lost' },
];

const statusLabel: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', proposal: 'Proposal', won: 'Won', lost: 'Lost',
};

const statusBadgeClass: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  contacted: 'bg-purple-100 text-purple-800 border-purple-200',
  proposal: 'bg-orange-100 text-orange-800 border-orange-200',
  won: 'bg-green-100 text-green-800 border-green-200',
  lost: 'bg-red-100 text-red-800 border-red-200',
};

// ---------------------------------------------------------------------------
// Shared per-lead actions menu (used by both Kanban cards and table rows).
// ---------------------------------------------------------------------------
const LeadActions = ({
  lead, canDelete, onView, onEdit, onMove, onConvert, onDelete,
}: {
  lead: Lead;
  canDelete: boolean;
  onView: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onMove: (l: Lead, status: LeadStatus) => void;
  onConvert: (l: Lead) => void;
  onDelete: (l: Lead) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open lead actions">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => onView(lead)}><Eye className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onEdit(lead)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger><ChevronRight className="mr-2 h-4 w-4" />Move to Stage</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {statusColumns.map(col => (
            <DropdownMenuItem
              key={col.status}
              disabled={lead.status === col.status}
              onSelect={() => onMove(lead, col.status)}
            >
              {col.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => onConvert(lead)}
        disabled={!!lead.convertedToClientId}
      >
        <UserCheck className="mr-2 h-4 w-4" />
        {lead.convertedToClientId ? 'Already Converted' : 'Convert to Client'}
      </DropdownMenuItem>
      {canDelete && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(lead)}>
            <Trash2 className="mr-2 h-4 w-4" />Delete
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

const LeadCardSkeleton = () => (
  <Card className="mb-3">
    <CardContent className="p-4 flex items-center space-x-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </CardContent>
  </Card>
);

const LeadCard = ({ lead, actions }: { lead: Lead; actions: React.ReactNode }) => (
  <Card className="mb-3">
    <CardContent className="p-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 border">
          <AvatarFallback><User className="h-4 w-4 text-muted-foreground" /></AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{lead.name}</p>
          <p className="text-sm text-muted-foreground truncate">{lead.phone}</p>
          {leadDestination(lead) && (
            <p className="text-xs text-muted-foreground truncate mt-1">📍 {leadDestination(lead)}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {lead.source && <Badge variant="outline" className="text-xs">{formatSource(lead.source)}</Badge>}
            {lead.convertedToClientId && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Client</Badge>}
          </div>
        </div>
        <div className="flex-shrink-0">{actions}</div>
      </div>
    </CardContent>
  </Card>
);

const KanbanColumn = ({
  title, status, leads, isLoading, renderActions,
}: {
  title: string;
  status: LeadStatus;
  leads: Lead[];
  isLoading: boolean;
  renderActions: (l: Lead) => React.ReactNode;
}) => (
  <div className="flex-1 min-w-0">
    <Card className="bg-muted/50 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="secondary" className={statusBadgeClass[status]}>{leads.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && Array.from({ length: 2 }).map((_, i) => <LeadCardSkeleton key={i} />)}
        {!isLoading && leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} actions={renderActions(lead)} />
        ))}
        {!isLoading && leads.length === 0 && (
          <div className="text-center p-4 text-sm text-muted-foreground">No leads in this stage.</div>
        )}
      </CardContent>
    </Card>
  </div>
);

// ---------------------------------------------------------------------------
// Lead detail view (read-only).
// ---------------------------------------------------------------------------
const DetailRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-1.5 border-b last:border-0">
    <dt className="text-sm text-muted-foreground col-span-1">{label}</dt>
    <dd className="text-sm col-span-2">{value || <span className="text-muted-foreground">—</span>}</dd>
  </div>
);

const travelPurposeMap: Record<string, string> = {
  leisure: 'Leisure', tourism: 'Tourism', visit: 'Visit', business: 'Business', family: 'Family',
};

// Website leads store destination/notes under different keys; unify here.
const leadDestination = (l: Lead) => l.preferredDestination || l.destination || '';
const leadNotes = (l: Lead) => l.notes || l.message || '';

// `website:consultation` -> "Website · Consultation"; plain sources unchanged.
const formatSource = (s?: string) => {
  if (!s) return '';
  if (s.includes(':')) {
    return s.split(':').map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' · ');
  }
  return s;
};

const LeadDetail = ({ lead }: { lead: Lead }) => (
  <dl className="mt-2">
    <DetailRow label="Name" value={lead.name} />
    <DetailRow label="Phone" value={lead.phone} />
    <DetailRow label="Email" value={lead.email} />
    <DetailRow label="Stage" value={<Badge variant="secondary" className={statusBadgeClass[lead.status]}>{statusLabel[lead.status]}</Badge>} />
    <DetailRow label="Source" value={formatSource(lead.source)} />
    {lead.sourceWebsite && <DetailRow label="From Website" value={lead.sourceWebsite} />}
    <DetailRow label="Destination" value={leadDestination(lead)} />
    <DetailRow label="Travel Purpose" value={lead.travelPurpose ? (travelPurposeMap[lead.travelPurpose] || lead.travelPurpose) : undefined} />
    <DetailRow label="Budget" value={lead.budget ? `₹${lead.budget.toLocaleString('en-IN')}` : undefined} />
    <DetailRow label="PAX" value={lead.pax} />
    <DetailRow label="Notes" value={leadNotes(lead)} />
    <DetailRow label="Created" value={lead.createdAt?.toDate ? format(lead.createdAt.toDate(), 'PPp') : undefined} />
    {lead.convertedToClientId && (
      <DetailRow label="Converted Client" value={<Link href={`/clients/${lead.convertedToClientId}`} className="text-primary hover:underline">View client →</Link>} />
    )}
  </dl>
);

export default function LeadsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { canDelete } = useAppUser();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('createdAt-desc');

  // Share-link dialog state.
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePlatform, setSharePlatform] = useState<string>('Website');
  const [customSource, setCustomSource] = useState('');
  const [copied, setCopied] = useState(false);

  const effectiveSource = (sharePlatform === 'Other' ? customSource.trim() : sharePlatform) || 'Website';
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/lead?source=${encodeURIComponent(effectiveSource)}`
    : `/lead?source=${encodeURIComponent(effectiveSource)}`;

  const leadsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const [field, direction] = sortOrder.split('-');
    return query(collection(firestore, 'leads'), orderBy(field, direction as 'asc' | 'desc'));
  }, [firestore, sortOrder]);

  const { data: leads, isLoading } = useCollection<Lead>(leadsQuery);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    const term = searchTerm.toLowerCase();
    return leads.filter(lead => {
      const searchMatch = term
        ? lead.name.toLowerCase().includes(term) ||
          lead.phone?.toLowerCase().includes(term) ||
          (lead.email && lead.email.toLowerCase().includes(term))
        : true;
      const sourceMatch = sourceFilter !== 'All' ? lead.source === sourceFilter : true;
      return searchMatch && sourceMatch;
    });
  }, [leads, searchTerm, sourceFilter]);

  const leadsByStatus = (status: LeadStatus) => filteredLeads.filter(l => l.status === status);

  // Source filter options: presets + every distinct source seen in the data
  // (covers website:* sources and any custom share-link sources).
  const sourceOptions = useMemo(() => {
    const set = new Set<string>(LEAD_SOURCES as readonly string[]);
    (leads || []).forEach(l => { if (l.source) set.add(l.source); });
    return ['All', ...Array.from(set).sort()];
  }, [leads]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const handleAddLead = (newLeadData: Omit<Lead, 'id' | 'avatar'>) => {
    if (!leadsQuery || !user) return;
    addDocumentNonBlocking(collection(firestore!, 'leads'), newLeadData);
    setIsCreateOpen(false);
    toast({ title: 'Lead Created', description: `New lead "${newLeadData.name}" has been added.` });
  };

  const handleUpdateLead = (updatedData: Partial<Lead>) => {
    if (!firestore || !editingLead) return;
    updateDocumentNonBlocking(doc(firestore, 'leads', editingLead.id), {
      ...updatedData, updatedAt: serverTimestamp(), updatedBy: user?.uid,
    });
    setEditingLead(null);
    toast({ title: 'Lead Updated', description: `Lead "${editingLead.name}" has been updated.` });
  };

  const handleMoveStage = (lead: Lead, status: LeadStatus) => {
    if (!firestore || lead.status === status) return;
    updateDocumentNonBlocking(doc(firestore, 'leads', lead.id), {
      status, updatedAt: serverTimestamp(), updatedBy: user?.uid,
    });
    toast({ title: 'Stage Updated', description: `"${lead.name}" moved to ${statusLabel[status]}.` });
  };

  const handleConvert = async () => {
    if (!firestore || !convertLead || !user) return;
    const lead = convertLead;

    const clientData: Record<string, any> = {
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone,
      avatar: lead.avatar,
      nationality: lead.nationality || '',
      preferredDestination: leadDestination(lead),
      travelPurpose: lead.travelPurpose || '',
      preferredTravelDates: {
        from: lead.preferredTravelDates?.from ?? null,
        to: lead.preferredTravelDates?.to ?? null,
      },
      budget: lead.budget ?? null,
      pax: lead.pax || 1,
      preferences: leadNotes(lead),
      status: 'prospect',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      updatedBy: user.uid,
    };

    const ref = await addDocumentNonBlocking(collection(firestore, 'clients'), clientData);

    updateDocumentNonBlocking(doc(firestore, 'leads', lead.id), {
      status: 'won',
      convertedToClientId: ref?.id ?? null,
      convertedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });

    setConvertLead(null);
    toast({ title: 'Lead Converted', description: `"${lead.name}" is now a client.` });
  };

  const handleDelete = () => {
    if (!firestore || !leadToDelete) return;
    deleteDocumentNonBlocking(doc(firestore, 'leads', leadToDelete.id));
    toast({ variant: 'destructive', title: 'Lead Deleted', description: `Lead "${leadToDelete.name}" has been deleted.` });
    setLeadToDelete(null);
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: 'Link Copied!', description: `Lead form link for "${effectiveSource}" copied to clipboard.` });
    setTimeout(() => setCopied(false), 2000);
  };

  const renderActions = (lead: Lead) => (
    <LeadActions
      lead={lead}
      canDelete={canDelete}
      onView={setViewingLead}
      onEdit={setEditingLead}
      onMove={handleMoveStage}
      onConvert={setConvertLead}
      onDelete={setLeadToDelete}
    />
  );

  const sortOptions: Record<string, string> = {
    'createdAt-desc': 'Newest first',
    'createdAt-asc': 'Oldest first',
    'name-asc': 'Name (A–Z)',
  };

  return (
    <>
      <PageHeader title="Leads" description="Track and manage new leads through the sales pipeline.">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <Share2 className="mr-2 h-4 w-4" />Share Lead Form
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />New Lead
          </Button>
        </div>
      </PageHeader>

      {/* Toolbar */}
      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone or email..."
              className="pl-10 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-between">
                  Source: {sourceFilter === 'All' ? 'All' : formatSource(sourceFilter)} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 overflow-y-auto">
                {sourceOptions.map(s => (
                  <DropdownMenuItem key={s} onSelect={() => setSourceFilter(s)}>
                    {s === 'All' ? 'All' : formatSource(s)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-between">
                  Sort: {sortOptions[sortOrder]} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.entries(sortOptions).map(([value, label]) => (
                  <DropdownMenuItem key={value} onSelect={() => setSortOrder(value)}>{label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* View toggle */}
      <Tabs defaultValue="table" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="kanban"><LayoutGrid className="mr-2 h-4 w-4" />Board</TabsTrigger>
          <TabsTrigger value="table"><TableIcon className="mr-2 h-4 w-4" />Table</TabsTrigger>
        </TabsList>

        {/* Kanban */}
        <TabsContent value="kanban">
          <div className="flex flex-col md:flex-row gap-4 pb-4">
            {statusColumns.map(col => (
              <KanbanColumn
                key={col.status}
                title={col.title}
                status={col.status}
                leads={leadsByStatus(col.status)}
                isLoading={isLoading}
                renderActions={renderActions}
              />
            ))}
          </div>
        </TabsContent>

        {/* Table */}
        <TabsContent value="table">
          <div className="bg-card border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Lead</TableHead>
                  <TableHead className="w-[240px]">Contact</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="w-[120px]">Source</TableHead>
                  <TableHead className="w-[110px]">Stage</TableHead>
                  <TableHead className="w-[120px]">Created</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))}
                {!isLoading && filteredLeads.map(lead => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border">
                          <AvatarFallback><User className="h-4 w-4 text-muted-foreground" /></AvatarFallback>
                        </Avatar>
                        <span>{lead.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${lead.email}`} className="hover:underline truncate">{lead.email}</a>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{lead.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{leadDestination(lead) || '—'}</TableCell>
                    <TableCell>{lead.source ? <Badge variant="outline">{formatSource(lead.source)}</Badge> : '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusBadgeClass[lead.status]}>{statusLabel[lead.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{lead.createdAt?.toDate ? format(lead.createdAt.toDate(), 'P') : '—'}</TableCell>
                    <TableCell className="text-right">{renderActions(lead)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isLoading && filteredLeads.length === 0 && (
              <div className="text-center p-8 text-muted-foreground"><p>No leads found.</p></div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Share lead-form link dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Lead Capture Form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pick where you'll post this link. Leads submitted through it are automatically tagged with that source.
            </p>
            <div className="space-y-2">
              <Label>Platform / Source</Label>
              <Select value={sharePlatform} onValueChange={setSharePlatform}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {SHARE_PLATFORMS.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sharePlatform === 'Other' && (
              <div className="space-y-2">
                <Label>Custom source name</Label>
                <Input
                  placeholder="e.g., Diwali Campaign"
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Shareable link</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" onClick={handleCopyShareLink} className="shrink-0">
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="md:max-w-2xl">
          <DialogHeader><DialogTitle>Create New Lead</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-1">
            <LeadForm onSubmit={handleAddLead} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="lead-form">Save Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
        <DialogContent className="md:max-w-2xl">
          <DialogHeader><DialogTitle>Edit {editingLead?.name}</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-1">
            {editingLead && <LeadForm lead={editingLead} onSubmit={handleUpdateLead} />}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingLead(null)}>Cancel</Button>
            <Button type="submit" form="lead-form">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View detail dialog */}
      <Dialog open={!!viewingLead} onOpenChange={(open) => !open && setViewingLead(null)}>
        <DialogContent className="md:max-w-lg">
          <DialogHeader><DialogTitle>{viewingLead?.name}</DialogTitle></DialogHeader>
          {viewingLead && <LeadDetail lead={viewingLead} />}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { const l = viewingLead; setViewingLead(null); if (l) setEditingLead(l); }}>
              <Pencil className="mr-2 h-4 w-4" />Edit
            </Button>
            {!viewingLead?.convertedToClientId && (
              <Button onClick={() => { const l = viewingLead; setViewingLead(null); if (l) setConvertLead(l); }}>
                <UserCheck className="mr-2 h-4 w-4" />Convert to Client
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert confirm */}
      <AlertDialog open={!!convertLead} onOpenChange={(open) => !open && setConvertLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert lead to client?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new client record for <span className="font-bold">{convertLead?.name}</span> with the details
              captured on this lead, and marks the lead as Won. You can complete the rest of the client profile afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert}>Convert</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <ConfirmDeleteDialog
        open={!!leadToDelete}
        onOpenChange={(open) => !open && setLeadToDelete(null)}
        onConfirm={handleDelete}
        confirmText={leadToDelete?.name || ''}
        description={
          <>
            This action cannot be undone. This will permanently delete the lead{' '}
            <span className="font-semibold text-foreground">{leadToDelete?.name}</span>.
          </>
        }
      />
    </>
  );
}
