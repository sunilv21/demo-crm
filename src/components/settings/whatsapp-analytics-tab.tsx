'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { WhatsAppAccount, WhatsAppCampaign, WhatsAppMessage } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';

// Mirrors src/components/settings/analytics-tab.tsx (email): campaign
// totals come from the whatsapp_campaigns docs themselves (sentCount/
// failedCount), while Usage/Recent Activity come from whatsapp_messages —
// which already includes both 1:1 chat replies AND campaign sends (every
// send path writes there), so summing campaign counters on top of it would
// double-count. Keeping the two sections separate, like email does with
// campaigns vs. email_logs, avoids that.
const MESSAGES_LIMIT = 500;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function WhatsAppAnalyticsTab() {
  const firestore = useFirestore();

  const campaignsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'whatsapp_campaigns'), orderBy('createdAt', 'desc'));
  }, [firestore]);
  const { data: campaigns, isLoading: campaignsLoading } = useCollection<WhatsAppCampaign>(campaignsQuery);

  const messagesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'whatsapp_messages'),
      where('direction', '==', 'outbound'),
      orderBy('timestamp', 'desc'),
      limit(MESSAGES_LIMIT)
    );
  }, [firestore]);
  const { data: messages, isLoading: messagesLoading } = useCollection<WhatsAppMessage>(messagesQuery);

  const accountsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'whatsapp_accounts');
  }, [firestore]);
  const { data: accounts } = useCollection<WhatsAppAccount>(accountsQuery);

  const accountLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts || []) map.set(a.id, `${a.label} (${a.phoneNumber || '—'})`);
    return map;
  }, [accounts]);

  const stats = useMemo(() => {
    const campaignSent = (campaigns || []).reduce((sum, c) => sum + (c.sentCount || 0), 0);
    const campaignFailed = (campaigns || []).reduce((sum, c) => sum + (c.failedCount || 0), 0);
    const campaignPending = (campaigns || [])
      .filter((c) => c.status === 'running' || c.status === 'paused')
      .reduce((sum, c) => sum + Math.max(0, (c.totalRecipients || 0) - (c.sentCount || 0) - (c.failedCount || 0)), 0);

    const successRate =
      campaignSent + campaignFailed > 0 ? (campaignSent / (campaignSent + campaignFailed)) * 100 : null;

    const usageByAccount = new Map<string, { label: string; sent: number }>();
    for (const m of messages || []) {
      const entry = usageByAccount.get(m.accountId) || { label: accountLabelById.get(m.accountId) || m.accountId, sent: 0 };
      entry.sent += 1;
      usageByAccount.set(m.accountId, entry);
    }

    return {
      campaignSent,
      campaignFailed,
      campaignPending,
      successRate,
      usageByAccount: Array.from(usageByAccount.values()).sort((a, b) => b.sent - a.sent),
    };
  }, [campaigns, messages, accountLabelById]);

  const isLoading = campaignsLoading || messagesLoading;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <StatCard label="Campaign Sent" value={String(stats.campaignSent)} />
            <StatCard label="Campaign Failed" value={String(stats.campaignFailed)} />
            <StatCard label="Campaign Pending" value={String(stats.campaignPending)} />
            <StatCard label="Campaign Success Rate" value={stats.successRate === null ? '—' : `${stats.successRate.toFixed(1)}%`} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage by WhatsApp Number</CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && stats.usageByAccount.length === 0 && (
            <p className="text-sm text-muted-foreground">No outbound messages yet (last {MESSAGES_LIMIT}).</p>
          )}
          {stats.usageByAccount.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.usageByAccount.map((a) => (
                  <TableRow key={a.label}>
                    <TableCell className="font-medium">{a.label}</TableCell>
                    <TableCell>{a.sent}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))}
              {!isLoading &&
                (messages || []).slice(0, 50).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{m.contactName || m.contactPhone || m.chatId.split('@')[0]}</TableCell>
                    <TableCell className="text-sm truncate max-w-xs">{m.body}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={m.status === 'failed' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-green-100 text-green-800 border-green-200'}
                      >
                        {m.status || 'sent'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString() : ''}
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && (messages || []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No activity yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
