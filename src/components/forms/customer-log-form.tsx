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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '../ui/button';
import { type CustomerLog, type Client } from '@/lib/types';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';

const formSchema = z.object({
  activity: z.string().min(1, { message: 'Log entry cannot be empty.' }),
});

type LogFormValues = z.infer<typeof formSchema>;

interface CustomerLogFormProps {
  client: Pick<Client, 'id' | 'name'>;
  onSubmit: (data: Omit<CustomerLog, 'id' | 'timestamp' | 'clientId' | 'clientName' | 'userName'>) => void;
}

export const CustomerLogForm = React.forwardRef<HTMLFormElement, CustomerLogFormProps>(({ client, onSubmit }, ref) => {
    const { user } = useUser();
    const form = useForm<LogFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            activity: '',
        },
    });

  function handleSubmit(values: LogFormValues) {
    if (!user) {
        console.error("User not authenticated");
        return;
    }
    onSubmit({
        ...values,
        userId: user.uid,
        // Audit Fields
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
        updatedBy: user.uid,
    });
    form.reset();
  }

  return (
    <Form {...form}>
      <form id="customer-log-form" ref={ref} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="activity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Log Entry</FormLabel>
              <FormControl>
                <Textarea placeholder="Record an interaction, note, or follow-up action..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full">Add Log</Button>
      </form>
    </Form>
  );
});

CustomerLogForm.displayName = "CustomerLogForm";
