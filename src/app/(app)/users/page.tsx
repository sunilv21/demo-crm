'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { Pencil, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/common/page-header';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  useUser,
  updateDocumentNonBlocking,
} from '@/firebase';
import type { User as AppUser } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
};

const inr = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function UsersPage() {
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AppUser | null>(null);

  const usersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  const { data: users, isLoading } = useCollection<AppUser>(usersQuery);

  const handleRoleChange = (userId: string, newRole: 'admin' | 'manager' | 'employee') => {
    if (!firestore || !currentUser) return;
    if (userId === currentUser.uid) {
      toast({
        variant: 'destructive',
        title: 'Cannot change your own role',
        description: 'Ask another administrator to change your role.',
      });
      return;
    }
    const userDocRef = doc(firestore, 'users', userId);
    updateDocumentNonBlocking(userDocRef, {
      role: newRole,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid,
    });
    toast({
      title: 'Role updated',
      description: `User role changed to ${ROLE_LABEL[newRole]}.`,
    });
  };

  return (
    <>
      <PageHeader title="Users" description="Manage employees, roles, salary and shifts.">
        <Button asChild>
          <Link href="/users/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New User
          </Link>
        </Button>
      </PageHeader>
      <div className="bg-card border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[160px]">Role</TableHead>
              <TableHead className="text-right">Base Salary</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead className="w-[80px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-56" /></TableCell>
                  <TableCell><Skeleton className="h-9 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              (users ?? []).map((u) => {
                const isSelf = currentUser?.uid === u.id;
                const initial = (u.name || u.email || '?').charAt(0).toUpperCase();
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatar} alt={u.name} />
                          <AvatarFallback>{initial}</AvatarFallback>
                        </Avatar>
                        <span>{u.name || '—'}</span>
                        {isSelf && <Badge variant="secondary">You</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role ?? 'employee'}
                        onValueChange={(value) =>
                          handleRoleChange(u.id, value as 'admin' | 'manager' | 'employee')
                        }
                        disabled={isSelf}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="employee">Employee</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      {u.baseSalary != null ? inr(u.baseSalary) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.workStartTime && u.workEndTime
                        ? `${u.workStartTime} – ${u.workEndTime}`
                        : 'default'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        {!isLoading && (users ?? []).length === 0 && (
          <div className="text-center p-8 text-muted-foreground">No users found.</div>
        )}
      </div>
      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function EditUserDialog({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const [baseSalary, setBaseSalary] = useState<string>('0');
  const [workStartTime, setWorkStartTime] = useState<string>('09:30');
  const [workEndTime, setWorkEndTime] = useState<string>('18:30');
  const [graceMinutes, setGraceMinutes] = useState<string>('15');
  const [leaveCap, setLeaveCap] = useState<string>('2');

  useEffect(() => {
    if (!user) return;
    setBaseSalary(String(user.baseSalary ?? 0));
    setWorkStartTime(user.workStartTime ?? '09:30');
    setWorkEndTime(user.workEndTime ?? '18:30');
    setGraceMinutes(String(user.lateGraceMinutes ?? 15));
    setLeaveCap(String(user.monthlyLeaveCap ?? 2));
  }, [user]);

  const handleClose = () => onClose();

  const handleSave = () => {
    if (!firestore || !user || !currentUser) return;
    const ref = doc(firestore, 'users', user.id);
    updateDocumentNonBlocking(ref, {
      baseSalary: Number(baseSalary) || 0,
      workStartTime,
      workEndTime,
      lateGraceMinutes: Number(graceMinutes) || 0,
      monthlyLeaveCap: Number(leaveCap) || 0,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid,
    });
    toast({ title: 'User updated', description: `${user.name}'s details saved.` });
    handleClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="baseSalary">Base Monthly Salary (₹)</Label>
            <Input
              id="baseSalary"
              type="number"
              min={0}
              step={500}
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="workStart">Shift Start</Label>
              <Input
                id="workStart"
                type="time"
                value={workStartTime}
                onChange={(e) => setWorkStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="workEnd">Shift End</Label>
              <Input
                id="workEnd"
                type="time"
                value={workEndTime}
                onChange={(e) => setWorkEndTime(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="grace">Grace (min)</Label>
              <Input
                id="grace"
                type="number"
                min={0}
                max={120}
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="leaveCap">Monthly Leave Cap</Label>
            <Input
              id="leaveCap"
              type="number"
              min={0}
              max={31}
              value={leaveCap}
              onChange={(e) => setLeaveCap(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Approved leaves beyond this count in a month are marked Absent and deducted.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
