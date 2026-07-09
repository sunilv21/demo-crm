'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

// Notifies the user when they go offline / come back online. Pairs with the
// Firestore offline persistence enabled in getSdks() — writes queue locally and
// sync automatically on reconnect.
export function NetworkStatusListener() {
  const { toast } = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    const goOffline = () => {
      wasOffline.current = true;
      toast({
        variant: 'destructive',
        title: 'You are offline',
        description: 'Changes are saved locally and will sync when you reconnect.',
      });
    };
    const goOnline = () => {
      if (!wasOffline.current) return;
      wasOffline.current = false;
      toast({ title: 'Back online', description: 'Your changes are syncing.' });
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    // Reflect an initial offline state on mount.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) goOffline();

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [toast]);

  return null;
}
