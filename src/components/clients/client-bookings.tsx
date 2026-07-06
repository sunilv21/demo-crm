"use client";

import { collection, query, where } from "firebase/firestore";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import type { Booking } from "@/lib/types";
import { Skeleton } from "../ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo } from "react";
import { Plane, Bed, Car, MapPinned, PlusCircle, Package, MapPin, Calendar } from "lucide-react";

const TypeIcon = ({ type }: { type?: string }) => {
  switch (type) {
    case "flight":
      return <Plane className="h-4 w-4 text-muted-foreground" />;
    case "hotel":
      return <Bed className="h-4 w-4 text-muted-foreground" />;
    case "car":
      return <Car className="h-4 w-4 text-muted-foreground" />;
    case "activity":
      return <MapPinned className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Package className="h-4 w-4 text-muted-foreground" />;
  }
};

const typeLabel = (type?: string) =>
  type === "car" ? "Transfer" : type ? type.charAt(0).toUpperCase() + type.slice(1) : "Booking";

const statusVariant = (status?: string) =>
  status === "confirmed" ? "default" : status === "cancelled" ? "destructive" : "secondary";

const BookingItemSkeleton = () => (
  <div className="flex items-center gap-4">
    <Skeleton className="h-9 w-9 rounded-md" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-1/4" />
    </div>
    <Skeleton className="h-6 w-20 rounded-full" />
  </div>
);

export function ClientBookings({ clientId }: { clientId: string }) {
  const firestore = useFirestore();

  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return query(collection(firestore, "bookings"), where("clientId", "==", clientId));
  }, [firestore, clientId]);

  const { data: bookings, isLoading, error } = useCollection<Booking>(bookingsQuery);

  const sortedBookings = useMemo(() => {
    return [...(bookings ?? [])].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
  }, [bookings]);

  if (error) return <p className="text-destructive">Error: {error.message}</p>;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Bookings</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href={`/clients/${clientId}/bookings`}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Manage
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <BookingItemSkeleton key={i} />)}
          {!isLoading &&
            sortedBookings.map((booking) => (
              <div key={booking.id} className="flex items-center gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                  <TypeIcon type={booking.bookingType} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {typeLabel(booking.bookingType)}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {booking.destination && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {booking.destination}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {booking.startDate ? format(new Date(booking.startDate), "dd MMM yyyy") : "—"}
                      {booking.endDate ? ` – ${format(new Date(booking.endDate), "dd MMM yyyy")}` : ""}
                    </span>
                  </div>
                </div>
                <Badge variant={statusVariant(booking.status)} className="capitalize">
                  {booking.status}
                </Badge>
              </div>
            ))}
          {!isLoading && sortedBookings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No bookings yet.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
