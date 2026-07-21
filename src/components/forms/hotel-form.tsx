'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { Hotel } from '@/lib/types';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Hotel name is required.' }),
  city: z.string().optional(),
  country: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  termsAndConditions: z.string().optional(),
  notes: z.string().optional(),
});

type HotelFormValues = z.infer<typeof formSchema>;

interface HotelFormProps {
  onSubmit: (data: Partial<Hotel>) => void;
  onCancel: () => void;
  hotel?: Hotel;
  isSubmitting?: boolean;
}

export function HotelForm({ onSubmit, onCancel, hotel, isSubmitting = false }: HotelFormProps) {
  const { user } = useUser();

  const form = useForm<HotelFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: hotel?.name || '',
      city: hotel?.city || '',
      country: hotel?.country || '',
      address: hotel?.address || '',
      phone: hotel?.phone || '',
      termsAndConditions: hotel?.termsAndConditions || '',
      notes: hotel?.notes || '',
    },
  });

  function handleSubmit(values: HotelFormValues) {
    if (!user || isSubmitting) return;

    const auditFields = hotel
      ? { updatedAt: serverTimestamp(), updatedBy: user.uid }
      : {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        };

    onSubmit({
      name: values.name,
      city: values.city || '',
      country: values.country || '',
      address: values.address || '',
      phone: values.phone || '',
      termsAndConditions: values.termsAndConditions || '',
      notes: values.notes || '',
      active: hotel?.active ?? true,
      ...auditFields,
    } as Partial<Hotel>);
  }

  return (
    <Form {...form}>
      <form id="hotel-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hotel Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Crowne Plaza Dubai" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hotel Address</FormLabel>
              <FormControl><Textarea rows={2} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hotel Telephone No.</FormLabel>
              <FormControl><Input type="tel" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="termsAndConditions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Terms &amp; Conditions</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder={"Paste or type the hotel's terms as-is..."} {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Printed on this hotel's booking vouchers, split into points automatically — no need to format it yourself.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Paste or type anything else worth recording about this hotel..." {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Also printed on the voucher when set, split into points automatically.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="sticky bottom-0 z-20 -mx-6 -mb-4 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting} form="hotel-form">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hotel ? 'Save Changes' : 'Create Hotel'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
