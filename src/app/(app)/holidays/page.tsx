'use client';

import { useMemo, useState } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  addDocumentNonBlocking,
  deleteDocumentNonBlocking,
  useAppUser,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { Holiday } from '@/lib/types';
import { formatDateLong } from '@/lib/attendance';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';

const holidaySchema = z.object({
  date: z.string().min(1, 'Date is required.'),
  name: z.string().min(2, 'Name must be at least 2 characters.'),
});

export default function HolidaysPage() {
  const firestore = useFirestore();
  const { authUser, isAdmin } = useAppUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [holidayToDelete, setHolidayToDelete] = useState<Holiday | null>(null);

  const holidaysQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'holidays') : null),
    [firestore],
  );
  const { data: holidays, isLoading } = useCollection<Holiday>(holidaysQuery);

  const sorted = useMemo(
    () => [...(holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays],
  );

  const form = useForm<z.infer<typeof holidaySchema>>({
    resolver: zodResolver(holidaySchema),
    defaultValues: { date: '', name: '' },
  });

  const submit = (values: z.infer<typeof holidaySchema>) => {
    if (!firestore || !authUser) return;
    addDocumentNonBlocking(collection(firestore, 'holidays'), {
      date: values.date,
      name: values.name,
      createdAt: serverTimestamp(),
      createdBy: authUser.uid,
    });
    toast({ title: 'Holiday added', description: `${values.name} – ${values.date}` });
    setOpen(false);
    form.reset({ date: '', name: '' });
  };

  const remove = (h: Holiday) => {
    if (!firestore) return;
    deleteDocumentNonBlocking(doc(firestore, 'holidays', h.id));
    toast({ title: 'Holiday removed', description: h.name });
    setHolidayToDelete(null);
  };

  return (
    <>
      <PageHeader
        title="Holidays"
        description="Company holidays — these days are non-working in payroll."
      >
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Holiday
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Holiday</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Republic Day" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit">Add</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>{sorted.length} holiday{sorted.length === 1 ? '' : 's'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Name</TableHead>
                {isAdmin && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    No holidays defined yet.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((h) => {
                const [y, m, d] = h.date.split('-').map(Number);
                const dayName = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
                  weekday: 'long',
                });
                return (
                  <TableRow key={h.id}>
                    <TableCell>{formatDateLong(h.date)}</TableCell>
                    <TableCell className="text-muted-foreground">{dayName}</TableCell>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setHolidayToDelete(h)}
                          aria-label="Remove holiday"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!holidayToDelete}
        onOpenChange={(o) => !o && setHolidayToDelete(null)}
        onConfirm={() => holidayToDelete && remove(holidayToDelete)}
        confirmText={holidayToDelete?.name || ''}
        confirmLabel="Remove"
        description={
          <>
            This will remove the holiday{' '}
            <span className="font-semibold text-foreground">{holidayToDelete?.name}</span>
            {holidayToDelete ? ` (${formatDateLong(holidayToDelete.date)})` : ''}.
          </>
        }
      />
    </>
  );
}
