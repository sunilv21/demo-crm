
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Client } from '@/lib/types';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';

const formSchema = z.object({
  status: z.enum(['active', 'inactive', 'lead', 'prospect']),
  visaStatus: z.enum(['toStart', 'inProcess', 'applied', 'approved', 'rejected', 'completed', 'travelling', '']).optional(),
});

type StatusFormValues = z.infer<typeof formSchema>;

interface StatusUpdateFormProps {
  onSubmit: (data: Partial<Client>) => void;
  client: Client;
}

export const StatusUpdateForm = React.forwardRef<HTMLFormElement, StatusUpdateFormProps>(({ onSubmit, client }, ref) => {
  const { user } = useUser();
  const form = useForm<StatusFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      status: client?.status || 'prospect',
      visaStatus: client?.visaStatus || '',
    },
  });

  function handleSubmit(values: StatusFormValues) {
    if (!user) {
        console.error("User is not authenticated. Cannot submit form.");
        return;
    }
    onSubmit({
      status: values.status,
      ...(values.visaStatus ? { visaStatus: values.visaStatus } : {}),
    });
  }

  return (
    <Form {...form}>
      <form id="status-update-form" ref={ref} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="visaStatus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visa Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select visa status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="toStart">To Start</SelectItem>
                  <SelectItem value="inProcess">In Process</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="travelling">Travelling</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full">Update Status</Button>
      </form>
    </Form>
  );
});

StatusUpdateForm.displayName = "StatusUpdateForm";
