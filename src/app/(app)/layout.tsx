'use client';

import { AppHeader } from '@/components/common/app-header';
import { AppSidebarNav } from '@/components/common/app-sidebar-nav';
import { AutoLogoutWatcher } from '@/components/attendance/auto-logout-watcher';
import { NetworkStatusListener } from '@/components/common/network-status';
import { FinanceRoleGuard } from '@/components/common/finance-role-guard';
import { NotificationProvider } from '@/components/notifications/notification-provider';
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from '@/components/ui/sidebar';
import { useUser, AppUserProvider } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

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


export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading || !user) {
    return <AppLayoutSkeleton />;
  }

  return (
    <AppUserProvider>
      <NotificationProvider>
        <AutoLogoutWatcher />
        <NetworkStatusListener />
        <FinanceRoleGuard />
        <SidebarProvider>
          <Sidebar side="left" collapsible="icon" className="group-data-[collapsible=icon]:border-r print:hidden">
              <AppSidebarNav />
          </Sidebar>
          <SidebarInset className="flex flex-col min-w-0">
            <AppHeader />
            <main id="main-content" className="flex-1 overflow-auto min-w-0 p-4 lg:p-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </NotificationProvider>
    </AppUserProvider>
  );
}
