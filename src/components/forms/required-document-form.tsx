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
import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';

const formSchema = z.object({
  names: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one document.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface RequiredDocumentFormProps {
  onSubmit: (data: FormValues) => void;
  existingDocuments: string[];
}

const documentTypes = [
    'Passport Copy',
    'Visa Application Form',
    'Flight Tickets',
    'Hotel Vouchers',
    'Travel Insurance Certificate',
    'Bank Statement',
    'Employment Letter',
    'Itinerary Confirmation',
];

export const RequiredDocumentForm = React.forwardRef<HTMLFormElement, RequiredDocumentFormProps>(({ onSubmit, existingDocuments }, ref) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      names: [],
    },
  });
  
  const availableDocumentTypes = documentTypes.filter(docType => !existingDocuments.includes(docType));

  return (
    <Form {...form}>
      <form id="required-document-form" ref={ref} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="names"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document Types</FormLabel>
                <ScrollArea className="h-72 w-full rounded-md border p-4">
                    {availableDocumentTypes.map((item) => (
                    <FormField
                        key={item}
                        control={form.control}
                        name="names"
                        render={({ field }) => {
                        return (
                            <FormItem
                            key={item}
                            className="flex flex-row items-start space-x-3 space-y-0 mb-4"
                            >
                            <FormControl>
                                <Checkbox
                                checked={field.value?.includes(item)}
                                onCheckedChange={(checked) => {
                                    return checked
                                    ? field.onChange([...(field.value || []), item])
                                    : field.onChange(
                                        field.value?.filter(
                                        (value) => value !== item
                                        )
                                    )
                                }}
                                />
                            </FormControl>
                            <FormLabel className="font-normal">
                                {item}
                            </FormLabel>
                            </FormItem>
                        )
                        }}
                    />
                    ))}
              </ScrollArea>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
});

RequiredDocumentForm.displayName = "RequiredDocumentForm";