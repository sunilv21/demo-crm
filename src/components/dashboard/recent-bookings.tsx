'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAppUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Booking } from '@/lib/types';
import Link from 'next/link';
import { useMemo } from 'react';

export function RecentBookings() {
  const firestore = useFirestore();
  const { canViewRevenue, isAdminOrManager, authUser } = useAppUser();

  // Non-admins may only list bookings they created (server-enforced).
  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (!isAdminOrManager) {
      if (!authUser) return null;
      return query(collection(firestore, 'bookings'), where('createdBy', '==', authUser.uid));
    }
    return collection(firestore, 'bookings');
  }, [firestore, isAdminOrManager, authUser]);
  const { data: bookings, isLoading } = useCollection<Booking>(bookingsQuery);

  const recent = useMemo(() => {
    return [...(bookings ?? [])]
      .sort((a, b) => {
        const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.startDate).getTime();
        const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.startDate).getTime();
        return bt - at;
      })
      .slice(0, 5);
  }, [bookings]);

  return (
    <Card className="col-span-1 lg:col-span-1">
      <CardHeader>
        <CardTitle>Recent Bookings</CardTitle>
        <CardDescription>Your latest bookings.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && recent.length === 0 && (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          )}
          {!isLoading &&
            recent.map((booking) => (
              <div className="flex items-center" key={booking.id}>
                <Avatar className="h-9 w-9">
                  <AvatarFallback>
                    <User className="h-5 w-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="ml-4 space-y-1 min-w-0">
                  <Link
                    href={`/clients/${booking.clientId}`}
                    className="text-sm font-medium leading-none text-primary hover:underline truncate block"
                  >
                    {booking.clientName || 'Unknown Client'}
                  </Link>
                  <p className="text-sm text-muted-foreground capitalize">
                    {booking.status}
                  </p>
                </div>
                {canViewRevenue && (
                  <div className="ml-auto font-medium whitespace-nowrap">
                    ₹{(booking.total || 0).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
