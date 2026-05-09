"use client";

import { collection, query, where, orderBy } from "firebase/firestore";
import { useAppUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import type { CustomerLog } from "@/lib/types";
import { Skeleton } from "./ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { format } from 'date-fns';
import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Search, User } from "lucide-react";

const LogItemSkeleton = () => (
    <div className="flex items-start gap-4">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-8 w-full" />
        </div>
    </div>
);

export function CustomerLogs({ clientId }: { clientId?: string }) {
  const firestore = useFirestore();
  const { authUser, isLoading: appUserLoading } = useAppUser();
  const [searchTerm, setSearchTerm] = useState('');

  const ready = !!firestore && !!authUser && !appUserLoading;

  const logsQuery = useMemoFirebase(() => {
    if (!ready) return null;
    const col = collection(firestore!, "customer_logs");

    if (clientId) {
      return query(col, where("clientId", "==", clientId), orderBy("createdAt", "desc"));
    }
    return col;
  }, [ready, firestore, clientId]);

  const { data: logs, isLoading, error } = useCollection<CustomerLog>(logsQuery);

  const sortedLogs = useMemo(() => {
    return [...(logs ?? [])].sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bTime - aTime;
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return sortedLogs;
    const lowercasedTerm = searchTerm.toLowerCase();
    return sortedLogs.filter(log => 
        (log.clientName && log.clientName.toLowerCase().includes(lowercasedTerm)) ||
        (log.userName && log.userName.toLowerCase().includes(lowercasedTerm)) ||
        (log.activity && log.activity.toLowerCase().includes(lowercasedTerm))
    );
  }, [sortedLogs, searchTerm]);

  if (error) return <p className="text-destructive">Error: {error.message}</p>;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Activity Feed</CardTitle>
            {!clientId && (
                <div className="relative max-w-sm w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search logs by client, user, or content..."
                        className="pl-10 w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
            {isLoading && Array.from({length: 3}).map((_, i) => <LogItemSkeleton key={i}/>)}
            {!isLoading && filteredLogs?.map(log => (
                <div key={log.id} className="flex items-start gap-4">
                    <Avatar className="h-9 w-9">
                        <AvatarFallback>
                            <User className="h-5 w-5" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">
                                {log.userName || 'System'}
                                {!clientId && log.clientName && (
                                    <>
                                        {' on '}
                                        <Link href={`/clients/${log.clientId}`} className="font-semibold text-primary hover:underline">
                                            {log.clientName}
                                        </Link>
                                    </>
                                )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {log.createdAt?.toDate ? format(log.createdAt.toDate(), "dd MMM yyyy, hh:mm a") : 'Just now'}
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{log.activity}</p>
                    </div>
                </div>
            ))}
            {!isLoading && filteredLogs?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    <p>{searchTerm ? 'No logs match your search.' : 'No customer logs found.'}</p>
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
