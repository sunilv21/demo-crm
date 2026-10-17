'use client';

// "Other Format" — a structured travel-quotation document, entirely separate
// from the Brochure tab's AI-narrative generator (itinerary-form.tsx). Two
// ways to fill it in, usable together:
//   1. Paste raw itinerary text and let AI extract the structure.
//   2. Edit every section by hand — add/remove rows freely.
// "Download as Word" calls generateOtherFormatDocx (a real .docx via the
// `docx` library, ported from build_itinerary_skytours.js) — see
// src/app/actions/itinerary-docx.ts.

import { useCallback, useMemo, useState, type ReactNode, type SetStateAction } from 'react';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Loader2, Wand2, Download, FileDown, Plus, Trash2, Check, X,
  ArrowRightLeft, BedDouble, Landmark, Compass, Circle, PlusCircle, Utensils, Plane, Info,
  Hotel, MapPinned, CalendarRange, Wallet, Building2, ClipboardList, StickyNote,
  MapPin, Users, CalendarDays, Clock, Star, ClipboardCheck, Hash, Globe, Image as ImageIcon,
} from 'lucide-react';
import { extractOtherFormatItinerarySection, type ExtractionProvider } from '@/app/actions/itinerary-format';
import { generateOtherFormatDocx } from '@/app/actions/itinerary-docx';
import { generateOtherFormatPdf } from '@/app/actions/itinerary-pdf';
import { downloadBase64File } from '@/lib/download-file';
import {
  emptyOtherFormatItinerary,
  newId,
  OF_CURRENCIES,
  OF_CURRENCY_SYMBOL,
  formatOfMoney,
  OF_DAY_ITEM_LABELS,
  OF_SECTION_KEYS,
  OF_SECTION_LABELS,
  AGENCY,
  type OFCurrencyCode,
  type OFItinerary,
  type OFSectionKey,
  type OFTemplate,
  type OFTripSummaryRow,
  type OFHotelOption,
  type OFHotelRow,
  type OFFlightRow,
  type OFTourRow,
  type OFDayPlan,
  type OFDayItem,
  type OFDayItemType,
  type OFNoteItem,
  type OFHotelDifferenceRow,
} from './other-format-types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

