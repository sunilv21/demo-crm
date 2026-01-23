
'use client';
import React, { useEffect, useState } from 'react';
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
import { Button } from '../ui/button';
import { type VisaHistoryItem } from '@/lib/types';
import { useCountries } from '@/hooks/use-countries';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Check, ChevronsUpDown } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';

const formSchema = z.object({
  country: z.string().min(1, 'Country is required.'),
  status: z.enum(['approved', 'rejected'], { required_error: 'Status is required.' }),
  date: z.date({ required_error: 'Date is required.' }),
  rejectionReason: z.string().optional(),
}).refine(data => {
    if (data.status === 'rejected') {
        return !!data.rejectionReason && data.rejectionReason.length > 0;
    }
    return true;
}, {
    message: 'Rejection reason is required when status is "Rejected".',
    path: ['rejectionReason'],
});

type FormValues = z.infer<typeof formSchema>;

interface VisaHistoryFormProps {
  onSubmit: (data: VisaHistoryItem) => void;
  visaHistoryItem?: VisaHistoryItem | null;
}

export const VisaHistoryForm = React.forwardRef<HTMLFormElement, VisaHistoryFormProps>(({ onSubmit, visaHistoryItem }, ref) => {
  const { countryNames } = useCountries();
  const [open, setOpen] = React.useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      country: visaHistoryItem?.country || '',
      status: visaHistoryItem?.status || 'approved',
      date: visaHistoryItem ? new Date(visaHistoryItem.date) : undefined,
      rejectionReason: visaHistoryItem?.rejectionReason || '',
    },
  });

  useEffect(() => {
    if (visaHistoryItem) {
        form.reset({
            country: visaHistoryItem.country,
            status: visaHistoryItem.status,
            date: new Date(visaHistoryItem.date),
            rejectionReason: visaHistoryItem.rejectionReason || '',
        });
    } else {
        form.reset({
            country: '',
            status: 'approved',
            date: undefined,
            rejectionReason: '',
        });
    }
  }, [visaHistoryItem, form]);


  const status = form.watch('status');

  function handleSubmit(values: FormValues) {
    onSubmit({
        ...values,
        date: values.date.toISOString(),
    });
  }

  return (
    <Form {...form}>
      <form id="visa-history-form" ref={ref} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
            <FormItem className="flex flex-col">
                <FormLabel>Country</FormLabel>
                 <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                    "w-full justify-between",
                                    !field.value && "text-muted-foreground"
                                )}
                            >
                                {field.value ? countryNames.find(c => c === field.value) : "Select country"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-[--radix-popover-trigger-width] p-0"
                        side="bottom"
                        align="start"
                        avoidCollisions={false}
                    >
                        <Command>
                            <CommandInput placeholder="Search country..." />
                            <CommandEmpty>No country found.</CommandEmpty>
                            <CommandList className="max-h-60 overflow-y-auto overscroll-contain">
                                <CommandGroup>
                                    {countryNames.map((country) => (
                                        <CommandItem
                                            value={country}
                                            key={country}
                                            onSelect={() => {
                                                form.setValue('country', country)
                                                setOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    country === field.value ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {country}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                <FormMessage />
            </FormItem>
            )}
        />
        <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>Application Date</FormLabel>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                    <FormControl>
                        <Button
                        variant={'outline'}
                        className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                        )}
                        >
                        {field.value ? (
                            format(field.value, 'PPP')
                        ) : (
                            <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                    </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                            field.onChange(date);
                            setIsDatePickerOpen(false);
                        }}
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
                <FormMessage />
                </FormItem>
            )}
            />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {status === 'rejected' && (
            <FormField
            control={form.control}
            name="rejectionReason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reason for Rejection</FormLabel>
                <FormControl>
                  <Textarea placeholder="Explain why the visa was rejected..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </form>
    </Form>
  );
});

VisaHistoryForm.displayName = "VisaHistoryForm";

    
