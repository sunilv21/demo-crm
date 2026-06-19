'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { LeadForm } from '@/components/forms/lead-form';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Lead } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

function LeadCapture() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const source = (searchParams.get('source') || 'Website').trim() || 'Website';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (newLeadData: Omit<Lead, 'id' | 'avatar'>) => {
    if (!firestore) return;
    setIsSubmitting(true);
    const leadsCollection = collection(firestore, 'leads');

    addDocumentNonBlocking(leadsCollection, { ...newLeadData, source })
      .then(() => {
        router.push('/lead/thank-you');
      })
      .catch((error) => {
        console.error('Error saving lead: ', error);
        toast({
          variant: 'destructive',
          title: 'Submission Failed',
          description: 'There was an error saving your details. Please try again.',
        });
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <div className="relative z-10 min-h-screen w-full flex flex-col justify-start py-8 sm:py-12 overflow-y-auto sm:items-center sm:justify-center">
      <div className="container max-w-2xl w-full">
        <div className="flex flex-col items-center text-center mb-8">
          <Image src="/favicon.ico" alt="Sky Visa Logo" width={100} height={48} className="h-12 w-auto mb-4" />
          <h1 className="text-4xl font-bold tracking-tight text-white">Get in Touch</h1>
          <p className="text-lg text-white/80 mt-2">
            Share a few details and our travel experts will reach out to plan your trip.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 sm:p-8">
          <LeadForm onSubmit={handleSubmit} isPublicForm source={source} isSubmitting={isSubmitting} />
        </div>

        <p className="text-center text-xs text-white/60 mt-8">Powered by Sky Visa</p>
      </div>
    </div>
  );
}

export default function PublicLeadPage() {
  return (
    <div className="relative min-h-screen w-full">
      {/* Desktop Background */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-fixed hidden sm:block"
        style={{
          backgroundImage: `url('https://images.pexels.com/photos/531602/pexels-photo-531602.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')`,
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      </div>
      {/* Mobile Background */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-fixed block sm:hidden"
        style={{
          backgroundImage: `url('https://images.pexels.com/photos/2531237/pexels-photo-2531237.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')`,
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      </div>

      <Suspense fallback={<div className="relative z-10 min-h-screen flex items-center justify-center text-white">Loading…</div>}>
        <LeadCapture />
      </Suspense>
    </div>
  );
}
