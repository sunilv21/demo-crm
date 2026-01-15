'use client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Book, FileText, FileUp, History, Map, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export function ClientQuickAccess() {
    const params = useParams();
    const clientId = params.clientId as string;

    const quickAccessItems = [
        { label: "Profile", icon: User, href: `/clients/${clientId}` },
        { label: "Bookings", icon: Book, href: `/clients/${clientId}/bookings` },
        { label: "Itinerary", icon: Map, href: `/clients/${clientId}/itinerary` },
        { label: "Documents", icon: FileUp, href: `/clients/${clientId}/documents` },
        { label: "Invoices", icon: FileText, href: `/clients/${clientId}/invoices` },
        { label: "Travel History", icon: History, href: `/clients/${clientId}/history` },
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Quick Access</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                {quickAccessItems.map(item => (
                    <Button key={item.label} variant="outline" className="w-full justify-start" asChild>
                        <Link href={item.href}>
                            <item.icon className="mr-2 h-4 w-4" />
                            {item.label}
                        </Link>
                    </Button>
                ))}
            </CardContent>
        </Card>
    );
}
