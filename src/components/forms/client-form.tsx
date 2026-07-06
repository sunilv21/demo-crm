
'use client';
import React from 'react';
import { useForm, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Client, Companion } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Check, ChevronsUpDown, Bell, Trash2, Loader2, PlusCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, parse } from 'date-fns';
import { useCountries, type CountryInfo } from '@/hooks/use-countries';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import parsePhoneNumber, { AsYouType, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { useFormPersistence } from '@/hooks/use-form-persistence';
import { DialogFooter } from '../ui/dialog';
import { Separator } from '../ui/separator';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Label } from '../ui/label';


// Firestore rejects `undefined` anywhere (incl. nested objects / array items).
// Recursively replace undefined with null. Safe here because dates are already
// serialized and serverTimestamp() sentinels are added separately, not cleaned.
function deepStripUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(deepStripUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      const cleaned = deepStripUndefined(value[key]);
      out[key] = cleaned === undefined ? null : cleaned;
    }
    return out;
  }
  return value === undefined ? null : value;
}

const SERVICE_OPTIONS = [
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'visa', label: 'Visa' },
  { value: 'transfers', label: 'Transfers' },
  { value: 'activity', label: 'Activity' },
  { value: 'localTours', label: 'Local Tours' },
] as const;

// Form values are persisted to localStorage (useFormPersistence), where Dates
// are serialized to strings. Revive strings back into Date objects so z.date()
// validation doesn't fail with "Expected date, received string".
const optionalDate = z.preprocess((v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return v;
}, z.date().optional());

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name is required.' }),
  email: z.string().email({ message: 'Invalid email address.' }).optional().or(z.literal('')),
  country: z.string().optional(),
  phone: z.string().min(1, { message: 'Phone is required.' }),
  travelPurpose: z.string().optional(),
  dateOfBirth: optionalDate,
  gender: z.enum(['male', 'female', 'other']).optional(),
  nationality: z.string().optional(),
  preferredDestination: z.string().optional(),
  preferredTravelDates: z.object({
    from: optionalDate,
    to: optionalDate,
  }).optional(),
  tripDestinations: z.array(z.object({
    destination: z.string().optional(),
    from: optionalDate,
    to: optionalDate,
  })).optional(),
  services: z.array(z.enum(['flight', 'hotel', 'visa', 'transfers', 'activity', 'localTours'])).optional(),
  additionalServices: z.array(z.string()).optional(),
  preferences: z.string().optional(),
  status: z.enum(['active', 'inactive', 'lead', 'prospect']),
  visaStatus: z.enum(['toStart', 'inProcess', 'applied', 'approved', 'rejected', 'completed', 'travelling', '']).optional(),
  pax: z.coerce.number().int().min(1, "PAX must be at least 1.").optional(),
  companions: z.array(z.object({
    name: z.string().min(1, 'Companion name is required.'),
    type: z.enum(['adult', 'child', 'infant']).optional(),
  })).optional(),
  assignedEmployee: z.string().optional(),
}).refine(data => !data.phone || !data.country || isValidPhoneNumber(data.phone, data.country as CountryCode), {
  message: "Invalid phone number for the selected country.",
  path: ["phone"],
});

type ClientFormValues = z.infer<typeof formSchema>;

interface ClientFormProps {
  onSubmit: (data: Partial<Client>) => void;
  onCancel: () => void;
  client?: Client;
  isPublicForm?: boolean;
  isSubmitting?: boolean;
  canAssign?: boolean;
  staffUsers?: { id: string; name: string }[];
}

const FormCard: React.FC<React.PropsWithChildren<{isPublicForm: boolean} & React.HTMLAttributes<HTMLDivElement>>> = ({ isPublicForm, className, ...props }) => {
    const cardClass = isPublicForm 
        ? "bg-white/10 backdrop-blur-md border-white/20 text-white" 
        : "bg-card text-card-foreground";

    return <Card className={cn(cardClass, className)} {...props} />;
};


