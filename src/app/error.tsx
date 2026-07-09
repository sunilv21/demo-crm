'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';
import Link from 'next/link';
import { FirestorePermissionError } from '@/firebase/errors';

// Route-level error boundary. Catches render/runtime errors in the app — including
// the FirestorePermissionError that FirebaseErrorListener throws — and shows a
// friendly recovery UI instead of a blank white screen.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the technical detail in the console for debugging.
    console.error('[AppError]', error);
  }, [error]);

  const isPermission = error instanceof FirestorePermissionError;
  const friendly = isPermission
    ? "You don't have permission to view or change this, or you may be signed out."
    : "Something went wrong while loading this page.";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">{friendly}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => reset()}>
          <RotateCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Home className="mr-2 h-4 w-4" />
            Go to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
