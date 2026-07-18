'use client';

// "Other Format" — a structured travel-quotation document, entirely separate
// from the Brochure tab's AI-narrative generator (itinerary-form.tsx). Two
// ways to fill it in, usable together:
//   1. Paste raw itinerary text and let AI extract the structure.
//   2. Edit every section by hand — add/remove rows freely.
// "Download as Word" calls generateOtherFormatDocx (a real .docx via the
// `docx` library, ported from build_itinerary_skytours.js) — see
// src/app/actions/itinerary-docx.ts.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Wand2, Download, Plus, Trash2 } from 'lucide-react';
import { extractOtherFormatItinerary } from '@/app/actions/itinerary-format';
import { generateOtherFormatDocx } from '@/app/actions/itinerary-docx';
import { downloadBase64File } from '@/lib/download-file';
import {
  emptyOtherFormatItinerary,
  newId,
  OF_DAY_ITEM_LABELS,
  AGENCY,
  type OFItinerary,
  type OFTripSummaryRow,
  type OFHotelOption,
  type OFHotelRow,
  type OFTourRow,
  type OFDayPlan,
  type OFDayItem,
  type OFDayItemType,
  type OFNoteItem,
  type OFHotelDifferenceRow,
} from './other-format-types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function OtherFormatPanel() {
  const [data, setData] = useState<OFItinerary>(emptyOtherFormatItinerary);
  const [rawText, setRawText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const hasContent =
    data.meta.title ||
    data.tripSummary.length ||
    data.hotelOptions.some((o) => o.hotels.length) ||
    data.tours.length ||
    data.days.length ||
    data.inclusions.length ||
    data.exclusions.length;

  const handleExtract = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const result = await extractOtherFormatItinerary(rawText);
      if ('error' in result) {
        setExtractError(result.error);
      } else {
        setData(result.data);
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await generateOtherFormatDocx(data);
      if ('error' in result) {
        setDownloadError(result.error);
      } else {
        downloadBase64File(result.base64, result.filename, DOCX_MIME);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 lg:h-[calc(100vh-10rem)]">
      <Card className="h-fit lg:h-full lg:overflow-y-auto lg:overflow-x-hidden">
        <CardHeader>
          <CardTitle>Create an Itinerary (Other Format)</CardTitle>
          <CardDescription>
            A structured travel quotation — trip summary, two hotel options, tours &amp; transfers, a
            day-by-day programme, inclusions/exclusions, notes and a cost comparison. Paste raw
            itinerary text to extract it automatically, then fill in or adjust anything by hand.
            Downloads as a real Word (.docx) document.
          </CardDescription>
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
            <Button
              type="button"
              onClick={handleExtract}
              disabled={extracting || rawText.trim().length < 20}
              className="w-full mt-2"
              variant="outline"
            >
              {extracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extracting…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Extract with AI
                </>
              )}
            </Button>
            {extractError && (
              <Alert variant="destructive" className="mt-2">
                <AlertTitle>Extraction failed</AlertTitle>
                <AlertDescription>{extractError}</AlertDescription>
              </Alert>
            )}
          </div>

          <Accordion type="multiple" defaultValue={['meta']} className="space-y-2">
            <AccordionItem value="meta" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Trip Details</AccordionTrigger>
              <AccordionContent>
                <MetaFields data={data} onChange={(meta) => setData((d) => ({ ...d, meta }))} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="summary" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">Trip Summary ({data.tripSummary.length})</AccordionTrigger>
              <AccordionContent>
                <TripSummaryEditor rows={data.tripSummary} onChange={(rows) => setData((d) => ({ ...d, tripSummary: rows }))} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="hotels1" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">
                Hotel Option 1 ({data.hotelOptions[0].hotels.length} hotels)
              </AccordionTrigger>
              <AccordionContent>
                <HotelOptionEditor
                  option={data.hotelOptions[0]}
                  onChange={(opt) => setData((d) => ({ ...d, hotelOptions: [opt, d.hotelOptions[1]] }))}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="hotels2" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold">
                Hotel Option 2 ({data.hotelOptions[1].hotels.length} hotels)
              </AccordionTrigger>
              <AccordionContent>
                <HotelOptionEditor
                  option={data.hotelOptions[1]}
                  onChange={(opt) => setData((d) => ({ ...d, hotelOptions: [d.hotelOptions[0], opt] }))}
                />
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
                  onChange={(hotelDifferences) => setData((d) => ({ ...d, hotelDifferences }))}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button type="button" onClick={handleDownload} disabled={downloading || !hasContent} className="w-full">
            {downloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download as Word (.docx)
              </>
            )}
          </Button>
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
        ) : (
          <OtherFormatPreview data={data} />
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

// ---------------------------------------------------------------- Meta
function MetaFields({ data, onChange }: { data: OFItinerary; onChange: (meta: OFItinerary['meta']) => void }) {
  const meta = data.meta;
  const set = (patch: Partial<OFItinerary['meta']>) => onChange({ ...meta, ...patch });
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
function HotelOptionEditor({ option, onChange }: { option: OFHotelOption; onChange: (option: OFHotelOption) => void }) {
  const set = (patch: Partial<OFHotelOption>) => onChange({ ...option, ...patch });
  const updateHotel = (id: string, patch: Partial<OFHotelRow>) =>
    set({ hotels: option.hotels.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  const removeHotel = (id: string) => set({ hotels: option.hotels.filter((h) => h.id !== id) });
  const addHotel = () =>
    set({ hotels: [...option.hotels, { id: newId(), city: '', hotel: '', stars: 4, room: '', checkin: '', checkout: '', nights: 1 }] });

  return (
    <div className="pb-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          {fieldLabel('Label')}
          <Input value={option.label} onChange={(e) => set({ label: e.target.value })} className="h-8 text-sm" />
        </div>
        <div>
          {fieldLabel('Per Person')}
          <Input value={option.perPerson} onChange={(e) => set({ perPerson: e.target.value })} placeholder="USD 767" className="h-8 text-sm" />
        </div>
        <div>
          {fieldLabel('Total')}
          <Input value={option.total} onChange={(e) => set({ total: e.target.value })} placeholder="USD 1,534" className="h-8 text-sm" />
        </div>
      </div>

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
        Per-person and total prices come from the two Hotel Option sections above — edit them there.
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
        <Textarea value={cc.footnote} onChange={(e) => set({ footnote: e.target.value })} placeholder="* Cost is in USD, per person × 2. Excludes international airfare, visa..." className="min-h-[60px] text-sm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Hotel differences
function HotelDifferencesEditor({ rows, onChange }: { rows: OFHotelDifferenceRow[]; onChange: (rows: OFHotelDifferenceRow[]) => void }) {
  const update = (id: string, patch: Partial<OFHotelDifferenceRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () => onChange([...rows, { id: newId(), city: '', opt1: '', opt2: '' }]);
  return (
    <div className="pb-3">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 mb-2">
          <Input value={r.city} onChange={(e) => update(r.id, { city: e.target.value })} placeholder="City" className="h-8 text-sm w-1/4" />
          <Input value={r.opt1} onChange={(e) => update(r.id, { opt1: e.target.value })} placeholder="Option 1 hotel" className="h-8 text-sm flex-1" />
          <Input value={r.opt2} onChange={(e) => update(r.id, { opt2: e.target.value })} placeholder="Option 2 hotel" className="h-8 text-sm flex-1" />
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
  const [opt1, opt2] = data.hotelOptions;
  const hasCost = opt1.perPerson || opt2.perPerson || opt1.total || opt2.total;

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

      {[opt1, opt2].some((o) => o.hotels.length > 0) && (
        <div>
          <div className="of-h font-bold text-xs uppercase tracking-wide mb-2">Hotel Accommodation</div>
          {[opt1, opt2].map(
            (opt) =>
              opt.hotels.length > 0 && (
                <div key={opt.id} className="mb-3">
                  <div className="of-banner mb-1">
                    {opt.label.toUpperCase()} {opt.perPerson && `| ${opt.perPerson} pp`} {opt.total && `| ${opt.total} Total`}
                  </div>
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
                <th>Component</th>
                <th>{opt1.label} (pp)</th>
                <th>{opt2.label} (pp)</th>
                <th>{opt1.label} Total</th>
                <th>{opt2.label} Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="font-semibold">{data.costComparison.componentLabel}</div>
                  <div className="text-xs italic text-muted-foreground">{data.costComparison.componentSub}</div>
                </td>
                <td>{opt1.perPerson}</td>
                <td>{opt2.perPerson}</td>
                <td className="of-gold font-bold">{opt1.total}</td>
                <td className="of-gold font-bold">{opt2.total}</td>
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
            <thead><tr><th>City</th><th>{opt1.label}</th><th>{opt2.label}</th></tr></thead>
            <tbody>
              {data.hotelDifferences.map((r) => (
                <tr key={r.id}><td>{r.city}</td><td className="text-blue-600 font-semibold">{r.opt1}</td><td className="text-blue-600 font-semibold">{r.opt2}</td></tr>
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
