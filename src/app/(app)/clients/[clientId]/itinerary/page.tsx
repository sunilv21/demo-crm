'use client';

import { PageHeader } from '@/components/common/page-header';

export default function ClientItineraryPage() {
  return (
    <>
      <PageHeader title="Client Itinerary" description="View and manage the itinerary for this client." />
      <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
        <p>The itinerary for this client will be displayed here.</p>
      </div>
    </>
  );
}
