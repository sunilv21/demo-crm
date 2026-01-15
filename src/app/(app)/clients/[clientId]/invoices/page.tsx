'use client';

import { PageHeader } from '@/components/common/page-header';

export default function ClientInvoicesPage() {
  return (
    <>
      <PageHeader title="Client Invoices" description="Manage all invoices for this client." />
      <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
        <p>Invoices for this client will be displayed here.</p>
      </div>
    </>
  );
}
