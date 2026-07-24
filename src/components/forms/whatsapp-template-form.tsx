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
import type { WhatsAppTemplate } from '@/lib/types';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';

// Mirrors src/components/forms/email-template-form.tsx — only
// {{customer_name}} is supported (see src/lib/whatsapp-template.ts), so no
// booking/destination/date variables are offered here.
const formSchema = z.object({
  name: z.string().min(1, { message: 'Template name is required.' }),
  body: z.string().min(1, { message: 'Message is required.' }),
});

type WhatsAppTemplateFormValues = z.infer<typeof formSchema>;

interface WhatsAppTemplateFormProps {
  onSubmit: (data: Partial<WhatsAppTemplate>) => void;
  onCancel: () => void;
  template?: WhatsAppTemplate;
  isSubmitting?: boolean;
}

export function WhatsAppTemplateForm({ onSubmit, onCancel, template, isSubmitting = false }: WhatsAppTemplateFormProps) {
  const { user } = useUser();

  const form = useForm<WhatsAppTemplateFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || '',
      body: template?.body || '',
    },
  });

  function handleSubmit(values: WhatsAppTemplateFormValues) {
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
      body: values.body,
      ...auditFields,
    } as Partial<WhatsAppTemplate>);
  }

  return (
    <Form {...form}>
      <form id="whatsapp-template-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Seasonal Offer" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message *</FormLabel>
              <FormControl>
                <Textarea rows={8} placeholder="Hi {{customer_name}}, ..." {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">Available variable: {'{{customer_name}}'}</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="sticky bottom-0 z-20 -mx-6 -mb-4 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting} form="whatsapp-template-form">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {template ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
