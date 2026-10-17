'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useUser, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { UserForm } from '@/components/forms/user-form';
import type { User as AppUser } from '@/lib/types';
import { doc, serverTimestamp } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth';
import {
  Briefcase,
  CalendarDays,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Phone,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  agent: 'Agent',
  finance: 'Finance',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  employee: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  agent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  finance: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function InfoRow({ icon: Icon, label, value, mono = false }: { icon: React.ElementType; label: string; value?: string | null; mono?: boolean }) {
  const { toast } = useToast();
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-sm break-all ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value}</p>
      </div>
      {mono && (
        <button
          className="mt-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast({ title: 'Copied', description: 'Copied to clipboard.' });
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="relative h-32 rounded-xl bg-muted" />
      <div className="px-6 -mt-16 flex items-end gap-4">
        <Skeleton className="h-24 w-24 rounded-full border-4 border-background" />
        <div className="mb-2 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4 px-0">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userDoc, isLoading: isDocLoading } = useDoc<AppUser>(userDocRef);

  if (isUserLoading || isDocLoading || !user) return <ProfileSkeleton />;

  const displayName = user.displayName || userDoc?.name || 'User';
  const initials = getInitials(displayName);
  const role = userDoc?.role ?? 'employee';
  const memberSince = userDoc?.createdAt?.toDate
    ? format(userDoc.createdAt.toDate(), 'MMMM yyyy')
    : null;

  const handleUpdateUser = async (values: { name: string; phone?: string; jobTitle?: string }) => {
    if (!user || !userDocRef) return;
    try {
      await updateProfile(user, { displayName: values.name });
      const userData: Partial<AppUser> = {
        name: values.name,
        phone: values.phone,
        jobTitle: values.jobTitle,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };
      if (!userDoc) {
        userData.email = user.email!;
        userData.role = 'employee';
        userData.id = user.uid;
        userData.createdAt = serverTimestamp();
        userData.createdBy = user.uid;
        setDocumentNonBlocking(userDocRef, userData, {});
      } else {
        setDocumentNonBlocking(userDocRef, userData, { merge: true });
      }
      toast({ title: 'Profile updated', description: 'Your details have been saved.' });
      setIsEditOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: err.message || 'Could not save changes.' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Banner + Avatar ─────────────────────────────────────────── */}
      <div className="relative">
        <div className="h-36 rounded-xl bg-gradient-to-br from-primary/80 via-primary to-primary/60 overflow-hidden">
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        {/* Avatar */}
        <div className="absolute -bottom-10 left-6">
          <Avatar className="h-20 w-20 border-4 border-background shadow-lg ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Edit button top-right */}
        <div className="absolute top-4 right-4">
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-1.5 shadow">
                <Pencil className="h-3.5 w-3.5" />
                Edit Profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Profile</DialogTitle>
                <DialogDescription>Update your name, phone number and job title.</DialogDescription>
              </DialogHeader>
              <UserForm onSubmit={handleUpdateUser} user={user} userDoc={userDoc} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" form="user-form">Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Name / Role row ─────────────────────────────────────────── */}
      <div className="pt-12 px-2 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold leading-tight">{displayName}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <span className={`ml-1 mb-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[role]}`}>
          {ROLE_LABELS[role] ?? role}
        </span>
      </div>

      {/* ── Two-column cards ────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Contact & Personal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border px-4 pb-4">
            <InfoRow icon={Mail} label="Email address" value={user.email} />
            <InfoRow icon={Phone} label="Phone number" value={userDoc?.phone} />
            <InfoRow icon={Briefcase} label="Job title" value={userDoc?.jobTitle} />
            {memberSince && (
              <InfoRow icon={CalendarDays} label="Member since" value={memberSince} />
            )}
          </CardContent>
        </Card>

        {/* Account & Security */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border px-4 pb-4">
              <InfoRow icon={UserIcon} label="User ID" value={user.uid} mono />
              <div className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Role</p>
                  <p className="mt-0.5 text-sm font-medium capitalize">{ROLE_LABELS[role] ?? role}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Password</p>
                  <p className="text-xs text-muted-foreground">Last changed: unknown</p>
                </div>
                <ChangePasswordDialog />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const reset = () => { setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) { toast({ variant: 'destructive', title: 'Not signed in' }); return; }
    if (newPwd.length < 6) { toast({ variant: 'destructive', title: 'Password too short', description: 'New password must be at least 6 characters.' }); return; }
    if (newPwd !== confirmPwd) { toast({ variant: 'destructive', title: 'Passwords do not match' }); return; }
    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPwd);
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
      reset();
      setOpen(false);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const msg =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : code === 'auth/weak-password'
            ? 'New password is too weak.'
            : err?.message || 'Failed to update password.';
      toast({ variant: 'destructive', title: 'Update failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />
          Change
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="currentPwd">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPwd"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                required
                className="pr-10"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <Lock className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label htmlFor="newPwd">New Password</Label>
            <div className="relative">
              <Input
                id="newPwd"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
                minLength={6}
                className="pr-10"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <Lock className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
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
            {confirmPwd && newPwd !== confirmPwd && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || (!!confirmPwd && newPwd !== confirmPwd)}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
