'use client';

import { useFormStatus } from 'react-dom';
import { useActionState, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { getItinerary } from '@/app/actions/itinerary';
import { usePersistedState } from '@/hooks/use-persisted-state';
import {
  initialItineraryState,
  emptyHotel,
  type ItineraryState,
  type HotelRow,
} from './itinerary-types';
import type { ItinerarySuggestionsOutput } from '@/ai/flows/itinerary-suggestions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Wand2, Printer, Plus, Trash2, Star, Rows3, LayoutGrid, Palette } from 'lucide-react';
import { OtherFormatPanel } from './other-format-panel';
import { OF_TEMPLATES, type OFTemplate } from './other-format-types';

// ============================================================================
// Print constants — A4 ISO 216
// ----------------------------------------------------------------------------
// Pages are sized in mm so the browser print engine treats them as exact A4
// sheets. Inner padding is the "print-safe" buffer that survives whatever
// margin the user's print dialog might add.
// ============================================================================

const DAYS_PER_PAGE = 2; // editorial cards, 2 per A4 sheet

type DayPlan = ItinerarySuggestionsOutput['itinerary'][number];

function chunkDays(days: DayPlan[]): DayPlan[][] {
  const out: DayPlan[][] = [];
  for (let i = 0; i < days.length; i += DAYS_PER_PAGE) {
    out.push(days.slice(i, i + DAYS_PER_PAGE));
  }
  return out;
}

function formatDateLong(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateShort(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function tripDurationLabel(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  const nights = Math.max(0, days - 1);
  return `${nights} Nights · ${days} Days`;
}

// Treat an activity's `time` as a real logistical clock time (e.g. "10:45")
// only when it looks like one — never a vague label like "Morning". Shared
// between the brochure's DayCard and the Other Format table rows.
function isHardTime(t?: string): boolean {
  return !!t && /^\d{1,2}[:.]\d{2}/.test(t.trim());
}

// Inclusions/exclusions/policy copy shown on the brochure's final page AND the
// Other Format document — kept as one source so the two formats can't drift.
const DEFAULT_INCLUSIONS = [
  'Hotel accommodation with daily breakfast',
  'Private arrival & departure transfers',
  'Private tour transfers per the programme',
  'All sightseeing & entrance fees as listed',
  'Applicable government taxes & service charges',
];
const DEFAULT_EXCLUSIONS = [
  'International airfare (unless mentioned)',
  'Visa fees and travel insurance',
  'Personal expenses — laundry, mini-bar, calls',
  'Optional activities not listed in inclusions',
  'Anything not specified in the inclusions list',
];
const DEFAULT_POLICIES = [
  {
    t: 'Pricing &amp; Exchange Rate',
    b: 'Quotation reflects current rates. Subject to revision before final payment based on currency fluctuations.',
  },
  {
    t: 'Itinerary Amendments',
    b: 'Any change must be requested at least 96 hours before travel start. No changes once the sequence has commenced.',
  },
  {
    t: 'Check-In · Check-Out',
    b: 'Early check-in or late check-out is subject to hotel availability and discretion at arrival.',
  },
  {
    t: 'Cancellation Policy',
    b: 'Cancellation charges apply as per agency policy and supplier-specific terms in your confirmation.',
  },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Wand2 className="mr-2 h-4 w-4" />
          Generate Itinerary
        </>
      )}
    </Button>
  );
}

// ============================================================================
// Form panel + document orchestrator
// ============================================================================

