'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppUser } from '@/firebase';

// The finance role is scoped to the Finance module only. If such a user lands
// anywhere else (e.g. the default /dashboard after login, or a typed URL),
// bounce them to /finance. Profile/logout stay accessible.
export function FinanceRoleGuard() {
  const { role, isLoading } = useAppUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || role !== 'finance') return;
    const allowed =
      pathname === '/finance' ||
      pathname.startsWith('/finance/') ||
      pathname.startsWith('/agent-performance') ||
      pathname.startsWith('/profile');
    if (!allowed) router.replace('/finance');
  }, [role, isLoading, pathname, router]);

  return null;
}
