import { RequireRole } from '@/components/common/require-role';

// The Database page now also hosts the Hotels tab (Hotel Master), which
// every role needs for booking auto-fill — so the route itself is open to
// everyone; the Archived Clients tab further restricts itself to
// admin/manager inside database/page.tsx.
export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allow={['admin', 'manager', 'employee', 'agent']}>{children}</RequireRole>;
}
