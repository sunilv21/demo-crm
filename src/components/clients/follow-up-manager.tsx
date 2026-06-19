'use client';

import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, useUser } from '@/firebase';
import type { Client, FollowUp } from '@/lib/types';
import { collection, query, where, orderBy, doc, serverTimestamp } from 'firebase/firestore';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { useState, useCallback } from 'react';
import { FollowUpForm } from '../forms/follow-up-form';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { ClientFollowUps } from './client-follow-ups';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';

export function FollowUpManager({ client }: { client: Client }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
    const [followUpToDelete, setFollowUpToDelete] = useState<FollowUp | null>(null);

    const followUpsQuery = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return query(
            collection(firestore, 'follow_ups'),
            where('clientId', '==', client.id),
            orderBy('date', 'desc')
        );
    }, [firestore, user, client.id]);

    const { data: followUps, isLoading } = useCollection<FollowUp>(followUpsQuery);

    const handleFormSubmit = useCallback((values: Omit<FollowUp, 'id' | 'clientName' | 'clientEmail' | 'clientPhone'>, selectedClient: Client) => {
        if (!user || !firestore) return;
        
        if (editingFollowUp && editingFollowUp.id) {
            const followUpRef = doc(firestore, 'follow_ups', editingFollowUp.id);
            setDocumentNonBlocking(followUpRef, {
                ...values,
                updatedAt: serverTimestamp(),
                updatedBy: user.uid,
            }, { merge: true });
            toast({ title: "Follow-up updated" });
        } else {
             const followUpsCollection = collection(firestore, 'follow_ups');
             addDocumentNonBlocking(followUpsCollection, {
                ...values,
                clientId: selectedClient.id,
                clientName: selectedClient.name,
                clientEmail: selectedClient.email,
                clientPhone: selectedClient.phone,
                createdBy: user.uid,
                updatedBy: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: "Follow-up created" });
        }

        setIsFormOpen(false);
        setEditingFollowUp(null);
    }, [firestore, user, editingFollowUp, toast]);
    
    const handleToggleDone = useCallback((followUp: FollowUp) => {
        if (!firestore || !user) return;
        const followUpRef = doc(firestore, 'follow_ups', followUp.id);
        setDocumentNonBlocking(followUpRef, {
            done: !followUp.done,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
        }, { merge: true });
    }, [firestore, user]);

    const requestDelete = useCallback((followUpId: string) => {
        const fu = (followUps ?? []).find(f => f.id === followUpId) ?? null;
        setFollowUpToDelete(fu);
    }, [followUps]);

    const confirmDelete = useCallback(() => {
        if (!firestore || !followUpToDelete) return;
        const followUpRef = doc(firestore, 'follow_ups', followUpToDelete.id);
        deleteDocumentNonBlocking(followUpRef);
        toast({ variant: 'destructive', title: "Follow-up deleted" });
        setFollowUpToDelete(null);
    }, [firestore, followUpToDelete, toast]);

    const handleEdit = useCallback((followUp: FollowUp) => {
        setEditingFollowUp(followUp);
        setIsFormOpen(true);
    }, []);

    const handleNew = useCallback(() => {
        setEditingFollowUp(null);
        setIsFormOpen(true);
    }, []);

    return (
        <>
            <ClientFollowUps 
                followUps={followUps}
                isLoading={isLoading}
                onToggleDone={handleToggleDone}
                onEdit={handleEdit}
                onDelete={requestDelete}
                onNew={handleNew}
            />
            <ConfirmDeleteDialog
                open={!!followUpToDelete}
                onOpenChange={(o) => !o && setFollowUpToDelete(null)}
                onConfirm={confirmDelete}
                confirmText={followUpToDelete?.clientName || client.name}
                description={
                    <>
                        This will permanently delete this follow-up for{' '}
                        <span className="font-semibold text-foreground">{followUpToDelete?.clientName || client.name}</span>
                        {followUpToDelete?.date ? ` on ${followUpToDelete.date}` : ''}. To confirm, type the client name below.
                    </>
                }
            />
             <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingFollowUp?.id ? 'Edit' : 'Create'} Follow-up</DialogTitle>
                    </DialogHeader>
                    <FollowUpForm 
                        onSubmit={handleFormSubmit} 
                        followUp={editingFollowUp}
                        clientForNewTask={editingFollowUp ? undefined : client}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                        <Button type="submit" form="follow-up-form">{editingFollowUp?.id ? 'Save Changes' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
    
