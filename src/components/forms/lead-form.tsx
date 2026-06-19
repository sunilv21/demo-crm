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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useUser } from '@/firebase';
import { serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';

export const LEAD_SOURCES = ['Website', 'Referral', 'Social Media', 'Walk-in', 'Phone', 'Manual', 'Other'] as const;

// Platforms offered when generating a shareable lead-capture link.
export const SHARE_PLATFORMS = [
  'Website', 'Facebook', 'Instagram', 'WhatsApp', 'Google',
  'LinkedIn', 'YouTube', 'X (Twitter)', 'Referral', 'Other',
] as const;

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name is required.' }),
  phone: z.string().min(1, { message: 'Phone is required.' }),
  email: z.string().email({ message: 'Invalid email address.' }).optional().or(z.literal('')),
  status: z.enum(['new', 'contacted', 'proposal', 'won', 'lost']),
  source: z.string().optional(),
  preferredDestination: z.string().optional(),
  travelPurpose: z.string().optional(),
  budget: z.coerce.number().optional(),
  pax: z.coerce.number().int().min(1, 'PAX must be at least 1.').optional(),
  notes: z.string().optional(),
});

type LeadFormValues = z.infer<typeof formSchema>;

interface LeadFormProps {
  onSubmit: (data: Omit<Lead, 'id'>) => void;
  lead?: Lead;
  /** Public capture form: hides internal fields, doesn't require auth. */
  isPublicForm?: boolean;
  /** Source to attach (used by the public capture form from the URL). */
  source?: string;
  isSubmitting?: boolean;
}

export const LeadForm = React.forwardRef<HTMLFormElement, LeadFormProps>(
  ({ onSubmit, lead, isPublicForm = false, source, isSubmitting = false }, ref) => {
  const { user } = useUser();
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: lead?.name || '',
      phone: lead?.phone || '',
      email: lead?.email || '',
      status: lead?.status || 'new',
      source: lead?.source || source || (isPublicForm ? 'Website' : 'Manual'),
      preferredDestination: lead?.preferredDestination || '',
      travelPurpose: lead?.travelPurpose || '',
      budget: lead?.budget || undefined,
      pax: lead?.pax || 1,
      notes: lead?.notes || '',
    },
  });

  function handleSubmit(values: LeadFormValues) {
    if (!isPublicForm && !user) {
      console.error('User is not authenticated. Cannot submit form.');
      return;
    }
    const randomAvatar = PlaceHolderImages[Math.floor(Math.random() * PlaceHolderImages.length)].imageUrl;
    const actor = user?.uid || 'public_form';

    const auditFields = lead
      ? { // Update
          updatedAt: serverTimestamp(),
          updatedBy: actor,
        }
      : { // Create
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: actor,
          updatedBy: actor,
        };

    // Normalise empty optional values to keep documents clean. The public form
    // always lands a brand-new lead in the "new" stage.
    const cleaned = {
      ...values,
      status: isPublicForm ? 'new' : values.status,
      email: values.email || '',
      source: (isPublicForm ? (source || values.source) : values.source) || 'Manual',
      preferredDestination: values.preferredDestination || '',
      travelPurpose: values.travelPurpose || '',
      budget: values.budget ?? null,
      pax: values.pax ?? 1,
      notes: values.notes || '',
    };

    onSubmit({
      ...cleaned,
      avatar: lead?.avatar || randomAvatar,
      ...auditFields,
    } as unknown as Omit<Lead, 'id'>);
  }

  const labelClass = isPublicForm ? 'text-white/90' : '';
  const inputClass = isPublicForm ? 'bg-white/20 border-white/30 text-white placeholder:text-white/60' : '';
  const triggerClass = isPublicForm ? 'bg-white/20 border-white/30 text-white' : '';
  const contentClass = isPublicForm ? 'bg-gray-800 text-white' : '';

  return (
    <Form {...form}>
      <form id="lead-form" ref={ref} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., John Doe" {...field} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>Phone *</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="e.g., +91 12345 67890" {...field} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="e.g., john.doe@example.com" {...field} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Source: editable internally, fixed (from the link) on public forms. */}
          {!isPublicForm && (
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className={triggerClass}>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className={contentClass}>
                      {LEAD_SOURCES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="preferredDestination"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>Preferred Destination</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Dubai" {...field} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="travelPurpose"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>Travel Purpose</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className={triggerClass}>
                      <SelectValue placeholder="Select purpose" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className={contentClass}>
                    <SelectItem value="leisure">Leisure</SelectItem>
                    <SelectItem value="tourism">Tourism</SelectItem>
                    <SelectItem value="visit">Visit</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="family">Family</SelectItem>
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
            name="budget"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>Budget (₹)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="Enter budget" {...field} value={field.value ?? ''} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pax"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>PAX (Travelers)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} {...field} value={field.value ?? ''} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Stage is an internal concept; hidden on the public capture form. */}
        {!isPublicForm && (
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stage</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a stage" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={labelClass}>{isPublicForm ? 'Anything else we should know?' : 'Notes'}</FormLabel>
              <FormControl>
                <Textarea placeholder="Any additional details..." {...field} className={inputClass} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isPublicForm && (
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className={cn('w-full bg-blue-600 hover:bg-blue-700 text-white')}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        )}
      </form>
    </Form>
  );
});

LeadForm.displayName = "LeadForm";
