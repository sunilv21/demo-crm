
'use client';
import React from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { Button } from '../ui/button';
import { type PreviousTrip } from '@/lib/types';
import { useCountries } from '@/hooks/use-countries';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Check, ChevronsUpDown } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';

const formSchema = z.object({
  country: z.string().min(1, 'Country is required.'),
  startDate: z.date({ required_error: 'Start date is required.' }),
  endDate: z.date({ required_error: 'End date is required.' }),
}).refine(data => data.endDate >= data.startDate, {
    message: "End date cannot be before start date.",
    path: ["endDate"],
});

type FormValues = z.infer<typeof formSchema>;

interface PreviousTripFormProps {
  onSubmit: (data: PreviousTrip) => void;
  previousTrip?: PreviousTrip | null;
}

export const PreviousTripForm = React.forwardRef<HTMLFormElement, PreviousTripFormProps>(({ onSubmit, previousTrip }, ref) => {
  const { countryNames } = useCountries();
  const [open, setOpen] = React.useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = React.useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = React.useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      country: previousTrip?.country || '',
      startDate: previousTrip ? new Date(previousTrip.startDate) : undefined,
      endDate: previousTrip ? new Date(previousTrip.endDate) : undefined,
    },
  });

  const startDate = useWatch({
    control: form.control,
    name: 'startDate',
  });

  function handleSubmit(values: FormValues) {
    onSubmit({
        ...values,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
    });
  }

  return (
    <Form {...form}>
      <form id="previous-trip-form" ref={ref} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
        <div className="grid grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
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
                                const currentEndDate = form.getValues('endDate');
                                if (currentEndDate && date && date > currentEndDate) {
                                    form.setValue('endDate', undefined);
                                }
                                setIsStartDatePickerOpen(false);
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
                name="endDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel>End Date</FormLabel>
                    <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
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
                                setIsEndDatePickerOpen(false);
                            }}
                            disabled={{ before: startDate as Date }}
                            initialFocus
                            defaultMonth={startDate}
                        />
                        </PopoverContent>
                    </Popover>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>
      </form>
    </Form>
  );
});

PreviousTripForm.displayName = "PreviousTripForm";

    
