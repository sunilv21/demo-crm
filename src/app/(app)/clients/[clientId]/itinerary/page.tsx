'use client';

import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Map } from 'lucide-react';
import Link from 'next/link';

export default function ClientItineraryPage() {
  return (
    <>
      <PageHeader title="Client Itinerary" description="View and manage the itinerary for this client." />
      <div className="bg-card border rounded-lg p-8 flex flex-col items-center gap-4 text-center text-muted-foreground">
        <Map className="h-10 w-10" />
        <p>Build a custom day-by-day itinerary in the Itinerary Builder.</p>
        <Button asChild>
          <Link href="/itinerary-builder">
            <Map className="mr-2 h-4 w-4" />
            Open Itinerary Builder
          </Link>
        </Button>
      </div>
    </>
  );
}
