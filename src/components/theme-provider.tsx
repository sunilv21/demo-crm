'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

// Wraps next-themes so the app can toggle Light / Dark / System. The dark
// palette is already defined under `.dark` in globals.css; this drives that
// class on <html> and persists the choice.
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
