'use client';

import Link from 'next/link';
import { clientSlug } from '@/lib/utils';
import { useMemo } from 'react';
import { collection, query } from 'firebase/firestore';
import { Bell, ChevronRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAppUser,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { FollowUp } from '@/lib/types';

const PRIORITY_CLS: Record<FollowUp['priority'], string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
};

function dueLabel(dateStr: string): { label: string; tone: 'overdue' | 'today' | 'upcoming' } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'upcoming' };
  return { label: `In ${diff}d`, tone: 'upcoming' };
}

export function PendingFollowUps() {
  const firestore = useFirestore();
  const { authUser, isLoading: appUserLoading } = useAppUser();

  const ready = !!firestore && !!authUser && !appUserLoading;

  const followUpsQuery = useMemoFirebase(() => {
    if (!ready) return null;
    return query(collection(firestore!, 'follow_ups'));
  }, [ready, firestore]);

  const { data: followUps, isLoading } = useCollection<FollowUp>(followUpsQuery);

  const pending = useMemo(() => {
    const list = (followUps ?? [])
      .filter((f) => !f.done)
      .sort((a, b) => a.date.localeCompare(b.date));
    return list.slice(0, 5);
  }, [followUps]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Pending Follow-ups
        </CardTitle>
        <CardDescription>Team priority tasks.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {!isLoading && pending.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No pending follow-ups. Nice.
          </div>
        )}
        {!isLoading && pending.length > 0 && (
          <ul className="divide-y -my-2">
            {pending.map((f) => {
              const due = dueLabel(f.date);
              return (
                <li key={f.id} className="py-2">
                  <Link
                    href={`/clients/${clientSlug(f.clientName ?? '', f.clientId)}`}
                    className="flex items-center gap-3 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {f.clientName}
                        </p>
                        <Badge
                          variant="outline"
                          className={`${PRIORITY_CLS[f.priority]} capitalize text-[10px] px-1.5 py-0 h-4`}
                        >
                          {f.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {f.notes || 'No notes'}
                      </p>
                    </div>
                    <div
                      className={`text-xs whitespace-nowrap ${
                        due.tone === 'overdue'
                          ? 'text-destructive font-medium'
                          : due.tone === 'today'
                            ? 'text-yellow-700 font-medium'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {due.label}
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
