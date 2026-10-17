import { PageHeader } from '@/components/common/page-header';
import { ItineraryForm } from './itinerary-form';
import { Suspense } from 'react';

// The Other Format tab's NVIDIA extraction model (meta/llama-3.2-11b-vision-
// instruct) routinely takes 40-60s+ per section — well past most hosts'
// default serverless function timeout. Route segment config (not the 'use
// server' action file itself — that only allows async function exports) is
// where Next.js reads maxDuration for Server Actions invoked from this page,
// so this is what actually extends the platform-side limit on Vercel.
export const maxDuration = 120;

export default function ItineraryBuilderPage() {
  return (
    <>
      <div className="print-hide print:hidden">
        <PageHeader
          title="Itinerary Builder"
          description="Generate a print-ready A4 travel brochure — cover, day-by-day programme, inclusions and policies."
        />
      </div>
      <Suspense fallback={<div>Loading form...</div>}>
        <ItineraryForm />
      </Suspense>
    </>
  );
}
