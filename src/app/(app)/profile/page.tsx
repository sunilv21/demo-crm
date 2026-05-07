'use client';

import { PageHeader } from '@/components/common/page-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useUser, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { Mail, User as UserIcon, Pencil, Phone, Briefcase, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { UserForm } from '@/components/forms/user-form';
import { doc, serverTimestamp } from 'firebase/firestore';
import type { User as AppUser } from '@/lib/types';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth';
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
  
  const handleUpdateUser = async (values: { name: string; phone?: string; jobTitle?: string; }) => {
    if (!user || !userDocRef) return;

    try {
      // Update Firebase Auth profile
      await updateProfile(user, { displayName: values.name });

      // Update Firestore user document
      const userData: Partial<AppUser> = {
        name: values.name,
        phone: values.phone,
        jobTitle: values.jobTitle,
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

  const displayName = user.displayName || userDoc?.name || 'User';

  return (
    <>
      <PageHeader title="My Profile" />
      <Card className="mx-auto max-w-2xl">
        <CardHeader className="text-center items-center">
          <Avatar className="h-24 w-24 border-2 border-primary mb-4">
            <AvatarFallback>
              <UserIcon className="h-12 w-12 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-3xl">{displayName}</CardTitle>
          <p className="text-muted-foreground">{user.email}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Profile
                  </Button>
              </DialogTrigger>
              <DialogContent>
                  <DialogHeader>
                      <DialogTitle>Edit Profile</DialogTitle>
                  </DialogHeader>
                  <UserForm onSubmit={handleUpdateUser} user={user} userDoc={userDoc} />
                   <DialogFooter>
                      <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                      <Button type="submit" form="user-form">Save Changes</Button>
                  </DialogFooter>
              </DialogContent>
             </Dialog>
            <ChangePasswordDialog />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 mt-4 border-t pt-6">
            <DetailItem icon={Mail} value={user.email} />
            <DetailItem icon={Phone} value={userDoc?.phone} />
            <DetailItem icon={Briefcase} value={userDoc?.jobTitle} />
            <DetailItem icon={UserIcon} value={user.uid} />
        </CardContent>
      </Card>
    </>
  );
}

function ChangePasswordDialog() {
  const { user } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) {
      toast({ variant: 'destructive', title: 'Not signed in' });
      return;
    }
    if (newPwd.length < 6) {
      toast({ variant: 'destructive', title: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast({ variant: 'destructive', title: 'Passwords do not match.' });
      return;
    }
    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPwd);
      toast({ title: 'Password updated', description: 'Your password has been changed.' });
      reset();
      setOpen(false);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const message =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : code === 'auth/weak-password'
            ? 'New password is too weak.'
            : err?.message || 'Failed to update password.';
      toast({ variant: 'destructive', title: 'Password update failed', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="mr-2 h-4 w-4" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Enter your current password to confirm, then your new password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="currentPwd">Current Password</Label>
            <Input
              id="currentPwd"
              type="password"
              autoComplete="current-password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="newPwd">New Password</Label>
            <Input
              id="newPwd"
              type="password"
              autoComplete="new-password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div>
            <Label htmlFor="confirmPwd">Confirm New Password</Label>
            <Input
              id="confirmPwd"
              type="password"
              autoComplete="new-password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
