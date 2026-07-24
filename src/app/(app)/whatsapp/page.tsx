'use client';

import { useEffect, useState } from 'react';
import { ChannelSwitcher } from '@/components/common/channel-switcher';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { useAppUser } from '@/firebase';
import { WhatsAppChatTab } from '@/components/settings/whatsapp-chat-tab';
import { WhatsAppAccountsTab } from '@/components/settings/whatsapp-accounts-tab';
import { WhatsAppCampaignsTab } from '@/components/settings/whatsapp-campaigns-tab';
import { WhatsAppAnalyticsTab } from '@/components/settings/whatsapp-analytics-tab';
import { WhatsAppTemplatesTab } from '@/components/settings/whatsapp-templates-tab';
import { useNotifications } from '@/components/notifications/notification-provider';
import { NotificationDot } from '@/components/notifications/notification-dot';

// Mirrors src/app/(app)/inbox/page.tsx's structure: a channel switcher at
// top, then this channel's own sub-tabs. Account pairing stays admin-only,
// same reasoning as the Email channel's Accounts tab.
export default function WhatsAppPage() {
  const { isAdmin } = useAppUser();
  const { unseenWhatsApp, markWhatsAppSeen } = useNotifications();
  const [activeTab, setActiveTab] = useState('chats');

  // Clear the unseen flag on mount (default tab is "chats") and whenever it
  // becomes active again — mirrors src/app/(app)/inbox/page.tsx.
  useEffect(() => {
    if (activeTab === 'chats') markWhatsAppSeen();
  }, [activeTab, markWhatsAppSeen]);

  return (
    <>
      <ChannelSwitcher active="whatsapp" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
        <TabsList>
          <TabsTrigger value="chats" className="gap-1.5">
            Chats
            {unseenWhatsApp && activeTab !== 'chats' && <NotificationDot />}
          </TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="chats" className="mt-4">
          <WhatsAppChatTab />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          <WhatsAppCampaignsTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <WhatsAppAnalyticsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <WhatsAppTemplatesTab />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          {isAdmin ? (
            <WhatsAppAccountsTab />
          ) : (
            <div className="flex items-center justify-center py-12">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />Restricted</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  WhatsApp number connections are admin-only.
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
