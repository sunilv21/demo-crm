
'use client';

import { useParams } from 'next/navigation';
import { useAppUser, useCollection, useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import type { Client, User as StaffUser } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { visaStatusGlow } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, MapPin, Briefcase, Calendar, IndianRupee, Hotel, Cog, UserCheck, Plane, NotepadText, Pencil, FileText, Bell, Users, User } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CustomerLogs } from '@/components/customer-logs';
import { ClientBookings } from '@/components/clients/client-bookings';
import { ClientForm } from '@/components/forms/client-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { StatusUpdateForm } from '@/components/forms/status-update-form';

const serviceLabels: Record<string, string> = {
    flight: 'Flight',
    hotel: 'Hotel',
    visa: 'Visa',
    transfers: 'Transfers',
    activity: 'Activity',
    localTours: 'Local Tours',
};

const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value?: string | number | null }) => {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3">
            <Icon className="h-5 w-5 text-muted-foreground mt-1" />
            <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="text-sm text-foreground">{value}</p>
            </div>
        </div>
    );
};

const ClientProfileSkeleton = () => (
    <div className="space-y-8">
        <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-1 space-y-6">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center gap-4">
                            <Skeleton className="h-24 w-24 rounded-full" />
                            <div className="text-center space-y-1">
                                <Skeleton className="h-6 w-32" />
                                <Skeleton className="h-4 w-40" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-2 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Details &amp; Preferences</CardTitle></CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-6">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div className="flex items-start gap-3" key={i}>
                                <Skeleton className="h-5 w-5" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-4 w-32" />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
            <Card>
            <CardHeader><CardTitle>Logs Feed</CardTitle></CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            </CardContent>
        </Card>
    </div>
);


