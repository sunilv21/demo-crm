'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

const STORAGE_KEY = 'skyvisa:financeMonthFilter';

export interface GlobalMonthFilterContextValue {
  month: string;
  setMonth: (month: string) => void;
}

const GlobalMonthFilterContext = createContext<GlobalMonthFilterContextValue | undefined>(undefined);

export function useGlobalMonthFilter(): GlobalMonthFilterContextValue {
  const ctx = useContext(GlobalMonthFilterContext);
  if (ctx === undefined) {
    throw new Error('useGlobalMonthFilter must be used within a GlobalMonthFilterProvider.');
  }
  return ctx;
}

export const GlobalMonthFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [month, setMonth] = useState('');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setMonth(stored);
    } catch {
      // Ignore (private browsing / storage disabled).
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, month);
    } catch {
      // Ignore.
    }
  }, [month]);

  const value = useMemo<GlobalMonthFilterContextValue>(() => ({ month, setMonth }), [month]);

  return <GlobalMonthFilterContext.Provider value={value}>{children}</GlobalMonthFilterContext.Provider>;
};