// The two tabs are entirely independent generators with entirely different
// data models — Brochure is the AI-narrative A4 document below; Other Format
// (OtherFormatPanel, in other-format-panel.tsx) is a separate paste-and/or-
// fill structured quotation document with its own .docx export. Nothing is
// shared between them; switching tabs does not carry data across.
//
// Both panels stay mounted at all times (plain wrapper divs, not Radix
// TabsContent's Presence/unmount behaviour) so that switching tabs to peek at
// the other format never discards a generated itinerary — the AI call that
// produced it isn't free to redo. A `hidden` wrapper on the inactive panel
// does double duty: it hides that panel on screen AND, because plain Tailwind
// `hidden` applies in every media (not just screen), it also keeps that
// panel's own print container from printing — so printing always outputs
// only the currently-visible tab, with no extra prop needed to track that.
export function ItineraryForm() {
  // Other Format is the default tab, Brochure the secondary one — same order
  // as the tabs below.
  const [activeTab, setActiveTab] = useState<'brochure' | 'other'>('other');
  // Lifted up from OtherFormatPanel so the Format toggle can sit on the same
  // fixed top row as the Brochure/Other Format tabs instead of scrolling
  // away with that panel's own content.
  const [template, setTemplate] = usePersistedState<OFTemplate>('skyvisa:itinerary-other-format:template', 'classic');
  return (
    <>
      <ItineraryStyles />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 print-hide print:hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="other">Other Format</TabsTrigger>
            <TabsTrigger value="brochure">Brochure</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === 'other' && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Format:</span>
            {OF_TEMPLATES.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={template === t ? 'default' : 'outline'}
                className="h-7 px-2.5 text-xs capitalize"
                onClick={() => setTemplate(t)}
              >
                {t === 'classic' ? (
                  <Rows3 className="mr-1 h-3.5 w-3.5" />
                ) : t === 'branded' ? (
                  <Palette className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <LayoutGrid className="mr-1 h-3.5 w-3.5" />
                )}
                {t}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className={activeTab === 'brochure' ? '' : 'hidden'}>
        <BrochurePanel />
      </div>
      <div className={activeTab === 'other' ? '' : 'hidden'}>
        <OtherFormatPanel template={template} />
      </div>
    </>
  );
}

// The AI-narrative A4 brochure generator: destination/preferences in, a full
// cover + day-by-day + package-details document out.
function BrochurePanel() {
  const [state, formAction] = useActionState<ItineraryState, FormData>(
    getItinerary,
    initialItineraryState,
  );

  // useActionState's `state` has no external setter (only a form submission
  // can change it), so a generated brochure can't be written back into it
  // directly on restore. Instead: persist a copy on every successful
  // generation, and fall back to that copy — via `effectiveState` below —
  // whenever this mount hasn't produced a fresh result yet (e.g. the user
  // navigated away and back). Saves both the itinerary and the AI call that
  // would otherwise have to be repeated to see it again.
  const [persisted, setPersisted] = usePersistedState<ItineraryState>(
    'skyvisa:itinerary-brochure:state',
    initialItineraryState
  );
  const [hotels, setHotels] = usePersistedState<HotelRow[]>('skyvisa:itinerary-brochure:hotels', []);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!restored && !state.itinerary && persisted.itinerary) setRestored(true);
  }, [restored, state.itinerary, persisted.itinerary]);

  useEffect(() => {
    if (state.itinerary) setPersisted(state);
    // setPersisted is stable (useCallback identity from usePersistedState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const effectiveState = state.itinerary ? state : restored ? persisted : state;

  // Reset the hotel list only when a FRESH generation (this mount, via the
  // form) lands on a different destination than the previous fresh one —
  // never on the initial restore-from-storage, which would otherwise wipe
  // the very hotels list that restore just brought back.
  const prevLiveDestRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!state.itinerary) return;
    if (prevLiveDestRef.current !== undefined && prevLiveDestRef.current !== state.itinerary.destination) {
      setHotels([]);
    }
    prevLiveDestRef.current = state.itinerary.destination;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.itinerary]);

  const addHotel = () => setHotels((h) => [...h, emptyHotel()]);
  const removeHotel = (id: string) => setHotels((h) => h.filter((x) => x.id !== id));
  const updateHotel = (id: string, patch: Partial<HotelRow>) =>
    setHotels((h) => h.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const handlePrint = () => window.print();

  return (
    <>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] gap-6 print-hide lg:h-[calc(100vh-10rem)]">
      <Card className="h-fit lg:h-full lg:overflow-y-auto lg:overflow-x-hidden">
        <CardHeader>
          <CardTitle>Create a Custom Itinerary</CardTitle>
          <CardDescription>
            Generates a print-ready A4 brochure with a cover page, day-by-day editorial pages,
            and a dedicated package-details page (hotels, inclusions, policies). Your progress here
            is saved automatically — switching pages and coming back won&apos;t lose it or burn
            another AI call.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Keyed so a restored itinerary's form values (destination,
              preferences, etc.) actually apply — an uncontrolled input's
              defaultValue only takes effect on mount, and `restored` flips
              true a moment after this panel first mounts. */}
          <form key={restored ? 'restored' : 'fresh'} action={formAction} className="space-y-4">
            <div>
              <Label htmlFor="destination">Destination</Label>
              <Input
                id="destination"
                name="destination"
                placeholder="e.g., Kuala Lumpur, Malaysia"
                defaultValue={effectiveState.form.destination}
                required
              />
            </div>
            <div>
              <Label htmlFor="preferences">Preferences</Label>
              <Textarea
                id="preferences"
                name="preferences"
                placeholder="e.g., Interested in city tours, theme parks, Indian-friendly food, mid-range hotel."
                defaultValue={effectiveState.form.preferences}
                required
                className="min-h-[110px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="travellerName">Traveller Name</Label>
                <Input
                  id="travellerName"
                  name="travellerName"
                  placeholder="Ms. Tisha"
                  defaultValue={effectiveState.form.travellerName}
                />
              </div>
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  defaultValue={effectiveState.form.startDate}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  defaultValue={effectiveState.form.endDate}
                />
              </div>
              <div>
                <Label htmlFor="partySize">Party Size</Label>
                <Input
                  id="partySize"
                  name="partySize"
                  placeholder="2 Adults"
                  defaultValue={effectiveState.form.partySize}
                />
              </div>
              <div>
                <Label htmlFor="referenceCode">Reference</Label>
                <Input
                  id="referenceCode"
                  name="referenceCode"
                  placeholder="175037/IYC"
                  defaultValue={effectiveState.form.referenceCode}
                />
              </div>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <SubmitButton />
            {effectiveState.itinerary && (
              <Button
                type="button"
                onClick={handlePrint}
                variant="outline"
                className="w-full"
              >
                <Printer className="mr-2 h-4 w-4" />
                Download as PDF
              </Button>
            )}
          </form>

          {effectiveState.itinerary && (
            <HotelEditor
              hotels={hotels}
              onAdd={addHotel}
              onUpdate={updateHotel}
              onRemove={removeHotel}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col items-center lg:h-full lg:overflow-y-auto lg:overflow-x-hidden">
        {!effectiveState.itinerary && (
          <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/50 rounded-lg p-8 w-full lg:min-h-[60vh]">
            <p>Your A4 travel brochure will render here once generated.</p>
          </div>
        )}
        {effectiveState.itinerary && (
          <ItineraryDocument
            state={effectiveState}
            hotels={hotels}
            className="origin-top scale-[0.9] lg:scale-[0.72] xl:scale-[0.83]"
          />
        )}
      </div>
    </div>

    {/* Sibling of the print-hidden grid above, NOT nested inside it — an
        ancestor's display:none suppresses descendants regardless of their own
        display value, which would prevent this from ever showing in print. */}
    {effectiveState.itinerary && (
      <div className="hidden print:block">
        <ItineraryDocument state={effectiveState} hotels={hotels} />
      </div>
    )}
    </>
  );
}

// ============================================================================
// Document
// ============================================================================

