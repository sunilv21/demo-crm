'use client';

import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { CustomerLog } from '@/lib/types';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';

export function LastLogActivity({ clientId }: { clientId: string }) {
  const firestore = useFirestore();

  const logsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return query(
      collection(firestore, 'customer_logs'),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
  }, [firestore, clientId]);

  const { data: logs, isLoading } = useCollection<CustomerLog>(logsQuery);

  if (isLoading) {
    return <Skeleton className="h-4 w-32" />;
  }

  if (!logs || logs.length === 0) {
    return <span className="text-muted-foreground">No logs yet</span>;
  }

  return (
    <span title={logs[0].activity} className="block truncate text-sm">
      {logs[0].activity}
    </span>
  );
}
