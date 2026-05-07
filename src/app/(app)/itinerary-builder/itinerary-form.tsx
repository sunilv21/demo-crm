'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { getItinerary, type ItineraryState } from '@/app/actions/itinerary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Wand2, Clock, Info, Printer } from 'lucide-react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';

const initialState: ItineraryState = {
  form: {
    destination: '',
    preferences: '',
  },
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Wand2 className="mr-2 h-4 w-4" />
          Generate Itinerary
        </>
      )}
    </Button>
  );
}

export function ItineraryForm() {
  const [state, formAction] = useFormState(getItinerary, initialState);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* On-screen layout */}
      <div className="grid lg:grid-cols-3 gap-8 print-hidden">
        <Card className="lg:col-span-1 h-fit sticky top-20">
          <CardHeader>
            <CardTitle>Create a Custom Itinerary</CardTitle>
            <CardDescription>
              Let our AI assistant craft the perfect trip for you. Provide a destination and your travel preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div>
                <Label htmlFor="destination">Destination</Label>
                <Input
                  id="destination"
                  name="destination"
                  placeholder="e.g., Kyoto, Japan"
                  defaultValue={state.form.destination}
                  required
                />
              </div>
              <div>
                <Label htmlFor="preferences">Preferences</Label>
                <Textarea
                  id="preferences"
                  name="preferences"
                  placeholder="e.g., Interested in historical temples, authentic cuisine, and peaceful gardens. Budget is moderate."
                  defaultValue={state.form.preferences}
                  required
                  className="min-h-[120px]"
                />
              </div>
              {state.error && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <SubmitButton />
            </form>
          </CardContent>
        </Card>
        
        <div className="lg:col-span-2">
          {!state.itinerary && (
              <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/50 rounded-lg p-8 lg:min-h-[60vh]">
                <p>Your personalized travel plan will appear here.</p>
              </div>
          )}
          {state.itinerary && (
            <div className="space-y-8">
              <div className='mb-8 flex justify-between items-center'>
                  <h2 className="text-3xl font-bold tracking-tight">Your Itinerary for {state.itinerary.destination}</h2>
                    <Button onClick={handlePrint} variant="outline">
                      <Printer className="mr-2 h-4 w-4" />
                      Download as PDF
                  </Button>
              </div>
              {state.itinerary.itinerary.map(dayPlan => (
                <Card key={dayPlan.day} className="overflow-hidden">
                  <div className="relative h-48 w-full">
                    <Image src={dayPlan.imageUrl} alt={dayPlan.title} layout="fill" objectFit="cover" data-ai-hint="travel landscape" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-6">
                      <h3 className="text-2xl font-bold text-white">Day {dayPlan.day}: {dayPlan.title}</h3>
                      <p className="text-sm text-white/90">{dayPlan.summary}</p>
                    </div>
                  </div>
                  <CardContent className="p-6 space-y-6">
                    {dayPlan.activities.map((activity, index) => (
                      <div key={index}>
                        <div className="flex gap-4">
                          <div className="flex flex-col items-center">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <Clock className="h-4 w-4" />
                              </div>
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-primary">{activity.time}</p>
                            <p className="font-medium">{activity.description}</p>
                            {activity.details && (
                              <p className="text-sm text-muted-foreground mt-1 flex items-center">
                                  <Info className="h-3 w-3 mr-2"/>
                                  {activity.details}
                              </p>
                            )}
                          </div>
                        </div>
                          {index < dayPlan.activities.length -1 && <Separator className="mt-6" />}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Off-screen layout FOR PRINTING ONLY */}
      {state.itinerary && (
        <div className="hidden print:block">
           <h2 className="text-3xl font-bold tracking-tight mb-8">Your Itinerary for {state.itinerary.destination}</h2>
          {state.itinerary.itinerary.map(dayPlan => (
            <div key={dayPlan.day} className="mb-8 rounded-lg border border-gray-200 overflow-hidden break-inside-avoid">
              <div className="p-6 bg-primary text-primary-foreground print-exact-background">
                <p className="text-sm font-semibold opacity-80">{dayPlan.title}</p>
                <h3 className="text-3xl font-bold mt-1">Day {dayPlan.day}: {dayPlan.title}</h3>
                <p className="mt-2 opacity-90">{dayPlan.summary}</p>
              </div>
              <div className="p-6 bg-white">
                <div className="flow-root">
                  <ul className="-mb-8">
                    {dayPlan.activities.map((activity, index) => (
                      <li key={index}>
                        <div className="relative pb-8">
                          {index !== dayPlan.activities.length - 1 ? (
                            <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                          ) : null}
                          <div className="relative flex items-start space-x-4">
                            <div>
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground ring-8 ring-white print-exact-background">
                                    <Clock className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="min-w-0 flex-1 pt-1.5">
                                <p className="text-sm font-semibold text-primary">{activity.time}</p>
                                <p className="font-semibold text-gray-800 mt-0.5">{activity.description}</p>
                                {activity.details && (
                                  <p className="text-sm text-gray-500 mt-1 flex items-center">
                                      <Info className="h-3.5 w-3.5 mr-2 text-gray-400"/>
                                      {activity.details}
                                  </p>
                                )}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
