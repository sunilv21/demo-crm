'use client';

import { useParams } from 'next/navigation';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, serverTimestamp } from 'firebase/firestore';
import type { Client, User as StaffUser } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { visaStatusGlow, clientIdFromSlug, formatINR } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell, BookOpen, Briefcase, Calendar, CalendarDays, ChevronRight, Cog,
  ExternalLink, FolderOpen, Globe, Hotel, IndianRupee, Mail, MapPin,
  NotepadText, Pencil, Phone, Plane, User, UserCheck, Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { CustomerLogs } from '@/components/customer-logs';
import { ClientBookings } from '@/components/clients/client-bookings';
import { ClientForm } from '@/components/forms/client-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Website user profile (travel website shared Firebase) ─────────────────────
interface WebsiteUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;
  gender?: string;
  dateOfBirth?: any;
  nationality?: string;
  maritalStatus?: string;
  city?: string;
  state?: string;
  cloudDocsUrl?: string;
  passport?: {
    number?: string;
    countryOfIssue?: string;
    dateOfIssue?: any;
    dateOfExpiry?: any;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  flight: 'Flight', hotel: 'Hotel', visa: 'Visa',
  transfers: 'Transfers', activity: 'Activity', localTours: 'Local Tours',
};
const ADD_SERVICE_LABELS: Record<string, string> = {
  travelInsurance: 'Travel Insurance', airportPickup: 'Airport Pickup', localTours: 'Local Tours',
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Active',   cls: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400' },
  prospect: { label: 'Prospect', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400' },
  inactive: { label: 'Inactive', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400' },
  lead:     { label: 'Lead',     cls: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400' },
};

const VISA_CONFIG: Record<string, { label: string; cls: string }> = {
  toStart:   { label: 'To Start',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  inProcess: { label: 'In Process', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  applied:   { label: 'Applied',    cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  approved:  { label: 'Approved',   cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected:  { label: 'Rejected',   cls: 'bg-red-100 text-red-800 border-red-200' },
  completed: { label: 'Completed',  cls: 'bg-sky-100 text-sky-800 border-sky-200' },
};

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ── Info Row ──────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

// ── Website Profile Card ──────────────────────────────────────────────────────

function formatFirestoreDate(value: any): string | null {
  if (!value) return null;
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    return isNaN(d.getTime()) ? null : format(d, 'dd MMM yyyy');
  } catch { return null; }
}

function WebsiteProfileCard({ wu }: { wu: WebsiteUser }) {
  const passport = wu.passport;
  const hasPassport = passport?.number || passport?.countryOfIssue || passport?.dateOfExpiry;
  const location = [wu.city, wu.state].filter(Boolean).join(', ');

  return (
    <Card className="border-sky-200 bg-sky-50/40 dark:border-sky-900/50 dark:bg-sky-950/10">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          Website Profile
          <span className="ml-1 text-[10px] font-normal text-sky-500/70 lowercase tracking-normal">linked from travel portal</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Cloud Docs Link — most important, shown prominently */}
        {wu.cloudDocsUrl && (
          <a
            href={wu.cloudDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-100/60 px-3 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-100 transition-colors dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-400"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Open Cloud Documents</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </a>
        )}

        <div className="grid sm:grid-cols-2 gap-x-4 divide-y sm:divide-y-0 divide-border">
          <div className="divide-y divide-border">
            <InfoRow icon={MapPin}    label="Location"       value={location || null} />
            <InfoRow icon={Globe}     label="Nationality"    value={wu.nationality} />
            <InfoRow icon={UserCheck} label="Marital Status" value={wu.maritalStatus} />
            <InfoRow icon={Calendar}  label="Date of Birth"  value={formatFirestoreDate(wu.dateOfBirth)} />
          </div>

          {hasPassport && (
            <div className="divide-y divide-border pt-2 sm:pt-0">
              <div className="flex items-start gap-3 py-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Passport</p>
                  {passport?.number && <p className="mt-0.5 text-sm font-medium font-mono">{passport.number}</p>}
                  {passport?.countryOfIssue && <p className="text-xs text-muted-foreground">{passport.countryOfIssue}</p>}
                  {passport?.dateOfIssue && <p className="text-xs text-muted-foreground">Issued: {formatFirestoreDate(passport.dateOfIssue)}</p>}
                  {passport?.dateOfExpiry && <p className="text-xs text-muted-foreground">Expires: {formatFirestoreDate(passport.dateOfExpiry)}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ClientProfileSkeleton() {
  return (
    <div className="space-y-5">
      <div className="relative h-28 rounded-xl bg-muted" />
      <div className="-mt-14 px-5 flex items-end gap-4">
        <Skeleton className="h-20 w-20 rounded-full border-4 border-background shrink-0" />
        <div className="mb-1 space-y-1.5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientProfilePage() {
  const params = useParams();
  const firestore = useFirestore();
  const { isAdminOrManager, authUser } = useAppUser();
  const { toast } = useToast();
  const clientId = clientIdFromSlug(params.clientId as string);

  const [isEditOpen, setIsEditOpen] = useState(false);

  const clientRef = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);

  const { data: client, isLoading } = useDoc<Client>(clientRef);

  const usersQuery = useMemoFirebase(
    () => (firestore && isAdminOrManager ? collection(firestore, 'users') : null),
    [firestore, isAdminOrManager]
  );
  const { data: staffUsers } = useCollection<StaffUser>(usersQuery);
  const staffOptions = (staffUsers || []).map((u) => ({ id: u.id, name: u.name }));

  // Lookup website portal user by matching email (then phone) in the shared Firebase users collection.
  // Travel website users have role === 'user'; CRM staff have 'admin'|'manager'|'employee'|'finance'|'agent'.
  const websiteUserByEmailQuery = useMemoFirebase(() => {
    if (!firestore || !client?.email) return null;
    return query(collection(firestore, 'users'), where('email', '==', client.email), where('role', '==', 'user'));
  }, [firestore, client?.email]);
  const websiteUserByPhoneQuery = useMemoFirebase(() => {
    if (!firestore || !client?.phone || client?.email) return null;
    return query(collection(firestore, 'users'), where('phone', '==', client.phone), where('role', '==', 'user'));
  }, [firestore, client?.phone, client?.email]);

  const { data: websiteUsersByEmail } = useCollection<WebsiteUser>(websiteUserByEmailQuery);
  const { data: websiteUsersByPhone } = useCollection<WebsiteUser>(websiteUserByPhoneQuery);
  const websiteUser = websiteUsersByEmail?.[0] ?? websiteUsersByPhone?.[0] ?? null;

  if (isLoading || !client) return <ClientProfileSkeleton />;

  if (
    !isAdminOrManager &&
    !(client.assignedEmployees?.includes(authUser?.uid || '') || false) &&
    client.createdBy !== authUser?.uid
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
        <User className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Access restricted</h2>
        <p className="text-sm text-muted-foreground">This client is not assigned to you.</p>
      </div>
    );
  }

  const handleUpdateClient = (updatedData: Partial<Client>) => {
    if (!clientRef) return;
    setDocumentNonBlocking(clientRef, { ...updatedData, updatedAt: serverTimestamp() }, { merge: true });
    setIsEditOpen(false);
    toast({ title: 'Client updated', description: 'Changes have been saved.' });
  };

  const status = client.status || 'inactive';
  const visaStatus = client.visaStatus;
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.inactive;
  const visaCfg = visaStatus ? VISA_CONFIG[visaStatus] : null;
  const initials = getInitials(client.name);
  const services = Array.isArray(client.services) ? client.services : client.services ? [client.services as string] : [];
  const addServices = client.additionalServices ?? [];
  const createdAt = client.createdAt?.toDate ? format(client.createdAt.toDate(), 'dd MMM yyyy') : null;

  return (
    <div className="space-y-4">

      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      <div className="relative">
        {/* Banner */}
        <div
          className="h-28 rounded-xl overflow-hidden"
          style={{ background: `linear-gradient(135deg, hsl(var(--primary)/0.9), hsl(var(--primary)/0.5))` }}
        >
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.3) 10px, rgba(255,255,255,0.3) 11px)',
            }}
          />
        </div>

        {/* Action buttons in banner */}
        <div className="absolute top-3 right-3 flex gap-2">
          {/* Status — direct dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm transition-opacity hover:opacity-80 ${statusCfg.cls}`}>
                {statusCfg.label}
                <ChevronRight className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Client Status</DropdownMenuLabel>
              <DropdownMenuGroup>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <DropdownMenuItem
                    key={key}
                    className={`text-xs gap-2 ${status === key ? 'font-semibold' : ''}`}
                    onClick={() => handleUpdateClient({ status: key as Client['status'] })}
                  >
                    <span className={`h-2 w-2 rounded-full border ${cfg.cls}`} />
                    {cfg.label}
                    {status === key && <span className="ml-auto text-[10px]">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Visa Status</DropdownMenuLabel>
              <DropdownMenuGroup>
                {Object.entries(VISA_CONFIG).map(([key, cfg]) => (
                  <DropdownMenuItem
                    key={key}
                    className={`text-xs gap-2 ${visaStatus === key ? 'font-semibold' : ''}`}
                    onClick={() => handleUpdateClient({ visaStatus: key as Client['visaStatus'] })}
                  >
                    <span className={`h-2 w-2 rounded-full border ${cfg.cls}`} />
                    {cfg.label}
                    {visaStatus === key && <span className="ml-auto text-[10px]">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Edit button */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs shadow">
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
              <ClientForm client={client} onSubmit={handleUpdateClient} onCancel={() => setIsEditOpen(false)} canAssign={isAdminOrManager} staffUsers={staffOptions} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Avatar — overlaps banner */}
        <div className="absolute -bottom-9 left-5">
          <Avatar
            className="h-18 w-18 border-[3px] border-background shadow-lg"
            style={{ height: 72, width: 72, ...visaStatusGlow(client.visaStatus) }}
          >
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* ── Name / Badges ───────────────────────────────────────────── */}
      <div className="pt-10 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold leading-tight">{client.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {client.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.email}</span>}
            {client.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{client.phone}</span>}
            {client.nationality && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.nationality}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {visaCfg && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${visaCfg.cls}`}>
              Visa · {visaCfg.label}
            </span>
          )}
          {createdAt && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              Since {createdAt}
            </span>
          )}
        </div>
      </div>

      {/* ── Info Cards ──────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Personal & Contact */}
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal & Contact</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 divide-y divide-border">
            <InfoRow icon={Mail}       label="Email"       value={client.email} />
            <InfoRow icon={Phone}      label="Phone"       value={client.phone} />
            <InfoRow icon={MapPin}     label="Nationality" value={client.nationality} />
            <InfoRow icon={Calendar}   label="Date of Birth" value={client.dateOfBirth ? format(new Date(client.dateOfBirth), 'dd MMM yyyy') : null} />
            <InfoRow icon={UserCheck}  label="Gender"      value={client.gender ? client.gender.charAt(0).toUpperCase() + client.gender.slice(1) : null} />
            <InfoRow icon={Users}      label="PAX"         value={client.pax} />
          </CardContent>
        </Card>

        {/* Travel & Budget */}
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Travel Preferences</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 divide-y divide-border">
            <InfoRow icon={Briefcase}    label="Travel Purpose"    value={client.travelPurpose} />
            <InfoRow icon={Plane}        label="Preferred Destination" value={client.preferredDestination} />
            <InfoRow icon={IndianRupee}  label="Budget"            value={client.budget ? formatINR(client.budget) : null} />
            <InfoRow icon={Hotel}        label="Hotel Preference"  value={client.hotelPreference} />
            {client.followUpDate && (
              <InfoRow icon={Bell} label="Follow-up" value={format(new Date(client.followUpDate), 'dd MMM yyyy')} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Services ────────────────────────────────────────────────── */}
      {(services.length > 0 || addServices.length > 0) && (
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Services</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-1.5">
              {services.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <Cog className="h-3 w-3" />{SERVICE_LABELS[s] ?? s}
                </span>
              ))}
              {addServices.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {ADD_SERVICE_LABELS[s] ?? s}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Website Profile (travel portal linked data) ─────────────── */}
      {websiteUser && <WebsiteProfileCard wu={websiteUser} />}

      {/* ── Notes / Preferences ─────────────────────────────────────── */}
      {client.preferences && (
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <NotepadText className="h-3.5 w-3.5" />
              Notes & Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{client.preferences}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Bookings & Logs ─────────────────────────────────────────── */}
      <ClientBookings clientId={clientId} />
      <CustomerLogs clientId={clientId} />
    </div>
  );
}
