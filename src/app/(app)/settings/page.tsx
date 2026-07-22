'use client';

import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmailAccountsTab } from '@/components/settings/email-accounts-tab';
import { InboxTab } from '@/components/settings/inbox-tab';
import { TemplatesTab } from '@/components/settings/templates-tab';
import { AuditLogTab } from '@/components/settings/audit-log-tab';

// Extensible admin-only settings area. "Email Accounts" + "Inbox" +
// "Templates" + "Audit Log" today; future integrations (SMS, payment
// gateway, ...) are additional TabsTrigger/TabsContent pairs alongside
// these. The top-level "Inbox" nav item (src/app/(app)/inbox/page.tsx) is
// the daily-use surface for admin/manager/agent — this page stays the
// admin-only config + oversight home (Audit Log is admin-only, not
// duplicated onto /inbox).
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Connected mailboxes and integrations." />

      <Tabs defaultValue="email-accounts" className="mt-2">
        <TabsList>
          <TabsTrigger value="email-accounts">Email Accounts</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="audit-log">Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="email-accounts" className="mt-4">
          <EmailAccountsTab />
        </TabsContent>
        <TabsContent value="inbox" className="mt-4">
          <InboxTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="audit-log" className="mt-4">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
