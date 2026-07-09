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
import type { Organization } from '@/lib/types';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Organization name is required.' }),
  contactPerson: z.string().optional(),
  email: z.string().email({ message: 'Invalid email address.' }).optional().or(z.literal('')),
  phone: z.string().optional(),
  gstNumber: z.string().optional(),
  billingAddress: z.string().optional(),
  notes: z.string().optional(),
});

type OrganizationFormValues = z.infer<typeof formSchema>;

interface OrganizationFormProps {
  onSubmit: (data: Partial<Organization>) => void;
  onCancel: () => void;
  organization?: Organization;
  isSubmitting?: boolean;
}

export function OrganizationForm({ onSubmit, onCancel, organization, isSubmitting = false }: OrganizationFormProps) {
  const { user } = useUser();

  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: organization?.name || '',
      contactPerson: organization?.contactPerson || '',
      email: organization?.email || '',
      phone: organization?.phone || '',
      gstNumber: organization?.gstNumber || '',
      billingAddress: organization?.billingAddress || '',
      notes: organization?.notes || '',
    },
  });

  function handleSubmit(values: OrganizationFormValues) {
    if (!user || isSubmitting) return;

    const auditFields = organization
      ? { updatedAt: serverTimestamp(), updatedBy: user.uid }
      : {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        };

    onSubmit({
      name: values.name,
      type: 'corporate',
      contactPerson: values.contactPerson || '',
      email: values.email || '',
      phone: values.phone || '',
      gstNumber: values.gstNumber || '',
      billingAddress: values.billingAddress || '',
      notes: values.notes || '',
      ...auditFields,
    } as Partial<Organization>);
  }

  return (
    <Form {...form}>
      <form id="organization-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Acme Corp Pvt. Ltd." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="contactPerson"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Person</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gstNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>GST Number</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="billingAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Billing Address</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
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
                <Textarea rows={2} placeholder="Internal notes about this organization..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="sticky bottom-0 z-20 -mx-6 -mb-4 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting} form="organization-form">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {organization ? 'Save Changes' : 'Create Organization'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
