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
import type { Campaign, EmailLog } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';

const EMAIL_LOGS_LIMIT = 500;

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

export function AnalyticsTab() {
  const firestore = useFirestore();

  const campaignsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'campaigns'), orderBy('createdAt', 'desc'));
  }, [firestore]);
  const { data: campaigns, isLoading: campaignsLoading } = useCollection<Campaign>(campaignsQuery);

  const logsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'email_logs'), orderBy('createdAt', 'desc'), limit(EMAIL_LOGS_LIMIT));
  }, [firestore]);
  const { data: logs, isLoading: logsLoading } = useCollection<EmailLog>(logsQuery);

  const stats = useMemo(() => {
    const campaignSent = (campaigns || []).reduce((sum, c) => sum + (c.sentCount || 0), 0);
    const campaignFailed = (campaigns || []).reduce((sum, c) => sum + (c.failedCount || 0), 0);
    const campaignPending = (campaigns || [])
      .filter((c) => c.status === 'running' || c.status === 'paused')
      .reduce((sum, c) => sum + Math.max(0, (c.totalRecipients || 0) - (c.sentCount || 0) - (c.failedCount || 0)), 0);

    const logSent = (logs || []).filter((l) => l.status === 'sent').length;
    const logFailed = (logs || []).filter((l) => l.status === 'failed').length;

    const totalSent = campaignSent + logSent;
    const totalFailed = campaignFailed + logFailed;
    const successRate = totalSent + totalFailed > 0 ? (totalSent / (totalSent + totalFailed)) * 100 : null;

    const usageByMailbox = new Map<string, { email: string; sent: number; failed: number }>();
    for (const log of logs || []) {
      const entry = usageByMailbox.get(log.mailboxId) || { email: log.mailboxEmail, sent: 0, failed: 0 };
      if (log.status === 'sent') entry.sent += 1;
      else entry.failed += 1;
      usageByMailbox.set(log.mailboxId, entry);
    }

    return {
      totalSent,
      totalFailed,
      pending: campaignPending,
      successRate,
      usageByMailbox: Array.from(usageByMailbox.values()).sort((a, b) => b.sent + b.failed - (a.sent + a.failed)),
    };
  }, [campaigns, logs]);

  const isLoading = campaignsLoading || logsLoading;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <StatCard label="Total Sent" value={String(stats.totalSent)} />
            <StatCard label="Total Failed" value={String(stats.totalFailed)} />
            <StatCard label="Pending (Campaigns)" value={String(stats.pending)} />
            <StatCard label="Success Rate" value={stats.successRate === null ? '—' : `${stats.successRate.toFixed(1)}%`} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage by Mailbox</CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && stats.usageByMailbox.length === 0 && (
            <p className="text-sm text-muted-foreground">No transactional sends yet (last {EMAIL_LOGS_LIMIT} logs).</p>
          )}
          {stats.usageByMailbox.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.usageByMailbox.map((m) => (
                  <TableRow key={m.email}>
                    <TableCell className="font-medium">{m.email}</TableCell>
                    <TableCell>{m.sent}</TableCell>
                    <TableCell>{m.failed}</TableCell>
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
                <TableHead>Subject</TableHead>
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
                (logs || []).slice(0, 50).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{l.to.join(', ')}</TableCell>
                    <TableCell className="text-sm truncate max-w-xs">{l.subject}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={l.status === 'sent' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString() : ''}
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && (logs || []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No activity yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
