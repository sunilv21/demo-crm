'use client';

import React, { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppUser, type Role } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RequireRoleProps {
  allow: Role[];
  children: ReactNode;
  redirectTo?: string;
}

export function RequireRole({ allow, children, redirectTo }: RequireRoleProps) {
  const { role, isLoading } = useAppUser();
  const router = useRouter();
  const allowed = allow.includes(role);

  useEffect(() => {
    if (!isLoading && !allowed && redirectTo) {
      router.replace(redirectTo);
    }
  }, [isLoading, allowed, redirectTo, router]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!allowed) {
    if (redirectTo) return null;
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You do not have permission to view this page. Contact an administrator if you
            believe this is a mistake.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
