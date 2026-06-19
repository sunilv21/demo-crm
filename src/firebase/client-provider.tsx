'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

// Public, unauthenticated routes (lead/intake capture forms). These must render
// immediately and must NOT wait for the Firebase auth state to resolve — the
// visitor isn't logging in, and the app-shell skeleton is meaningless to them.
function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === '/lead' ||
    pathname.startsWith('/lead/') ||
    pathname === '/intake' ||
    pathname.startsWith('/intake/')
  );
}

interface FirebaseClientProviderProps {
  children: ReactNode;
}

interface FirebaseServices {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

function AppLayoutSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden md:flex flex-col border-r p-2 gap-2" style={{ width: '11rem' }}>
        <div className="flex items-center justify-center h-14 border-b">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="flex-1 py-2 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2">
              <Skeleton className="h-5 w-5 rounded-sm" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-auto border-t p-2">
          <div className="flex items-center gap-2 p-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-40 flex h-10 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 lg:h-[60px] lg:px-6">
          <Skeleton className="h-5 w-32" />
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
      </div>
    </div>
  );
}


export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [services, setServices] = useState<FirebaseServices | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);

  useEffect(() => {
    const s = initializeFirebase();
    setServices(s);

    // ⛔ WAIT until auth resolves once
    const unsub = onAuthStateChanged(s.auth, () => {
      setAuthReady(true);
      unsub();
    });

    return () => unsub();
  }, []);

  // Firebase SDK init is synchronous-fast; everything below needs `services`.
  if (!services) {
    // Public capture forms get no app-shell skeleton (it's meaningless to a
    // logged-out visitor and adds perceived weight); they paint instantly.
    return publicRoute ? null : <AppLayoutSkeleton />;
  }

  // ⛔ BLOCK FIRESTORE UNTIL AUTH READY — but ONLY for the authenticated app.
  // Public forms write unauthenticated and don't read on load, so they must not
  // wait for the (network) auth round-trip.
  if (!publicRoute && !authReady) {
    return <AppLayoutSkeleton />;
  }

  return (
    <FirebaseProvider
      firebaseApp={services.firebaseApp}
      auth={services.auth}
      firestore={services.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
