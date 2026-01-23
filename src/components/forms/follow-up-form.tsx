
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
import { type FollowUp, Client } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Button } from '../ui/button';

const formSchema = z.object({
  clientId: z.string().min(1, 'Client is required.'),
  date: z.date({ required_error: 'Date is required.' }),
  notes: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  done: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface FollowUpFormProps {
  onSubmit: (data: Omit<FollowUp, 'id' | 'clientName' | 'clientEmail' | 'clientPhone'>, client: Client) => void;
  followUp?: FollowUp | null;
  clientForNewTask?: Client;
}

export const FollowUpForm = React.forwardRef<HTMLFormElement, FollowUpFormProps>(({ onSubmit, followUp, clientForNewTask }, ref) => {
  const firestore = useFirestore();
  const [open, setOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  const clientsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'clients') : null, [firestore]);
  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: followUp ? {
      clientId: followUp.clientId,
      date: new Date(followUp.date),
      notes: followUp.notes || '',
      priority: followUp.priority,
      done: followUp.done,
    } : {
      clientId: clientForNewTask?.id || '',
      date: new Date(),
      notes: '',
      priority: 'medium',
      done: false,
    },
  });

  function handleSubmit(values: FormValues) {
    const selectedClient = clients?.find(c => c.id === values.clientId);
    if (!selectedClient) {
        form.setError('clientId', { type: 'manual', message: 'Selected client not found.' });
        return;
    }
    onSubmit({
      ...values,
      notes: values.notes || null,
      date: values.date.toISOString(),
    }, selectedClient);
  }

  return (
    <Form {...form}>
      <form id="follow-up-form" ref={ref} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
            <FormItem className="flex flex-col">
                <FormLabel>Client</FormLabel>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                                variant="outline"
                                role="combobox"
                                disabled={isLoadingClients || !!clientForNewTask}
                                className={cn( "w-full justify-between", !field.value && "text-muted-foreground")}
                            >
                                {isLoadingClients ? "Loading..." : field.value ? (clients?.find(c => c.id === field.value)?.name) : "Select client"}
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
                            <CommandInput placeholder="Search client..." />
                            <CommandEmpty>No client found.</CommandEmpty>
                            <CommandList className="max-h-60 overflow-y-auto overscroll-contain">
                                <CommandGroup>
                                    {clients?.map((client) => (
                                        <CommandItem
                                            value={client.name}
                                            key={client.id}
                                            onSelect={() => {
                                                form.setValue('clientId', client.id)
                                                setOpen(false);
                                            }}
                                        >
                                            <Check className={cn("mr-2 h-4 w-4", client.id === field.value ? "opacity-100" : "opacity-0")} />
                                            {client.name}
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
                <FormLabel>Follow-up Date</FormLabel>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                    <FormControl>
                        <Button
                        variant={'outline'}
                        className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
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
                          if (date) {
                            setIsDatePickerOpen(false);
                          }
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
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea placeholder="What needs to be done?" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
        />
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
});

FollowUpForm.displayName = "FollowUpForm";

    
