import { PageHeader } from '@/components/common/page-header';
import { ItineraryForm } from './itinerary-form';
import { Suspense } from 'react';

export default function ItineraryBuilderPage() {
  return (
    <>
      <PageHeader
        title="AI Itinerary Builder"
        description="Create customized travel itineraries with flights, hotels, and activities using AI."
      />
      <Suspense fallback={<div>Loading form...</div>}>
        <ItineraryForm />
      </Suspense>
    </>
  );
}
