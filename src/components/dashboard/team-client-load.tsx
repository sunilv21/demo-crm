'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Client, User } from '@/lib/types';
import { User as UserIcon } from 'lucide-react';
import { useMemo } from 'react';

export function TeamClientLoad() {
  const firestore = useFirestore();

  const usersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  const clientsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'clients') : null),
    [firestore]
  );

  const { data: users, isLoading: loadingUsers } = useCollection<User>(usersQuery);
  const { data: clients, isLoading: loadingClients } = useCollection<Client>(clientsQuery);
  const isLoading = loadingUsers || loadingClients;

  // Count clients assigned to each staff member.
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    (clients ?? []).forEach((c) => {
      if (c.assignedEmployees && c.assignedEmployees.length > 0) {
        c.assignedEmployees.forEach((empId) => {
          counts.set(empId, (counts.get(empId) || 0) + 1);
        });
      }
    });
    return (users ?? [])
      .map((u) => ({ id: u.id, name: u.name, role: u.role, count: counts.get(u.id) || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [users, clients]);

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Team Workload</CardTitle>
        <CardDescription>Clients each team member is working on.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No team members found.</p>
          )}
          {!isLoading &&
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>
                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <Badge variant="secondary" className="capitalize mt-0.5">{r.role}</Badge>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold leading-none">{r.count}</p>
                  <p className="text-xs text-muted-foreground">clients</p>
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
