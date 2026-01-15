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
import { CalendarIcon, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, parse } from 'date-fns';
import { useCountries, type CountryInfo } from '@/hooks/use-countries';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '../ui/command';
import { ScrollArea } from '../ui/scroll-area';
import parsePhoneNumber, { AsYouType, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { useFormPersistence } from '@/hooks/use-form-persistence';
import { DialogFooter } from '../ui/dialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';


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
  visaStatus: z.enum(['toStart', 'inProcess', 'approved', 'rejected', 'travelling', '']).optional(),
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


export const ClientForm = React.forwardRef<HTMLFormElement, ClientFormProps>(({ onSubmit, onCancel, client, isPublicForm = false, isSubmitting = false }, ref) => {
  const { countryNames, countryOptions, nationalities } = useCountries();
  const { user } = useUser();
  const FORM_KEY = client ? `client-form-${client.id}` : 'new-client-form';
  const [isFromDatePickerOpen, setIsFromDatePickerOpen] = React.useState(false);
  const [isToDatePickerOpen, setIsToDatePickerOpen] = React.useState(false);
  
  const defaultBlankValues: ClientFormValues = {
    name: '',
    email: '',
    country: 'IN',
    phone: '',
    travelPurpose: undefined,
    dateOfBirth: '',
    gender: undefined,
    nationality: '',
    preferredDestination: '',
    preferredTravelDates: { from: undefined, to: undefined },
    budget: 0,
    hotelPreference: '',
    services: undefined,
    additionalServices: [],
    preferences: '',
    status: 'prospect',
    visaStatus: '',
  };
  
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: client ? {
      name: client?.name || '',
      email: client?.email || '',
      country: client?.phone && parsePhoneNumber(client.phone)?.country ? parsePhoneNumber(client.phone)?.country : 'IN',
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
      budget: client?.budget || 0,
      hotelPreference: client?.hotelPreference || '',
      services: client?.services,
      additionalServices: client?.additionalServices || [],
      preferences: client?.preferences || '',
      status: client?.status || 'prospect',
      visaStatus: client?.visaStatus || '',
    } : defaultBlankValues,
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

    const dataToSubmit: Partial<Client> = {
      ...restOfValues,
      phone: phoneNumber?.format('E.164') || values.phone,
      avatar: client?.avatar || randomAvatar,
      preferredTravelDates: {
          from: values.preferredTravelDates?.from?.toISOString(),
          to: values.preferredTravelDates?.to?.toISOString()
      }
    };
    
    if (values.dateOfBirth) {
        try {
            dataToSubmit.dateOfBirth = parse(values.dateOfBirth, 'dd/MM/yyyy', new Date()).toISOString();
        } catch (e) {
             console.error("Invalid date format:", values.dateOfBirth);
             form.setError("dateOfBirth", { type: "manual", message: "Date must be in DD/MM/YYYY format." });
             // Focus on the date of birth field when there's an error
             const dateOfBirthField = document.querySelector('input[name="dateOfBirth"]') as HTMLInputElement;
             if (dateOfBirthField) {
                 dateOfBirthField.focus();
             }
             return;
        }
    }

    const auditFields = client
        ? { // Update
            updatedBy: user?.uid || 'public_form',
          }
        : { // Create
            createdAt: serverTimestamp(),
            createdBy: user?.uid || 'public_form',
            updatedBy: user?.uid || 'public_form',
          };

    onSubmit({
      ...dataToSubmit,
      ...auditFields
    });
    
    // Clear form after successful submission
    if (!isPublicForm) {
      form.reset(defaultBlankValues);
      clearSavedData();
      // Focus on the first field after form reset
      setTimeout(() => {
        const firstField = document.querySelector('input[name="name"]') as HTMLInputElement;
        if (firstField) {
          firstField.focus();
        }
      }, 100);
    }
  }
  
  const handleClearForm = () => {
    form.reset(defaultBlankValues);
    clearSavedData();
    // Focus on the first field after clearing form
    setTimeout(() => {
      const firstField = document.querySelector('input[name="name"]') as HTMLInputElement;
      if (firstField) {
        firstField.focus();
      }
    }, 100);
  };
  
  const formLabelClass = isPublicForm ? "text-white/90" : "";
  const formInputClass = isPublicForm ? "bg-white/20 border-white/30 text-white placeholder:text-white/60" : "";
  const formSelectTriggerClass = isPublicForm ? "bg-white/20 border-white/30 text-white" : "";
  const formSelectContentClass = isPublicForm ? "bg-gray-800 text-white" : "";
  const formRadioLabelClass = isPublicForm ? "text-white/90 font-normal" : "font-normal";


  const Combobox = ({ field, data, placeholder }: { field: any, data: string[] | CountryInfo[], placeholder: string }) => {
    const [open, setOpen] = React.useState(false);
  
    const isCountryInfo = (d: any): d is CountryInfo => typeof d === 'object' && 'value' in d && 'label' in d;
  
    const findLabel = (value: string) => {
        const item = data.find(item => (isCountryInfo(item) ? item.value : item) === value);
        return item ? (isCountryInfo(item) ? item.label : item) : placeholder;
    };

    // Auto-open dropdown when field is focused
    const handleFocus = () => {
      setOpen(true);
    };

    // Handle input change to enable auto-search
    const handleInputChange = (value: string) => {
      if (!open) {
        setOpen(true);
      }
      // The Command component will handle the filtering automatically
    };
  
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <FormControl>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(!open);
                } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  // Open dropdown when user starts typing
                  setOpen(true);
                }
              }}
              onFocus={handleFocus}
              className={cn(
                "w-full justify-between",
                !field.value && "text-muted-foreground",
                formSelectTriggerClass
              )}
            >
              {field.value ? findLabel(field.value) : placeholder}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" style={{ maxHeight: '400px' }}>
          <Command className="max-h-96" shouldFilter={false}>
            <CommandInput 
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  handleInputChange(e.key);
                }
              }}
              autoFocus={open}
            />
            <CommandEmpty>No {placeholder.toLowerCase()} found.</CommandEmpty>
            <CommandGroup className="overflow-y-auto">
                {data.map((item) => {
                  const label = isCountryInfo(item) ? item.label : item;
                  const value = isCountryInfo(item) ? item.value : item;
                  return (
                    <CommandItem
                      value={label}
                      key={value}
                      onSelect={() => {
                        // For string arrays, use the label directly; for objects, use the value
                        const selectedValue = isCountryInfo(item) ? value : label;
                        form.setValue(field.name, selectedValue);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === field.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {label}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };


  return (
    <Form {...form}>
      <form ref={ref} id="client-form" onSubmit={form.handleSubmit(handleSubmit, (errors) => {
    // Find the first field with an error and focus it
    const firstErrorField = Object.keys(errors)[0];
    if (firstErrorField) {
      const errorElement = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
      if (errorElement) {
        errorElement.focus();
      }
    }
  })} className="space-y-8">
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
                            <Input {...field} className={formInputClass} tabIndex={0}/>
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

                <div className="grid grid-cols-1 gap-4">
                    <FormItem>
                        <FormLabel className={formLabelClass}>Contact no *</FormLabel>
                        <div className="flex gap-2">
                            <FormField
                                control={form.control}
                                name="country"
                                render={({ field }) => (
                                <FormItem className="flex flex-col w-[180px]">
                                    <Combobox field={field} data={countryOptions} placeholder="Select country"/>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => {
                                return (
                                    <FormItem className="flex-1">
                                    <FormControl>
                                        <Input 
                                            type="tel"
                                            placeholder='Phone number'
                                            {...field}
                                            className={formInputClass}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )
                                }}
                            />
                        </div>
                    </FormItem>
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
                                <Input 
                                    placeholder="DD/MM/YYYY" 
                                    {...field} 
                                    onChange={(e) => {
                                        const input = e.target.value.replace(/\D/g, '');
                                        let formattedInput = '';
                                        if (input.length > 0) {
                                            formattedInput = input.substring(0, 2);
                                        }
                                        if (input.length > 2) {
                                            formattedInput += '/' + input.substring(2, 4);
                                        }
                                        if (input.length > 4) {
                                            formattedInput += '/' + input.substring(4, 8);
                                        }
                                        field.onChange(formattedInput);
                                    }}
                                    maxLength={10}
                                    className={formInputClass}
                                />
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
                                    <SelectTrigger className={formSelectTriggerClass} tabIndex={0}>
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
                            name="nationality"
                            render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel className={formLabelClass}>Nationality</FormLabel>
                                <Combobox field={field} data={nationalities} placeholder="Select nationality" />
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </div>
            </CardContent>
        </FormCard>

        <FormCard isPublicForm={isPublicForm}>
            <CardHeader>
                <CardTitle>Travel Preferences</CardTitle>
                <CardDescription>Help us understand what the client is looking for.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField
                    control={form.control}
                    name="travelPurpose"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className={formLabelClass}>Travel Purpose</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger className={formSelectTriggerClass} tabIndex={0}>
                                <SelectValue placeholder="Select purpose" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent className={formSelectContentClass}>
                                <SelectItem value="leisure">Leisure</SelectItem>
                                <SelectItem value="business">Business</SelectItem>
                                <SelectItem value="family">Family</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="preferredDestination"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>Preferred Destination(s)</FormLabel>
                            <Combobox field={field} data={countryNames} placeholder="Select destination" />
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
                            <Popover open={isFromDatePickerOpen} onOpenChange={setIsFromDatePickerOpen}>
                                <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                    variant={'outline'}
                                    tabIndex={0}
                                    className={cn(
                                        'w-full pl-3 text-left font-normal',
                                        !field.value && 'text-muted-foreground',
                                        formSelectTriggerClass
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
                                        const currentEndDate = form.getValues('preferredTravelDates.to');
                                        if (currentEndDate && date && date > currentEndDate) {
                                            form.setValue('preferredTravelDates.to', undefined);
                                        }
                                        if (date) {
                                            setIsFromDatePickerOpen(false);
                                        }
                                    }}
                                    disabled={{ before: new Date() }}
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
                        name="preferredTravelDates.to"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel className={formLabelClass}>Preferred End Date</FormLabel>
                            <Popover open={isToDatePickerOpen} onOpenChange={setIsToDatePickerOpen}>
                                <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                    variant={'outline'}
                                    tabIndex={0}
                                    className={cn(
                                        'w-full pl-3 text-left font-normal',
                                        !field.value && 'text-muted-foreground',
                                        formSelectTriggerClass
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
                                        if (date) {
                                            setIsToDatePickerOpen(false);
                                        }
                                    }}
                                    disabled={{ before: startDate || new Date() }}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="budget"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className={formLabelClass}>Budget (₹)</FormLabel>
                            <FormControl>
                            <Input type="number" placeholder="Enter budget" {...field} className={formInputClass}/>
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
                                    <SelectTrigger className={formSelectTriggerClass} tabIndex={0}>
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
                        <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                            <RadioGroupItem value="visa" />
                            </FormControl>
                            <FormLabel className={formRadioLabelClass}>Visa</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                            <RadioGroupItem value="fullPackage" />
                            </FormControl>
                            <FormLabel className={formRadioLabelClass}>Full Package with Visa</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                            <RadioGroupItem value="packageOnly" />
                            </FormControl>
                            <FormLabel className={formRadioLabelClass}>Package Only</FormLabel>
                        </FormItem>
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
                        <Textarea placeholder="List previous countries & years visited, or any other preferences..." {...field} className={formInputClass} tabIndex={0}/>
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
                                <SelectTrigger tabIndex={0}>
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
                                    <SelectTrigger tabIndex={0}>
                                        <SelectValue placeholder="Select visa status" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                    <SelectItem value="toStart">To Start</SelectItem>
                                    <SelectItem value="inProcess">In Process</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
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
             <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="lg" disabled={isSubmitting} tabIndex={0}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
             </Button>
        ) : (
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} tabIndex={0}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} tabIndex={0}>
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

    