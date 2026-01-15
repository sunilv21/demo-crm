'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { mockClients, mockBookings } from '@/lib/data';
import { useEffect, useState } from 'react';

type RecentClient = {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
  value: number;
};

const generateRecentClients = () => mockBookings
    .slice(0, 5)
    .map(booking => {
      const client = mockClients.find(c => c.id === booking.clientId);
      return {
        ...(client || {}),
        id: booking.id, // Use booking id to ensure uniqueness
        value: booking.status === 'confirmed' ? (Math.random() * 5000 + 2000) : 0,
      }
    });

export function RecentBookings() {
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);

  useEffect(() => {
    setRecentClients(generateRecentClients());
  }, []);

  return (
    <Card className="col-span-1 lg:col-span-1">
      <CardHeader>
        <CardTitle>Recent Bookings</CardTitle>
        <CardDescription>You made 4 bookings this month.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {recentClients.map((client) => client && (
            <div className="flex items-center" key={client.id}>
              <Avatar className="h-9 w-9">
                <AvatarImage src={client.avatar} alt="Avatar" data-ai-hint="person face" />
                <AvatarFallback>{client.name?.charAt(0) ?? '?'}</AvatarFallback>
              </Avatar>
              <div className="ml-4 space-y-1">
                <p className="text-sm font-medium leading-none">{client.name}</p>
                <p className="text-sm text-muted-foreground">{client.email}</p>
              </div>
              <div className="ml-auto font-medium">
                {client.value > 0 ? `+$${client.value.toFixed(2)}` : ''}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
