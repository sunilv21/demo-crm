'use client';

import { useEffect, useCallback } from 'react';
import { UseFormReturn } from 'react-hook-form';

export function useFormPersistence<T extends Record<string, any>>(
  key: string,
  form: UseFormReturn<T>,
  debounceTime = 500
) {
  const { watch, reset, getValues } = form;

  // Debounce function
  const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(null, args);
      }, delay);
    };
  };

  // Memoized save function with debounce
  const saveStateToLocalStorage = useCallback(
    debounce((data: T) => {
      try {
        const serializedState = JSON.stringify(data);
        window.localStorage.setItem(key, serializedState);
      } catch (error) {
        console.error("Could not save form state to local storage:", error);
      }
    }, debounceTime),
    [key, debounceTime]
  );
  
  // Watch for form changes and save them
  useEffect(() => {
    const subscription = watch((value) => {
      saveStateToLocalStorage(value as T);
    });
    return () => subscription.unsubscribe();
  }, [watch, saveStateToLocalStorage]);

  // Load state from local storage on initial render
  useEffect(() => {
    try {
      const serializedState = window.localStorage.getItem(key);
      if (serializedState === null) {
        return;
      }
      const savedState = JSON.parse(serializedState);
      // Only reset if there's actually something saved
      if (Object.keys(savedState).length > 0) {
        reset(savedState);
      }
    } catch (error) {
      console.error("Could not load form state from local storage:", error);
    }
  }, [key, reset]);

  const clearSavedData = useCallback(() => {
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        console.error("Could not clear form state from local storage:", error);
    }
  }, [key]);

  return { clearSavedData };
}
