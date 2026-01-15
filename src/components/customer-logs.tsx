"use client";

import { collection, query, where, orderBy } from "firebase/firestore";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import type { CustomerLog } from "@/lib/types";
import { Skeleton } from "./ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { formatDistanceToNow } from 'date-fns';
import Link from "next/link";
import { useState } from "react";
import { Input } from "./ui/input";
import { Search } from "lucide-react";

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
  const [searchTerm, setSearchTerm] = useState('');

  const logsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    let q = collection(firestore, "customer_logs");

    if (clientId) {
        return query(q, where("clientId", "==", clientId), orderBy("createdAt", "desc"));
    }
    return query(q, orderBy("createdAt", "desc"));
  }, [firestore, clientId]);

  const { data: logs, isLoading, error } = useCollection<CustomerLog>(logsQuery);

  const filteredLogs = useMemoFirebase(() => {
    if (!logs) return [];
    if (!searchTerm) return logs;
    const lowercasedTerm = searchTerm.toLowerCase();
    return logs.filter(log => 
        (log.clientName && log.clientName.toLowerCase().includes(lowercasedTerm)) ||
        (log.userName && log.userName.toLowerCase().includes(lowercasedTerm)) ||
        (log.activity && log.activity.toLowerCase().includes(lowercasedTerm))
    );
  }, [logs, searchTerm]);

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
                        <AvatarImage src={`https://picsum.photos/seed/${log.createdBy}/40/40`} data-ai-hint="person face" />
                        <AvatarFallback>{log.userName?.slice(0, 2) || '?'}</AvatarFallback>
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
                                {log.createdAt?.toDate ? formatDistanceToNow(log.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
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
