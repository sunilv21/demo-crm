
'use client';

import { ClientForm } from '@/components/forms/client-form';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Client } from '@/lib/types';
import { Plane } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function IntakePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Organization the link was scoped to (from ?org=<id>&orgName=<name>). The id
  // is authoritative and saved on the client; the name is display-only. Read
  // from the URL directly to avoid a useSearchParams() Suspense boundary.
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('org');
    if (id) setOrg({ id, name: params.get('orgName') || '' });
  }, []);

  const handleIntakeSubmit = (newClientData: Partial<Client>) => {
    if (!firestore) return;

    setIsSubmitting(true);
    const clientsCollection = collection(firestore, 'clients');

    // Set default status for public intake
    const dataToSave = {
      ...newClientData,
      status: 'lead',
      createdBy: 'public_form',
      updatedBy: 'public_form',
      // Scope to the organization when the link carried one.
      ...(org?.id ? { organizationId: org.id } : {}),
    };

    addDocumentNonBlocking(clientsCollection, dataToSave)
        .then(() => {
            router.push('/intake/thank-you');
        })
        .catch((error) => {
            console.error("Error adding document: ", error);
            toast({
                variant: 'destructive',
                title: 'Submission Failed',
                description: 'There was an error saving your information. Please try again.'
            });
        })
        .finally(() => {
            setIsSubmitting(false);
        });
  };

  return (
    <div className="relative min-h-screen w-full">
      {/* Desktop Background */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-fixed hidden sm:block"
        style={{
            backgroundImage: `url('https://images.pexels.com/photos/531602/pexels-photo-531602.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')`
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      </div>
      
      {/* Mobile Background */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-fixed block sm:hidden"
        style={{
            backgroundImage: `url('https://images.pexels.com/photos/2531237/pexels-photo-2531237.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')`
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      </div>

      <div className="relative z-10 min-h-screen w-full flex flex-col justify-start py-8 sm:py-12 overflow-y-auto sm:items-center sm:justify-center">
          <div className="container max-w-3xl w-full">
              <div className="flex flex-col items-center text-center mb-8">
                  <Image src="/favicon.ico" alt="Sky Visa Logo" width={100} height={48} className="h-12 w-auto mb-4" />
                  <h1 className="text-4xl font-bold tracking-tight text-white">Travel Inquiry</h1>
                  {org?.name && (
                      <span className="mt-3 inline-block rounded-full bg-white/15 px-4 py-1 text-sm font-medium text-white">
                          {org.name}
                      </span>
                  )}
                  <p className="text-lg text-white/80 mt-2">
                      Please provide your details and travel preferences so we can craft your perfect journey.
                  </p>
              </div>
              <ClientForm 
                  onSubmit={handleIntakeSubmit} 
                  onCancel={() => {}} 
                  isPublicForm={true}
                  isSubmitting={isSubmitting}
              />
              <p className="text-center text-xs text-white/60 mt-8">
                  Powered by Sky Visa
              </p>
          </div>
      </div>
    </div>
  );
}