export default function ClientProfilePage() {
    const params = useParams();
    const firestore = useFirestore();
    const { isAdminOrManager, authUser } = useAppUser();
    const { toast } = useToast();
    const clientId = params.clientId as string;

    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [isStatusUpdateOpen, setIsStatusUpdateOpen] = useState(false);
    
    const clientRef = useMemoFirebase(() => {
        if (!firestore || !clientId) return null;
        return doc(firestore, 'clients', clientId);
    }, [firestore, clientId]);

    const { data: client, isLoading } = useDoc<Client>(clientRef);

    // Staff list for reassignment (admins/managers only).
    const usersQuery = useMemoFirebase(
        () => (firestore && isAdminOrManager ? collection(firestore, 'users') : null),
        [firestore, isAdminOrManager]
    );
    const { data: staffUsers } = useCollection<StaffUser>(usersQuery);
    const staffOptions = (staffUsers || []).map(u => ({ id: u.id, name: u.name }));

    if (isLoading || !client) {
        return <ClientProfileSkeleton />;
    }

    // Only admins/managers can view any client; others (employees, agents)
    // may only view clients assigned to them OR that they created.
    if (
        !isAdminOrManager &&
        !(client.assignedEmployees?.includes(authUser?.uid || '') || false) &&
        client.createdBy !== authUser?.uid
    ) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <h2 className="text-xl font-semibold">Access restricted</h2>
                <p className="text-muted-foreground mt-2">This client is not assigned to you.</p>
            </div>
        );
    }

    const handleUpdateClient = (updatedData: Partial<Client>) => {
        if (!clientRef) return;
        setDocumentNonBlocking(clientRef, { ...updatedData, updatedAt: serverTimestamp() }, { merge: true });
        setIsEditingDetails(false);
        setIsStatusUpdateOpen(false);
        toast({
            title: 'Client Updated',
            description: 'The client details have been successfully saved.',
        });
    };

    const clientStatus = client.status || 'inactive';
    const visaStatus = client.visaStatus;

    return (
        <div className="space-y-8">
            <div className="grid gap-8 md:grid-cols-3">
                <div className="md:col-span-1 space-y-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col items-center gap-4">
                                <Avatar className="h-24 w-24 border-2 border-primary" style={visaStatusGlow(client.visaStatus)}>
                                    <AvatarFallback>
                                        <User className="h-12 w-12 text-muted-foreground" />
                                    </AvatarFallback>
                                </Avatar>
                                <div className="text-center">
                                    <h2 className="text-2xl font-semibold">{client.name}</h2>
                                    <p className="text-muted-foreground">{client.email}</p>
                                </div>
                                <Dialog open={isStatusUpdateOpen} onOpenChange={setIsStatusUpdateOpen}>
                                    <DialogTrigger asChild>
                                        <div className='flex gap-2 items-center'>
                                            <Badge
                                                variant={
                                                    clientStatus === 'active' ? 'default' :
                                                    clientStatus === 'prospect' ? 'secondary' : 'outline'
                                                }
                                                className={
                                                    `cursor-pointer ` + (clientStatus === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
                                                    clientStatus === 'prospect' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : '')
                                                }
                                            >
                                                {clientStatus.charAt(0).toUpperCase() + clientStatus.slice(1)}
                                            </Badge>
                                            {visaStatus && (
                                                <Badge
                                                    variant={
                                                        visaStatus === 'approved' ? 'default' :
                                                        visaStatus === 'rejected' ? 'destructive' :
                                                        'secondary'
                                                    }
                                                    className={
                                                        `cursor-pointer ` + (
                                                        visaStatus === 'approved' ? 'bg-green-100 text-green-800 border-green-200' :
                                                        visaStatus === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                                                        visaStatus === 'travelling' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                                                        visaStatus === 'completed' ? 'bg-sky-100 text-sky-800 border-sky-200' :
                                                        visaStatus === 'applied' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                                        visaStatus === 'inProcess' ? 'bg-purple-100 text-purple-800 border-purple-200' : 
                                                        'bg-gray-100 text-gray-800 border-gray-200')
                                                    }
                                                >
                                                    Visa: {visaStatus.charAt(0).toUpperCase() + visaStatus.slice(1)}
                                                </Badge>
                                            )}
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Update Status</DialogTitle>
                                        </DialogHeader>
                                        <StatusUpdateForm client={client} onSubmit={handleUpdateClient} />
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                        <DetailItem icon={Mail} label="Email" value={client.email} />
                        <DetailItem icon={Phone} label="Phone" value={client.phone} />
                        <DetailItem icon={MapPin} label="Nationality" value={client.nationality} />
                        </CardContent>
                    </Card>
                </div>
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Details &amp; Preferences</CardTitle>
                            {!isEditingDetails && (
                                <Button variant="ghost" size="icon" onClick={() => setIsEditingDetails(true)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            {isEditingDetails ? (
                                <>
                                    <div className="max-h-[60vh] overflow-y-auto pr-2">
                                    <ClientForm client={client} onSubmit={handleUpdateClient} onCancel={() => setIsEditingDetails(false)} canAssign={isAdminOrManager} staffUsers={staffOptions} />
                                    </div>
                                </>
                            ) : (
                                <div className='space-y-6'>
                                    <div>
                                        <h3 className="text-sm font-medium mb-4 text-muted-foreground">Personal &amp; Travel Preferences</h3>
                                        <div className="grid sm:grid-cols-2 gap-6">
                                            <DetailItem icon={Users} label="PAX" value={client.pax} />
                                            <DetailItem icon={Calendar} label="Date of Birth" value={client.dateOfBirth ? format(new Date(client.dateOfBirth), 'dd/MM/yyyy') : 'N/A'} />
                                            <DetailItem icon={UserCheck} label="Gender" value={client.gender} />
                                            <DetailItem icon={Briefcase} label="Travel Purpose" value={client.travelPurpose} />
                                            <DetailItem icon={Plane} label="Preferred Destination" value={client.preferredDestination} />
                                            <DetailItem icon={Cog} label="Services" value={(() => { const svc = Array.isArray(client.services) ? client.services : client.services ? [client.services as string] : []; return svc.length > 0 ? svc.map(s => serviceLabels[s] || s).join(', ') : undefined; })()} />
                                            <DetailItem icon={FileText} label="Visa Status" value={client.visaStatus} />
                                            <DetailItem icon={Cog} label="Additional Services" value={client.additionalServices?.join(', ')} />
                                            {client.followUpDate && <DetailItem icon={Bell} label="Follow-up Date" value={format(new Date(client.followUpDate), 'PPP')} />}
                                        </div>
                                    </div>

                                    <div className='border-t border-border pt-6'>
                                        <h3 className="text-sm font-medium mb-4 text-muted-foreground">Additional Preferences</h3>
                                        <div className="flex items-start gap-3">
                                            <NotepadText className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                                            <p className="text-sm text-foreground whitespace-pre-wrap">{client.preferences || 'No notes available.'}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            <ClientBookings clientId={clientId} />
            <CustomerLogs clientId={clientId} />
        </div>
    );
}
