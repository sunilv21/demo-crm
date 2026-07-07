"use client";

import { collection, query, where } from "firebase/firestore";
import { useAppUser, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import type { Booking } from "@/lib/types";
import { buildDetailEntries, bookingReference } from "@/lib/booking-details";
import { Skeleton } from "../ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Plane, Flag, Bed, Car, PlusCircle, ChevronRight, Stamp } from "lucide-react";
import { cn } from "@/lib/utils";

const ItineraryIcon = ({ type }: { type?: string }) => {
  const t = type?.toLowerCase();
  if (t?.includes("flight")) return <Plane className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes("tour")) return <Flag className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes("hotel")) return <Bed className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes("rental") || t?.includes("car")) return <Car className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (t?.includes("visa")) return <Stamp className="mr-2 h-4 w-4 text-muted-foreground" />;
  return null;
};

const typeLabel = (type?: string) =>
  type === "car" ? "Transfer" : type ? type.charAt(0).toUpperCase() + type.slice(1) : "N/A";

const BookingRowSkeleton = ({ cols }: { cols: number }) => (
  <TableRow>
    {Array.from({ length: cols }).map((_, i) => (
      <TableCell key={i}>
        <Skeleton className="h-4 w-24" />
      </TableCell>
    ))}
  </TableRow>
);

export function ClientBookings({ clientId }: { clientId: string }) {
  const firestore = useFirestore();
  const { canViewRevenue } = useAppUser();

  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return query(collection(firestore, "bookings"), where("clientId", "==", clientId));
  }, [firestore, clientId]);

  const { data: bookings, isLoading, error } = useCollection<Booking>(bookingsQuery);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const sortedBookings = useMemo(() => {
    return [...(bookings ?? [])].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
  }, [bookings]);

  // Expander · Reference · Itinerary · Dates · [Customer · Cost · Profit] · Status
  const colCount = canViewRevenue ? 8 : 5;

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
      <CardContent className="p-0">
        <div className="overflow-x-auto rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Itinerary</TableHead>
                <TableHead>Dates</TableHead>
                {canViewRevenue && <TableHead className="text-right">Customer</TableHead>}
                {canViewRevenue && <TableHead className="text-right">Cost</TableHead>}
                {canViewRevenue && <TableHead className="text-right">Profit</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => <BookingRowSkeleton key={i} cols={colCount} />)}
              {!isLoading &&
                sortedBookings.map((booking) => {
                  const ref = bookingReference(booking);
                  const detailEntries = buildDetailEntries(booking);
                  const hasDetails = detailEntries.length > 0;
                  const isOpen = !!expanded[booking.id];
                  return (
                    <Fragment key={booking.id}>
                      <TableRow className={cn(hasDetails && "cursor-pointer")} onClick={hasDetails ? () => toggle(booking.id) : undefined}>
                        <TableCell className="pr-0">
                          {hasDetails && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={isOpen ? "Collapse details" : "Expand details"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(booking.id);
                              }}
                            >
                              <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{ref ? ref.value : "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <ItineraryIcon type={booking.bookingType} />
                            {typeLabel(booking.bookingType)}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {booking.startDate
                            ? new Date(booking.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "—"}
                          {booking.endDate
                            ? ` - ${new Date(booking.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                            : ""}
                        </TableCell>
                        {canViewRevenue && (
                          <TableCell className="text-right">₹{(booking.total || 0).toLocaleString()}</TableCell>
                        )}
                        {canViewRevenue && (
                          <TableCell className="text-right text-muted-foreground">
                            ₹{(booking.supplierCost || 0).toLocaleString()}
                          </TableCell>
                        )}
                        {canViewRevenue &&
                          (() => {
                            const p = booking.profit ?? ((booking.total || 0) - (booking.supplierCost || 0));
                            return (
                              <TableCell className={`text-right font-semibold ${p >= 0 ? "text-green-600" : "text-red-600"}`}>
                                ₹{p.toLocaleString()}
                              </TableCell>
                            );
                          })()}
                        <TableCell>
                          <Badge
                            variant={
                              booking.status === "confirmed"
                                ? "default"
                                : booking.status === "pending" || booking.status === "hold"
                                ? "secondary"
                                : "destructive"
                            }
                            className={
                              booking.status === "confirmed"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : booking.status === "pending" || booking.status === "hold"
                                ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                                : booking.status === "cancelled"
                                ? "bg-red-100 text-red-800 border-red-200"
                                : ""
                            }
                          >
                            {booking.status === "hold" || booking.status === "pending" ? "Hold" : booking.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {hasDetails && isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={colCount} className="pt-0">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 text-xs">
                              {detailEntries.map((entry) => {
                                if (entry.isTable && Array.isArray(entry.value)) {
                                  const cols = entry.columns ?? [
                                    { key: 'from', label: 'From' },
                                    { key: 'to', label: 'To' },
                                    { key: 'date', label: 'Date' },
                                  ];
                                  return (
                                    <div key={entry.label} className="col-span-2 sm:col-span-4">
                                      <span className="text-muted-foreground font-medium">{entry.label}: </span>
                                      <table className="mt-2 w-full text-left border-collapse">
                                        <thead>
                                          <tr className="border-b border-border">
                                            {cols.map((c) => (
                                              <th key={c.key} className="py-1 px-2 text-muted-foreground font-medium">{c.label}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {entry.value.map((row: any, idx: number) => (
                                            <tr key={idx} className="border-b border-border/50 last:border-0">
                                              {cols.map((c) => (
                                                <td key={c.key} className="py-1 px-2">{row[c.key]}</td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={entry.label} className="min-w-0">
                                    <span className="text-muted-foreground">{entry.label}: </span>
                                    <span className="text-foreground break-words">{entry.value}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
            </TableBody>
          </Table>
          {!isLoading && sortedBookings.length === 0 && (
            <div className="text-center p-8 text-muted-foreground">No bookings yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
