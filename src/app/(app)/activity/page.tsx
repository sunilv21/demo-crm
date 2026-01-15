'use client';

import { PageHeader } from '@/components/common/page-header';
import { CustomerLogs } from '@/components/customer-logs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FollowUpList } from '@/components/activity/follow-up-list';
import { Activity, Bell } from 'lucide-react';

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity & Tasks"
        description="A live feed of all customer interactions and your pending follow-ups."
      />
      <Tabs defaultValue="feed">
        <TabsList className="mb-4">
          <TabsTrigger value="feed">
             <Activity className="mr-2 h-4 w-4" />
            Activity Feed
          </TabsTrigger>
          <TabsTrigger value="follow-ups">
            <Bell className="mr-2 h-4 w-4" />
            Follow-ups
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feed">
           <CustomerLogs />
        </TabsContent>
        <TabsContent value="follow-ups">
            <FollowUpList />
        </TabsContent>
      </Tabs>
    </>
  );
}
