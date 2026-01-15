'use client';

import { PageHeader } from '@/components/common/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useUser, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { Mail, User as UserIcon, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { UserForm } from '@/components/forms/user-form';
import { doc, serverTimestamp } from 'firebase/firestore';
import type { User as AppUser } from '@/lib/types';
import { updateProfile } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';


const ProfilePageSkeleton = () => (
  <>
    <PageHeader title="My Profile" />
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center items-center">
        <Skeleton className="h-24 w-24 rounded-full mx-auto mb-4" />
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-56 mx-auto" />
      </CardHeader>
      <CardContent className="space-y-4 mt-4 border-t pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </CardContent>
    </Card>
  </>
);

const DetailItem = ({ icon: Icon, value }: { icon: React.ElementType, value?: string | null }) => {
    if (!value) return null;
    return (
        <div className="flex items-center gap-4 text-muted-foreground">
            <Icon className="h-5 w-5" />
            <span className="text-foreground">{value}</span>
        </div>
    );
};

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userDoc, isLoading: isDocLoading } = useDoc<AppUser>(userDocRef);

  const isLoading = isUserLoading || isDocLoading;

  if (isLoading || !user) {
    return <ProfilePageSkeleton />;
  }
  
  const handleUpdateUser = async (values: { name: string }) => {
    if (!user || !userDocRef) return;

    try {
      // Update Firebase Auth profile
      await updateProfile(user, { displayName: values.name });

      // Update Firestore user document
      const userData: Partial<AppUser> = {
        name: values.name,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

       if (!userDoc) { // If doc doesn't exist, create it
        userData.email = user.email!;
        userData.role = 'employee';
        userData.id = user.uid;
        userData.createdAt = serverTimestamp();
        userData.createdBy = user.uid;
        setDocumentNonBlocking(userDocRef, userData, {});
      } else { // Else, update it
        setDocumentNonBlocking(userDocRef, userData, { merge: true });
      }

      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      setIsFormOpen(false);
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: "Update Failed",
        description: error.message || "Could not update profile.",
      });
    }
  };

  const userInitial = user.displayName?.charAt(0) || user.email?.charAt(0) || '?';
  const displayName = user.displayName || userDoc?.name || 'User';

  return (
    <>
      <PageHeader title="My Profile" />
      <Card className="mx-auto max-w-2xl">
        <CardHeader className="text-center items-center">
          <Avatar className="h-24 w-24 border-2 border-primary mb-4">
            <AvatarImage src={user.photoURL || ''} alt={displayName} data-ai-hint="person face" />
            <AvatarFallback className="text-4xl">{userInitial}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-3xl">{displayName}</CardTitle>
          <p className="text-muted-foreground">{user.email}</p>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="mt-4">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Profile
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                </DialogHeader>
                <UserForm onSubmit={handleUpdateUser} user={user} />
                 <DialogFooter>
                    <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                    <Button type="submit" form="user-form">Save Changes</Button>
                </DialogFooter>
            </DialogContent>
           </Dialog>
        </CardHeader>
        <CardContent className="space-y-4 mt-4 border-t pt-6">
            <DetailItem icon={Mail} value={user.email} />
            <DetailItem icon={UserIcon} value={user.uid} />
        </CardContent>
      </Card>
    </>
  );
}
