'use client';

import type { Client, FollowUp } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Edit, MoreHorizontal, CheckCircle, Circle } from 'lucide-react';
import { format, isPast } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { cn } from '@/lib/utils';


const FollowUpItemSkeleton = () => (
    <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
        </div>
         <Skeleton className="h-8 w-8 rounded-md" />
    </div>
);

interface ClientFollowUpsProps {
    followUps: FollowUp[] | null;
    isLoading: boolean;
    onToggleDone: (followUp: FollowUp) => void;
    onEdit: (followUp: FollowUp) => void;
    onDelete: (followUpId: string) => void;
    onNew: () => void;
}

export function ClientFollowUps({ followUps, isLoading, onToggleDone, onEdit, onDelete, onNew }: ClientFollowUpsProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Follow-ups</CardTitle>
                <Button variant="ghost" size="icon" onClick={onNew}>
                    <PlusCircle className="h-5 w-5" />
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {isLoading && Array.from({ length: 2 }).map((_, i) => <FollowUpItemSkeleton key={i} />)}
                    {!isLoading && followUps?.map(followUp => {
                        const isMissed = isPast(new Date(followUp.date)) && !followUp.done;
                        return (
                        <div key={followUp.id} className="flex items-start gap-3">
                            <div className="flex-1">
                                <p className={cn(`font-medium`, followUp.done && 'line-through text-muted-foreground')}>{followUp.notes}</p>
                                <p className={cn(`text-sm`, 
                                    followUp.done ? 'text-green-600' :
                                    isMissed ? 'text-red-600' : 'text-muted-foreground'
                                )}>
                                    {followUp.date ? format(new Date(followUp.date), 'PPP') : 'No date'}
                                </p>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => onToggleDone(followUp)}>
                                        {followUp.done ? <Circle className="mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                        {followUp.done ? 'Mark as incomplete' : 'Mark as complete'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onEdit(followUp)}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(followUp.id)}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )})}
                     {!isLoading && followUps?.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground">
                            <p className="text-sm">No follow-ups for this client.</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