function ItineraryDocument({
  state,
  hotels,
  className,
}: {
  state: ItineraryState;
  hotels: HotelRow[];
  className?: string;
}) {
  const meta = state.form;
  const itinerary = state.itinerary!;
  const dayPages = chunkDays(itinerary.itinerary);
  const totalPages = 1 + dayPages.length + 1; // cover + day-pages + final

  return (
    <div className={`itin-doc ${className ?? ''}`}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Jost:wght@300;400;500;600;700&display=swap"
      />

      <CoverPage
        pageNumber={1}
        totalPages={totalPages}
        meta={meta}
        itinerary={itinerary}
        dayCount={itinerary.itinerary.length}
      />

      {dayPages.map((days, i) => (
        <DaysPage
          key={`days-${i}`}
          pageNumber={i + 2}
          totalPages={totalPages}
          days={days}
          meta={meta}
          totalDays={itinerary.itinerary.length}
        />
      ))}

      <FinalPage
        pageNumber={totalPages}
        totalPages={totalPages}
        meta={meta}
        hotels={hotels}
      />
    </div>
  );
}

// ============================================================================
// Shared chrome
// ============================================================================

// BrandStrip = full-width blue band header followed by the blue/yellow/red
// tri-colour accent strip — replicates the visa-checklist brochure header so
// every page in the itinerary uses the same corporate identity.
function BrandStrip() {
  return (
    <>
      <div className="itin-bandhead">
        <div className="itin-bandhead-left">
          <div className="itin-bandhead-logo">
            <Image
              src="/skylogo.png"
              alt="Sky Tours &amp; Visa Consultant"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
          <div className="itin-bandhead-info">
            <div className="itin-bandhead-brand">SKY TOURS &amp; VISA CONSULTANT</div>
            <div className="itin-bandhead-tag">Your Trusted Travel Partner | skyvisa.in</div>
            <div className="itin-bandhead-addr">
              2nd Floor, Orbit Mall, Near C-21 Mall, Indore, Madhya Pradesh - 452010, India
            </div>
          </div>
        </div>
        <div className="itin-bandhead-right">
          <div>Phone: +91 8827 222177</div>
          <div>Phone: +91 88717 50058</div>
          <div>WhatsApp: +91 8827 581621</div>
          <div>Email: info@skyvisa.in</div>
        </div>
      </div>
      
    </>
  );
}

