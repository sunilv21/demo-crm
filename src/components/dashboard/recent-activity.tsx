'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { collection, query } from 'firebase/firestore';
import { Activity, ChevronRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAppUser,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { CustomerLog } from '@/lib/types';
import { toDate } from '@/lib/attendance';

function formatLogStamp(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function RecentActivity() {
  const firestore = useFirestore();
  const { authUser, isLoading: appUserLoading } = useAppUser();

  const ready = !!firestore && !!authUser && !appUserLoading;

  const logsQuery = useMemoFirebase(() => {
    if (!ready) return null;
    return query(collection(firestore!, 'customer_logs'));
  }, [ready, firestore]);

  const { data: logs, isLoading } = useCollection<CustomerLog>(logsQuery);

  const recent = useMemo(() => {
    const list = [...(logs ?? [])].sort((a, b) => {
      const aTime = toDate(a.createdAt).getTime();
      const bTime = toDate(b.createdAt).getTime();
      return bTime - aTime;
    });
    return list.slice(0, 8);
  }, [logs]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
        <CardDescription>Latest team customer log updates.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {!isLoading && recent.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No activity yet.
          </div>
        )}
        {!isLoading && recent.length > 0 && (
          <ul className="divide-y -my-2">
            {recent.map((log) => {
              const when = toDate(log.createdAt);
              return (
                <li key={log.id} className="py-2">
                  <Link
                    href={`/clients/${log.clientId}`}
                    className="flex items-center gap-3 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        <span className="font-medium">{log.clientName ?? 'Client'}</span>
                        {' — '}
                        <span className="text-muted-foreground">{log.activity}</span>
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatLogStamp(when)}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
