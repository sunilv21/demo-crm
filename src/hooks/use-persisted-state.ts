'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Like useState, but mirrors the value to localStorage (debounced) and
 * restores it on mount — so navigating away from a page (or a full refresh)
 * doesn't lose in-progress work, and doesn't force an expensive re-generation
 * (e.g. a paid AI call) just to get back to where the user was.
 *
 * Restoration happens in an effect, not the useState initializer, so the
 * first render always matches what the server would have rendered (avoids a
 * hydration mismatch) — the persisted value is applied a moment after mount
 * instead. Same pattern as useFormPersistence, generalized beyond
 * react-hook-form for plain useState call sites.
 */
export function usePersistedState<T>(key: string, initial: T, debounceMs = 400) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch (error) {
      console.error(`Could not load persisted state for "${key}":`, error);
    }
    // Restore only once per mount/key — not meant to react to `initial` changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error(`Could not persist state for "${key}":`, error);
      }
    }, debounceMs);
    return () => clearTimeout(timeoutRef.current);
  }, [key, value, debounceMs]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error(`Could not clear persisted state for "${key}":`, error);
    }
    setValue(initial);
    // `initial` is captured once at the call site (a fresh empty value),
    // not meant to change across the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clear] as const;
}