// 3-line corporate footer matching the visa-checklist PDF exactly:
//   row 1 — Brand · website  |  Page X of Y
//   row 2 — Contacts line
//   row 3 — Italic indicative-document disclaimer
function PageFooter({
  pageNumber,
  totalPages,
  reference,
}: {
  pageNumber: number;
  totalPages: number;
  reference: string;
}) {
  return (
    <div className="itin-footer">
      <div className="itin-footer-accent" aria-hidden="true">
        <span className="itin-tricolor-blue" />
        <span className="itin-tricolor-yellow" />
        <span className="itin-tricolor-red" />
      </div>
      <div className="itin-footer-inner">
        <div className="itin-footer-row">
          <div className="itin-footer-brand">
            <strong>Sky Tours &amp; Visa Consultant</strong>
            &nbsp;&nbsp;|&nbsp;&nbsp;www.skyvisa.in
          </div>
          <div className="itin-footer-page">
            {reference ? (
              <span className="itin-footer-ref">Ref {reference} · </span>
            ) : null}
            Page {pageNumber} of {totalPages}
          </div>
        </div>
        <div className="itin-footer-contacts">
          Phone: +91 8827 222177 &nbsp;|&nbsp; WhatsApp: +91 8827 581621 &nbsp;|&nbsp; Email:
          info@skyvisa.in
        </div>
        <div className="itin-footer-disclaimer">
          This is an indicative travel itinerary. Final inclusions, hotels and pricing are subject
          to availability and confirmation at the time of booking.
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="itin-eyebrow">{children}</div>;
}

function GoldRule() {
  return <div className="itin-gold-rule" />;
}

// ============================================================================
// Page 1 — Cover (typographic, no images)
// ============================================================================

function CoverPage({
  pageNumber,
  totalPages,
  meta,
  itinerary,
  dayCount,
}: {
  pageNumber: number;
  totalPages: number;
  meta: ItineraryState['form'];
  itinerary: ItinerarySuggestionsOutput;
  dayCount: number;
}) {
  // Destination convention from the AI: "Kuala Lumpur, Malaysia" — the LAST
  // comma-segment is the country (headline on the cover), everything before
  // becomes the city/region subtitle.
  const parts = itinerary.destination
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const country = parts.length > 1 ? parts[parts.length - 1] : parts[0] || itinerary.destination;
  const cities = parts.length > 1 ? parts.slice(0, -1).join(' · ') : '';

  return (
    <section className="itin-a4 itin-page-cover">
      <BrandStrip />

      <div className="itin-cover-body">

        <div className="itin-cover-destination-block">
          <div className="itin-cover-destlabel">Destination</div>
          <h1 className="itin-cover-country">{country.toUpperCase()}</h1>
          {cities && <div className="itin-cover-cities">{cities}</div>}
        </div>

        <GoldRule />

        <div className="itin-cover-meta">
          <div>
            <div className="itin-meta-label">Prepared for</div>
            <div className="itin-meta-value">{meta.travellerName || '—'}</div>
          </div>
          <div>
            <div className="itin-meta-label">Duration</div>
            <div className="itin-meta-value">
              {tripDurationLabel(meta.startDate, meta.endDate) || `${dayCount} Days`}
            </div>
          </div>
          <div>
            <div className="itin-meta-label">Travel Dates</div>
            <div className="itin-meta-value">
              {meta.startDate && meta.endDate
                ? `${formatDateShort(meta.startDate)} — ${formatDateShort(meta.endDate)}`
                : '—'}
            </div>
          </div>
          <div>
            <div className="itin-meta-label">Party</div>
            <div className="itin-meta-value">{meta.partySize || '—'}</div>
          </div>
          <div>
            <div className="itin-meta-label">Reference</div>
            <div className="itin-meta-value">{meta.referenceCode || '—'}</div>
          </div>
          <div>
            <div className="itin-meta-label">Prepared On</div>
            <div className="itin-meta-value">
              {new Date().toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>

        <GoldRule />

        <div className="itin-cover-toc">
          <div className="itin-toc-heading">In This Document</div>
          <ul>
            <li>
              <span>I</span>
              <span className="itin-toc-title">Day-by-Day Programme</span>
              <span className="itin-toc-meta">{dayCount} days</span>
            </li>
            <li>
              <span>II</span>
              <span className="itin-toc-title">Accommodation &amp; Pricing</span>
              <span className="itin-toc-meta">final page</span>
            </li>
            <li>
              <span>III</span>
              <span className="itin-toc-title">Inclusions &amp; Exclusions</span>
              <span className="itin-toc-meta">final page</span>
            </li>
            <li>
              <span>IV</span>
              <span className="itin-toc-title">Booking Policies &amp; Terms</span>
              <span className="itin-toc-meta">final page</span>
            </li>
          </ul>
        </div>

        <div className="itin-cover-quote">
          “Travel is the only thing you buy that makes you richer.”
        </div>
      </div>

      <PageFooter
        pageNumber={pageNumber}
        totalPages={totalPages}
        reference={meta.referenceCode || ''}
      />
    </section>
  );
}

// ============================================================================
// Pages 2..N — Day-by-day programme
// ============================================================================

function DaysPage({
  pageNumber,
  totalPages,
  days,
  meta,
  totalDays,
}: {
  pageNumber: number;
  totalPages: number;
  days: DayPlan[];
  meta: ItineraryState['form'];
  totalDays: number;
}) {
  const firstDay = days[0]?.day ?? 1;
  const lastDay = days[days.length - 1]?.day ?? firstDay;
  const rangeLabel =
    firstDay === lastDay
      ? `Day ${firstDay} of ${totalDays}`
      : `Days ${firstDay}–${lastDay} of ${totalDays}`;

  return (
    <section className="itin-a4">
      <BrandStrip />

      <div className="itin-page-head">
        <div>
          <Eyebrow>Day-by-Day Programme · I</Eyebrow>
          
        </div>
        <div className="itin-page-head-meta">{rangeLabel}</div>
      </div>
      <GoldRule />

      <div className="itin-days-stack">
        {days.map((d) => (
          <DayCard key={d.day} day={d} totalDays={totalDays} />
        ))}
      </div>

      <PageFooter
        pageNumber={pageNumber}
        totalPages={totalPages}
        reference={meta.referenceCode || ''}
      />
    </section>
  );
}

function DayCard({ day, totalDays }: { day: DayPlan; totalDays: number }) {
  // We render the day as a continuous narrative (summary) + a short bulleted
  // highlights list — no time column. isHardTime (module scope) suppresses
  // any incoming `time` value unless it's a real clock time like "10:45".
  return (
    <article className="itin-day">
      <header className="itin-day-head">
        <div className="itin-day-badge">
          <div className="itin-day-badge-label">Day</div>
          <div className="itin-day-badge-num">{String(day.day).padStart(2, '0')}</div>
          <div className="itin-day-badge-of">of {String(totalDays).padStart(2, '0')}</div>
        </div>
        <div className="itin-day-headtext">
          <div className="itin-day-title">{day.title}</div>
        </div>
      </header>

      <div className="itin-day-body">
        {day.summary && <p className="itin-day-narrative">{day.summary}</p>}

        {day.activities && day.activities.length > 0 && (
          <>
            <div className="itin-day-highlights-label">Day Highlights</div>
            <ul className="itin-day-highlights">
              {day.activities.map((a, i) => (
                <li key={i}>
                  <span className="itin-hl-marker" aria-hidden="true" />
                  <span className="itin-hl-body">
                    {isHardTime(a.time) && (
                      <span className="itin-hl-time">{a.time} · </span>
                    )}
                    {a.description}
                    {a.details && <span className="itin-hl-details"> — {a.details}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  );
}

// ============================================================================
// Final page — Hotels, Inclusions/Exclusions, Policies (one A4, no images)
// ============================================================================

function FinalPage({
  pageNumber,
  totalPages,
  meta,
  hotels,
}: {
  pageNumber: number;
  totalPages: number;
  meta: ItineraryState['form'];
  hotels: HotelRow[];
}) {
  return (
    <section className="itin-a4 itin-page-final">
      <BrandStrip />

      <div className="itin-page-head">
        <div>
          <Eyebrow>Package Details</Eyebrow>
          <h2 className="itin-page-title">Quotation Summary</h2>
        </div>
        <div className="itin-page-head-meta">{meta.referenceCode ? `Ref ${meta.referenceCode}` : ''}</div>
      </div>
      <GoldRule />

      <div className="itin-final-stack">
        <FinalSection numeral="II" overline="Hotels &amp; Pricing" title="Accommodation Options">
          {hotels.length === 0 ? (
            <div className="itin-empty-note">
              No hotel quotes attached. Add accommodation options from the editor to surface them
              here.
            </div>
          ) : (
            <HotelTable hotels={hotels} />
          )}
        </FinalSection>

        <FinalSection numeral="III" overline="What Is &amp; Isn't Included" title="Inclusions &amp; Exclusions">
          <div className="itin-inc-grid">
            <IECard mode="inc" heading="Included in Package" items={DEFAULT_INCLUSIONS} />
            <IECard mode="exc" heading="Not Included" items={DEFAULT_EXCLUSIONS} />
          </div>
        </FinalSection>

        <FinalSection numeral="IV" overline="Booking Policies" title="Terms &amp; Important Notes">
          <div className="itin-policy-grid">
            {DEFAULT_POLICIES.map((p) => (
              <div key={p.t} className="itin-policy">
                <div className="itin-policy-title" dangerouslySetInnerHTML={{ __html: p.t }} />
                <div className="itin-policy-body" dangerouslySetInnerHTML={{ __html: p.b }} />
              </div>
            ))}
          </div>
        </FinalSection>
      </div>

      <PageFooter
        pageNumber={pageNumber}
        totalPages={totalPages}
        reference={meta.referenceCode || ''}
      />
    </section>
  );
}

function FinalSection({
  numeral,
  overline,
  title,
  children,
}: {
  numeral: string;
  overline: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="itin-final-section">
      <div className="itin-final-head">
        <div className="itin-final-numeral">{numeral}</div>
        <div>
          <div className="itin-final-overline" dangerouslySetInnerHTML={{ __html: overline }} />
          <div className="itin-final-title" dangerouslySetInnerHTML={{ __html: title }} />
        </div>
      </div>
      <div className="itin-final-body">{children}</div>
    </div>
  );
}

function HotelTable({ hotels }: { hotels: HotelRow[] }) {
  return (
    <table className="itin-hotel-table">
      <thead>
        <tr>
          <th style={{ width: '38%' }}>Hotel</th>
          <th>Category</th>
          <th>Room Type</th>
          <th style={{ textAlign: 'right' }}>Price / Pax (INR)</th>
        </tr>
      </thead>
      <tbody>
        {hotels.map((h) => (
          <tr key={h.id}>
            <td>
              <div className="itin-hotel-name">
                {h.name || 'Hotel'}
                {h.recommended && <span className="itin-rec-badge">Recommended</span>}
              </div>
              <div className="itin-hotel-stars">
                {'★'.repeat(Math.max(0, Math.min(5, h.stars)))}
              </div>
            </td>
            <td className="itin-hotel-cell">{h.category || '—'}</td>
            <td className="itin-hotel-cell">{h.roomType || '—'}</td>
            <td className="itin-hotel-price">
              <div className="itin-hotel-price-val">
                {h.priceInr ? `₹ ${h.priceInr}` : '—'}
              </div>
              <div className="itin-hotel-price-note">per person · twin sharing</div>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4}>
            Rates inclusive of daily breakfast. Subject to revision based on currency
            fluctuations. Local government taxes payable at check-in.
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function IECard({
  mode,
  heading,
  items,
}: {
  mode: 'inc' | 'exc';
  heading: string;
  items: string[];
}) {
  return (
    <div className={`itin-ie ${mode === 'inc' ? 'itin-ie-inc' : 'itin-ie-exc'}`}>
      <div className="itin-ie-head">{heading}</div>
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <span className="itin-ie-mark" aria-hidden="true">
              {mode === 'inc' ? '✓' : '✕'}
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Hotel editor (form panel, screen-only)
// ============================================================================

function HotelEditor({
  hotels,
  onAdd,
  onUpdate,
  onRemove,
}: {
  hotels: HotelRow[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<HotelRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-sm">Accommodation Options</div>
          <div className="text-xs text-muted-foreground">
            Hotel rows appear on the final page of the brochure.
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add hotel
        </Button>
      </div>

      {hotels.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No hotels added yet.</p>
      ) : (
        <ul className="space-y-3">
          {hotels.map((h) => (
            <li key={h.id} className="rounded border p-3 space-y-2 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <Input
                  value={h.name}
                  onChange={(e) => onUpdate(h.id, { name: e.target.value })}
                  placeholder="Hotel Cosmo Kuala Lumpur"
                  className="h-8 text-sm font-medium"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => onRemove(h.id)}
                  aria-label="Remove hotel"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Stars
                  </Label>
                  <select
                    value={h.stars}
                    onChange={(e) => onUpdate(h.id, { stars: Number(e.target.value) })}
                    className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                  >
                    {[3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} ★
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Category
                  </Label>
                  <Input
                    value={h.category}
                    onChange={(e) => onUpdate(h.id, { category: e.target.value })}
                    placeholder="Premium · 4 Star"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Room type
                  </Label>
                  <Input
                    value={h.roomType}
                    onChange={(e) => onUpdate(h.id, { roomType: e.target.value })}
                    placeholder="Deluxe Promo"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Price / pax (INR)
                  </Label>
                  <Input
                    value={h.priceInr}
                    onChange={(e) => onUpdate(h.id, { priceInr: e.target.value })}
                    placeholder="29,799"
                    inputMode="numeric"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <Checkbox
                  checked={h.recommended}
                  onCheckedChange={(v) => onUpdate(h.id, { recommended: v === true })}
                />
                <span className="text-xs flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                  Recommended
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// Styles — A4 print-optimised, editorial luxury palette
// ============================================================================

function ItineraryStyles() {
  return (
    <style jsx global>{`
      .itin-doc {
        /* SKY brand palette — matches the visa-checklist PDF identity.
           "navy" + "gold" CSS vars are kept as semantic aliases so we don't
           have to rename every downstream reference; their VALUES now point
           at the brand-blue family. Pure yellow / red are reserved for the
           tri-colour accent strip and the hotel recommended badge. */
        --brand-blue: #1976d2;
        --brand-blue-deep: #0d4a8e;
        --brand-blue-light: #3ea3f0;
        --brand-yellow: #f4c20d;
        --brand-red: #e53935;

        --navy: var(--brand-blue-deep);
        --navy-deep: #0a3a73;
        --ink: #1a1a1a;
        --ink-soft: #444444;
        --muted: #888888;
        --hairline: #d6d6d6;
        --hairline-soft: #ececec;
        --paper: #ffffff;
        --paper-warm: #faf7f2;
        --paper-cool: #f4f7fb;
        --gold: var(--brand-blue);
        --gold-soft: var(--brand-blue-light);
        --inc: #2e7d32;
        --exc: #c62828;

        font-family: 'Jost', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        font-weight: 300;
        font-size: 10pt;
        line-height: 1.55;
        color: var(--ink);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
      .itin-doc .itin-serif,
      .itin-doc h1,
      .itin-doc h2,
      .itin-doc h3 {
        font-family: 'Cormorant Garamond', 'Times New Roman', Georgia, serif;
        font-weight: 500;
        letter-spacing: 0.2px;
      }

      /* ============================================================
         A4 SHEET — exact dimensions, safe-area inset baked in
         ============================================================ */
      .itin-a4 {
        width: 210mm;
        height: 297mm;
        margin: 0 auto 14mm;
        background: var(--paper);
        color: var(--ink);
        box-shadow: 0 10px 40px rgba(8, 24, 58, 0.12);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 12mm 14mm 10mm;
        page-break-after: always;
        break-after: page;
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
      .itin-a4:last-child {
        margin-bottom: 0;
        page-break-after: auto;
        break-after: auto;
      }

      /* Cover gets a warm-cream paper feel */
      .itin-page-cover {
        background: var(--paper-warm);
      }

      /* ============================================================
         BRAND BAND HEADER + TRI-COLOUR STRIP
         Matches the visa-checklist PDF: full-width brand-blue band with
         logo + brand text + contacts, followed by a thin blue/yellow/red
         tri-colour accent strip.  Uses negative margins to escape the
         page's safe-area padding and sit flush with the sheet edges.
         ============================================================ */
      .itin-bandhead {
        background: var(--brand-blue);
        color: white;
        margin: -12mm -14mm 0;
        padding: 5mm 14mm 4mm;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
      .itin-bandhead-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .itin-bandhead-logo {
        flex-shrink: 0;
        width: 16mm;
        height: 16mm;
        background: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-bandhead-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .itin-bandhead-info {
        min-width: 0;
      }
      .itin-bandhead-brand {
        font-family: 'Jost', sans-serif;
        font-size: 13pt;
        font-weight: 700;
        letter-spacing: 0.6px;
        color: white;
        line-height: 1.1;
      }
      .itin-bandhead-tag {
        font-size: 7pt;
        color: rgba(255, 255, 255, 0.92);
        margin-top: 2px;
        letter-spacing: 0.2px;
      }
      .itin-bandhead-addr {
        font-size: 6.5pt;
        color: rgba(255, 255, 255, 0.82);
        margin-top: 2px;
        line-height: 1.35;
      }
      .itin-bandhead-right {
        text-align: right;
        font-size: 7pt;
        color: white;
        line-height: 1.55;
        flex-shrink: 0;
      }
      .itin-bandhead-right > div {
        white-space: nowrap;
      }

      .itin-tricolor {
        display: flex;
        height: 2.2mm;
        margin: 0 -14mm 5mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-tricolor span {
        flex: 1 1 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-tricolor-blue {
        background: var(--brand-blue);
      }
      .itin-tricolor-yellow {
        background: var(--brand-yellow);
      }
      .itin-tricolor-red {
        background: var(--brand-red);
      }

      /* ============================================================
         SHARED PAGE ELEMENTS
         ============================================================ */
      .itin-eyebrow {
        font-size: 6.8pt;
        font-weight: 500;
        letter-spacing: 3.2px;
        text-transform: uppercase;
        color: var(--gold);
        margin-bottom: 4px;
      }
      .itin-gold-rule {
        height: 1px;
        background: linear-gradient(90deg, var(--gold) 0%, var(--gold-soft) 30%, transparent 80%);
        margin: 5mm 0;
      }

      .itin-page-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        margin-top: 2mm;
      }
      .itin-page-title {
        font-size: 22pt;
        font-weight: 600;
        color: var(--navy);
        line-height: 1.05;
        margin: 2px 0 0;
      }
      .itin-page-head-meta {
        font-size: 8pt;
        color: var(--muted);
        letter-spacing: 1.5px;
        text-transform: uppercase;
        padding-bottom: 4px;
      }

      /* ============================================================
         FOOTER — 3-line corporate footer matching the visa-checklist PDF
         (brand · website  |  Page X of Y // contacts // disclaimer).
         Flow-positioned so the content area expands naturally via flex.
         ============================================================ */
      /* Footer is mirrored on the header band:
         - sits at the BOTTOM of every A4 sheet (margin-top: auto via flex)
         - extends EDGE-TO-EDGE (negative side+bottom margins escape the page padding)
         - top edge has a thin tri-colour accent strip echoing the header
         - inner content stays in the safe area via re-applied horizontal padding */
      .itin-footer {
        margin: 5mm -14mm -10mm;
        padding: 0;
        background: var(--paper);
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .itin-footer-accent {
        display: flex;
        height: 1.6mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-footer-accent span {
        flex: 1 1 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-footer-accent .itin-tricolor-blue { background: var(--brand-blue); }
      .itin-footer-accent .itin-tricolor-yellow { background: var(--brand-yellow); }
      .itin-footer-accent .itin-tricolor-red { background: var(--brand-red); }
      .itin-footer-inner {
        padding: 3mm 14mm 4mm;
        border-top: 1px solid var(--hairline);
      }
      .itin-footer-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8mm;
      }
      .itin-footer-brand {
        font-size: 7.5pt;
        color: var(--ink);
        letter-spacing: 0.2px;
      }
      .itin-footer-brand strong {
        font-family: 'Jost', sans-serif;
        font-weight: 700;
        color: var(--ink);
      }
      .itin-footer-page {
        font-size: 7.5pt;
        font-weight: 700;
        color: var(--brand-blue);
        letter-spacing: 0.4px;
        white-space: nowrap;
      }
      .itin-footer-ref {
        color: var(--muted);
        font-weight: 500;
      }
      .itin-footer-contacts {
        font-size: 7pt;
        color: var(--muted);
        margin-top: 1mm;
        letter-spacing: 0.2px;
      }
      .itin-footer-disclaimer {
        font-size: 6.4pt;
        font-style: italic;
        color: var(--muted);
        margin-top: 1.2mm;
        letter-spacing: 0.2px;
      }

      /* ============================================================
         COVER PAGE — uses the standard BrandStrip blue band header;
         the destination block below is the visual hero.
         ============================================================ */
      .itin-cover-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding-top: 6mm;
        padding-bottom: 6mm;
      }
      .itin-cover-destination-block {
        margin: 6mm 0 4mm;
      }
      .itin-cover-destlabel {
        font-size: 6.8pt;
        font-weight: 600;
        letter-spacing: 4px;
        text-transform: uppercase;
        color: var(--gold);
        margin-bottom: 3mm;
      }
      .itin-cover-country {
        font-family: 'Cormorant Garamond', serif;
        font-size: 70pt;
        font-weight: 600;
        color: var(--navy);
        line-height: 0.95;
        letter-spacing: 3px;
        margin: 0;
        text-transform: uppercase;
      }
      .itin-cover-cities {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 18pt;
        font-weight: 400;
        color: var(--ink-soft);
        margin-top: 4mm;
        letter-spacing: 0.5px;
      }
      /* Backwards-compat aliases (older CSS class names) */
      .itin-cover-title {
        font-family: 'Cormorant Garamond', serif;
        font-size: 56pt;
        font-weight: 500;
        color: var(--navy);
        line-height: 1;
        letter-spacing: -0.5px;
        margin: 4mm 0 2mm;
      }
      .itin-cover-subtitle {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 18pt;
        font-weight: 400;
        color: var(--ink-soft);
      }
      .itin-cover-meta {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8mm 12mm;
        margin: 4mm 0;
      }
      .itin-meta-label {
        font-size: 6.5pt;
        font-weight: 500;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        color: var(--gold);
        margin-bottom: 2px;
      }
      .itin-meta-value {
        font-family: 'Cormorant Garamond', serif;
        font-size: 14pt;
        font-weight: 500;
        color: var(--navy);
        line-height: 1.15;
      }

      .itin-cover-toc {
        margin-top: 4mm;
      }
      .itin-toc-heading {
        font-size: 7pt;
        font-weight: 500;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: var(--gold);
        margin-bottom: 6mm;
      }
      .itin-cover-toc ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .itin-cover-toc li {
        display: grid;
        grid-template-columns: 24mm 1fr auto;
        align-items: baseline;
        padding: 4mm 0;
        border-top: 1px solid var(--hairline-soft);
        gap: 8mm;
      }
      .itin-cover-toc li:last-child {
        border-bottom: 1px solid var(--hairline-soft);
      }
      .itin-cover-toc li > span:first-child {
        font-family: 'Cormorant Garamond', serif;
        font-size: 18pt;
        font-weight: 500;
        color: var(--gold);
        letter-spacing: 1px;
      }
      .itin-toc-title {
        font-family: 'Cormorant Garamond', serif;
        font-size: 15pt;
        color: var(--navy);
      }
      .itin-toc-meta {
        font-size: 7.5pt;
        color: var(--muted);
        letter-spacing: 1.5px;
        text-transform: uppercase;
      }
      .itin-cover-quote {
        margin-top: auto;
        padding-top: 6mm;
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 11pt;
        text-align: center;
        color: var(--ink-soft);
        border-top: 1px solid var(--hairline-soft);
      }

      /* ============================================================
         DAYS PAGE
         ============================================================ */
      .itin-days-stack {
        margin-top: 4mm;
        display: flex;
        flex-direction: column;
        gap: 6mm;
        flex: 1;
      }

      .itin-day {
        border: 1px solid var(--hairline);
        border-radius: 4px;
        background: var(--paper);
        page-break-inside: avoid;
        break-inside: avoid;
        overflow: hidden;
      }
      .itin-day-head {
        display: flex;
        align-items: stretch;
        background: linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 100%);
        color: white;
        padding: 6px 0;
      }
      .itin-day-badge {
        flex-shrink: 0;
        width: 22mm;
        text-align: center;
        padding: 6px 4px;
        border-right: 1px solid rgba(255, 255, 255, 0.12);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
      }
      .itin-day-badge-label {
        font-size: 6pt;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        color: var(--gold-soft);
      }
      .itin-day-badge-num {
        font-family: 'Cormorant Garamond', serif;
        font-size: 24pt;
        font-weight: 600;
        line-height: 1;
        color: white;
        margin-top: 1px;
      }
      .itin-day-badge-of {
        font-size: 6pt;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.55);
      }
      .itin-day-headtext {
        flex: 1;
        padding: 4px 14px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .itin-day-title {
        font-family: 'Cormorant Garamond', serif;
        font-size: 15pt;
        font-weight: 600;
        color: white;
        line-height: 1.2;
        letter-spacing: 0.3px;
      }

      /* DAY BODY — narrative paragraph + key highlights (no time column) */
      .itin-day-body {
        padding: 5mm 7mm 5mm 7mm;
        background: var(--paper);
      }
      .itin-day-narrative {
        font-family: 'Cormorant Garamond', 'Times New Roman', Georgia, serif;
        font-size: 10.5pt;
        font-weight: 400;
        line-height: 1.55;
        color: var(--ink);
        margin: 0 0 4mm 0;
        text-align: justify;
        hyphens: auto;
      }
      .itin-day-narrative::first-letter {
        font-family: 'Cormorant Garamond', serif;
        font-size: 22pt;
        font-weight: 600;
        color: var(--navy);
        float: left;
        line-height: 1;
        padding: 3px 6px 0 0;
      }
      .itin-day-highlights-label {
        font-size: 6.5pt;
        font-weight: 600;
        letter-spacing: 2.8px;
        text-transform: uppercase;
        color: var(--gold);
        padding-top: 2mm;
        border-top: 1px solid var(--hairline-soft);
        margin-bottom: 2mm;
      }
      .itin-day-highlights {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .itin-day-highlights li {
        display: grid;
        grid-template-columns: 8mm 1fr;
        align-items: start;
        padding: 3px 0;
      }
      .itin-hl-marker {
        width: 5px;
        height: 5px;
        margin-top: 6px;
        border-radius: 50%;
        background: var(--brand-blue);
        box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.18);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-hl-body {
        font-size: 8.8pt;
        line-height: 1.5;
        color: var(--ink);
      }
      .itin-hl-time {
        font-family: 'Cormorant Garamond', serif;
        font-size: 9pt;
        font-weight: 600;
        color: var(--navy);
      }
      .itin-hl-details {
        font-size: 7.8pt;
        color: var(--muted);
        font-style: italic;
      }

      /* ============================================================
         FINAL PAGE — fits everything (hotels + inc/exc + policies +
         closing band) into a single A4 sheet without overflow.
         Strategy: column flex with controlled gaps; closing band
         pinned to the bottom via margin-top: auto.
         ============================================================ */
      .itin-page-final {
        background: var(--paper);
      }
      .itin-page-final .itin-final-stack {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        gap: 4mm;
        padding-top: 2mm;
      }
      .itin-final-section {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .itin-final-head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 2mm;
      }
      .itin-final-numeral {
        font-family: 'Cormorant Garamond', serif;
        font-size: 16pt;
        font-weight: 500;
        color: var(--gold);
        line-height: 1;
        letter-spacing: 1px;
        min-width: 12mm;
      }
      .itin-final-overline {
        font-size: 6.2pt;
        font-weight: 500;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: var(--gold);
      }
      .itin-final-title {
        font-family: 'Cormorant Garamond', serif;
        font-size: 13pt;
        font-weight: 600;
        color: var(--navy);
        line-height: 1.1;
        margin-top: 1px;
      }
      .itin-final-body {
        padding-left: 12mm;
      }

      /* HOTEL TABLE — generous row spacing for breathing room */
      .itin-empty-note {
        font-size: 8.5pt;
        font-style: italic;
        color: var(--muted);
        padding: 4px 0;
      }
      .itin-hotel-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 8.5pt;
      }
      .itin-hotel-table thead th {
        text-align: left;
        font-size: 6.6pt;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--muted);
        padding: 5px 10px 6px;
        border-bottom: 1.5px solid var(--navy);
      }
      .itin-hotel-table tbody td {
        padding: 11px 10px;
        vertical-align: middle;
        border-bottom: 1px solid var(--hairline-soft);
        background: var(--paper);
      }
      .itin-hotel-table tbody tr:last-child td {
        border-bottom: 1px solid var(--hairline);
      }
      .itin-hotel-name {
        font-family: 'Cormorant Garamond', serif;
        font-size: 11pt;
        font-weight: 600;
        color: var(--navy);
        line-height: 1.2;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 3px;
      }
      .itin-rec-badge {
        display: inline-block;
        font-family: 'Jost', sans-serif;
        font-size: 5.4pt;
        font-weight: 700;
        color: var(--ink);
        background: var(--brand-yellow);
        padding: 2px 7px;
        border-radius: 20px;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-hotel-stars {
        color: var(--brand-yellow);
        font-size: 8pt;
        letter-spacing: 1.2px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .itin-hotel-cell {
        font-size: 8pt;
        color: var(--ink-soft);
        line-height: 1.35;
      }
      .itin-hotel-price {
        text-align: right;
        white-space: nowrap;
      }
      .itin-hotel-price-val {
        font-family: 'Cormorant Garamond', serif;
        font-size: 13pt;
        font-weight: 700;
        color: var(--navy);
        line-height: 1.05;
        letter-spacing: 0.3px;
      }
      .itin-hotel-price-note {
        font-size: 6.4pt;
        color: var(--muted);
        margin-top: 2px;
        letter-spacing: 0.4px;
      }
      .itin-hotel-table tfoot td {
        padding: 5px 10px;
        font-size: 6.8pt;
        font-style: italic;
        color: var(--muted);
      }

      /* INC / EXC — slightly tighter, 2-col */
      .itin-inc-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8mm;
      }
      .itin-ie {
        border-top: 1.5px solid var(--navy);
        padding-top: 2.5mm;
      }
      .itin-ie-inc {
        border-color: var(--inc);
      }
      .itin-ie-exc {
        border-color: var(--exc);
      }
      .itin-ie-head {
        font-size: 6.8pt;
        font-weight: 600;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        color: var(--navy);
        margin-bottom: 2.5mm;
      }
      .itin-ie ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .itin-ie li {
        display: grid;
        grid-template-columns: 12px 1fr;
        gap: 7px;
        font-size: 8pt;
        line-height: 1.45;
        color: var(--ink);
        padding: 2px 0;
      }
      .itin-ie-mark {
        font-family: 'Jost', sans-serif;
        font-weight: 700;
        font-size: 8.5pt;
        line-height: 1.2;
      }
      .itin-ie-inc .itin-ie-mark {
        color: var(--inc);
      }
      .itin-ie-exc .itin-ie-mark {
        color: var(--exc);
      }

      /* POLICIES — tightened to balance the page */
      .itin-policy-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3mm 8mm;
      }
      .itin-policy {
        padding-left: 3.5mm;
        border-left: 2px solid var(--gold);
      }
      .itin-policy-title {
        font-size: 7pt;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--navy);
        margin-bottom: 1px;
      }
      .itin-policy-body {
        font-size: 7.4pt;
        color: var(--ink-soft);
        line-height: 1.45;
      }

      /* ============================================================
         PRINT — locks each .itin-a4 to exactly one A4 sheet
         ============================================================ */
      @media print {
        @page {
          size: A4;
          margin: 0;
        }
        html,
        body {
          background: white !important;
        }
        .print-hide {
          display: none !important;
        }
        .itin-a4 {
          box-shadow: none;
          margin: 0;
          width: 210mm;
          height: 297mm;
          page-break-after: always;
          break-after: page;
        }
        .itin-a4:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        .itin-day,
        .itin-final-section,
        .itin-ie,
        .itin-policy {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      }
    `}</style>
  );
}
