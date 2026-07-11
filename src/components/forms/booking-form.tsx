'use client';

import { useForm, useFieldArray } from 'react-hook-form';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CalendarIcon,
  Plane,
  Bed,
  Car,
  MapPinned,
  PlusCircle,
  Stamp,
  X,
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
import { useAppUser, useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { addDoc, collection, query, serverTimestamp, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

const formSchema = z.object({
  clientId: z.string().optional(),
  newClientName: z.string().optional(),
  destination: z.string().optional(),
  startDate: z.date({
    required_error: 'Start date is required.',
  }),
  endDate: z.date().optional(),
  total: z.coerce.number().min(0).optional(),
  supplierCost: z.coerce.number().min(0).optional(),
  bookingType: z.enum([
    'flight',
    'hotel',
    'car',
    'activity',
    'visa',
    'other',
  ]),
  status: z.enum([
    'draft',
    'pending',
    'hold',
    'confirmed',
    'cancelled',
  ]),
  amountPaid: z.coerce.number().optional(),
  supplierName: z.string().optional(),
  remarks: z.string().optional(),
  isOneWay: z.boolean().optional(),
  hasLayover: z.boolean().optional(),
  layoverAirport: z.string().optional(),
  bookingPortal: z.string().optional(),
  isMultiCity: z.boolean().optional(),
  sectors: z
    .array(
      z.object({
        origin: z.string().optional(),
        destination: z.string().optional(),
        departure: z.string().optional(),
        cabinClass: z.string().optional(),
        flightNumber: z.string().optional(),
        airportCode: z.string().optional(),
      })
    )
    .optional(),
  visaApplicants: z
    .array(
      z.object({
        name: z.string().optional(),
        passportNumber: z.string().optional(),
        validFrom: z.string().optional(),
        validUntil: z.string().optional(),
      })
    )
    .optional(),
  hotelGuests: z
    .array(z.object({ name: z.string().optional() }))
    .optional(),
  details: z.record(z.any()).optional(),
}).refine(
  (data) => !!data.clientId || !!data.newClientName?.trim(),
  { message: 'Select an existing customer or add a new one.', path: ['clientId'] }
).refine(
  (data) => !data.endDate || !data.startDate || data.endDate >= data.startDate,
  { message: 'End date must be on or after the start date.', path: ['endDate'] }
);

const emptySector = {
  origin: '',
  destination: '',
  departure: '',
  cabinClass: 'economy',
  flightNumber: '',
  airportCode: '',
};

type BookingFormValues = z.infer<typeof formSchema>;

interface BookingFormProps {
  onSubmit: (data: Omit<Booking, 'id'>) => void;
  booking?: Booking;
  clientId?: string;
  clientName?: string;
}

export function BookingForm({ onSubmit, booking, clientId, clientName: initialClientName }: BookingFormProps) {
  const { user } = useUser();
  const { canViewRevenue, isAdminOrManager } = useAppUser();
  const firestore = useFirestore();
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [addingNewClient, setAddingNewClient] = useState(false);

  // Non-admins may only list their own clients (server-enforced).
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (!isAdminOrManager) {
      if (!user) return null;
      return query(collection(firestore, 'clients'), where('assignedEmployees', 'array-contains', user.uid));
    }
    return collection(firestore, 'clients');
  }, [firestore, isAdminOrManager, user]);
  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientId: booking?.clientId || clientId || '',
      newClientName: '',
      destination: booking?.destination || '',
      startDate: booking ? new Date(booking.startDate) : new Date(),
      endDate: booking?.endDate ? new Date(booking.endDate) : undefined,
      total: booking?.total || undefined,
      supplierCost: booking?.supplierCost || undefined,
      // 'pending' is the legacy name for 'hold' — normalise so the dropdown shows it.
      status: (booking?.status === 'pending' ? 'hold' : booking?.status) || 'draft',
      bookingType: booking?.bookingType || 'flight',
      amountPaid: booking?.amountPaid || 0,
      supplierName: booking?.supplierName || '',
      remarks: booking?.remarks || '',
      isOneWay: booking?.isOneWay || false,
      hasLayover: booking?.hasLayover || false,
      layoverAirport: booking?.layoverAirport || '',
      bookingPortal: booking?.bookingPortal || '',
      isMultiCity: booking?.isMultiCity || false,
      sectors: booking?.sectors || [],
      visaApplicants: booking?.visaApplicants || [],
      hotelGuests: booking?.hotelGuests || [],
      details: booking?.bookingDetails || {},
    },
  });

  const {
    fields: sectorFields,
    append: appendSector,
    remove: removeSector,
  } = useFieldArray({
    control: form.control,
    name: 'sectors',
  });

  const {
    fields: applicantFields,
    append: appendApplicant,
    remove: removeApplicant,
  } = useFieldArray({
    control: form.control,
    name: 'visaApplicants',
  });

  const {
    fields: guestFields,
    append: appendGuest,
    remove: removeGuest,
  } = useFieldArray({
    control: form.control,
    name: 'hotelGuests',
  });

  const selectedBookingType = form.watch('bookingType');
  const isOneWay = form.watch('isOneWay');

  // When Visa is chosen, ensure at least one applicant row is present.
  useEffect(() => {
    if (selectedBookingType === 'visa' && applicantFields.length === 0) {
      appendApplicant({ name: '', passportNumber: '', validFrom: '', validUntil: '' });
    }
  }, [selectedBookingType, applicantFields.length, appendApplicant]);

  // Only show endDate if NOT (flight AND one-way) and NOT activity
  // Visa validity is captured per applicant, so no booking-level end date.
  const showEndDate =
    !(selectedBookingType === 'flight' && isOneWay) &&
    selectedBookingType !== 'activity' &&
    selectedBookingType !== 'visa';

  // Cost breakdown: profit = what the customer pays − what the booking costs us
  const bookingPrice = Number(form.watch('supplierCost')) || 0;
  const customerPrice = Number(form.watch('total')) || 0;
  const profit = customerPrice - bookingPrice;
  const profitMargin = customerPrice > 0 ? (profit / customerPrice) * 100 : 0;

  async function handleSubmit(values: BookingFormValues) {
    const progressMap = {
      draft: 10,
      pending: 50,
      hold: 50,
      confirmed: 100,
      cancelled: 0,
    };

    if (!user) {
      console.error("User is not authenticated. Cannot submit form.");
      return;
    }

    let resolvedClientId = values.clientId;
    let clientName = initialClientName;

    // If the user typed a new customer name, create the client first and use its id.
    const newName = values.newClientName?.trim();
    if (addingNewClient && newName && firestore) {
      const clientRef = await addDoc(collection(firestore, 'clients'), {
        name: newName,
        status: 'prospect',
        avatar: '',
        // The creator owns the client they add inline (shows in their client list).
        assignedEmployees: [user.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
        updatedBy: user.uid,
      });
      resolvedClientId = clientRef.id;
      clientName = newName;
    }

    if (!clientName) {
      clientName = clients?.find(c => c.id === resolvedClientId)?.name || 'Unknown Client';
    }

    const auditFields = booking
      ? {
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        }
      : {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        };

    // A flight with a departure date but no return date is a one-way trip —
    // record that so it never renders a phantom return date.
    const isOneWay =
      values.bookingType === 'flight' ? (values.isOneWay || !values.endDate) : values.isOneWay;

    // Revenue attribution: the first AGENT to add pricing claims ownership.
    // Preserve any existing owner; otherwise, if the current user is an agent and
    // this booking has a price, they become the owning sales agent.
    const hasPricing = (values.total ?? 0) > 0 || (values.supplierCost ?? 0) > 0;
    const agentId = booking?.agentId || (canViewRevenue && user && hasPricing ? user.uid : undefined);

    const payload: Record<string, any> = {
      ...values,
      isOneWay,
      clientId: resolvedClientId,
      clientName,
      startDate: values.startDate.toISOString(),
      endDate: values.endDate ? values.endDate.toISOString() : null,
      total: values.total ?? 0,
      supplierCost: values.supplierCost ?? 0,
      profit: (values.total ?? 0) - (values.supplierCost ?? 0),
      progress: progressMap[values.status] ?? 0,
      ...(agentId ? { agentId } : {}),
      ...auditFields,
    };

    // `newClientName` is a form-only helper, not a booking field.
    delete payload.newClientName;

    // Move the type-specific `details` into `bookingDetails`, dropping empties.
    const rawDetails = (values.details || {}) as Record<string, any>;
    const cleanedDetails: Record<string, any> = {};
    Object.keys(rawDetails).forEach((key) => {
      const v = rawDetails[key];
      if (v !== undefined && v !== null && v !== '') {
        cleanedDetails[key] = v;
      }
    });
    delete payload.details;
    payload.bookingDetails = cleanedDetails;

    // Firestore rejects `undefined` field values — drop them so the write succeeds.
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    onSubmit(payload as Omit<Booking, 'id'>);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} id="booking-form" className="space-y-4">
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Customer</FormLabel>
                {!clientId && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => {
                      const next = !addingNewClient;
                      setAddingNewClient(next);
                      field.onChange('');
                      form.setValue('newClientName', '');
                    }}
                  >
                    {addingNewClient ? 'Select existing customer' : '+ Add new customer'}
                  </Button>
                )}
              </div>
              {addingNewClient && !clientId ? (
                <FormControl>
                  <Input placeholder="Enter new customer name" {...form.register('newClientName')} />
                </FormControl>
              ) : (
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!!clientId || isLoadingClients}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={isLoadingClients ? 'Loading customers...' : 'Select a customer'}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bookingType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Booking Type</FormLabel>
              <Tabs
                value={field.value}
                onValueChange={field.onChange}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto">
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
                    Transfer
                  </TabsTrigger>
                  <TabsTrigger value="activity">
                    <MapPinned className="h-4 w-4 mr-2" />
                    Activity
                  </TabsTrigger>
                  <TabsTrigger value="visa">
                    <Stamp className="h-4 w-4 mr-2" />
                    Visa
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
              <Input placeholder="Airline" {...form.register('details.airline')} />
              <Input placeholder="PNR Number" {...form.register('details.pnr')} />
              <Input placeholder="Booking Portal" {...form.register('bookingPortal')} />
              {!form.watch('isMultiCity') && (
                <>
                  <Input placeholder="Departure Airport" {...form.register('details.departureAirport')} />
                  <Input placeholder="Arrival Airport" {...form.register('details.arrivalAirport')} />
                </>
              )}
              <select
                {...form.register('details.cabinClass')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Cabin Class</option>
                <option value="economy">Economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={form.watch('isOneWay')}
                  onCheckedChange={(checked) => form.setValue('isOneWay', checked as boolean)}
                />
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  One Way
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={form.watch('hasLayover')}
                  onCheckedChange={(checked) => {
                    const isChecked = checked as boolean;
                    form.setValue('hasLayover', isChecked);
                    if (!isChecked) {
                      form.setValue('layoverAirport', '');
                    }
                  }}
                />
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Has Layover
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={form.watch('isMultiCity')}
                  onCheckedChange={(checked) => {
                    const isChecked = checked as boolean;
                    form.setValue('isMultiCity', isChecked);
                    if (isChecked && sectorFields.length === 0) {
                      appendSector(emptySector);
                      appendSector(emptySector);
                    }
                  }}
                />
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Multi City
                </label>
              </div>
            </div>

            {form.watch('hasLayover') && (
              <Input placeholder="Layover Airport" {...form.register('layoverAirport')} />
            )}

            {form.watch('isMultiCity') && (
              <div className="space-y-3 pt-2">
                <h4 className="font-medium text-sm">Sectors</h4>
                {sectorFields.map((sectorField, index) => (
                  <div
                    key={sectorField.id}
                    className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center"
                  >
                    <Input
                      placeholder="Enter Origin"
                      {...form.register(`sectors.${index}.origin`)}
                    />
                    <Input
                      placeholder="Enter Destination"
                      {...form.register(`sectors.${index}.destination`)}
                    />
                    <Input
                      type="date"
                      {...form.register(`sectors.${index}.departure`)}
                    />
                    <select
                      {...form.register(`sectors.${index}.cabinClass`)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="economy">Economy</option>
                      <option value="business">Business</option>
                      <option value="first">First</option>
                    </select>
                    <Input
                      placeholder="Ex : 9W123"
                      {...form.register(`sectors.${index}.flightNumber`)}
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        placeholder="Ex : BOM"
                        {...form.register(`sectors.${index}.airportCode`)}
                      />
                      {sectorFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => removeSector(index)}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendSector(emptySector)}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Sector
                </Button>
              </div>
            )}
          </div>
        )}

        {selectedBookingType === 'hotel' && (
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-lg">
              Hotel Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Hotel Name" {...form.register('details.hotelName')} />
              <Input placeholder="Hotel Booking ID" {...form.register('details.hotelBookingId')} />
              <Input placeholder="City" {...form.register('details.city')} />
              <Input placeholder="Country" {...form.register('details.country')} />
              <Input placeholder="Room Type" {...form.register('details.roomType')} />
              <Input type="number" placeholder="Number Of Rooms" {...form.register('details.rooms')} />
              <Input type="number" placeholder="Number Of Guests" {...form.register('details.guests')} />
              <Input placeholder="Booking Portal" {...form.register('bookingPortal')} />
            </div>
            <div className="pt-1">
              <FormLabel className="text-sm">Meals Included</FormLabel>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                {([
                  { key: 'breakfast', label: 'Breakfast' },
                  { key: 'lunch', label: 'Lunch' },
                  { key: 'dinner', label: 'Dinner' },
                ] as const).map((meal) => (
                  <div key={meal.key} className="flex items-center space-x-2">
                    <Checkbox
                      checked={!!form.watch(`details.${meal.key}`)}
                      onCheckedChange={(checked) => form.setValue(`details.${meal.key}`, checked as boolean)}
                    />
                    <label className="text-sm font-medium leading-none">{meal.label}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* Guest names — printed on the voucher */}
            <div className="pt-1 space-y-2">
              <FormLabel className="text-sm">Guest Names ({guestFields.length})</FormLabel>
              {guestFields.map((f, index) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Input
                    placeholder={`Guest ${index + 1} full name`}
                    {...form.register(`hotelGuests.${index}.name`)}
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeGuest(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => appendGuest({ name: '' })}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Guest
              </Button>
            </div>
          </div>
        )}

        {selectedBookingType === 'car' && (
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-lg">
              Transfer Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Rental Company" {...form.register('details.rentalCompany')} />
              <Input placeholder="Vehicle Type" {...form.register('details.vehicleType')} />
              <Input placeholder="Pickup Location" {...form.register('details.pickupLocation')} />
              <Input placeholder="Drop Location" {...form.register('details.dropLocation')} />
              <Input placeholder="Driver Name" {...form.register('details.driverName')} />
              <Input placeholder="Driver Contact" {...form.register('details.driverContact')} />
            </div>
          </div>
        )}

        {selectedBookingType === 'activity' && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-lg">
            Activity Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input placeholder="Activity Name" {...form.register('details.activityName')} />
            <Input placeholder="Location" {...form.register('details.location')} />
            <Input placeholder="Supplier Name" {...form.register('details.supplierName')} />
            <Input placeholder="Voucher Number" {...form.register('details.voucherNumber')} />
            <Input type="number" placeholder="Adults" {...form.register('details.adults')} />
            <Input type="number" placeholder="Children" {...form.register('details.children')} />
            <Input type="number" placeholder="Infants" {...form.register('details.infants')} />
            <Input placeholder="Pickup Point" {...form.register('details.pickupPoint')} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FormLabel>Activity Date</FormLabel>
              <Input type="date" {...form.register('details.activityDate')} />
            </div>
            <div>
              <FormLabel>Activity Time</FormLabel>
              <Input type="time" {...form.register('details.activityTime')} />
            </div>
          </div>
        </div>
      )}

      {selectedBookingType === 'visa' && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-lg">Visa Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <FormLabel>Visa Type</FormLabel>
              <Select
                value={form.watch('details.visaType') || ''}
                onValueChange={(v) => form.setValue('details.visaType', v)}
              >
                <SelectTrigger><SelectValue placeholder="Select visa type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tourist">Tourist</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Student">Student</SelectItem>
                  <SelectItem value="Work">Work</SelectItem>
                  <SelectItem value="Transit">Transit</SelectItem>
                  <SelectItem value="Medical">Medical</SelectItem>
                  <SelectItem value="Family / Dependent">Family / Dependent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <FormLabel>Processing</FormLabel>
              <Select
                value={form.watch('details.processingType') || ''}
                onValueChange={(v) => form.setValue('details.processingType', v)}
              >
                <SelectTrigger><SelectValue placeholder="Select processing" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Express">Express</SelectItem>
                  <SelectItem value="Super Express">Super Express</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <FormLabel>Entry Type</FormLabel>
              <Select
                value={form.watch('details.entryType') || ''}
                onValueChange={(v) => form.setValue('details.entryType', v)}
              >
                <SelectTrigger><SelectValue placeholder="Select entry type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Single">Single Entry</SelectItem>
                  <SelectItem value="Double">Double Entry</SelectItem>
                  <SelectItem value="Multiple">Multiple Entry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <FormLabel>Country</FormLabel>
              <Input placeholder="Country" {...form.register('details.country')} />
            </div>
            <div className="space-y-1">
              <FormLabel>Application / Reference No.</FormLabel>
              <Input placeholder="Application / Reference Number" {...form.register('details.applicationNumber')} />
            </div>
            <div className="space-y-1">
              <FormLabel>Supplier Name</FormLabel>
              <Input placeholder="Supplier Name" {...form.register('details.supplierName')} />
            </div>
          </div>

          {/* Per-applicant details */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <FormLabel className="text-base">Applicants ({applicantFields.length})</FormLabel>
            </div>
            {applicantFields.map((f, index) => (
              <div key={f.id} className="rounded-md border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Applicant {index + 1}</span>
                  {applicantFields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeApplicant(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <FormLabel className="text-xs">Full Name</FormLabel>
                    <Input placeholder="As on passport" {...form.register(`visaApplicants.${index}.name`)} />
                  </div>
                  <div className="space-y-1">
                    <FormLabel className="text-xs">Passport Number</FormLabel>
                    <Input placeholder="Passport Number" {...form.register(`visaApplicants.${index}.passportNumber`)} />
                  </div>
                  <div className="space-y-1">
                    <FormLabel className="text-xs">Valid From</FormLabel>
                    <Input type="date" {...form.register(`visaApplicants.${index}.validFrom`)} />
                  </div>
                  <div className="space-y-1">
                    <FormLabel className="text-xs">Valid Until</FormLabel>
                    <Input type="date" {...form.register(`visaApplicants.${index}.validUntil`)} />
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendApplicant({ name: '', passportNumber: '', validFrom: '', validUntil: '' })}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Applicant
            </Button>
          </div>
        </div>
      )}

      {selectedBookingType === 'other' && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-lg">
            Other Booking
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input placeholder="Booking Name" {...form.register('details.bookingName')} />
            <Input placeholder="Reference Number" {...form.register('details.referenceNumber')} />
            <Input placeholder="Supplier" {...form.register('details.supplier')} />
            <Input placeholder="Description" {...form.register('details.description')} />
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
                        : selectedBookingType === 'visa'
                          ? 'Application Date'
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
                        // Keep the range valid: if the end date now precedes the
                        // new start date, clear it so the user re-picks.
                        const end = form.getValues('endDate');
                        if (date && end && end < date) {
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
          {showEndDate && (
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
                        // Can't check out / return before the start date.
                        disabled={(date) => {
                          const start = form.getValues('startDate');
                          return start ? date < new Date(new Date(start).setHours(0, 0, 0, 0)) : false;
                        }}
                        defaultMonth={form.getValues('startDate') || field.value}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {canViewRevenue && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-lg">Cost Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="supplierCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Booking Price (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Cost to us" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="total"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Price (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Price charged to customer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Profit Margin</FormLabel>
              <FormControl>
                <Input
                  readOnly
                  tabIndex={-1}
                  value={`₹ ${profit.toLocaleString('en-IN')} (${profitMargin.toFixed(1)}%)`}
                  className={cn(
                    'font-semibold cursor-default',
                    profit > 0
                      ? 'text-green-600'
                      : profit < 0
                        ? 'text-red-600'
                        : 'text-muted-foreground'
                  )}
                />
              </FormControl>
            </FormItem>
          </div>
        </div>
        )}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
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
