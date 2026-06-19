import { PageHeader } from '@/components/common/page-header';
import { ItineraryForm } from './itinerary-form';
import { Suspense } from 'react';

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
