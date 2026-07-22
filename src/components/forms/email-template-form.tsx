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
import type { EmailTemplate } from '@/lib/types';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';

const formSchema = z.object({
  name: z.string().min(1, { message: 'Template name is required.' }),
  subject: z.string().min(1, { message: 'Subject is required.' }),
  bodyHtml: z.string().min(1, { message: 'Body is required.' }),
});

type EmailTemplateFormValues = z.infer<typeof formSchema>;

interface EmailTemplateFormProps {
  onSubmit: (data: Partial<EmailTemplate>) => void;
  onCancel: () => void;
  template?: EmailTemplate;
  isSubmitting?: boolean;
}

const AVAILABLE_VARIABLES = [
  '{{customer_name}}',
  '{{booking_id}}',
  '{{destination}}',
  '{{start_date}}',
  '{{end_date}}',
  '{{company}}',
];

export function EmailTemplateForm({ onSubmit, onCancel, template, isSubmitting = false }: EmailTemplateFormProps) {
  const { user } = useUser();

  const form = useForm<EmailTemplateFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || '',
      subject: template?.subject || '',
      bodyHtml: template?.bodyHtml || '',
    },
  });

  function handleSubmit(values: EmailTemplateFormValues) {
    if (!user || isSubmitting) return;

    const auditFields = template
      ? { updatedAt: serverTimestamp(), updatedBy: user.uid }
      : {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        };

    onSubmit({
      name: values.name,
      subject: values.subject,
      bodyHtml: values.bodyHtml,
      ...auditFields,
    } as Partial<EmailTemplate>);
  }

  return (
    <Form {...form}>
      <form id="email-template-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Booking Voucher" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject *</FormLabel>
              <FormControl>
                <Input placeholder="Your booking voucher — {{booking_id}}" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bodyHtml"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Body *</FormLabel>
              <FormControl>
                <Textarea rows={8} className="font-mono text-sm" placeholder="Dear {{customer_name}}, ..." {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Available variables: {AVAILABLE_VARIABLES.join(', ')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="sticky bottom-0 z-20 -mx-6 -mb-4 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting} form="email-template-form">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {template ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
