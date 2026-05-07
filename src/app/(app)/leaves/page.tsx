'use client';

import { useMemo, useState } from 'react';
import {
  collection,
  doc,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, PlusCircle, X } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  useAppUser,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { Leave, LeaveStatus, LeaveType } from '@/lib/types';
import {
  approvedLeaveDaysInMonth,
  daysBetween,
  formatDateLong,
  todayIST,
} from '@/lib/attendance';

const leaveTypes: { value: LeaveType; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'sick', label: 'Sick' },
  { value: 'earned', label: 'Earned' },
  { value: 'lop', label: 'Loss of Pay (LOP)' },
];

const leaveSchema = z
  .object({
    type: z.enum(['casual', 'sick', 'earned', 'lop']),
    startDate: z.string().min(1, 'Start date is required.'),
    endDate: z.string().min(1, 'End date is required.'),
    reason: z.string().min(3, 'Please provide a brief reason.'),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date cannot be before start date.',
    path: ['endDate'],
  });

const STATUS_BADGE: Record<LeaveStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

export default function LeavesPage() {
  const { authUser, appUser, isAdmin } = useAppUser();

  return (
    <>
      <PageHeader title="Leaves" description="Request leave and view approval status." />
      <div className="grid gap-6">
        {appUser && <LeaveBalanceCards />}
        {isAdmin ? (
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending Approval</TabsTrigger>
              <TabsTrigger value="all">All Leaves</TabsTrigger>
              <TabsTrigger value="mine">My Leaves</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              <AdminLeaveTable filter="pending" />
            </TabsContent>
            <TabsContent value="all">
              <AdminLeaveTable filter="all" />
            </TabsContent>
            <TabsContent value="mine">
              <MyLeaves userId={authUser?.uid ?? null} />
            </TabsContent>
          </Tabs>
        ) : (
          <MyLeaves userId={authUser?.uid ?? null} />
        )}
      </div>
    </>
  );
}

function LeaveBalanceCards() {
  const firestore = useFirestore();
  const { authUser, appUser, isLoading: appUserLoading } = useAppUser();
  const cap = appUser?.monthlyLeaveCap;

  const myLeavesQuery = useMemoFirebase(() => {
    if (!firestore || !authUser || appUserLoading || !cap) return null;
    return query(collection(firestore, 'leaves'), where('userId', '==', authUser.uid));
  }, [firestore, authUser, appUserLoading, cap]);
  const { data: myLeaves } = useCollection<Leave>(myLeavesQuery);

  const balance = useMemo(() => {
    if (!cap) return null;
    const today = todayIST();
    const [y, m] = today.split('-').map(Number);
    const total = approvedLeaveDaysInMonth(myLeaves ?? [], y, m);
    const lop = approvedLeaveDaysInMonth(myLeaves ?? [], y, m, 'lop');
    const usedThisMonth = total - lop;
    const available = Math.max(0, cap - usedThisMonth);
    const monthName = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long' });
    return { usedThisMonth, available, cap, monthName };
  }, [myLeaves, cap]);

  if (!cap || !balance) return null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Monthly Leave Balance · {balance.monthName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{balance.available}</div>
          <p className="text-xs text-muted-foreground">
            of {balance.cap} available · {balance.usedThisMonth} used this month
          </p>
          {balance.usedThisMonth > balance.cap && (
            <p className="text-xs text-destructive mt-1">
              Over the monthly cap — extra days will count as Absent.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MyLeaves({ userId }: { userId: string | null }) {
  const firestore = useFirestore();
  const { appUser, authUser, isLoading: appUserLoading } = useAppUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const myQuery = useMemoFirebase(() => {
    if (!firestore || !userId || appUserLoading) return null;
    return query(collection(firestore, 'leaves'), where('userId', '==', userId));
  }, [firestore, userId, appUserLoading]);
  const { data: leaves, isLoading } = useCollection<Leave>(myQuery);

  const sorted = useMemo(
    () => [...(leaves ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [leaves],
  );

  const form = useForm<z.infer<typeof leaveSchema>>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      type: 'casual',
      startDate: '',
      endDate: '',
      reason: '',
    },
  });

  const submit = (values: z.infer<typeof leaveSchema>) => {
    if (!firestore || !authUser || !appUser) return;
    const days = daysBetween(values.startDate, values.endDate);
    addDocumentNonBlocking(collection(firestore, 'leaves'), {
      userId: authUser.uid,
      userName: appUser.name || authUser.email || 'Unknown',
      type: values.type,
      startDate: values.startDate,
      endDate: values.endDate,
      days,
      reason: values.reason,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    toast({ title: 'Leave requested', description: 'Awaiting admin approval.' });
    setOpen(false);
    form.reset();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>My Leave Requests</CardTitle>
          <CardDescription>Track approval status and history.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Request Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Leave</DialogTitle>
              <DialogDescription>
                Your request will be reviewed by an administrator.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {leaveTypes.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit">Submit Request</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No leave requests yet.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="capitalize">{l.type}</TableCell>
                <TableCell>{formatDateLong(l.startDate)}</TableCell>
                <TableCell>{formatDateLong(l.endDate)}</TableCell>
                <TableCell>{l.days}</TableCell>
                <TableCell className="max-w-[260px] truncate" title={l.reason}>
                  {l.reason}
                </TableCell>
                <TableCell>
                  <Badge className={`${STATUS_BADGE[l.status]} capitalize`}>{l.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AdminLeaveTable({ filter }: { filter: 'pending' | 'all' }) {
  const firestore = useFirestore();
  const { authUser, isAdminOrManager, isLoading: appUserLoading } = useAppUser();
  const { toast } = useToast();

  const ready = !!firestore && !!authUser && isAdminOrManager && !appUserLoading;

  const allQuery = useMemoFirebase(
    () => (ready ? collection(firestore!, 'leaves') : null),
    [ready, firestore],
  );
  const { data: leaves, isLoading } = useCollection<Leave>(allQuery);

  const filtered = useMemo(() => {
    const list = leaves ?? [];
    const arr = filter === 'pending' ? list.filter((l) => l.status === 'pending') : list;
    return [...arr].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [leaves, filter]);

  const decide = (leave: Leave, action: 'approved' | 'rejected') => {
    if (!firestore || !authUser) return;
    const ref = doc(firestore, 'leaves', leave.id);
    updateDocumentNonBlocking(ref, {
      status: action,
      ...(action === 'approved'
        ? { approvedBy: authUser.uid, approvedAt: serverTimestamp() }
        : { rejectedBy: authUser.uid, rejectedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });
    toast({
      title: action === 'approved' ? 'Leave approved' : 'Leave rejected',
      description: `${leave.userName} · ${leave.startDate} to ${leave.endDate}`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{filter === 'pending' ? 'Pending Approvals' : 'All Leaves'}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  Nothing to show.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.userName}</TableCell>
                <TableCell className="capitalize">{l.type}</TableCell>
                <TableCell>{formatDateLong(l.startDate)}</TableCell>
                <TableCell>{formatDateLong(l.endDate)}</TableCell>
                <TableCell>{l.days}</TableCell>
                <TableCell className="max-w-[240px] truncate" title={l.reason}>
                  {l.reason}
                </TableCell>
                <TableCell>
                  <Badge className={`${STATUS_BADGE[l.status]} capitalize`}>{l.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {l.status === 'pending' ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(l, 'rejected')}
                      >
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => decide(l, 'approved')}>
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