export function OtherFormatPanel({ template }: { template: OFTemplate }) {
  // Persisted to localStorage (debounced) and restored on mount — so
  // navigating to another page and back, or a refresh, doesn't lose an
  // extracted/edited itinerary and doesn't force burning another AI call
  // just to get back to where the agent left off.
  const emptyData = useMemo(() => emptyOtherFormatItinerary(), []);
  const [rawData, setRawData, clearPersistedData] = usePersistedState<OFItinerary>('skyvisa:itinerary-other-format:data', emptyData);
  // Older localStorage saves predate fields added since (e.g. `flights`) and
  // won't have them — usePersistedState overwrites state wholesale from raw
  // JSON with no merge, so restoring one crashes every `data.flights.length`
  // read below. Normalize on the way out of the hook AND inside setData's
  // updater (which otherwise receives the same un-normalized previous state)
  // so both current renders and functional updates always see every field.
  const data = useMemo<OFItinerary>(() => ({ ...emptyData, ...rawData }), [emptyData, rawData]);
  const setData = useCallback(
    (update: SetStateAction<OFItinerary>) => {
      setRawData((prev) => {
        const normalizedPrev = { ...emptyData, ...prev };
        return typeof update === 'function' ? (update as (d: OFItinerary) => OFItinerary)(normalizedPrev) : update;
      });
    },
    [emptyData, setRawData]
  );
  const [rawText, setRawText] = usePersistedState('skyvisa:itinerary-other-format:raw-text', '');
  // Gemini is the default — it's genuinely fast (gemini-3.8-flash, a few
  // seconds per section). NVIDIA's only working model on this free-tier key,
  // meta/llama-3.2-11b-vision-instruct, measured 40-60s+ per section and
  // routinely times out on the heavier days/extras sections — kept as an
  // opt-in fallback, not the default.
  const [provider, setProvider] = usePersistedState<ExtractionProvider>('skyvisa:itinerary-other-format:provider', 'gemini');
  const [extracting, setExtracting] = useState(false);
  const [sectionStatus, setSectionStatus] = useState<Record<OFSectionKey, 'idle' | 'loading' | 'done' | 'error'>>(
    () => Object.fromEntries(OF_SECTION_KEYS.map((k) => [k, 'idle'])) as Record<OFSectionKey, 'idle'>
  );
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<OFSectionKey, string>>>({});
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadPdfError, setDownloadPdfError] = useState<string | null>(null);

  const doneCount = OF_SECTION_KEYS.filter((k) => sectionStatus[k] === 'done' || sectionStatus[k] === 'error').length;
  const extractProgressPct = Math.round((doneCount / OF_SECTION_KEYS.length) * 100);
  const failedSections = OF_SECTION_KEYS.filter((k) => sectionStatus[k] === 'error');
  const allFailed = !extracting && failedSections.length === OF_SECTION_KEYS.length && doneCount === OF_SECTION_KEYS.length;

  const hasContent =
    data.meta.title ||
    data.tripSummary.length ||
    data.hotelOptions.some((o) => o.hotels.length) ||
    data.flights.length ||
    data.tours.length ||
    data.days.length ||
    data.inclusions.length ||
    data.exclusions.length;

  // Runs each section (trip details, hotels, tours, days, extras) as its own
  // AI call in parallel, updating that section's status and merging its data
  // into the itinerary as soon as it resolves — real per-section progress
  // instead of one opaque "Extracting…" wait. `sections` defaults to all
  // five; passed a subset to retry only the ones that failed last time.
  const handleExtract = async (sections: readonly OFSectionKey[] = OF_SECTION_KEYS) => {
    setExtracting(true);
    setSectionStatus((s) => ({ ...s, ...Object.fromEntries(sections.map((k) => [k, 'loading'])) }));
    setSectionErrors((e) => {
      const next = { ...e };
      sections.forEach((k) => delete next[k]);
      return next;
    });

    await Promise.all(
      sections.map(async (section) => {
        try {
          const result = await extractOtherFormatItinerarySection(rawText, provider, section);
          if ('error' in result) {
            setSectionStatus((s) => ({ ...s, [section]: 'error' }));
            setSectionErrors((e) => ({ ...e, [section]: result.error }));
          } else {
            setData((d) => ({ ...d, ...result.data }));
            setSectionStatus((s) => ({ ...s, [section]: 'done' }));
          }
        } catch (e: any) {
          setSectionStatus((s) => ({ ...s, [section]: 'error' }));
          setSectionErrors((prev) => ({ ...prev, [section]: e?.message || 'Unexpected error.' }));
        }
      })
    );

    setExtracting(false);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await generateOtherFormatDocx(data, template);
      if ('error' in result) {
        setDownloadError(result.error);
      } else {
        downloadBase64File(result.base64, result.filename, DOCX_MIME);
      }
    } finally {
      setDownloading(false);
    }
  };

  // A real, directly-downloadable PDF via itinerary-pdf.tsx (@react-pdf/
  // renderer — same approach already used for booking voucher PDFs), not the
  // browser print dialog: this downloads immediately on click, same as Word
  // above, with its own running header/footer and A4 pagination (sections
  // break to a fresh page, cards never split across one). @react-pdf's View
  // supports borderRadius, which is what lets the modern template's rounded
  // cards actually render as rounded cards — something the .docx export
  // (itinerary-docx.ts / itinerary-docx-modern.ts, both untouched by this)
  // can't do, which is the whole reason this button exists alongside Word
  // rather than replacing it.
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    setDownloadPdfError(null);
    try {
      const result = await generateOtherFormatPdf(data, template);
      if ('error' in result) {
        setDownloadPdfError(result.error);
      } else {
        downloadBase64File(result.base64, result.filename, PDF_MIME);
      }
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 lg:h-[calc(100vh-10rem)]">
      <Card className="h-fit lg:h-full lg:overflow-y-auto lg:overflow-x-hidden">
        <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Create an Itinerary (Other Format)</CardTitle>
            <CardDescription>
              A structured travel quotation — trip summary, one or more hotel options, tours &amp; transfers, a
              day-by-day programme, inclusions/exclusions, notes and a cost comparison. Paste raw
              itinerary text to extract it automatically, then fill in or adjust anything by hand.
              Downloads as a real Word (.docx) document. Your progress here is saved automatically —
              switching pages and coming back won't lose it or burn another AI call.
            </CardDescription>
          </div>
          {hasContent && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="flex-shrink-0 text-muted-foreground"
              onClick={() => {
                clearPersistedData();
                setRawText('');
                setSectionStatus(Object.fromEntries(OF_SECTION_KEYS.map((k) => [k, 'idle'])) as Record<OFSectionKey, 'idle'>);
                setSectionErrors({});
              }}
            >
              Start Over
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="of-raw-text">Paste itinerary text</Label>
            <Textarea
              id="of-raw-text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste a supplier email, WhatsApp message, or draft itinerary here — destination, hotels, day-by-day plan, pricing, inclusions, whatever you have."
              className="min-h-[140px]"
            />
            <div className="flex items-center gap-2 mt-2">
              <Label htmlFor="of-provider" className="text-xs text-muted-foreground whitespace-nowrap">
                Model
              </Label>
              <select
                id="of-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as ExtractionProvider)}
                disabled={extracting}
                className="h-8 flex-1 rounded border border-input bg-background px-2 text-sm"
              >
                <option value="gemini">Gemini (Google) — fast</option>
                <option value="nvidia">NVIDIA (Llama 3.2) — slower</option>
              </select>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Label htmlFor="of-currency" className="text-xs text-muted-foreground whitespace-nowrap">
                Currency
              </Label>
              <select
                id="of-currency"
                value={data.currency}
                onChange={(e) => setData((d) => ({ ...d, currency: e.target.value as OFCurrencyCode }))}
                className="h-8 flex-1 rounded border border-input bg-background px-2 text-sm"
              >
                {OF_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Applies to every price in this document — type plain numbers into the hotel price fields below,
              the currency shown here is added automatically. Extracting with AI also detects it from the
              pasted text when a currency is evident there.
            </p>
            <Button
              type="button"
              onClick={() => handleExtract()}
              disabled={extracting || rawText.trim().length < 20}
              className="w-full mt-2"
              variant="outline"
            >
              {extracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extracting… {extractProgressPct}%
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Extract with AI
                </>
              )}
            </Button>

            {(extracting || doneCount > 0) && (
              <div className="mt-2 space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${extractProgressPct}%` }}
                  />
                </div>
                <ul className="space-y-1">
                  {OF_SECTION_KEYS.map((key) => {
                    const status = sectionStatus[key];
                    return (
                      <li key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                        {status === 'loading' && <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-primary" />}
                        {status === 'done' && <Check className="h-3 w-3 flex-shrink-0 text-green-600" />}
                        {status === 'error' && <X className="h-3 w-3 flex-shrink-0 text-destructive" />}
                        {status === 'idle' && <span className="h-3 w-3 flex-shrink-0 rounded-full border" />}
                        <span className={status === 'error' ? 'text-destructive' : ''}>{OF_SECTION_LABELS[key]}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {!extracting && failedSections.length > 0 && (
              <Alert variant="destructive" className="mt-2">
                <AlertTitle>{allFailed ? 'Extraction failed' : 'Some sections failed'}</AlertTitle>
                <AlertDescription className="space-y-2">
                  {failedSections.map((key) => (
                    <div key={key}>
                      <span className="font-medium">{OF_SECTION_LABELS[key]}:</span> {sectionErrors[key]}
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={() => handleExtract(failedSections)}>
                    Retry {failedSections.length === OF_SECTION_KEYS.length ? '' : 'failed sections'}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Accordion type="multiple" defaultValue={['meta']} className="space-y-2">
            <AccordionItem value="meta" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Trip Details</AccordionTrigger>
              <AccordionContent>
                <MetaFields data={data} onChange={(patch) => setData((d) => ({ ...d, ...patch }))} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="summary" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Trip Summary ({data.tripSummary.length})</AccordionTrigger>
              <AccordionContent>
                <TripSummaryEditor rows={data.tripSummary} onChange={(rows) => setData((d) => ({ ...d, tripSummary: rows }))} />
              </AccordionContent>
            </AccordionItem>

            {data.hotelOptions.map((opt, idx) => (
              <AccordionItem key={opt.id} value={`hotels-${opt.id}`} className="border rounded-md px-3">
                <AccordionTrigger className="text-sm font-semibold">
                  {opt.label || `Option ${idx + 1}`} ({opt.hotels.length} hotels)
                </AccordionTrigger>
                <AccordionContent>
                  <HotelOptionEditor
                    option={opt}
                    currencySymbol={OF_CURRENCY_SYMBOL[data.currency]}
                    onChange={(patch) =>
                      setData((d) => ({
                        ...d,
                        hotelOptions: d.hotelOptions.map((o, i) => (i === idx ? patch : o)),
                      }))
                    }
                    onRemove={
                      data.hotelOptions.length > 1
                        ? () =>
                            setData((d) => ({
                              ...d,
                              hotelOptions: d.hotelOptions.filter((_, i) => i !== idx),
                              hotelDifferences: d.hotelDifferences.map((r) => ({
                                ...r,
                                values: (r.values || []).filter((_, i) => i !== idx),
                              })),
                            }))
                        : undefined
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
            <AddButton
              onClick={() =>
                setData((d) => ({
                  ...d,
                  hotelOptions: [
                    ...d.hotelOptions,
                    { id: newId(), label: `Option ${d.hotelOptions.length + 1}`, perPerson: '', total: '', hotels: [] },
                  ],
                  hotelDifferences: d.hotelDifferences.map((r) => ({ ...r, values: [...(r.values || []), ''] })),
                }))
              }
              label="Add hotel option"
            />

            <AccordionItem value="flights" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Flights ({data.flights.length})</AccordionTrigger>
              <AccordionContent>
                <FlightsEditor rows={data.flights} onChange={(flights) => setData((d) => ({ ...d, flights }))} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tours" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Tours &amp; Transfers ({data.tours.length})</AccordionTrigger>
              <AccordionContent>
                <ToursEditor rows={data.tours} onChange={(tours) => setData((d) => ({ ...d, tours }))} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="days" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Day-by-Day Programme ({data.days.length} days)</AccordionTrigger>
              <AccordionContent>
                <DaysEditor days={data.days} onChange={(days) => setData((d) => ({ ...d, days }))} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="inclusions" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Inclusions ({data.inclusions.length})</AccordionTrigger>
              <AccordionContent>
                <StringListEditor
                  items={data.inclusions}
                  onChange={(inclusions) => setData((d) => ({ ...d, inclusions }))}
                  placeholder="e.g. Hotel accommodation with daily breakfast"
                  addLabel="Add inclusion"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="exclusions" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Exclusions ({data.exclusions.length})</AccordionTrigger>
              <AccordionContent>
                <StringListEditor
                  items={data.exclusions}
                  onChange={(exclusions) => setData((d) => ({ ...d, exclusions }))}
                  placeholder="e.g. International airfare"
                  addLabel="Add exclusion"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="notes" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Important Notes ({data.notes.length})</AccordionTrigger>
              <AccordionContent>
                <NotesEditor notes={data.notes} onChange={(notes) => setData((d) => ({ ...d, notes }))} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cost" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Package Cost Comparison</AccordionTrigger>
              <AccordionContent>
                <CostComparisonFields
                  data={data}
                  onChange={(costComparison) => setData((d) => ({ ...d, costComparison }))}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="diffs" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Hotel Differences ({data.hotelDifferences.length})</AccordionTrigger>
              <AccordionContent>
                <HotelDifferencesEditor
                  rows={data.hotelDifferences}
                  options={data.hotelOptions}
                  onChange={(hotelDifferences) => setData((d) => ({ ...d, hotelDifferences }))}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex gap-2">
            <Button type="button" onClick={handleDownload} disabled={downloading || !hasContent} className="flex-1">
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Word (.docx)
                </>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf || !hasContent} className="flex-1">
              {downloadingPdf ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF
                </>
              )}
            </Button>
          </div>
          {downloadPdfError && (
            <Alert variant="destructive">
              <AlertTitle>Could not generate the PDF</AlertTitle>
              <AlertDescription>{downloadPdfError}</AlertDescription>
            </Alert>
          )}
          {downloadError && (
            <Alert variant="destructive">
              <AlertTitle>Could not generate the document</AlertTitle>
              <AlertDescription>{downloadError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="lg:h-full lg:overflow-y-auto lg:overflow-x-hidden">
        {!hasContent ? (
          <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/50 rounded-lg p-8 w-full lg:min-h-[60vh]">
            <p>Your itinerary document will preview here once you paste/extract or start filling it in.</p>
          </div>
        ) : template === 'classic' ? (
          <OtherFormatPreview data={data} />
        ) : template === 'branded' ? (
          <OtherFormatPreviewBranded data={data} />
        ) : (
          <OtherFormatPreviewModern data={data} />
        )}
      </div>

    </div>
  );
}

// ============================================================================
// Small row-list editing primitives
// ============================================================================

function fieldLabel(text: string) {
  return <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{text}</Label>;
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={onClick} aria-label={label}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick} className="mt-2">
      <Plus className="mr-1 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

// Reads a dropped/selected image file as a data URL — used wherever the
// Branded template wants a real photo instead of its gradient placeholder
// (PhotoBlock). Stored directly in the itinerary JSON (no upload endpoint),
// so it round-trips with the rest of the document and needs no external
// hosting, at the cost of making the saved itinerary heavier per photo.
function ImageUploadButton({ value, onChange, label, size = 'h-12 w-16' }: { value?: string; onChange: (dataUrl: string | undefined) => void; label: string; size?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className={`${size} object-cover rounded border`} />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 shadow"
            aria-label={`Remove ${label} photo`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <label className={`${size} flex items-center justify-center rounded border border-dashed text-muted-foreground cursor-pointer hover:bg-muted/40`}>
          <ImageIcon className="h-4 w-4" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onChange(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />
        </label>
      )}
      <span className="text-[10px] text-muted-foreground max-w-[64px] truncate text-center">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Meta
function MetaFields({ data, onChange }: { data: OFItinerary; onChange: (patch: Partial<OFItinerary>) => void }) {
  const meta = data.meta;
  const set = (patch: Partial<OFItinerary['meta']>) => onChange({ meta: { ...meta, ...patch } });
  const destList = meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const setDestImage = (name: string, url: string | undefined) => {
    const next = { ...data.destinationImages };
    if (url) next[name] = url;
    else delete next[name];
    onChange({ destinationImages: next });
  };
  return (
    <div className="space-y-2 pb-3">
      <div>
        {fieldLabel('Trip Title')}
        <Input value={meta.title} onChange={(e) => set({ title: e.target.value })} placeholder="VIETNAM HOLIDAY — 4 Star" className="h-8 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          {fieldLabel('Country')}
          <Input value={meta.country} onChange={(e) => set({ country: e.target.value })} placeholder="Vietnam" className="h-8 text-sm" />
        </div>
        <div>
          {fieldLabel('Guest Name')}
          <Input value={meta.guestName} onChange={(e) => set({ guestName: e.target.value })} placeholder="Ms. Nupur" className="h-8 text-sm" />
        </div>
      </div>
      <div>
        {fieldLabel('Destinations (comma-separated)')}
        <Input
          value={meta.destinations}
          onChange={(e) => set({ destinations: e.target.value })}
          placeholder="Bana Hills, Ho Chi Minh City, Phu Quoc Island"
          className="h-8 text-sm"
        />
      </div>
      {destList.length > 0 && (
        <div>
          {fieldLabel('Destination Photos (optional — Branded format only)')}
          <div className="flex flex-wrap gap-3 mt-1">
            {destList.map((d) => (
              <ImageUploadButton key={d} value={data.destinationImages?.[d]} onChange={(url) => setDestImage(d, url)} label={d} />
            ))}
          </div>
        </div>
      )}
      <div>
        {fieldLabel('Tagline')}
        <Input value={meta.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Golden Bridge · Cu Chi Tunnels · Mekong Delta" className="h-8 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          {fieldLabel('Date Range')}
          <Input value={meta.dateRangeShort} onChange={(e) => set({ dateRangeShort: e.target.value })} placeholder="15–21 Jun 2026" className="h-8 text-sm" />
        </div>
        <div>
          {fieldLabel('Duration')}
          <Input value={meta.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="6N/7D" className="h-8 text-sm" />
        </div>
      </div>
      <div>
        {fieldLabel('Reference Code')}
        <Input value={meta.referenceCode} onChange={(e) => set({ referenceCode: e.target.value })} placeholder="175037/IYC" className="h-8 text-sm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Trip Summary
function TripSummaryEditor({ rows, onChange }: { rows: OFTripSummaryRow[]; onChange: (rows: OFTripSummaryRow[]) => void }) {
  const update = (id: string, patch: Partial<OFTripSummaryRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () => onChange([...rows, { id: newId(), label: '', value: '' }]);
  return (
    <div className="pb-3">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-2 mb-2">
          <Input value={r.label} onChange={(e) => update(r.id, { label: e.target.value })} placeholder="Label (e.g. Group Size)" className="h-8 text-sm w-1/3" />
          <Input value={r.value} onChange={(e) => update(r.id, { value: e.target.value })} placeholder="Value" className="h-8 text-sm flex-1" />
          <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap pt-1.5">
            <input type="checkbox" checked={!!r.emphasis} onChange={(e) => update(r.id, { emphasis: e.target.checked })} />
            highlight
          </label>
          <RemoveButton onClick={() => remove(r.id)} label="Remove row" />
        </div>
      ))}
      <AddButton onClick={add} label="Add row" />
    </div>
  );
}

// ---------------------------------------------------------------- Hotel Option
function HotelOptionEditor({
  option,
  currencySymbol,
  onChange,
  onRemove,
}: {
  option: OFHotelOption;
  currencySymbol: string;
  onChange: (option: OFHotelOption) => void;
  onRemove?: () => void;
}) {
  const set = (patch: Partial<OFHotelOption>) => onChange({ ...option, ...patch });
  const updateHotel = (id: string, patch: Partial<OFHotelRow>) =>
    set({ hotels: option.hotels.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  const removeHotel = (id: string) => set({ hotels: option.hotels.filter((h) => h.id !== id) });
  const addHotel = () =>
    set({ hotels: [...option.hotels, { id: newId(), city: '', hotel: '', stars: 4, room: '', checkin: '', checkout: '', nights: 1 }] });

  return (
    <div className="pb-3 space-y-2">
      <div className="flex items-start gap-3">
        <ImageUploadButton value={option.image} onChange={(url) => set({ image: url })} label="Photo (Branded)" size="h-14 w-20" />
        <div className="grid grid-cols-3 gap-2 flex-1">
          <div>
            {fieldLabel('Label')}
            <Input value={option.label} onChange={(e) => set({ label: e.target.value })} className="h-8 text-sm" />
          </div>
        <div>
          {fieldLabel('Per Person')}
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              {currencySymbol}
            </span>
            <Input
              value={option.perPerson}
              onChange={(e) => set({ perPerson: e.target.value })}
              placeholder="767"
              className="h-8 text-sm pl-6"
            />
          </div>
        </div>
        <div>
          {fieldLabel('Total')}
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              {currencySymbol}
            </span>
            <Input
              value={option.total}
              onChange={(e) => set({ total: e.target.value })}
              placeholder="1,534"
              className="h-8 text-sm pl-6"
            />
          </div>
        </div>
        </div>
      </div>

      {onRemove && (
        <Button type="button" size="sm" variant="ghost" className="text-destructive h-7" onClick={onRemove}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Remove this option
        </Button>
      )}

      <ul className="space-y-2">
        {option.hotels.map((h) => (
          <li key={h.id} className="rounded border p-2 space-y-1.5 bg-muted/30">
            <div className="flex items-start gap-2">
              <Input value={h.hotel} onChange={(e) => updateHotel(h.id, { hotel: e.target.value })} placeholder="Hotel name" className="h-8 text-sm font-medium flex-1" />
              <RemoveButton onClick={() => removeHotel(h.id)} label="Remove hotel" />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <Input value={h.city} onChange={(e) => updateHotel(h.id, { city: e.target.value })} placeholder="City" className="h-7 text-xs" />
              <select
                value={h.stars}
                onChange={(e) => updateHotel(h.id, { stars: Number(e.target.value) })}
                className="h-7 rounded border border-input bg-background px-1 text-xs"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{'★'.repeat(n)}</option>
                ))}
              </select>
              <Input value={h.room} onChange={(e) => updateHotel(h.id, { room: e.target.value })} placeholder="Room type" className="h-7 text-xs col-span-2" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Input value={h.checkin} onChange={(e) => updateHotel(h.id, { checkin: e.target.value })} placeholder="Check-in" className="h-7 text-xs" />
              <Input value={h.checkout} onChange={(e) => updateHotel(h.id, { checkout: e.target.value })} placeholder="Check-out" className="h-7 text-xs" />
              <Input
                type="number"
                min={0}
                value={h.nights}
                onChange={(e) => updateHotel(h.id, { nights: Number(e.target.value) })}
                placeholder="Nights"
                className="h-7 text-xs"
              />
            </div>
          </li>
        ))}
      </ul>
      <AddButton onClick={addHotel} label="Add hotel" />
    </div>
  );
}

// ---------------------------------------------------------------- Flights
function FlightsEditor({ rows, onChange }: { rows: OFFlightRow[]; onChange: (rows: OFFlightRow[]) => void }) {
  const update = (id: string, patch: Partial<OFFlightRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () =>
    onChange([
      ...rows,
      { id: newId(), airline: '', flightNo: '', from: '', to: '', departure: '', arrival: '', travelClass: '', baggage: '' },
    ]);
  return (
    <div className="pb-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded border p-2 space-y-1.5 bg-muted/30 mb-2">
          <div className="flex items-start gap-2">
            <Input value={r.airline} onChange={(e) => update(r.id, { airline: e.target.value })} placeholder="Airline (e.g. IndiGo)" className="h-8 text-sm flex-1" />
            <Input value={r.flightNo} onChange={(e) => update(r.id, { flightNo: e.target.value })} placeholder="Flight No." className="h-8 text-sm w-28 flex-shrink-0" />
            <RemoveButton onClick={() => remove(r.id)} label="Remove flight" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input value={r.from} onChange={(e) => update(r.id, { from: e.target.value })} placeholder="From (city/airport)" className="h-7 text-xs" />
            <Input value={r.to} onChange={(e) => update(r.id, { to: e.target.value })} placeholder="To (city/airport)" className="h-7 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input value={r.departure} onChange={(e) => update(r.id, { departure: e.target.value })} placeholder="Departure (date, time)" className="h-7 text-xs" />
            <Input value={r.arrival} onChange={(e) => update(r.id, { arrival: e.target.value })} placeholder="Arrival (date, time)" className="h-7 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input value={r.travelClass} onChange={(e) => update(r.id, { travelClass: e.target.value })} placeholder="Class (e.g. Economy)" className="h-7 text-xs" />
            <Input value={r.baggage} onChange={(e) => update(r.id, { baggage: e.target.value })} placeholder="Baggage allowance" className="h-7 text-xs" />
          </div>
        </div>
      ))}
      <AddButton onClick={add} label="Add flight" />
    </div>
  );
}

// ---------------------------------------------------------------- Tours
function ToursEditor({ rows, onChange }: { rows: OFTourRow[]; onChange: (rows: OFTourRow[]) => void }) {
  const update = (id: string, patch: Partial<OFTourRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () => onChange([...rows, { id: newId(), tour: '', basis: 'Private', details: '' }]);
  return (
    <div className="pb-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded border p-2 space-y-1.5 bg-muted/30 mb-2">
          <div className="flex items-start gap-2">
            <Input value={r.tour} onChange={(e) => update(r.id, { tour: e.target.value })} placeholder="Tour / transfer name" className="h-8 text-sm flex-1" />
            <RemoveButton onClick={() => remove(r.id)} label="Remove row" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input value={r.basis} onChange={(e) => update(r.id, { basis: e.target.value })} placeholder="Basis (Private/Shared)" className="h-7 text-xs" />
            <Input value={r.details} onChange={(e) => update(r.id, { details: e.target.value })} placeholder="Details" className="h-7 text-xs" />
          </div>
        </div>
      ))}
      <AddButton onClick={add} label="Add row" />
    </div>
  );
}

// ---------------------------------------------------------------- Days
function DaysEditor({ days, onChange }: { days: OFDayPlan[]; onChange: (days: OFDayPlan[]) => void }) {
  const update = (id: string, patch: Partial<OFDayPlan>) => onChange(days.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const remove = (id: string) => onChange(days.filter((d) => d.id !== id));
  const add = () =>
    onChange([
      ...days,
      { id: newId(), num: String(days.length + 1).padStart(2, '0'), date: '', weekday: '', place: '', title: '', items: [] },
    ]);

  return (
    <div className="pb-3 space-y-3">
      {days.map((day) => (
        <DayEditor key={day.id} day={day} onChange={(patch) => update(day.id, patch)} onRemove={() => remove(day.id)} />
      ))}
      <AddButton onClick={add} label="Add day" />
    </div>
  );
}

function DayEditor({ day, onChange, onRemove }: { day: OFDayPlan; onChange: (patch: Partial<OFDayPlan>) => void; onRemove: () => void }) {
  const updateItem = (id: string, patch: Partial<OFDayItem>) =>
    onChange({ items: day.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const removeItem = (id: string) => onChange({ items: day.items.filter((it) => it.id !== id) });
  const addItem = () => onChange({ items: [...day.items, { id: newId(), type: 'plain' as OFDayItemType, label: '', text: '' }] });

  return (
    <div className="rounded border p-2 space-y-1.5 bg-muted/20">
      <div className="flex items-start gap-2">
        <Input value={day.num} onChange={(e) => onChange({ num: e.target.value })} placeholder="01" className="h-8 text-sm w-14" />
        <Input value={day.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Day title" className="h-8 text-sm flex-1 font-medium" />
        <RemoveButton onClick={onRemove} label="Remove day" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Input value={day.date} onChange={(e) => onChange({ date: e.target.value })} placeholder="Date" className="h-7 text-xs" />
        <Input value={day.weekday} onChange={(e) => onChange({ weekday: e.target.value })} placeholder="Weekday" className="h-7 text-xs" />
        <Input value={day.place} onChange={(e) => onChange({ place: e.target.value })} placeholder="Place" className="h-7 text-xs" />
      </div>

      <div className="space-y-1.5 pl-2 border-l-2">
        {day.items.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5">
            <select
              value={item.type}
              onChange={(e) => updateItem(item.id, { type: e.target.value as OFDayItemType })}
              className="h-7 rounded border border-input bg-background px-1 text-xs w-32 flex-shrink-0"
            >
              {(Object.keys(OF_DAY_ITEM_LABELS) as OFDayItemType[]).map((t) => (
                <option key={t} value={t}>{OF_DAY_ITEM_LABELS[t]}</option>
              ))}
            </select>
            <Input value={item.label} onChange={(e) => updateItem(item.id, { label: e.target.value })} placeholder="Lead phrase" className="h-7 text-xs w-28 flex-shrink-0" />
            <Input value={item.text} onChange={(e) => updateItem(item.id, { text: e.target.value })} placeholder="Description" className="h-7 text-xs flex-1" />
            <RemoveButton onClick={() => removeItem(item.id)} label="Remove line" />
          </div>
        ))}
        <AddButton onClick={addItem} label="Add line" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Plain string lists (inclusions/exclusions)
function StringListEditor({
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  const update = (i: number, value: string) => onChange(items.map((it, idx) => (idx === i ? value : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, '']);
  return (
    <div className="pb-3">
      {items.map((text, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <Input value={text} onChange={(e) => update(i, e.target.value)} placeholder={placeholder} className="h-8 text-sm flex-1" />
          <RemoveButton onClick={() => remove(i)} label="Remove" />
        </div>
      ))}
      <AddButton onClick={add} label={addLabel} />
    </div>
  );
}

// ---------------------------------------------------------------- Notes
function NotesEditor({ notes, onChange }: { notes: OFNoteItem[]; onChange: (notes: OFNoteItem[]) => void }) {
  const update = (id: string, patch: Partial<OFNoteItem>) => onChange(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const remove = (id: string) => onChange(notes.filter((n) => n.id !== id));
  const add = () => onChange([...notes, { id: newId(), label: '', text: '' }]);
  return (
    <div className="pb-3">
      {notes.map((n) => (
        <div key={n.id} className="flex items-start gap-2 mb-2">
          <Input value={n.label} onChange={(e) => update(n.id, { label: e.target.value })} placeholder="VISA" className="h-8 text-sm w-28" />
          <Input value={n.text} onChange={(e) => update(n.id, { text: e.target.value })} placeholder="Note text" className="h-8 text-sm flex-1" />
          <RemoveButton onClick={() => remove(n.id)} label="Remove note" />
        </div>
      ))}
      <AddButton onClick={add} label="Add note" />
    </div>
  );
}

// ---------------------------------------------------------------- Cost comparison
function CostComparisonFields({ data, onChange }: { data: OFItinerary; onChange: (cc: OFItinerary['costComparison']) => void }) {
  const cc = data.costComparison;
  const set = (patch: Partial<OFItinerary['costComparison']>) => onChange({ ...cc, ...patch });
  return (
    <div className="pb-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        Per-person and total prices come from the Hotel Option sections above — edit them there.
      </p>
      <div>
        {fieldLabel('Component Label')}
        <Input value={cc.componentLabel} onChange={(e) => set({ componentLabel: e.target.value })} placeholder="6N/7D — Bana Hills + HCMC + Phu Quoc" className="h-8 text-sm" />
      </div>
      <div>
        {fieldLabel('Component Sub-description')}
        <Input value={cc.componentSub} onChange={(e) => set({ componentSub: e.target.value })} placeholder="4★ Hotels + Breakfast + All Transfers + All Tours" className="h-8 text-sm" />
      </div>
      <div>
        {fieldLabel('Footnote')}
        <Textarea
          value={cc.footnote}
          onChange={(e) => set({ footnote: e.target.value })}
          placeholder={`* Cost is in ${data.currency}, per person × 2. Excludes international airfare, visa...`}
          className="min-h-[60px] text-sm"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Hotel differences
function HotelDifferencesEditor({
  rows,
  options,
  onChange,
}: {
  rows: OFHotelDifferenceRow[];
  options: OFHotelOption[];
  onChange: (rows: OFHotelDifferenceRow[]) => void;
}) {
  const updateCity = (id: string, city: string) => onChange(rows.map((r) => (r.id === id ? { ...r, city } : r)));
  const updateValue = (id: string, idx: number, value: string) =>
    onChange(
      rows.map((r) => {
        if (r.id !== id) return r;
        const values = [...(r.values || [])];
        values[idx] = value;
        return { ...r, values };
      })
    );
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () => onChange([...rows, { id: newId(), city: '', values: options.map(() => '') }]);
  return (
    <div className="pb-3">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 mb-2">
          <Input value={r.city} onChange={(e) => updateCity(r.id, e.target.value)} placeholder="City" className="h-8 text-sm w-1/4" />
          {options.map((opt, idx) => (
            <Input
              key={opt.id}
              value={(r.values || [])[idx] || ''}
              onChange={(e) => updateValue(r.id, idx, e.target.value)}
              placeholder={`${opt.label || `Option ${idx + 1}`} hotel`}
              className="h-8 text-sm flex-1"
            />
          ))}
          <RemoveButton onClick={() => remove(r.id)} label="Remove row" />
        </div>
      ))}
      <AddButton onClick={add} label="Add row" />
    </div>
  );
}

// ============================================================================
// Preview — a read-only rendering approximating the .docx sections. The real
// fidelity target is the Word document itself; this is a working-preview, not
// a pixel-accurate replica of Word's rendering.
// ============================================================================

function OtherFormatPreview({ data }: { data: OFItinerary }) {
  const destList = data.meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const options = data.hotelOptions;
  const hasCost = options.some((o) => o.perPerson || o.total);
  const money = (v: string) => formatOfMoney(v, data.currency);

  return (
    <div className="of-prev bg-white text-[#222] rounded-lg shadow-sm border p-6 space-y-5 text-sm">
      <style jsx>{`
        .of-prev h1, .of-prev h2, .of-prev h3 { font-family: Georgia, 'Times New Roman', serif; }
        .of-h { color: #1b3a63; }
        .of-gold { color: #c8862a; }
        .of-banner { background: #1b3a63; color: #fff; padding: 6px 10px; border-radius: 4px; font-weight: 700; font-size: 12px; }
        .of-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .of-table th { background: #1b3a63; color: #fff; text-align: left; padding: 5px 8px; font-size: 11px; }
        .of-table td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        .of-table tr:nth-child(even) td { background: #eaf0f8; }
        .of-day { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
        .of-day-head { background: #1b3a63; color: #fff; padding: 6px 10px; font-size: 13px; font-weight: 700; }
        .of-day-item { padding: 5px 10px; border-top: 1px solid #eef2f7; font-size: 12px; }
        .of-letterhead { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 3px solid #c8862a; }
        .of-letterhead-divider { width: 3px; align-self: stretch; background: #1b3a63; border-radius: 2px; }
        .of-letterhead-name { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 30px; color: #1b3a63; line-height: 1.15; }
        .of-letterhead-addr { font-weight: 700; font-size: 12px; color: #333; margin-top: 2px; }
        .of-letterhead-contact { font-size: 11px; margin-top: 2px; }
        .of-letterhead-contact a { color: #4a86c8; font-weight: 700; text-decoration: underline; }
      `}</style>

      {/* Mirrors the letterhead banner build_itinerary_skytours.js-style docx
          puts at the top of the document body (buildLetterhead in
          itinerary-docx.ts) — kept in sync manually since one renders to
          React and the other to OOXML. */}
      <div className="of-letterhead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sky.png" alt="Sky Tours & Visa Consultant" width={72} height={72} className="flex-shrink-0" />
        <div className="of-letterhead-divider" />
        <div>
          <div className="of-letterhead-name">{AGENCY.name}</div>
          <div className="of-letterhead-addr">{AGENCY.address}</div>
          <div className="of-letterhead-contact">
            <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>
            {AGENCY.phones.map((ph) => (
              <span key={ph}> &nbsp;|&nbsp; <span className="font-semibold">{ph}</span></span>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center border-b-2 pb-2" style={{ borderColor: '#1b3a63' }}>
        <h1 className="of-h text-xl font-bold">{data.meta.title || 'Untitled Trip'}</h1>
        {destList.length > 0 && (
          <div className="text-sm mt-1">{destList.join(' · ')}</div>
        )}
        {data.meta.tagline && <div className="text-xs italic text-muted-foreground mt-1">{data.meta.tagline}</div>}
        <div className="text-xs text-muted-foreground mt-1">
          {[data.meta.guestName, data.meta.dateRangeShort, data.meta.duration, data.meta.referenceCode && `Ref ${data.meta.referenceCode}`]
            .filter(Boolean)
            .join('  |  ')}
        </div>
      </div>

      {data.tripSummary.length > 0 && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Trip Summary</div>
          <table className="of-table">
            <tbody>
              {data.tripSummary.map((r) => (
                <tr key={r.id}>
                  <td className="of-h font-semibold w-1/3">{r.label}</td>
                  <td className={r.emphasis ? 'of-gold font-bold' : ''}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {options.some((o) => o.hotels.length > 0) && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Hotel Accommodation</div>
          {options.map(
            (opt) =>
              opt.hotels.length > 0 && (
                <div key={opt.id} className="mb-3">
                  {/* Pricing deliberately NOT shown here — it belongs only in
                      the Package Cost Comparison section below, not repeated
                      next to every hotel option's name. */}
                  <div className="of-banner mb-1">{opt.label.toUpperCase()}</div>
                  <table className="of-table">
                    <thead>
                      <tr><th>City</th><th>Hotel</th><th>Stars</th><th>Room</th><th>Nights</th></tr>
                    </thead>
                    <tbody>
                      {opt.hotels.map((h) => (
                        <tr key={h.id}>
                          <td>{h.city}</td>
                          <td className="font-semibold">{h.hotel}</td>
                          <td>{'★'.repeat(h.stars)}</td>
                          <td>{h.room}</td>
                          <td>{h.nights}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </div>
      )}

      {data.flights.length > 0 && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Flights</div>
          <table className="of-table">
            <thead>
              <tr><th>Airline</th><th>Flight No.</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>Class</th><th>Baggage</th></tr>
            </thead>
            <tbody>
              {data.flights.map((f) => (
                <tr key={f.id}>
                  <td className="font-semibold">{f.airline}</td>
                  <td>{f.flightNo}</td>
                  <td>{f.from}</td>
                  <td>{f.to}</td>
                  <td>{f.departure}</td>
                  <td>{f.arrival}</td>
                  <td>{f.travelClass}</td>
                  <td className="text-muted-foreground">{f.baggage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.tours.length > 0 && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Tours &amp; Transfers</div>
          <table className="of-table">
            <thead><tr><th>Tour / Transfer</th><th>Basis</th><th>Details</th></tr></thead>
            <tbody>
              {data.tours.map((t) => (
                <tr key={t.id}><td>{t.tour}</td><td className="font-semibold">{t.basis}</td><td className="text-muted-foreground">{t.details}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.days.length > 0 && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Day-Wise Itinerary</div>
          {data.days.map((day) => (
            <div key={day.id} className="of-day">
              <div className="of-day-head">
                Day {day.num} {[day.date, day.weekday].filter(Boolean).join(' · ') && `| ${[day.date, day.weekday].filter(Boolean).join(' · ')} | `}{day.title}
              </div>
              {day.items.map((item) => (
                <div key={item.id} className="of-day-item">
                  {item.label && <span className="font-semibold">{item.label} </span>}
                  <span className="text-muted-foreground">{item.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-bold text-xs uppercase tracking-wide mb-1" style={{ color: '#2f6b3a' }}>Inclusions</div>
            <ul className="text-xs space-y-0.5">
              {data.inclusions.map((it, i) => <li key={i}>▶ {it}</li>)}
            </ul>
          </div>
          <div>
            <div className="font-bold text-xs uppercase tracking-wide mb-1" style={{ color: '#a33a2e' }}>Exclusions</div>
            <ul className="text-xs space-y-0.5">
              {data.exclusions.map((it, i) => <li key={i}>▶ {it}</li>)}
            </ul>
          </div>
        </div>
      )}

      {data.notes.length > 0 && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Important Notes</div>
          {data.notes.map((n) => (
            <p key={n.id} className="text-xs mb-1">
              <span className="of-h font-semibold">{n.label}: </span>
              {n.text}
            </p>
          ))}
        </div>
      )}

      {hasCost && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Package Cost Comparison</div>
          <table className="of-table">
            <thead>
              <tr>
                <th>
                  <div className="font-semibold">{data.costComparison.componentLabel}</div>
                  <div className="text-[10px] italic font-normal opacity-90">{data.costComparison.componentSub}</div>
                </th>
                {options.map((o) => <th key={o.id}>{o.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-semibold">Per Person</td>
                {options.map((o) => <td key={`${o.id}-pp`}>{money(o.perPerson)}</td>)}
              </tr>
              <tr>
                <td className="font-semibold">Total</td>
                {options.map((o) => <td key={`${o.id}-total`} className="of-gold font-bold">{money(o.total)}</td>)}
              </tr>
            </tbody>
          </table>
          {data.costComparison.footnote && <p className="text-xs italic text-muted-foreground mt-1">{data.costComparison.footnote}</p>}
        </div>
      )}

      {data.hotelDifferences.length > 0 && (
        <div>
          <div className="of-banner inline-block mb-2">HOTEL DIFFERENCES BETWEEN OPTIONS</div>
          <table className="of-table">
            <thead>
              <tr>
                <th>City</th>
                {options.map((o) => <th key={o.id}>{o.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.hotelDifferences.map((r) => (
                <tr key={r.id}>
                  <td>{r.city}</td>
                  {options.map((o, idx) => (
                    <td key={o.id} className="text-blue-600 font-semibold">{(r.values || [])[idx] || ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-center text-xs italic text-muted-foreground pt-3 border-t">
        This quotation has been prepared by {AGENCY.name}. For queries, contact {AGENCY.email}
      </div>
    </div>
  );
}

// ============================================================================
// "Modern" preview — same AGENCY letterhead and navy/gold brand colors as the
// classic layout above, same OFItinerary data, different surface treatment:
// white bordered/rounded cards instead of solid navy banners and dense
// tables. Mirrored in the .docx export by itinerary-docx-modern.ts (docx has
// no real border-radius, so that side approximates "card" with thin all-
// round borders instead).
// ============================================================================

const DAY_ITEM_ICON: Record<OFDayItemType, typeof Circle> = {
  transfer: ArrowRightLeft,
  checkin: BedDouble,
  attraction: Landmark,
  explore: Compass,
  plain: Circle,
  optional: PlusCircle,
  meals: Utensils,
  flight: Plane,
  note: Info,
};

const DAY_ITEM_ACCENT: Record<OFDayItemType, string> = {
  transfer: '#1b3a63',
  checkin: '#4a86c8',
  attraction: '#1b3a63',
  explore: '#1b3a63',
  plain: '#94a3b8',
  optional: '#c8862a',
  meals: '#c8862a',
  flight: '#4a86c8',
  note: '#94a3b8',
};

// A consistent icon-chip + gradient-fade rule in front of every section
// label, instead of plain uppercase text — the same visual beat repeated
// section to section is what reads as "considered" rather than a flat list.
function OfmSectionHeading({ icon: Icon, color = '#1b3a63', children }: { icon: typeof Circle; color?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span
        className="flex-shrink-0 rounded-md flex items-center justify-center"
        style={{ width: 24, height: 24, background: `${color}1f`, color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="font-bold text-xs uppercase tracking-wide" style={{ color }}>
        {children}
      </span>
      <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}33, transparent)` }} />
    </div>
  );
}

function OtherFormatPreviewModern({ data }: { data: OFItinerary }) {
  const destList = data.meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const options = data.hotelOptions;
  const hasCost = options.some((o) => o.perPerson || o.total);
  const money = (v: string) => formatOfMoney(v, data.currency);

  return (
    <div className="ofm bg-white text-[#222] rounded-lg shadow-sm border overflow-hidden text-sm">
      <style jsx>{`
        .ofm h1, .ofm h2, .ofm h3 { font-family: Georgia, 'Times New Roman', serif; }
        .ofm-h { color: #1b3a63; }
        .ofm-body { padding: 24px; display: flex; flex-direction: column; gap: 24px; }
        .ofm-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
        .ofm-chip { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .ofm-day-card { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
        .ofm-day-head { background: linear-gradient(135deg, #1b3a63, #2b5590); padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
        .ofm-day-badge { width: 32px; height: 32px; border-radius: 999px; background: #fff; color: #1b3a63; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
        .ofm-day-body { padding: 10px 12px; background: #fff; }
        .ofm-item-row:nth-child(even) { background: #f8fafc; border-radius: 6px; }
        .ofm-item-icon { width: 26px; height: 26px; border-radius: 999px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ofm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .ofm-table th { text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }
        .ofm-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
        .ofm-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .of-letterhead { display: flex; align-items: center; gap: 14px; padding: 18px 24px; background: radial-gradient(circle at top left, rgba(27,58,99,0.06), transparent 65%); border-bottom: 3px solid #c8862a; }
        .of-letterhead-divider { width: 3px; align-self: stretch; background: #1b3a63; border-radius: 2px; }
        .of-letterhead-name { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 30px; color: #1b3a63; line-height: 1.15; }
        .of-letterhead-addr { font-weight: 700; font-size: 12px; color: #333; margin-top: 2px; }
        .of-letterhead-contact { font-size: 11px; margin-top: 2px; }
        .of-letterhead-contact a { color: #4a86c8; font-weight: 700; text-decoration: underline; }
      `}</style>

      {/* Same letterhead as the classic layout — brand identity stays fixed
          across both templates. A soft navy radial wash behind it (and the
          gold top-to-bottom accent bar below) is what separates "modern"
          from a flat white page without touching the brand colors. */}
      <div className="h-1" style={{ background: 'linear-gradient(90deg, #1b3a63, #c8862a)' }} />
      <div className="of-letterhead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sky.png" alt="Sky Tours & Visa Consultant" width={72} height={72} className="flex-shrink-0" />
        <div className="of-letterhead-divider" />
        <div>
          <div className="of-letterhead-name">{AGENCY.name}</div>
          <div className="of-letterhead-addr">{AGENCY.address}</div>
          <div className="of-letterhead-contact">
            <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>
            {AGENCY.phones.map((ph) => (
              <span key={ph}> &nbsp;|&nbsp; <span className="font-semibold">{ph}</span></span>
            ))}
          </div>
        </div>
      </div>

      <div className="ofm-body">
        {/* Title card — radial tint + a blue top/bottom frame (matches the
            PDF export's title block) gives it a "hero" feel instead of
            reading as just another card. */}
        <div
          className="ofm-card text-center"
          style={{
            background: 'radial-gradient(circle at top, rgba(27,58,99,0.06), transparent 70%)',
            borderTop: '3px solid #4a86c8',
            borderBottom: '3px solid #4a86c8',
          }}
        >
          <h1 className="ofm-h text-xl font-bold">{data.meta.title || 'Untitled Trip'}</h1>
          {destList.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              {destList.map((d) => (
                <span key={d} className="ofm-chip" style={{ background: '#eaf0f8', color: '#1b3a63' }}>{d}</span>
              ))}
            </div>
          )}
          {data.meta.tagline && <div className="text-xs italic text-muted-foreground mt-2">{data.meta.tagline}</div>}
          <div className="text-xs text-muted-foreground mt-2">
            {[data.meta.guestName, data.meta.dateRangeShort, data.meta.duration, data.meta.referenceCode && `Ref ${data.meta.referenceCode}`]
              .filter(Boolean)
              .join('  |  ')}
          </div>
        </div>

        {data.tripSummary.length > 0 && (
          <div className="ofm-card">
            <OfmSectionHeading icon={ClipboardList}>Trip Summary</OfmSectionHeading>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {data.tripSummary.map((r) => (
                <div key={r.id} className="flex justify-between gap-2 text-xs py-0.5 border-b border-dashed border-slate-100">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={r.emphasis ? 'font-bold' : 'font-medium'} style={r.emphasis ? { color: '#c8862a' } : undefined}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {options.some((o) => o.hotels.length > 0) && (
          <div>
            <OfmSectionHeading icon={Hotel}>Hotel Accommodation</OfmSectionHeading>
            {/* Side-by-side option cards — pricing lives only in Package Cost
                Comparison below, not repeated here. Alternating accent colors
                give each option a distinct identity at a glance. */}
            <div className="flex flex-wrap gap-3">
              {options.map(
                (opt, i) =>
                  opt.hotels.length > 0 && (
                    <div
                      key={opt.id}
                      className="ofm-card flex-1 min-w-[220px]"
                      style={{ borderTop: `3px solid ${i % 2 === 0 ? '#1b3a63' : '#4a86c8'}` }}
                    >
                      <div className="ofm-chip mb-2" style={{ background: i % 2 === 0 ? '#1b3a63' : '#4a86c8', color: '#fff' }}>
                        {opt.label.toUpperCase()}
                      </div>
                      <ul className="space-y-2">
                        {opt.hotels.map((h) => (
                          <li key={h.id} className="text-xs">
                            <div className="font-semibold flex items-center gap-1">
                              {h.hotel}
                              <span style={{ color: '#c8862a' }}>{'★'.repeat(h.stars)}</span>
                            </div>
                            <div className="text-muted-foreground">
                              {[h.city, h.room, h.nights ? `${h.nights}N` : ''].filter(Boolean).join(' · ')}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
              )}
            </div>
          </div>
        )}

        {data.flights.length > 0 && (
          <div className="ofm-card">
            <OfmSectionHeading icon={Plane} color="#4a86c8">Flights</OfmSectionHeading>
            <table className="ofm-table">
              <thead>
                <tr><th>Airline</th><th>Flight No.</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>Class</th><th>Baggage</th></tr>
              </thead>
              <tbody>
                {data.flights.map((f) => (
                  <tr key={f.id}>
                    <td className="font-semibold">{f.airline}</td>
                    <td>{f.flightNo}</td>
                    <td>{f.from}</td>
                    <td>{f.to}</td>
                    <td>{f.departure}</td>
                    <td>{f.arrival}</td>
                    <td>{f.travelClass}</td>
                    <td className="text-muted-foreground">{f.baggage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.tours.length > 0 && (
          <div className="ofm-card">
            <OfmSectionHeading icon={MapPinned} color="#c8862a">Tours &amp; Transfers</OfmSectionHeading>
            <table className="ofm-table">
              <thead><tr><th>Tour / Transfer</th><th>Basis</th><th>Details</th></tr></thead>
              <tbody>
                {data.tours.map((t) => (
                  <tr key={t.id}><td>{t.tour}</td><td className="font-semibold">{t.basis}</td><td className="text-muted-foreground">{t.details}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.days.length > 0 && (
          <div>
            <OfmSectionHeading icon={CalendarRange}>Day-Wise Itinerary</OfmSectionHeading>
            {data.days.map((day) => (
              <div key={day.id} className="ofm-day-card">
                <div className="ofm-day-head">
                  <span className="ofm-day-badge">{day.num || '–'}</span>
                  <div>
                    <div className="font-bold text-sm text-white">{day.title}</div>
                    <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      {[day.date, day.weekday, day.place].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="ofm-day-body space-y-0.5">
                  {day.items.map((item) => {
                    const Icon = DAY_ITEM_ICON[item.type];
                    const accent = DAY_ITEM_ACCENT[item.type];
                    return (
                      <div key={item.id} className="ofm-item-row flex items-start gap-2 px-1.5 py-1">
                        <span className="ofm-item-icon" style={{ background: `${accent}1a`, color: accent }}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="text-xs pt-0.5">
                          {item.label && <span className="font-semibold">{item.label} </span>}
                          <span className="text-muted-foreground">{item.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="ofm-card" style={{ borderTop: '3px solid #2f6b3a', background: 'linear-gradient(180deg, rgba(47,107,58,0.04), transparent 40%)' }}>
              <OfmSectionHeading icon={Check} color="#2f6b3a">Inclusions</OfmSectionHeading>
              <ul className="text-xs space-y-1">
                {data.inclusions.map((it, i) => <li key={i} className="flex gap-1.5"><Check className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: '#2f6b3a' }} />{it}</li>)}
              </ul>
            </div>
            <div className="ofm-card" style={{ borderTop: '3px solid #a33a2e', background: 'linear-gradient(180deg, rgba(163,58,46,0.04), transparent 40%)' }}>
              <OfmSectionHeading icon={X} color="#a33a2e">Exclusions</OfmSectionHeading>
              <ul className="text-xs space-y-1">
                {data.exclusions.map((it, i) => <li key={i} className="flex gap-1.5"><X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: '#a33a2e' }} />{it}</li>)}
              </ul>
            </div>
          </div>
        )}

        {data.notes.length > 0 && (
          <div className="ofm-card" style={{ background: 'linear-gradient(180deg, rgba(200,134,42,0.05), transparent 45%)' }}>
            <OfmSectionHeading icon={StickyNote} color="#c8862a">Important Notes</OfmSectionHeading>
            <div className="space-y-2">
              {data.notes.map((n) => (
                <div key={n.id} className="flex gap-2 text-xs">
                  <span className="flex-shrink-0 font-semibold whitespace-nowrap" style={{ color: '#1b3a63' }}>{n.label}:</span>
                  <span className="text-muted-foreground pt-0.5">{n.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasCost && (
          <div className="ofm-card">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="flex-shrink-0 rounded-md flex items-center justify-center"
                style={{ width: 24, height: 24, background: '#c8862a1f', color: '#c8862a' }}
              >
                <Wallet className="h-3.5 w-3.5" />
              </span>
              <div>
                <div className="font-bold text-sm ofm-h">{data.costComparison.componentLabel}</div>
                {data.costComparison.componentSub && (
                  <div className="text-[11px] italic text-muted-foreground mt-0.5">{data.costComparison.componentSub}</div>
                )}
              </div>
            </div>
            {/* Total is the headline figure here — it's what the client actually
                pays — so it gets its own highlighted band and the larger type;
                Per Person is supporting detail above it, not equal-weight. */}
            <div className="flex flex-wrap gap-3">
              {options.map((o) => (
                <div key={o.id} className="flex-1 min-w-[160px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                  <div className="px-3 py-2 text-center text-xs font-bold ofm-h" style={{ background: '#eaf0f8' }}>
                    {o.label}
                  </div>
                  {o.perPerson && (
                    <div className="px-3 py-2 text-center border-b border-dashed border-slate-200">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Per Person</div>
                      <div className="text-base font-semibold mt-0.5">{money(o.perPerson)}</div>
                    </div>
                  )}
                  <div className="px-3 py-3 text-center" style={{ background: 'linear-gradient(180deg, #fdf5e0, #fbecc8)' }}>
                    <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: '#c8862a' }}>Total Package Cost</div>
                    <div className="text-2xl font-extrabold mt-0.5 tracking-tight" style={{ color: '#c8862a' }}>{money(o.total)}</div>
                  </div>
                </div>
              ))}
            </div>
            {data.costComparison.footnote && <p className="text-xs italic text-muted-foreground mt-3">{data.costComparison.footnote}</p>}
          </div>
        )}

        {data.hotelDifferences.length > 0 && (
          <div className="ofm-card">
            <OfmSectionHeading icon={Building2} color="#4a86c8">Hotel Differences Between Options</OfmSectionHeading>
            <table className="ofm-table">
              <thead>
                <tr>
                  <th>City</th>
                  {options.map((o) => <th key={o.id}>{o.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.hotelDifferences.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.city}</td>
                    {options.map((o, idx) => (
                      <td key={o.id} className="font-semibold" style={{ color: '#4a86c8' }}>{(r.values || [])[idx] || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-center text-xs italic text-muted-foreground pt-3 border-t">
          This quotation has been prepared by {AGENCY.name}. For queries, contact {AGENCY.email}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// "Branded" preview — the vibrant magazine-style layout (diagonal navy/orange
// accents, icon-badge fact grids, a connected day-timeline, image-panel
// hotel/pricing cards). Mirrors the .docx export's color direction
// (itinerary-docx-branded.ts) but is its own, much more visual, layout — the
// .docx can't do diagonal clips or full-bleed photo panels, so that export
// stays the simpler card/table version.
//
// No photo data exists on OFItinerary yet (see PhotoBlock below) — every
// place the reference mockup shows a real photograph is a navy/blue
// gradient panel with a faint image glyph instead, not a fabricated image.
// ============================================================================
const BRAND_NAVY = '#13305c';
const BRAND_NAVY_DEEP = '#0b2347';
const BRAND_BLUE_LIGHT = '#2f6fb3';
const BRAND_GOLD = '#c8862a';

// Stands in for a real photograph everywhere the mockup has one (hotel
// rooms, destination shots, the cover collage) — a real uploaded photo when
// `src` is set (see ImageUploadButton), otherwise a diagonal navy→blue
// gradient panel with a faint image glyph.
function PhotoBlock({ label, className = '', src }: { label?: string; className?: string; src?: string }) {
  if (src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label || ''} className="w-full h-full object-cover" />
        {label && (
          <span
            className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white tracking-wide uppercase"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
          >
            {label}
          </span>
        )}
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DEEP} 55%, ${BRAND_BLUE_LIGHT} 150%)` }}
    >
      <ImageIcon className="h-6 w-6 text-white/30" />
      {label && (
        <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white/70 tracking-wide uppercase">{label}</span>
      )}
    </div>
  );
}

const TRIP_SUMMARY_ICON_RULES: { test: RegExp; icon: typeof Circle }[] = [
  { test: /destination/i, icon: MapPin },
  { test: /date/i, icon: CalendarDays },
  { test: /duration|night|day/i, icon: Clock },
  { test: /passenger|guest|pax|adult/i, icon: Users },
  { test: /hotel|star|category/i, icon: Star },
  { test: /meal/i, icon: Utensils },
  { test: /group/i, icon: Users },
  { test: /status|booking/i, icon: ClipboardCheck },
  { test: /reference|ref\b/i, icon: Hash },
];
function iconForSummaryLabel(label: string): typeof Circle {
  return TRIP_SUMMARY_ICON_RULES.find((r) => r.test.test(label))?.icon ?? Info;
}

function OtherFormatPreviewBranded({ data }: { data: OFItinerary }) {
  const destList = data.meta.destinations.split(',').map((d) => d.trim()).filter(Boolean);
  const options = data.hotelOptions;
  const hasCost = options.some((o) => o.perPerson || o.total);
  const money = (v: string) => formatOfMoney(v, data.currency);

  return (
    <div className="ofb bg-white text-[#222] rounded-lg shadow-sm border overflow-hidden text-sm">
      {/* Colors below are literal hex values, not `${}` JS interpolation —
          Classic and Modern's <style jsx> blocks only ever use static CSS,
          and an interpolated styled-jsx template here previously hung both
          the Turbopack dev server and the webpack production build
          mid-compile for this page specifically. Keep any future color
          changes here hardcoded, not interpolated. Navy/blue (#13305c,
          #0b2347, #2f6fb3) is this template's base theme; gold (#c8862a,
          matching Classic/Modern) is reserved for highlight accents only. */}
      <style jsx>{`
        .ofb h1, .ofb h2, .ofb h3 { font-family: Georgia, 'Times New Roman', serif; }
        .ofb-section { padding: 22px 24px; border-bottom: 1px solid #eef1f5; }
        .ofb-section:last-child { border-bottom: none; }
        .ofb-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
        .ofb-head-bar { width: 5px; height: 20px; border-radius: 3px; background: #c8862a; flex-shrink: 0; }
        .ofb-head-icon { width: 26px; height: 26px; border-radius: 7px; background: #13305c; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ofb-fact { border: 1px solid #e7ebf2; border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; background: #fbfcfe; }
        .ofb-fact-icon { width: 30px; height: 30px; border-radius: 8px; background: #13305c; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ofb-timeline-rail { position: absolute; left: 19px; top: 6px; bottom: 6px; width: 2px; background: repeating-linear-gradient(180deg, #c8862a 0 6px, transparent 6px 12px); }
        .ofb-day-badge { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #c8862a, #e0a848); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(200,134,42,0.35); z-index: 1; }
        .ofb-option-card { border: 1px solid #e7ebf2; border-radius: 12px; overflow: hidden; }
        .ofb-option-banner { background: #13305c; color: #fff; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; padding: 5px 10px; text-align: center; }
        .ofb-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .ofb-table th { text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #fff; background: #13305c; }
        .ofb-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
        .ofb-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .of-letterhead { display: flex; align-items: center; gap: 14px; padding: 16px 24px; border-bottom: 3px solid #c8862a; }
        .of-letterhead-divider { width: 3px; align-self: stretch; background: #13305c; border-radius: 2px; }
        .of-letterhead-name { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 26px; color: #13305c; line-height: 1.15; }
        .of-letterhead-addr { font-weight: 700; font-size: 12px; color: #333; margin-top: 2px; }
        .of-letterhead-contact { font-size: 11px; margin-top: 2px; }
        .of-letterhead-contact a { color: #c8862a; font-weight: 700; text-decoration: underline; }
      `}</style>

      {/* Same letterhead every template uses — brand identity stays fixed. */}
      <div className="of-letterhead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sky.png" alt="Sky Tours & Visa Consultant" width={64} height={64} className="flex-shrink-0" />
        <div className="of-letterhead-divider" />
        <div>
          <div className="of-letterhead-name">{AGENCY.name}</div>
          <div className="of-letterhead-addr">{AGENCY.address}</div>
          <div className="of-letterhead-contact">
            <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>
            {AGENCY.phones.map((ph) => (
              <span key={ph}> &nbsp;|&nbsp; <span className="font-semibold">{ph}</span></span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- Cover / hero ---------------- */}
      <div
        className="relative px-7 py-9 overflow-hidden"
        style={{ background: `linear-gradient(135deg, #fff 55%, ${BRAND_NAVY}10 100%)` }}
      >
        {/* Diagonal corner accent — the one geometric signature of this
            template, done with a clipped div rather than a real photo. */}
        <div
          className="absolute top-0 right-0 w-40 h-40"
          style={{
            background: `linear-gradient(135deg, ${BRAND_BLUE_LIGHT}, ${BRAND_NAVY})`,
            clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          }}
        />
        <div className="text-[10px] font-bold tracking-[0.2em]" style={{ color: BRAND_NAVY }}>
          YOUR JOURNEY &nbsp;·&nbsp; OUR EXPERTISE &nbsp;·&nbsp; MORE MEMORIES
        </div>
        <h1 className="font-extrabold leading-[0.95] mt-2" style={{ color: BRAND_NAVY, fontSize: 52, fontFamily: 'Georgia, serif' }}>
          {(data.meta.title || data.meta.country || 'Untitled Trip').toUpperCase()}
        </h1>
        {data.meta.tagline && (
          <div className="italic mt-1" style={{ color: BRAND_GOLD, fontSize: 24, fontFamily: 'Georgia, serif' }}>
            {data.meta.tagline}
          </div>
        )}
        {destList.length > 0 && (
          <div className="text-sm mt-3 font-medium" style={{ color: BRAND_NAVY }}>
            {destList.join('  |  ')}
          </div>
        )}
        {data.meta.guestName && (
          <div className="text-sm mt-2 text-muted-foreground">Prepared for {data.meta.guestName}</div>
        )}

        <div className="flex flex-wrap gap-4 mt-5">
          {data.meta.dateRangeShort && (
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: BRAND_NAVY }}>
              <CalendarDays className="h-4 w-4" style={{ color: BRAND_GOLD }} />
              {data.meta.dateRangeShort}
            </div>
          )}
          {data.meta.duration && (
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: BRAND_NAVY }}>
              <Clock className="h-4 w-4" style={{ color: BRAND_GOLD }} />
              {data.meta.duration}
            </div>
          )}
          {data.meta.referenceCode && (
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: BRAND_NAVY }}>
              <Hash className="h-4 w-4" style={{ color: BRAND_GOLD }} />
              Ref {data.meta.referenceCode}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Trip overview ---------------- */}
      {data.tripSummary.length > 0 && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-bar" />
            <h2 className="text-lg font-extrabold" style={{ color: BRAND_NAVY }}>
              Trip <span style={{ color: BRAND_GOLD }}>Overview</span>
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            {data.tripSummary.map((r) => {
              const Icon = iconForSummaryLabel(r.label);
              return (
                <div key={r.id} className="ofb-fact">
                  <span className="ofb-fact-icon"><Icon className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{r.label}</div>
                    <div className={`text-xs truncate ${r.emphasis ? 'font-bold' : 'font-semibold'}`} style={r.emphasis ? { color: BRAND_GOLD } : { color: BRAND_NAVY }}>
                      {r.value}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- Hotel accommodation ---------------- */}
      {options.some((o) => o.hotels.length > 0) && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-icon"><Hotel className="h-3.5 w-3.5" /></span>
            <h2 className="text-lg font-extrabold" style={{ color: BRAND_NAVY }}>Hotel Accommodation</h2>
          </div>
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, options.filter((o) => o.hotels.length).length)}, minmax(0,1fr))` }}>
            {options.map(
              (opt) =>
                opt.hotels.length > 0 && (
                  <div key={opt.id} className="ofb-option-card">
                    <PhotoBlock className="h-48" src={opt.image} />
                    <div className="ofb-option-banner">{opt.label.toUpperCase()}</div>
                    <div className="p-2.5 space-y-2">
                      {opt.hotels.map((h) => (
                        <div key={h.id}>
                          <div className="text-xs font-bold flex items-center gap-1" style={{ color: BRAND_NAVY }}>
                            {h.hotel}
                            <span style={{ color: BRAND_GOLD }}>{'★'.repeat(h.stars)}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {[h.city, h.room, h.nights ? `${h.nights}N` : ''].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
            )}
          </div>
        </div>
      )}

      {/* ---------------- Flights ---------------- */}
      {data.flights.length > 0 && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-icon"><Plane className="h-3.5 w-3.5" /></span>
            <h2 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: BRAND_NAVY }}>Flight Details</h2>
          </div>
          <table className="ofb-table mt-2">
            <thead>
              <tr><th>Airline</th><th>Flight</th><th>From</th><th>To</th><th>Dep.</th><th>Arr.</th><th>Class</th></tr>
            </thead>
            <tbody>
              {data.flights.map((f) => (
                <tr key={f.id}>
                  <td className="font-semibold">{f.airline}</td>
                  <td>{f.flightNo}</td>
                  <td>{f.from}</td>
                  <td>{f.to}</td>
                  <td>{f.departure}</td>
                  <td>{f.arrival}</td>
                  <td>{f.travelClass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- Tours & transfers ---------------- */}
      {data.tours.length > 0 && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-icon"><MapPinned className="h-3.5 w-3.5" /></span>
            <h2 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: BRAND_NAVY }}>Tours &amp; Transfers</h2>
          </div>
          <table className="ofb-table mt-2">
            <thead><tr><th>Tour / Transfer</th><th>Basis</th><th>Details</th></tr></thead>
            <tbody>
              {data.tours.map((t) => (
                <tr key={t.id}><td>{t.tour}</td><td className="font-semibold">{t.basis}</td><td className="text-muted-foreground">{t.details}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- Day-wise itinerary (connected timeline) ---------------- */}
      {data.days.length > 0 && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-bar" />
            <h2 className="text-lg font-extrabold" style={{ color: BRAND_NAVY }}>
              Day-Wise <span style={{ color: BRAND_GOLD }}>Itinerary</span>
            </h2>
          </div>
          <div className="relative mt-4 pl-4">
            <div className="ofb-timeline-rail" />
            <div className="space-y-5">
              {data.days.map((day) => (
                <div key={day.id} className="flex gap-3">
                  <div className="ofb-day-badge">
                    <span className="text-[8px] font-bold tracking-wide leading-none">DAY</span>
                    <span className="text-base font-extrabold leading-none">{day.num || '–'}</span>
                  </div>
                  <div className="flex-1 pt-0.5">
                    <div className="text-[11px] text-muted-foreground font-medium">
                      {[day.date, day.weekday, day.place].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-sm font-bold" style={{ color: BRAND_NAVY }}>{day.title}</div>
                    <ul className="mt-1 space-y-0.5">
                      {day.items.map((item) => (
                        <li key={item.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0" style={{ background: BRAND_GOLD }} />
                          <span>
                            {item.label && <span className="font-semibold" style={{ color: BRAND_NAVY }}>{item.label} </span>}
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Destination highlights ---------------- */}
      {destList.length > 0 && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-bar" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: BRAND_NAVY }}>Destination Highlights</h2>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {destList.map((d) => (
              <div key={d} className="rounded-xl overflow-hidden border" style={{ borderColor: '#e7ebf2' }}>
                <PhotoBlock className="h-40" src={data.destinationImages?.[d]} />
                <div className="px-2.5 py-2 text-xs font-bold" style={{ color: BRAND_NAVY }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Package pricing ---------------- */}
      {hasCost && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-icon"><Wallet className="h-3.5 w-3.5" /></span>
            <h2 className="text-lg font-extrabold" style={{ color: BRAND_NAVY }}>Package Pricing</h2>
          </div>
          {data.costComparison.componentLabel && (
            <div className="text-xs text-muted-foreground mt-1">{data.costComparison.componentLabel}</div>
          )}
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
            {options.map((opt) => (
              <div key={opt.id} className="ofb-option-card">
                <PhotoBlock className="h-20" src={opt.image} />
                <div className="ofb-option-banner">{opt.label.toUpperCase()}</div>
                <div className="p-3 text-center">
                  {opt.hotels[0] && (
                    <div className="text-[11px] font-semibold mb-1" style={{ color: BRAND_NAVY }}>{opt.hotels[0].hotel}</div>
                  )}
                  {opt.perPerson && (
                    <>
                      <div className="text-2xl font-extrabold" style={{ color: BRAND_GOLD }}>{money(opt.perPerson)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Per Person</div>
                    </>
                  )}
                  {opt.total && (
                    <div className="text-xs font-semibold mt-1.5" style={{ color: BRAND_NAVY }}>Total: {money(opt.total)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {data.costComparison.footnote && (
            <div className="mt-3 rounded-lg p-2.5 text-[11px]" style={{ background: `${BRAND_GOLD}0f`, color: BRAND_NAVY }}>
              <span className="font-bold">Note: </span>{data.costComparison.footnote}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Inclusions / Exclusions ---------------- */}
      {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
        <div className="ofb-section grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ background: '#f0f9f2', border: '1px solid #d7ecdb' }}>
            <div className="flex items-center gap-1.5 font-extrabold text-xs uppercase tracking-wide" style={{ color: '#2f6b3a' }}>
              <Check className="h-3.5 w-3.5" /> Inclusions
            </div>
            <ul className="text-xs space-y-1 mt-2">
              {data.inclusions.map((it, i) => <li key={i} className="flex gap-1.5"><Check className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: '#2f6b3a' }} />{it}</li>)}
            </ul>
          </div>
          <div className="rounded-xl p-3" style={{ background: '#fdf1ef', border: '1px solid #f3d6d0' }}>
            <div className="flex items-center gap-1.5 font-extrabold text-xs uppercase tracking-wide" style={{ color: '#a33a2e' }}>
              <X className="h-3.5 w-3.5" /> Exclusions
            </div>
            <ul className="text-xs space-y-1 mt-2">
              {data.exclusions.map((it, i) => <li key={i} className="flex gap-1.5"><X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: '#a33a2e' }} />{it}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ---------------- Important notes ---------------- */}
      {data.notes.length > 0 && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-bar" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: BRAND_NAVY }}>Important Notes</h2>
          </div>
          <ul className="space-y-1.5 mt-2">
            {data.notes.map((n) => (
              <li key={n.id} className="flex gap-2 text-xs">
                <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: BRAND_GOLD }} />
                <span><span className="font-bold" style={{ color: BRAND_NAVY }}>{n.label}: </span><span className="text-muted-foreground">{n.text}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------- Hotel differences ---------------- */}
      {data.hotelDifferences.length > 0 && (
        <div className="ofb-section">
          <div className="ofb-head">
            <span className="ofb-head-bar" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: BRAND_NAVY }}>Hotel Differences Between Options</h2>
          </div>
          <table className="ofb-table mt-2">
            <thead>
              <tr>
                <th>City</th>
                {options.map((o) => <th key={o.id}>{o.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.hotelDifferences.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.city}</td>
                  {options.map((o, idx) => (
                    <td key={o.id} className="font-semibold" style={{ color: BRAND_GOLD }}>{(r.values || [])[idx] || ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- Contact footer ---------------- */}
      <div
        className="relative px-6 py-5 text-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY}, ${BRAND_NAVY_DEEP})`, color: '#fff' }}
      >
        <div
          className="absolute bottom-0 right-0 w-24 h-24"
          style={{ background: BRAND_BLUE_LIGHT, clipPath: 'polygon(100% 100%, 0 100%, 100% 0)', opacity: 0.85 }}
        />
        <div className="italic text-sm" style={{ fontFamily: 'Georgia, serif' }}>Because every journey deserves to be extraordinary.</div>
        <div className="text-xs mt-2 flex items-center justify-center gap-1.5">
          <Globe className="h-3.5 w-3.5" /> www.skyvisa.in &nbsp;|&nbsp; {AGENCY.email} &nbsp;|&nbsp; {AGENCY.phones[0]}
        </div>
      </div>
    </div>
  );
}
