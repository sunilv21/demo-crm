'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, ReactNode } from 'react';
import { doc, serverTimestamp } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { User as AppUser } from '@/lib/types';

export type Role = 'admin' | 'manager' | 'employee' | 'agent' | 'finance';

export interface AppUserContextValue {
  authUser: FirebaseUser | null;
  appUser: (AppUser & { id: string }) | null;
  role: Role;
  isLoading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isEmployee: boolean;
  isAgent: boolean;
  isFinance: boolean;
  isAdminOrManager: boolean;
  canManageUsers: boolean;
  canDelete: boolean;
  canManageInvoices: boolean;
  canViewInvoices: boolean;
  canViewAdminPages: boolean;
  // Revenue / pricing-margin details are private to agents only.
  canViewRevenue: boolean;
  // Company cash-flow (Finance module) — admin + finance role only. Kept
  // separate from canViewRevenue so per-booking margin stays agent-only.
  canViewFinance: boolean;
}

const AppUserContext = createContext<AppUserContextValue | undefined>(undefined);

export const AppUserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user: authUser, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (authUser && firestore ? doc(firestore, 'users', authUser.uid) : null),
    [authUser, firestore]
  );

  const { data: appUser, isLoading: isDocLoading } = useDoc<AppUser>(userDocRef);

  // Auto-provision a /users/{uid} doc for any signed-in user that doesn't
  // have one. Covers Firebase-Console-created accounts and any signup paths
  // that bypass /users/new. Without this, helper functions (rules + UI)
  // can't determine the user's role and access control behaves erratically.
  const provisionedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!firestore || !authUser) return;
    if (isUserLoading || isDocLoading) return;
    if (appUser) return; // doc already exists
    if (provisionedRef.current === authUser.uid) return; // already provisioned this session
    provisionedRef.current = authUser.uid;
    const ref = doc(firestore, 'users', authUser.uid);
    const fallbackName =
      authUser.displayName?.trim() ||
      authUser.email?.split('@')[0] ||
      'User';
    setDocumentNonBlocking(
      ref,
      {
        id: authUser.uid,
        name: fallbackName,
        email: authUser.email ?? '',
        role: 'employee',
        baseSalary: 0,
        workStartTime: '09:30',
        workEndTime: '18:30',
        lateGraceMinutes: 15,
        monthlyLeaveCap: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authUser.uid,
        updatedBy: authUser.uid,
      },
      { merge: true },
    );
  }, [firestore, authUser, appUser, isUserLoading, isDocLoading]);

  const value = useMemo<AppUserContextValue>(() => {
    const rawRole = (appUser?.role ?? 'employee') as Role;
    const role: Role =
      rawRole === 'admin' || rawRole === 'manager' || rawRole === 'agent' || rawRole === 'finance'
        ? rawRole
        : 'employee';
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';
    const isEmployee = role === 'employee';
    const isAgent = role === 'agent';
    const isFinance = role === 'finance';
    const isAdminOrManager = isAdmin || isManager;

    return {
      authUser,
      appUser,
      role,
      isLoading: isUserLoading || (!!authUser && isDocLoading),
      isAdmin,
      isManager,
      isEmployee,
      isAgent,
      isFinance,
      isAdminOrManager,
      canManageUsers: isAdmin,
      canDelete: isAdminOrManager,
      canManageInvoices: isAdmin,
      canViewInvoices: isAdminOrManager,
      canViewAdminPages: isAdminOrManager,
      canViewRevenue: isAgent,
      // Company cash flow + agent performance: the dedicated finance role only.
      canViewFinance: isFinance,
    };
  }, [authUser, appUser, isUserLoading, isDocLoading]);

  return <AppUserContext.Provider value={value}>{children}</AppUserContext.Provider>;
};

export function useAppUser(): AppUserContextValue {
  const ctx = useContext(AppUserContext);
  if (ctx === undefined) {
    throw new Error('useAppUser must be used within an AppUserProvider.');
  }
  return ctx;
}
