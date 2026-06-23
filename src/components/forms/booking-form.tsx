'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CalendarIcon,
  Plane,
  Bed,
  Car,
  MapPinned,
  PlusCircle,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import type { Booking, Client } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';

const formSchema = z.object({
  clientId: z.string().min(1, { message: 'Client is required.' }),

  destination: z.string().optional(),

  startDate: z.date({
    required_error: 'Start date is required.',
  }),

  endDate: z.date({
    required_error: 'End date is required.',
  }),

  total: z.coerce.number().min(0).optional(),

  bookingType: z.enum([
    'flight',
    'hotel',
    'car',
    'activity',
    'other',
  ]),

  status: z.enum([
  'draft',
  'pending',
  'confirmed',
  'cancelled',
]),

  amountPaid: z.coerce.number().optional(),
  supplierName: z.string().optional(),
  remarks: z.string().optional(),
});

type BookingFormValues = z.infer<typeof formSchema>;

interface BookingFormProps {
  onSubmit: (data: Omit<Booking, 'id'>) => void;
  booking?: Booking;
  clientId?: string;
  clientName?: string;
}

export function BookingForm({ onSubmit, booking, clientId, clientName: initialClientName }: BookingFormProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const clientsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'clients') : null, [firestore]);
  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);
  
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientId: booking?.clientId || clientId || '',
      destination: booking?.destination || '',
      startDate: booking ? new Date(booking.startDate) : undefined,
      endDate: booking ? new Date(booking.endDate) : undefined,
      total: booking?.total || undefined,
      status: booking?.status || 'draft',
      bookingType: booking?.bookingType || 'flight',
      amountPaid: booking?.amountPaid || 0,
      supplierName: booking?.supplierName || '',
      remarks: booking?.remarks || '',
    },
  });
  
  const selectedBookingType = form.watch('bookingType');
  
  function handleSubmit(values: BookingFormValues) {
    const progressMap = {
  draft: 10,
  pending: 50,
  confirmed: 100,
  cancelled: 0,
};
    if (!user) {
        console.error("User is not authenticated. Cannot submit form.");
        return;
    }

    let clientName = initialClientName;
    if (!clientName) {
      clientName = clients?.find(c => c.id === values.clientId)?.name || 'Unknown Client';
    }
    
    const auditFields = booking
        ? { // Update
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          }
        : { // Create
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
            updatedBy: user.uid,
          };
    
    onSubmit({
      ...values,
      clientName: clientName,
      startDate: values.startDate.toISOString(),
      endDate: values.endDate.toISOString(),
      total: values.total ?? 0,
      progress: progressMap[values.status] ?? 0,
      ...auditFields
    } as Omit<Booking, 'id'>);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} id="booking-form" className="space-y-4">
        <FormField
            control={form.control}
            name="bookingType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Booking Type</FormLabel>
                <Tabs
                  value={field.value}
                  onValueChange={field.onChange}
                  className="w-full">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="flight">
                      <Plane className="h-4 w-4 mr-2" />
                      Flight
                    </TabsTrigger>
                    <TabsTrigger value="hotel">
                      <Bed className="h-4 w-4 mr-2" />
                      Hotel
                    </TabsTrigger>
                    <TabsTrigger value="car">
                      <Car className="h-4 w-4 mr-2" />
                      Car
                    </TabsTrigger>
                    <TabsTrigger value="activity">
                      <MapPinned className="h-4 w-4 mr-2" />
                      Activity
                    </TabsTrigger>
                    <TabsTrigger value="other">
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Other
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <FormMessage />
              </FormItem>
            )}
          />


            {selectedBookingType === 'flight' && (
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-lg">
                Flight Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input placeholder="Airline" />
                <Input placeholder="PNR Number" />
                <Input placeholder="Ticket Number" />
                <Input placeholder="Departure Airport" />
                <Input placeholder="Arrival Airport" />
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Cabin Class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="economy">
                      Economy
                    </SelectItem>
                    <SelectItem value="business">
                      Business
                    </SelectItem>
                    <SelectItem value="first">
                      First
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
              {selectedBookingType === 'hotel' && (
                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-lg">
                    Hotel Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input placeholder="Hotel Name" />
                    <Input placeholder="City" />
                    <Input placeholder="Country" />
                    <Input placeholder="Room Type" />
                    <Input type="number" placeholder="Number Of Rooms" />
                    <Input type="number" placeholder="Number Of Guests" />
                  </div>
                </div>
              )}
              {selectedBookingType === 'car' && (
                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-lg">
                    Car Rental Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input placeholder="Rental Company" />
                    <Input placeholder="Vehicle Type" />
                    <Input placeholder="Pickup Location" />
                    <Input placeholder="Drop Location" />
                    <Input placeholder="Driver Name" />
                    <Input placeholder="Driver Contact" />
                  </div>
                </div>
              )}

            {selectedBookingType === 'activity' && (
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-lg">
                Activity Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input placeholder="Activity Name" />
                <Input placeholder="Location" />
                <Input placeholder="Supplier Name" />
                <Input placeholder="Voucher Number" />
                <Input type="number" placeholder="Adults" />
                <Input type="number" placeholder="Children" />
                <Input type="number" placeholder="Infants" />
                <Input placeholder="Pickup Point" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormLabel>Activity Date</FormLabel>
                  <Input type="date" />
                </div>
                <div>
                  <FormLabel>Activity Time</FormLabel>
                  <Input type="time" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input type="number" placeholder="Cost Price" />
                <Input type="number" placeholder="Selling Price" />
                <Input type="number" placeholder="Profit" />
              </div>
            </div>
          )}
        
          {selectedBookingType === 'other' && (
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-lg">
                Other Booking
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input placeholder="Booking Name" />
                <Input placeholder="Reference Number" />
                <Input placeholder="Supplier" />
                <Input placeholder="Description" />
              </div>

            </div>
          )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>
                  {selectedBookingType === 'hotel'
                    ? 'Check In'
                    : selectedBookingType === 'car'
                    ? 'Pickup Date'
                    : selectedBookingType === 'activity'
                    ? 'Activity Date'
                    : selectedBookingType === 'other'
                    ? 'Booking Date'
                    : 'Departure Date'}
                </FormLabel>
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
               <FormLabel>
                  {selectedBookingType === 'hotel'
                    ? 'Check Out'
                    : selectedBookingType === 'car'
                    ? 'Drop Date'
                    : selectedBookingType === 'activity'
                    ? 'End Time'
                    : selectedBookingType === 'other'
                    ? 'Valid Until'
                    : 'Return Date'}
                </FormLabel>
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
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
                <FormMessage />
                </FormItem>
            )}
            />

        </div>
         <FormField
          control={form.control}
          name="total"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Total (₹)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 250000" {...field} />
              </FormControl>
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
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Hold</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
