
'use client';
import React from 'react';
import { useForm, useWatch, useFieldArray } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Client } from '@/lib/types';
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


const formSchema = z.object({
  name: z.string().min(2, { message: 'Name is required.' }),
  email: z.string().email({ message: 'Invalid email address.' }).optional().or(z.literal('')),
  country: z.string().min(1, { message: 'Country is required.' }),
  phone: z.string().min(1, { message: 'Phone is required.' }),
  travelPurpose: z.string().optional(),
  dateOfBirth: z.string().optional().refine((val) => {
    if (!val) return true; // Optional field
    return /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/.test(val);
  }, {
    message: "Date must be in DD/MM/YYYY format.",
  }),
  gender: z.enum(['male', 'female', 'other']).optional(),
  nationality: z.string().optional(),
  preferredDestination: z.string().optional(),
  preferredTravelDates: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
  }).optional(),
  budget: z.coerce.number().optional(),
  hotelPreference: z.string().optional(),
  services: z.enum(['visa', 'fullPackage', 'packageOnly']).optional(),
  additionalServices: z.array(z.string()).optional(),
  preferences: z.string().optional(),
  status: z.enum(['active', 'inactive', 'lead', 'prospect']),
  visaStatus: z.enum(['toStart', 'inProcess', 'applied', 'approved', 'rejected', 'completed', 'travelling', '']).optional(),
  pax: z.coerce.number().int().min(1, "PAX must be at least 1.").optional(),
  companions: z.array(z.object({ name: z.string().min(1, 'Companion name is required.') })).optional(),
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
}