const Combobox = ({
  field,
  data,
  placeholder,
  isPublicForm,
}: {
  field: any;
  data: readonly (string | CountryInfo)[];
  placeholder: string;
  isPublicForm?: boolean;
}) => {
  const [open, setOpen] = React.useState(false);

  const isCountryInfo = (d: any): d is CountryInfo =>
    typeof d === 'object' && 'value' in d && 'label' in d;

  const findLabel = (value: string) => {
    const item = data.find(
      (item) => (isCountryInfo(item) ? item.value : item) === value
    );
    return item
      ? isCountryInfo(item)
        ? item.label
        : item
      : placeholder;
  };

  const comboboxTriggerClass = isPublicForm 
    ? "bg-white/20 border-white/30 text-white hover:bg-white/30" 
    : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            role="combobox"
            className={cn(
              'w-full justify-between',
              !field.value && (isPublicForm ? 'text-white/60' : 'text-muted-foreground'),
              comboboxTriggerClass
            )}
          >
            {findLabel(field.value)}
            <ChevronsUpDown className={cn(
              "ml-2 h-4 w-4 shrink-0",
              isPublicForm ? "opacity-70" : "opacity-50"
            )} />
          </Button>
        </FormControl>
      </PopoverTrigger>

      <PopoverContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "w-[--radix-popover-trigger-width] p-0",
          isPublicForm ? "bg-gray-800 text-white border-white/20" : ""
        )}
        side="bottom"
        align="start"
        avoidCollisions={false}
      >
        <Command>
          <CommandInput
            placeholder={`Search ${placeholder.toLowerCase()}...`}
            className="h-9"
          />

          <CommandList className="max-h-60 overflow-y-auto overscroll-contain">
            <CommandEmpty>
              No {placeholder.toLowerCase()} found.
            </CommandEmpty>

            <CommandGroup>
              {data.map((item) => {
                const label = isCountryInfo(item) ? item.label : item;
                const value = isCountryInfo(item) ? item.value : item;

                return (
                  <CommandItem
                    key={value}
                    value={label}
                    onSelect={() => {
                      field.onChange(value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === field.value
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const ClientForm = React.forwardRef<HTMLFormElement, ClientFormProps>(({ onSubmit, onCancel, client, isPublicForm = false, isSubmitting = false, canAssign = false, staffUsers = [] }, ref) => {
  const { countryNames, countryOptions, nationalities } = useCountries();
  const { user } = useUser();
  const FORM_KEY = client ? `client-form-${client.id}` : 'new-client-form';
  
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: client?.name || '',
      email: client?.email || '',
      country: client?.phone ? parsePhoneNumber(client.phone)?.country : 'IN',
      phone: client?.phone ? parsePhoneNumber(client.phone)?.nationalNumber : '',
      travelPurpose: client?.travelPurpose || '',
      dateOfBirth: client?.dateOfBirth ? new Date(client.dateOfBirth) : undefined,
      gender: client?.gender,
      nationality: client?.nationality || '',
      preferredDestination: client?.preferredDestination || '',
      preferredTravelDates: {
        from: client?.preferredTravelDates?.from ? new Date(client.preferredTravelDates.from) : undefined,
        to: client?.preferredTravelDates?.to ? new Date(client.preferredTravelDates.to) : undefined,
      },
      tripDestinations: client?.tripDestinations?.map(d => ({
        destination: d.destination || '',
        from: d.from ? new Date(d.from) : undefined,
        to: d.to ? new Date(d.to) : undefined,
      })) || [],
      services: Array.isArray(client?.services) ? client.services : (client?.services ? [client.services as any] : []),
      additionalServices: client?.additionalServices || [],
      preferences: client?.preferences || '',
      status: client?.status || 'prospect',
      visaStatus: client?.visaStatus || '',
      pax: client?.pax || 1,
      companions: client?.companions || [],
      assignedEmployee: client?.assignedEmployee || '',
    },
  });
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "companions",
  });

  const { fields: tripFields, append: appendTrip, remove: removeTrip } = useFieldArray({
    control: form.control,
    name: "tripDestinations",
  });

  const { clearSavedData } = useFormPersistence<ClientFormValues>(FORM_KEY, form);

  function handleSubmit(values: ClientFormValues) {
    if ((!user && !isPublicForm) || isSubmitting) {
        return;
    }
    const randomAvatar = PlaceHolderImages[Math.floor(Math.random() * PlaceHolderImages.length)].imageUrl;
    const phoneNumber = values.phone && values.country ? parsePhoneNumber(values.phone, values.country as CountryCode) : null;

    const { country, ...restOfValues } = values;
    
    const dataToSubmit: { [key: string]: any } = {
      ...restOfValues,
    };

    // Replace all top-level undefined values with null
    Object.keys(dataToSubmit).forEach(keyStr => {
      const key = keyStr as keyof typeof dataToSubmit;
      if (dataToSubmit[key] === undefined) {
        dataToSubmit[key] = null;
      }
    });

    // Now, perform specific transformations
    dataToSubmit.phone = phoneNumber?.format('E.164') || values.phone;
    dataToSubmit.avatar = client?.avatar || randomAvatar;
    dataToSubmit.companions = (values.companions || []).map(c => ({
        name: c.name,
        type: c.type || 'adult',
    }));
    
    dataToSubmit.dateOfBirth = values.dateOfBirth ? values.dateOfBirth.toISOString() : null;

    dataToSubmit.preferredTravelDates = {
        from: values.preferredTravelDates?.from?.toISOString() ?? null,
        to: values.preferredTravelDates?.to?.toISOString() ?? null,
    };

    dataToSubmit.assignedEmployee =
        values.assignedEmployee && values.assignedEmployee !== 'unassigned'
            ? values.assignedEmployee
            : null;

    dataToSubmit.tripDestinations = (values.tripDestinations || []).map(d => ({
        destination: d.destination || null,
        from: d.from ? d.from.toISOString() : null,
        to: d.to ? d.to.toISOString() : null,
    }));

    if (!dataToSubmit.additionalServices) {
      dataToSubmit.additionalServices = [];
    }

    const auditFields = client
        ? { updatedBy: user?.uid || 'public_form' }
        : {
            createdAt: serverTimestamp(),
            createdBy: user?.uid || 'public_form',
            updatedBy: user?.uid || 'public_form',
          };

    onSubmit({
      ...deepStripUndefined(dataToSubmit),
      ...auditFields
    } as Partial<Client>);

    if (!isPublicForm) {
      clearSavedData();
    }
  }
  
  const handleClearForm = () => {
    form.reset({
      name: '',
      email: '',
      country: 'IN',
      phone: '',
      travelPurpose: '',
      dateOfBirth: undefined,
      gender: undefined,
      nationality: '',
      preferredDestination: '',
      preferredTravelDates: {
        from: undefined,
        to: undefined,
      },
      tripDestinations: [],
      services: [],
      additionalServices: [],
      preferences: '',
      status: 'prospect',
      visaStatus: '',
      pax: 1,
      companions: [],
      assignedEmployee: '',
    });
    if(!client){
        clearSavedData();
    }
  };
  
  const formLabelClass = isPublicForm ? "text-white/90" : "";
  const formInputClass = isPublicForm ? "bg-white/20 border-white/30 text-white placeholder:text-white/60" : "";
  const formSelectTriggerClass = isPublicForm ? "bg-white/20 border-white/30 text-white" : "";
  const formSelectContentClass = isPublicForm ? "bg-gray-800 text-white" : "";
  const formRadioLabelClass = isPublicForm ? "text-white/90 font-normal" : "font-normal";

  const DatePicker = ({ field, isPublicForm }: { field: any, isPublicForm?: boolean }) => {
    const [open, setOpen] = React.useState(false);
    
    const rawStartDate = form.getValues('preferredTravelDates.from');
    const startDate = rawStartDate ? new Date(rawStartDate) : null;
    const isValidStartDate = startDate && !isNaN(startDate.getTime());
    
    const date = field.value ? new Date(field.value) : null;
    const isValidDate = date && !isNaN(date.getTime());

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <FormControl>
                    <Button
                        variant={'outline'}
                        className={cn('w-full pl-3 text-left font-normal', !isValidDate && 'text-muted-foreground', formSelectTriggerClass)}
                    >
                        {isValidDate ? format(date, 'PPP') : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                </FormControl>
            </PopoverTrigger>
            <PopoverContent className={cn("w-auto p-0", isPublicForm && "dark")} align="start">
                <Calendar
                    mode="single"
                    selected={isValidDate ? date : undefined}
                    onSelect={(selectedDate) => {
                        field.onChange(selectedDate);
                        
                        if (field.name === 'preferredTravelDates.from') {
                            const rawEndDate = form.getValues('preferredTravelDates.to');
                            const endDate = rawEndDate ? new Date(rawEndDate) : null;
                            if (endDate && selectedDate && endDate < selectedDate) {
                                form.setValue('preferredTravelDates.to', undefined);
                            }
                        }
                        
                        if (selectedDate) setOpen(false);
                    }}
                    disabled={(d) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        if (field.name === 'preferredTravelDates.to' && isValidStartDate && startDate) {
                            return d < startDate;
                        }
                        return d < today;
                    }}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
  };

  const BirthDatePicker = ({ field, isPublicForm }: { field: any, isPublicForm?: boolean }) => {
    const [open, setOpen] = React.useState(false);
    const currentYear = new Date().getFullYear();

    const date = field.value ? new Date(field.value) : null;
    const isValidDate = date && !isNaN(date.getTime());

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <FormControl>
                    <Button
                        variant={'outline'}
                        className={cn('w-full pl-3 text-left font-normal', !isValidDate && 'text-muted-foreground', formSelectTriggerClass)}
                    >
                        {isValidDate ? format(date, 'PPP') : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                </FormControl>
            </PopoverTrigger>
            <PopoverContent className={cn("w-auto p-0", isPublicForm && "dark")} align="start">
                <Calendar
                    mode="single"
                    selected={isValidDate ? date : undefined}
                    onSelect={(d) => {
                        field.onChange(d);
                        if (d) setOpen(false);
                    }}
                    disabled={(d) => d > new Date()}
                    captionLayout="dropdown-buttons"
                    fromYear={1900}
                    toYear={currentYear}
                    defaultMonth={isValidDate && date ? date : new Date(currentYear - 30, 0, 1)}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
  };
  

  return (
    <Form {...form}>
      <form ref={ref} id="client-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {canAssign && (
        <FormCard isPublicForm={isPublicForm}>
            <CardHeader>
                <CardTitle>Assignment</CardTitle>
                <CardDescription>Assign this client to an employee who will handle it.</CardDescription>
            </CardHeader>
            <CardContent>
                <FormField
                    control={form.control}
                    name="assignedEmployee"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className={formLabelClass}>Assigned Employee</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                                <FormControl>
                                    <SelectTrigger className={formSelectTriggerClass}>
                                        <SelectValue placeholder="Unassigned" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className={formSelectContentClass}>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {staffUsers.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </FormCard>
        )}

        <FormCard isPublicForm={isPublicForm}>
            <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>
                    Provide the main contact details for the client.
                    {!isPublicForm && (
                        <Button type="button" variant="link" onClick={handleClearForm} className="text-destructive p-0 h-auto ml-2">
                            Clear Form
                        </Button>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className={formLabelClass}>Name *</FormLabel>
                            <FormControl>
                            <Input {...field} className={formInputClass}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className={formLabelClass}>Email</FormLabel>
                            <FormControl>
                            <Input type="email" {...field} className={formInputClass}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>Country</FormLabel>
                            <Combobox
                                field={field}
                                data={countryOptions}
                                placeholder="Select country"
                                isPublicForm={isPublicForm}
                            />
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className={formLabelClass}>Phone *</FormLabel>
                        <FormControl>
                            <Input
                            type="tel"
                            placeholder="Phone number"
                            {...field}
                            value={field.value ?? ''}
                            className={formInputClass}
                            />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
            </CardContent>
        </FormCard>
        
        <FormCard isPublicForm={isPublicForm}>
            <CardHeader>
                <CardTitle>Personal Details</CardTitle>
                <CardDescription>Enter the client's personal information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>Date of Birth</FormLabel>
                            <BirthDatePicker field={field} isPublicForm={isPublicForm} />
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                        <FormField
                            control={form.control}
                            name="gender"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel className={formLabelClass}>Gender</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger className={formSelectTriggerClass}>
                                    <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className={formSelectContentClass}>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="pax"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className={formLabelClass}>PAX (Total Travelers)</FormLabel>
                                    <FormControl>
                                        <Input type="number" min={1} {...field} className={formInputClass}/>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="nationality"
                            render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel className={formLabelClass}>Nationality</FormLabel>
                                <Combobox field={field} data={nationalities} placeholder="Select nationality" isPublicForm={isPublicForm} />
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </div>
                     <div className='mt-4'>
                        <Label className={formLabelClass}>Companions</Label>
                        <p className={cn("text-sm mt-1", isPublicForm ? 'text-white/70' : 'text-muted-foreground')}>
                            Add details of people travelling with the client.
                        </p>
                        <div className="space-y-2 mt-2">
                            {fields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-2">
                                <FormField
                                control={form.control}
                                name={`companions.${index}.name`}
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                    <FormControl>
                                        <Input placeholder={`Companion ${index + 1} Name`} {...field} className={formInputClass} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <FormField
                                control={form.control}
                                name={`companions.${index}.type`}
                                render={({ field }) => (
                                    <FormItem className="w-32">
                                    <Select onValueChange={field.onChange} value={field.value ?? 'adult'}>
                                        <FormControl>
                                            <SelectTrigger className={formSelectTriggerClass}>
                                                <SelectValue placeholder="Type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className={formSelectContentClass}>
                                            <SelectItem value="adult">Adult</SelectItem>
                                            <SelectItem value="child">Child</SelectItem>
                                            <SelectItem value="infant">Infant</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                className={cn(isPublicForm ? 'text-white/80 hover:text-white' : '', 'hover:bg-destructive/10 hover:text-destructive')}
                                >
                                <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                            ))}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => append({ name: "", type: "adult" })}
                        >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Companion
                        </Button>
                    </div>
            </CardContent>
        </FormCard>

        <FormCard isPublicForm={isPublicForm}>
            <CardHeader>
                <CardTitle>Travel Preferences</CardTitle>
                <CardDescription>Help us understand what the client is looking for.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    {/* Travel Purpose */}
                    <FormField
                        control={form.control}
                        name="travelPurpose"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>Travel Purpose</FormLabel>

                            <FormControl>
                            <Select
                                value={field.value}
                                onValueChange={field.onChange}
                            >
                                <SelectTrigger className={formSelectTriggerClass}>
                                <SelectValue placeholder="Select purpose" />
                                </SelectTrigger>

                                <SelectContent className={formSelectContentClass}>
                                <SelectItem value="leisure">Leisure</SelectItem>
                                <SelectItem value="tourism">Tourism</SelectItem>
                                <SelectItem value="visit">Visit</SelectItem>
                                <SelectItem value="business">Business</SelectItem>
                                <SelectItem value="family">Family</SelectItem>
                                </SelectContent>
                            </Select>
                            </FormControl>

                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    {/* Preferred Destination */}
                    <FormField
                        control={form.control}
                        name="preferredDestination"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>
                            Preferred Destination(s)
                            </FormLabel>

                            <FormControl>
                            <Combobox
                                field={field}
                                data={countryNames}
                                placeholder="Select destination"
                                isPublicForm={isPublicForm}
                            />
                            </FormControl>

                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="preferredTravelDates.from"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>Preferred Start Date</FormLabel>
                                <DatePicker field={field} isPublicForm={isPublicForm} />
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="preferredTravelDates.to"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>Preferred End Date</FormLabel>
                                <DatePicker field={field} isPublicForm={isPublicForm} />
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="mt-2">
                    <Label className={formLabelClass}>Trip Destinations</Label>
                    <p className={cn("text-sm mt-1", isPublicForm ? 'text-white/70' : 'text-muted-foreground')}>
                        Add each country the client will visit on this trip, with dates.
                    </p>
                    <div className="space-y-3 mt-2">
                        {tripFields.map((tripField, index) => (
                            <div key={tripField.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end rounded-lg border p-3">
                                <FormField
                                    control={form.control}
                                    name={`tripDestinations.${index}.destination`}
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className={formLabelClass}>Destination</FormLabel>
                                            <FormControl>
                                                <Combobox field={field} data={countryNames} placeholder="Select country" isPublicForm={isPublicForm} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`tripDestinations.${index}.from`}
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className={formLabelClass}>From</FormLabel>
                                            <DatePicker field={field} isPublicForm={isPublicForm} />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`tripDestinations.${index}.to`}
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className={formLabelClass}>To</FormLabel>
                                            <DatePicker field={field} isPublicForm={isPublicForm} />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeTrip(index)}
                                    className={cn(isPublicForm ? 'text-white/80 hover:text-white' : '', 'hover:bg-destructive/10 hover:text-destructive')}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => appendTrip({ destination: '', from: undefined, to: undefined })}
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Destination
                    </Button>
                </div>
            </CardContent>
        </FormCard>

        <FormCard isPublicForm={isPublicForm}>
            <CardHeader>
                <CardTitle>Services</CardTitle>
                <CardDescription>Select the services the client is interested in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField
                control={form.control}
                name="services"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                        <FormLabel className={formLabelClass}>Service Type</FormLabel>
                        <FormDescription className={isPublicForm ? 'text-white/70' : ''}>
                            Select one or more services the client needs.
                        </FormDescription>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {SERVICE_OPTIONS.map((option) => {
                                const current = field.value || [];
                                const checked = current.includes(option.value);
                                return (
                                    <div key={option.value} className="flex items-center space-x-3 space-y-0">
                                        <Checkbox
                                            id={`service-${option.value}`}
                                            checked={checked}
                                            onCheckedChange={(isChecked) => {
                                                field.onChange(
                                                    isChecked
                                                        ? [...current, option.value]
                                                        : current.filter((v) => v !== option.value)
                                                );
                                            }}
                                        />
                                        <Label htmlFor={`service-${option.value}`} className={formRadioLabelClass}>
                                            {option.label}
                                        </Label>
                                    </div>
                                );
                            })}
                        </div>
                        <FormMessage />
                    </FormItem>
                )}
                />

                <div>
                    <FormLabel className={formLabelClass}>Additional Services</FormLabel>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0 mt-2">
                        <FormField
                        control={form.control}
                        name="additionalServices"
                        render={() => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl><Checkbox onCheckedChange={(checked) => {
                                const current = form.getValues('additionalServices') || [];
                                return checked ? form.setValue('additionalServices', [...current, 'travelInsurance']) : form.setValue('additionalServices', current.filter(v => v !== 'travelInsurance'))
                            }} /></FormControl>
                            <FormLabel className={formRadioLabelClass}>Travel Insurance</FormLabel>
                            </FormItem>
                        )} />
                        <FormField
                        control={form.control}
                        name="additionalServices"
                        render={() => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl><Checkbox onCheckedChange={(checked) => {
                                const current = form.getValues('additionalServices') || [];
                                return checked ? form.setValue('additionalServices', [...current, 'airportPickup']) : form.setValue('additionalServices', current.filter(v => v !== 'airportPickup'))
                            }} /></FormControl>
                            <FormLabel className={formRadioLabelClass}>Airport Pickup</FormLabel>
                            </FormItem>
                        )} />
                        <FormField
                        control={form.control}
                        name="additionalServices"
                        render={() => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl><Checkbox onCheckedChange={(checked) => {
                                const current = form.getValues('additionalServices') || [];
                                return checked ? form.setValue('additionalServices', [...current, 'localTours']) : form.setValue('additionalServices', current.filter(v => v !== 'localTours'))
                            }} /></FormControl>
                            <FormLabel className={formRadioLabelClass}>Local Tours</FormLabel>
                            </FormItem>
                        )} />
                    </div>
                </div>

                <FormField
                control={form.control}
                name="preferences"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className={formLabelClass}>Additional Notes or Preferences</FormLabel>
                    <FormControl>
                        <Textarea placeholder="List previous countries & years visited, or any other preferences..." {...field} className={formInputClass}/>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </CardContent>
        </FormCard>
        
        {!isPublicForm && (
            <FormCard isPublicForm={isPublicForm}>
                <CardHeader>
                    <CardTitle>Internal Details</CardTitle>
                    <CardDescription>Status and tracking information for internal use.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Status</FormLabel>
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
                    </div>
                </CardContent>
            </FormCard>
        )}
        
        {isPublicForm ? (
             <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="lg" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
             </Button>
        ) : (
            <DialogFooter className="sticky bottom-0 z-20 -mx-6 -mb-4 border-t bg-background px-6 py-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} form="client-form">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {client ? 'Save Changes' : 'Save Client'}
                </Button>
            </DialogFooter>
        )}
      </form>
    </Form>
  );
});

ClientForm.displayName = "ClientForm";


