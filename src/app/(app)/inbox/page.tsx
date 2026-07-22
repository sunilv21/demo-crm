'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { useAppUser } from '@/firebase';
import { EmailAccountsTab } from '@/components/settings/email-accounts-tab';
import { InboxTab } from '@/components/settings/inbox-tab';
import { SentTab } from '@/components/settings/sent-tab';
import { TemplatesTab } from '@/components/settings/templates-tab';
import { CampaignsTab } from '@/components/settings/campaigns-tab';
import { AnalyticsTab } from '@/components/settings/analytics-tab';
import { useNotifications } from '@/components/notifications/notification-provider';
import { NotificationDot } from '@/components/notifications/notification-dot';

// Top-level daily-use Inbox. Reuses the exact same components (and Firestore
// collections) as /settings — that page stays admin-only for mailbox setup,
// this one is where admin/manager/agent actually read and send mail day to
// day. The Accounts tab's content (not the route) stays admin-gated.
export default function InboxPage() {
  const { isAdmin } = useAppUser();
  const { unseenInbox, unseenCampaigns, markInboxSeen, markCampaignsSeen } = useNotifications();
  const [activeTab, setActiveTab] = useState('inbox');

  // Clear the unseen flag for whichever tab is currently active — on mount
  // (default tab is "inbox") and on every switch.
  useEffect(() => {
    if (activeTab === 'inbox') markInboxSeen();
    if (activeTab === 'campaigns') markCampaignsSeen();
  }, [activeTab, markInboxSeen, markCampaignsSeen]);

  return (
    <>
      <PageHeader title="Inbox" description="Read and send email connected to the CRM." />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1.5">
            Inbox
            {unseenInbox && activeTab !== 'inbox' && <NotificationDot />}
          </TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5">
            Campaigns
            {unseenCampaigns && activeTab !== 'campaigns' && <NotificationDot />}
          </TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4">
          <InboxTab />
        </TabsContent>
        <TabsContent value="sent" className="mt-4">
          <SentTab />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <AnalyticsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          {isAdmin ? (
            <EmailAccountsTab />
          ) : (
            <div className="flex items-center justify-center py-12">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />Restricted</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Mailbox configuration is admin-only.
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