const FormCard: React.FC<React.PropsWithChildren<{isPublicForm: boolean} & React.HTMLAttributes<HTMLDivElement>>> = ({ isPublicForm, className, ...props }) => {
    const cardClass = isPublicForm 
        ? "bg-white/10 backdrop-blur-md border-white/20 text-white" 
        : "bg-card text-card-foreground";
    const headerClass = isPublicForm ? "text-white" : "";
    const descriptionClass = isPublicForm ? "text-white/80" : "";
    
    // This is a bit of a trick to pass props to children
    const childrenWithProps = React.Children.map(props.children, child => {
        if (React.isValidElement(child) && typeof child.type !== 'string') {
            if (child.type === CardHeader) {
                return React.cloneElement(child, {
                    ...child.props,
                    children: React.Children.map(child.props.children, headerChild => {
                         if (React.isValidElement(headerChild)) {
                            if (headerChild.type === CardTitle) {
                                return React.cloneElement(headerChild, {className: cn(headerChild.props.className, headerClass)});
                            }
                            if (headerChild.type === CardDescription) {
                                return React.cloneElement(headerChild, {className: cn(headerChild.props.className, descriptionClass)});
                            }
                         }
                        return headerChild;
                    })
                });
            }
        }
        return child;
    });

    return <Card className={cn(cardClass, className)} {...props}>{childrenWithProps}</Card>;
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

export const ClientForm = React.forwardRef<HTMLFormElement, ClientFormProps>(({ onSubmit, onCancel, client, isPublicForm = false, isSubmitting = false }, ref) => {
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
      dateOfBirth: client?.dateOfBirth ? format(new Date(client.dateOfBirth), 'dd/MM/yyyy') : '',
      gender: client?.gender,
      nationality: client?.nationality || '',
      preferredDestination: client?.preferredDestination || '',
      preferredTravelDates: {
        from: client?.preferredTravelDates?.from ? new Date(client.preferredTravelDates.from) : undefined,
        to: client?.preferredTravelDates?.to ? new Date(client.preferredTravelDates.to) : undefined,
      },
      budget: client?.budget || undefined,
      hotelPreference: client?.hotelPreference || '',
      services: client?.services,
      additionalServices: client?.additionalServices || [],
      preferences: client?.preferences || '',
      status: client?.status || 'prospect',
      visaStatus: client?.visaStatus || '',
      pax: client?.pax || 1,
      companions: client?.companions || [],
    },
  });
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "companions",
  });

  const { clearSavedData } = useFormPersistence<ClientFormValues>(FORM_KEY, form);

  const startDate = useWatch({
    control: form.control,
    name: 'preferredTravelDates.from',
  });

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
    dataToSubmit.companions = values.companions || [];
    
    if (values.dateOfBirth) {
        try {
            dataToSubmit.dateOfBirth = parse(values.dateOfBirth, 'dd/MM/yyyy', new Date()).toISOString();
        } catch (e) {
             console.error("Invalid date format:", values.dateOfBirth);
             form.setError("dateOfBirth", { type: "manual", message: "Date must be in DD/MM/YYYY format." });
             return;
        }
    } else {
        dataToSubmit.dateOfBirth = null;
    }

    dataToSubmit.preferredTravelDates = {
        from: values.preferredTravelDates?.from?.toISOString() ?? null,
        to: values.preferredTravelDates?.to?.toISOString() ?? null,
    };

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
      ...dataToSubmit,
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
      dateOfBirth: '',
      gender: undefined,
      nationality: '',
      preferredDestination: '',
      preferredTravelDates: {
        from: undefined,
        to: undefined,
      },
      budget: undefined,
      hotelPreference: '',
      services: undefined,
      additionalServices: [],
      preferences: '',
      status: 'prospect',
      visaStatus: '',
      pax: 1,
      companions: [],
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

  const DatePicker = ({ field }: { field: any }) => {
    const [open, setOpen] = React.useState(false);
    
    // Get the start date value for end date validation
    const startDate = form.getValues('preferredTravelDates.from');
    
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <FormControl>
                    <Button
                        variant={'outline'}
                        className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground', formSelectTriggerClass)}
                    >
                        {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
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
                        
                        // If this is start date, clear end date if it's before new start date
                        if (field.name === 'preferredTravelDates.from') {
                            const endDate = form.getValues('preferredTravelDates.to');
                            if (endDate && date && endDate < date) {
                                form.setValue('preferredTravelDates.to', undefined);
                            }
                        }
                        
                        if (date) setOpen(false);
                    }}
                    disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        if (field.name === 'preferredTravelDates.to' && startDate) {
                            return date < startDate;
                        }
                        return date < today;
                    }}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
  };
  
    const DatePickerString = ({ field }: { field: any }) => {
    return (
        <Input
            placeholder="DD/MM/YYYY"
            {...field}
            onChange={(e) => {
                const input = e.target.value.replace(/\D/g, '');
                let formattedInput = '';
                if (input.length > 0) formattedInput = input.substring(0, 2);
                if (input.length > 2) formattedInput += '/' + input.substring(2, 4);
                if (input.length > 4) formattedInput += '/' + input.substring(4, 8);
                field.onChange(formattedInput);
            }}
            maxLength={10}
            className={cn(
                formInputClass,
                "min-h-[44px] touch-manipulation" // Ensure minimum touch target size for mobile
            )}
            inputMode="numeric" // Show numeric keypad on mobile
            pattern="[0-9]*" // Helps with numeric input on mobile
        />
    );
  };

  return (
    <Form {...form}>
      <form ref={ref} id="client-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
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
                            <FormLabel className={formLabelClass}>Country *</FormLabel>
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
                        <FormItem>
                            <FormLabel className={formLabelClass}>Date of Birth</FormLabel>
                            <FormControl>
                                <DatePickerString field={field} />
                            </FormControl>
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
                            onClick={() => append({ name: "" })}
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
                                <DatePicker field={field} />
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
                                <DatePicker field={field} />
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="budget"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className={formLabelClass}>Budget (₹)</FormLabel>
                            <FormControl>
                            <Input type="number" placeholder="Enter budget" {...field} value={field.value ?? ''} className={formInputClass}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="hotelPreference"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className={formLabelClass}>Hotel Preference</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger className={formSelectTriggerClass}>
                                    <SelectValue placeholder="Select hotel type" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className={formSelectContentClass}>
                                    <SelectItem value="luxury">5-star</SelectItem>
                                    <SelectItem value="mid-range">4-star</SelectItem>
                                    <SelectItem value="budget">3-star</SelectItem>
                                    <SelectItem value="boutique">Boutique</SelectItem>
                                    <SelectItem value="no-preference">No Preference</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
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
                        <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0"
                            >
                                <div className="flex items-center space-x-3 space-y-0">
                                    <RadioGroupItem value="visa" id="visa" />
                                    <Label htmlFor="visa" className={formRadioLabelClass}>Visa</Label>
                                </div>
                                <div className="flex items-center space-x-3 space-y-0">
                                    <RadioGroupItem value="fullPackage" id="fullPackage" />
                                    <Label htmlFor="fullPackage" className={formRadioLabelClass}>Full Package with Visa</Label>
                                </div>
                                <div className="flex items-center space-x-3 space-y-0">
                                    <RadioGroupItem value="packageOnly" id="packageOnly" />
                                    <Label htmlFor="packageOnly" className={formRadioLabelClass}>Package Only</Label>
                                </div>
                            </RadioGroup>
                        </FormControl>
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
            <DialogFooter>
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
